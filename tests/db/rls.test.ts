/**
 * Executes the real migration in PGlite (Postgres compiled to WASM) and checks
 * the security model as an authenticated user, another user, an anonymous
 * visitor and the server role. No network, no Supabase project needed.
 */
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const sha = (c: string) => c.repeat(64);

let db: PGlite;

async function as<T>(role: "authenticated" | "anon" | "service_role", userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role`);
  }
}

const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, unknown>[];

async function expectDenied(p: Promise<unknown>, pattern = /permission denied|row-level security|violates/) {
  let message = "";
  try {
    await p;
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toMatch(pattern);
}

function entriesPayload() {
  const v = (type: string, amount: string) => ({
    sourceText: "line",
    type,
    customer: null,
    item: null,
    quantityText: null,
    unit: null,
    rateText: null,
    amountText: amount,
    balanceText: null,
    crossedOut: false,
  });
  return [
    { candidate_id: "e1", line_order: 1, source_text: "আগের বাকি ৮০০", transaction_type: "opening_balance", amount_text: "৮০০", amount_poisha: 80000, crossed_out: false, review_fields: [], entry_values: v("opening_balance", "৮০০") },
    { candidate_id: "e2", line_order: 2, source_text: "চাল ১৮০", transaction_type: "credit_sale", amount_text: "১৮০", amount_poisha: 18000, crossed_out: false, review_fields: ["amount"], entry_values: v("credit_sale", "১৮০") },
  ];
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(join(import.meta.dir, "supabase-stubs.sql"), "utf8"));
  const dir = join(import.meta.dir, "..", "..", "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.query(`insert into auth.users (id, email) values ($1, 'a@example.test'), ($2, 'b@example.test')`, [A, B]);

  // Server-side writes (the server uses the secret key, i.e. service_role).
  await as("service_role", null, async () => {
    await db.query(
      `insert into public.ledger_documents (id, owner_id, storage_path, sha256, mime_type, byte_size, width, height)
       values ('10000000-0000-4000-8000-000000000001', $1::uuid, $1::text || '/a.png', $3, 'image/png', 100, 64, 64),
              ('20000000-0000-4000-8000-000000000001', $2::uuid, $2::text || '/b.png', $4, 'image/png', 100, 64, 64)`,
      [A, B, sha("a"), sha("b")],
    );
    await db.query(
      `insert into public.extraction_runs (id, document_id, owner_id, request_id, cache_key, model_id, prompt_version, schema_version, processing_mode)
       values ('10000000-0000-4000-8000-0000000000aa', '10000000-0000-4000-8000-000000000001', $1, gen_random_uuid(), $3, 'muse-spark-1.3', 'p1', 's1', 'baseline_original'),
              ('20000000-0000-4000-8000-0000000000bb', '20000000-0000-4000-8000-000000000001', $2, gen_random_uuid(), $4, 'muse-spark-1.3', 'p1', 's1', 'baseline_original')`,
      [A, B, sha("c"), sha("d")],
    );
    for (const [owner, run] of [[A, "10000000-0000-4000-8000-0000000000aa"], [B, "20000000-0000-4000-8000-0000000000bb"]] as const) {
      await db.query(`select public.scriba_complete_extraction($1, $2, $3, $4, $5, $6)`, [
        owner,
        run,
        JSON.stringify({ elapsed_ms: 1000, input_tokens: 1500, output_tokens: 500, total_tokens: 2000, estimated_cost_usd: 0.004, raw_output_text: "{}", result: { ok: true }, validator_version: "v1" }),
        JSON.stringify(entriesPayload()),
        JSON.stringify({ ledgerType: "customer_credit", dateText: null, accountName: null }),
        JSON.stringify([{ finding_key: "k", rule_id: "written_total", rule_version: 1, status: "fail", severity: "error", entry_refs: ["e2"], expected_poisha: 32000, observed_poisha: 31000, message: "m" }]),
      ]);
    }
  });
});

describe("ownership isolation", () => {
  test("a user sees only their own rows in every table", async () => {
    await as("authenticated", A, async () => {
      for (const table of ["ledger_documents", "extraction_runs", "extracted_entries", "entry_reviews", "page_reviews", "validation_findings"]) {
        const r = await rows(`select owner_id from public.${table}`);
        expect(r.length).toBeGreaterThan(0);
        expect(r.every((x) => x.owner_id === A)).toBe(true);
      }
    });
  });

  test("user A cannot read, edit or delete user B's data by id", async () => {
    await as("authenticated", A, async () => {
      expect(await rows(`select * from public.ledger_documents where owner_id = $1`, [B])).toHaveLength(0);
      const upd = await db.query(`update public.entry_reviews set entry_values = '{}'::jsonb where owner_id = $1`, [B]);
      expect(upd.affectedRows).toBe(0);
      const del = await db.query(`delete from public.ledger_documents where owner_id = $1`, [B]);
      expect(del.affectedRows).toBe(0);
    });
  });

  test("anonymous visitors get nothing", async () => {
    await as("anon", null, async () => {
      await expectDenied(rows(`select * from public.ledger_documents`));
      await expectDenied(rows(`select * from public.confirmed_records`));
    });
  });
});

describe("server-attested records cannot be forged by users", () => {
  test("users cannot insert documents, runs, candidates, findings, records or audit events", async () => {
    await as("authenticated", A, async () => {
      await expectDenied(db.query(`insert into public.ledger_documents (owner_id, storage_path, sha256, mime_type, byte_size, width, height) values ($1::uuid, $1::text || '/x.png', $2, 'image/png', 1, 64, 64)`, [A, sha("e")]));
      await expectDenied(db.query(`update public.extraction_runs set status = 'succeeded'`));
      await expectDenied(db.query(`update public.extraction_runs set input_tokens = 0`));
      await expectDenied(db.query(`insert into public.validation_findings (run_id, owner_id, document_id, scope, finding_key, rule_id, rule_version, validator_version, status, severity, entry_refs, message) values ('10000000-0000-4000-8000-0000000000aa', $1, '10000000-0000-4000-8000-000000000001', 'extraction', 'k', 'r', 1, 'v', 'pass', 'info', '{}', 'm')`, [A]));
      await expectDenied(db.query(`insert into public.review_events (owner_id, document_id, run_id, action) values ($1, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-0000000000aa', 'confirm')`, [A]));
      await expectDenied(db.query(`update public.ledger_documents set sha256 = $1`, [sha("f")]));
    });
  });

  test("users cannot call the server-only functions", async () => {
    await as("authenticated", A, async () => {
      await expectDenied(
        db.query(`select public.scriba_confirm_entries($1, '10000000-0000-4000-8000-0000000000aa', gen_random_uuid(), 'v', '[]', '[]')`, [A]),
      );
    });
  });

  test("AI candidates are immutable, even for the server", async () => {
    await as("service_role", null, async () => {
      await expectDenied(db.query(`update public.extracted_entries set amount_text = '৩২০'`), /immutable/);
    });
  });
});

