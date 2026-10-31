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
 * and must find the same checksum. A photo uploaded before opens its existing document.
 */
export async function uploadPage(
  page: PageUpload,
  userId: string,
  onProgress: (fraction: number) => void,
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
      body: JSON.stringify({ storagePath, originalFilename: page.filename, clientSha256: page.sha256 }),
    });
  } catch {
    throw new UploadError("offline", "Network error while recording the upload.");
  }
  const body = (await res.json().catch(() => ({}))) as { documentId?: string; duplicate?: boolean; error?: string; reason?: string };
  if (!res.ok || !body.documentId) {
    const problem: ProblemKind =
      res.status === 413 ? "file" : res.status === 415 ? (body.reason === "too_small" ? "small" : "file") : "sendFailed";
    throw new UploadError(problem, body.error ?? "Upload could not be recorded.");
  }
  return { documentId: body.documentId, duplicate: Boolean(body.duplicate) };
}
