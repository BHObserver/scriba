"use client";

import { EXTENSION_FOR, type ImageInspection, type SupportedMimeType } from "@/lib/images/inspect";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { ProblemKind } from "./problems";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Upload the exact original bytes to the private bucket, reporting progress. */
export function uploadWithProgress(opts: {
  url: string;
  token: string;
  apiKey: string;
  body: Blob;
  contentType: string;
  onProgress: (fraction: number) => void;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", opts.url);
    xhr.setRequestHeader("Authorization", `Bearer ${opts.token}`);
    xhr.setRequestHeader("apikey", opts.apiKey);
    xhr.setRequestHeader("Content-Type", opts.contentType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError("sendFailed", `Storage upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new UploadError("offline", "Network error during upload."));
    xhr.send(opts.body);
  });
}

/** An upload that failed, with the problem screen it maps to (design/DESIGN_SPEC.md, error states). */
export class UploadError extends Error {
  constructor(
    readonly problem: ProblemKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Which problem screen an image rejection shows: tiny photos get "too small", the rest "can't open". */
export function problemForRejection(reason: Extract<ImageInspection, { ok: false }>["reason"]): ProblemKind {
  return reason === "too_small" ? "small" : "file";
}

export type PageUpload = {
  bytes: Uint8Array;
  mimeType: SupportedMimeType;
  sha256: string;
  filename: string | null;
};

/**
 * Store one page's original and register it as a document. The server re-reads the stored bytes
 * and must find the same checksum. A photo uploaded before opens its existing document. With
 * `memoFor` (U4) the photo is a company memo of that page.
 */
export async function uploadPage(
  page: PageUpload,
  userId: string,
  onProgress: (fraction: number) => void,
  memoFor?: string,
): Promise<{ documentId: string; duplicate: boolean }> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new UploadError("sendFailed", "Your session expired. Sign in again.");
  const storagePath = `${userId}/${crypto.randomUUID()}.${EXTENSION_FOR[page.mimeType]}`;
  await uploadWithProgress({
    url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/scriba-originals/${storagePath}`,
    token: data.session.access_token,
    apiKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    // The untouched original: no resizing, re-encoding or rotation.
    body: new Blob([page.bytes as BlobPart], { type: page.mimeType }),
    contentType: page.mimeType,
    onProgress,
  });
  let res: Response;
  try {
    res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePath, originalFilename: page.filename, clientSha256: page.sha256, memoFor }),
    });
  } catch {
    throw new UploadError("offline", "Network error while recording the upload.");
  }
  const body = (await res.json().catch(() => ({}))) as { documentId?: string; duplicate?: boolean; error?: string; reason?: string };
  if (!res.ok || !body.documentId) {
    const problem: ProblemKind =
      res.status === 413 ? "file" : res.status === 415 ? (body.reason === "too_small" ? "small" : "file") : "sendFailed";
    throw new UploadError(problem, body.error ?? "Upload could not be recorded.", res.status);
  }
  return { documentId: body.documentId, duplicate: Boolean(body.duplicate) };
}

/** The camera's own photo behind a flattened page (C2), and where the page sat in it. */
export type CameraOriginal = PageUpload & {
  /** The page's corners as fractions of the photo's displayed width and height (TL, TR, BR, BL). */
  corners: [number, number][];
  cornersSource: "detected" | "khata" | "adjusted";
};

/** Store one camera photo and attach it to its page's document. */
async function keepOriginal(documentId: string, camera: CameraOriginal, userId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new UploadError("sendFailed", "Your session expired.");
  const storagePath = `${userId}/${crypto.randomUUID()}.${EXTENSION_FOR[camera.mimeType]}`;
  await uploadWithProgress({
    url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/scriba-originals/${storagePath}`,
    token: data.session.access_token,
    apiKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    body: new Blob([camera.bytes as BlobPart], { type: camera.mimeType }),
    contentType: camera.mimeType,
    onProgress: () => {},
  });
  const res = await fetch(`/api/documents/${documentId}/camera`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ storagePath, clientSha256: camera.sha256, corners: camera.corners, cornersSource: camera.cornersSource }),
  });
  if (!res.ok) throw new UploadError("sendFailed", `The camera photo could not be recorded (${res.status}).`);
}

/**
 * Upload the camera photos behind the pages just sent, one at a time, after their readings
 * have started (so he never waits for them). It keeps going while he checks the page; a
 * failure loses only that evidence copy, never the page, so it is logged and skipped.
 */
export function keepOriginals(items: { documentId: string; camera: CameraOriginal }[], userId: string): Promise<void> {
  return items.reduce<Promise<void>>(
    (chain, item) =>
      chain.then(() =>
        keepOriginal(item.documentId, item.camera, userId).catch((e: unknown) => {
          console.warn("Scriba: the camera photo wasn't kept.", e);
        }),
      ),
    Promise.resolve(),
  );
}