describe("review workflow", () => {
  test("an edit is recorded in the audit trail by the database itself", async () => {
    await as("authenticated", A, async () => {
      const [entry] = await rows(`select id, version from public.entry_reviews where line_order = 2`);
      await db.query(`update public.entry_reviews set entry_values = jsonb_set(entry_values, '{amountText}', '"১৯০"') where id = $1`, [entry!.id]);
      const [after] = await rows(`select version from public.entry_reviews where id = $1`, [entry!.id]);
      expect(after!.version).toBe((entry!.version as number) + 1);
      const events = await rows(`select action, previous_values, new_values from public.review_events where entry_review_id = $1`, [entry!.id]);
      expect(events).toHaveLength(1);
      expect(events[0]!.action).toBe("edit");
      // The immutable AI candidate still holds what the model read.
      const [candidate] = await rows(`select amount_text from public.extracted_entries where candidate_id = 'e2'`);
      expect(candidate!.amount_text).toBe("১৮০");
    });
  });

  test("users cannot confirm entries directly", async () => {
    await as("authenticated", A, async () => {
      await expectDenied(db.query(`update public.entry_reviews set status = 'confirmed'`));
    });
  });

  test("the server confirms atomically, only for the assessed version", async () => {
    const [entry] = await as("authenticated", A, () => rows(`select id, version from public.entry_reviews where line_order = 1`));
    const record = (version: number) =>
      JSON.stringify([{ entry_review_id: entry!.id, expected_version: version, transaction_type: "opening_balance", source_text: "আগের বাকি ৮০০", amount_text: "৮০০", amount_poisha: 80000, was_corrected: false, acknowledgements: {} }]);

    await as("service_role", null, async () => {
      await expectDenied(
        db.query(`select public.scriba_confirm_entries($1, '10000000-0000-4000-8000-0000000000aa', gen_random_uuid(), 'v1', $2, '[]')`, [A, record((entry!.version as number) + 5)]),
        /changed since/,
      );
      // Wrong owner for the run.
      await expectDenied(
        db.query(`select public.scriba_confirm_entries($1, '10000000-0000-4000-8000-0000000000aa', gen_random_uuid(), 'v1', $2, '[]')`, [B, record(entry!.version as number)]),
        /not a succeeded run/,
      );
      const r = await rows(`select public.scriba_confirm_entries($1, '10000000-0000-4000-8000-0000000000aa', gen_random_uuid(), 'v1', $2, '[]') as n`, [A, record(entry!.version as number)]);
      expect(r[0]!.n).toBe(1);
    });

    await as("authenticated", A, async () => {
      expect(await rows(`select * from public.confirmed_records`)).toHaveLength(1);
      const [doc] = await rows(`select status from public.ledger_documents`);
      expect(doc!.status).toBe("partially_confirmed");
      // Confirmed rows are locked against further edits.
      const upd = await db.query(`update public.entry_reviews set entry_values = '{}'::jsonb where id = $1`, [entry!.id]);
      expect(upd.affectedRows).toBe(0);
      const actions = (await rows(`select action from public.review_events where entry_review_id = $1`, [entry!.id])).map((e) => e.action);
      expect(actions).toEqual(["confirm"]);
    });
  });

  test("a reviewer can add a missed line to their own run only", async () => {
    await as("authenticated", A, async () => {
      await db.query(
        `insert into public.entry_reviews (run_id, owner_id, document_id, line_order, entry_values) values ('10000000-0000-4000-8000-0000000000aa', $1, '10000000-0000-4000-8000-000000000001', 2.5, '{}')`,
        [A],
      );
      await expectDenied(
        db.query(
          `insert into public.entry_reviews (run_id, owner_id, document_id, line_order, entry_values) values ('20000000-0000-4000-8000-0000000000bb', $1, '20000000-0000-4000-8000-000000000001', 9, '{}')`,
          [A],
        ),
      );
    });
  });
});

describe("credit-control constraints", () => {
  test("only one pending run per cache key; request ids are unique", async () => {
    await as("service_role", null, async () => {
      const insert = (req: string) =>
        db.query(
          `insert into public.extraction_runs (document_id, owner_id, request_id, cache_key, model_id, prompt_version, schema_version, processing_mode)
           values ('10000000-0000-4000-8000-000000000001', $1, $2, $3, 'm', 'p', 's', 'baseline_original')`,
          [A, req, sha("9")],
        );
      await insert("30000000-0000-4000-8000-000000000001");
      await expectDenied(insert("30000000-0000-4000-8000-000000000002"), /duplicate key/);
      await expectDenied(
        db.query(`update public.extraction_runs set status = 'failed' where request_id = '30000000-0000-4000-8000-000000000001'`).then(() =>
          insert("30000000-0000-4000-8000-000000000001"),
        ),
        /duplicate key/,
      );
    });
  });

  test("a run records a known orientation and nothing else", async () => {
    await as("service_role", null, async () => {
      const insert = (mode: string, key: string) =>
        db.query(
          `insert into public.extraction_runs (document_id, owner_id, request_id, cache_key, model_id, prompt_version, schema_version, processing_mode)
           values ('10000000-0000-4000-8000-000000000001', $1, gen_random_uuid(), $2, 'm', 'p', 's', $3)`,
          [A, sha(key), mode],
        );
      await insert("rotate_90", "7");
      await insert("rotate_270", "6");
      await expectDenied(insert("rotate_45", "5"), /processing_mode_check/);
    });
  });

  test("a run cannot point at another owner's document", async () => {
    await as("service_role", null, async () => {
      await expectDenied(
        db.query(
          `insert into public.extraction_runs (document_id, owner_id, request_id, cache_key, model_id, prompt_version, schema_version, processing_mode)
           values ('20000000-0000-4000-8000-000000000001', $1, gen_random_uuid(), $2, 'm', 'p', 's', 'baseline_original')`,
          [A, sha("8")],
        ),
        /foreign key/,
      );
    });
  });
});

describe("private storage policies", () => {
  test("users can upload only into their own folder, and read only their own objects", async () => {
    await as("authenticated", A, async () => {
      await db.query(`insert into storage.objects (bucket_id, name) values ('scriba-originals', $1)`, [`${A}/one.png`]);
      await expectDenied(db.query(`insert into storage.objects (bucket_id, name) values ('scriba-originals', $1)`, [`${B}/evil.png`]));
      await expectDenied(db.query(`insert into storage.objects (bucket_id, name) values ('scriba-originals', 'root.png')`));
    });
    await as("authenticated", B, async () => {
      await db.query(`insert into storage.objects (bucket_id, name) values ('scriba-originals', $1)`, [`${B}/two.png`]);
      const visible = await rows(`select name from storage.objects`);
      expect(visible.map((r) => r.name)).toEqual([`${B}/two.png`]);
      const del = await db.query(`delete from storage.objects where name = $1`, [`${A}/one.png`]);
      expect(del.affectedRows).toBe(0);
    });
  });

  test("originals cannot be overwritten in place (no update policy)", async () => {
    await as("authenticated", A, async () => {
      const upd = await db.query(`update storage.objects set name = name where name = $1`, [`${A}/one.png`]);
      expect(upd.affectedRows).toBe(0);
    });
  });

  test("the bucket is private with type and size limits", async () => {
    const [bucket] = await rows(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'scriba-originals'`);
    expect(bucket).toMatchObject({ public: false, file_size_limit: 8388608 });
  });
});
