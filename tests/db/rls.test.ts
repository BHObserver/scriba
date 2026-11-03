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

describe("data model v2: parties, shop profile, day closes, business date", () => {
  const RUN_A = "10000000-0000-4000-8000-0000000000aa";
  const confirm = (owner: string, records: unknown[]) =>
    rows(`select public.scriba_confirm_entries($1, $2, gen_random_uuid(), 'v2', $3, '[]') as n`, [owner, RUN_A, JSON.stringify(records)]);

  test("confirmation creates a party once and links records to it, following merges", async () => {
    const drafts = await as("authenticated", A, () => rows(`select id, version, line_order from public.entry_reviews where status = 'draft' order by line_order`));
    expect(drafts.map((d) => Number(d.line_order))).toEqual([2, 2.5]);
    const [sale, payment] = drafts;

    await as("service_role", null, async () => {
      // A supplier spelled two ways, already merged by the shopkeeper.
      const [target] = await rows(`insert into public.parties (owner_id, kind, display_name, normalized_key) values ($1, 'supplier', 'রহমান মহাজন', 'রহমান মহাজন') returning id`, [A]);
      await db.query(`insert into public.parties (owner_id, kind, display_name, normalized_key, merged_into) values ($1, 'supplier', 'রাহমান মহাজন', 'রাহমান মহাজন', $2)`, [A, target!.id]);

      const base = { source_text: "line", was_corrected: false, acknowledgements: {} };
      const r = await confirm(A, [
        { ...base, entry_review_id: sale!.id, expected_version: sale!.version, transaction_type: "credit_sale", customer_alias: "করিম", amount_text: "১৯০", amount_poisha: 19000, party_kind: "customer", party_key: "করিম", party_name: "করিম" },
        { ...base, entry_review_id: payment!.id, expected_version: payment!.version, transaction_type: "supplier_payment", customer_alias: "রাহমান মহাজন", amount_text: "৫০০", amount_poisha: 50000, party_kind: "supplier", party_key: "রাহমান মহাজন", party_name: "রাহমান মহাজন" },
      ]);
      expect(r[0]!.n).toBe(2);
    });

    await as("authenticated", A, async () => {
      const linked = await rows(
        `select r.transaction_type, p.kind, p.display_name from public.confirmed_records r join public.parties p on p.id = r.party_id order by r.line_order`,
      );
      expect(linked).toEqual([
        { transaction_type: "credit_sale", kind: "customer", display_name: "করিম" },
        { transaction_type: "supplier_payment", kind: "supplier", display_name: "রহমান মহাজন" },
      ]);
      // The opening balance confirmed earlier has no party, and the new customer exists once.
      expect(await rows(`select id from public.confirmed_records where party_id is null`)).toHaveLength(1);
      expect(await rows(`select id from public.parties where kind = 'customer'`)).toHaveLength(1);
    });
    await as("authenticated", B, async () => {
      expect(await rows(`select * from public.parties`)).toHaveLength(0);
    });
  });

  test("parties: users rename their own, but cannot create, merge or delete them", async () => {
    await as("authenticated", A, async () => {
      const upd = await db.query(`update public.parties set display_name = 'করিম ভাই' where normalized_key = 'করিম'`);
      expect(upd.affectedRows).toBe(1);
      await expectDenied(db.query(`insert into public.parties (owner_id, kind, display_name, normalized_key) values ($1, 'customer', 'x', 'x')`, [A]));
      await expectDenied(db.query(`update public.parties set merged_into = null`));
      await expectDenied(db.query(`delete from public.parties`));
      await expectDenied(db.query(`update public.confirmed_records set party_id = null`));
    });
    await as("authenticated", B, async () => {
      const upd = await db.query(`update public.parties set display_name = 'x'`);
      expect(upd.affectedRows).toBe(0);
    });
  });

  test("shop profile: one per user, written only by its owner, sample flag only by the server", async () => {
    await as("authenticated", A, async () => {
      await db.query(`insert into public.shop_profiles (owner_id, shop_name, opening_cash_poisha) values ($1, 'মায়ের দোয়া স্টোর', 200000)`, [A]);
      await expectDenied(db.query(`insert into public.shop_profiles (owner_id, shop_name) values ($1, 'x')`, [B]));
      await expectDenied(db.query(`update public.shop_profiles set is_sample = true`));
      await expectDenied(db.query(`update public.shop_profiles set language = 'fr'`));
      const upd = await db.query(`update public.shop_profiles set language = 'en', opening_cash_poisha = 150000`);
      expect(upd.affectedRows).toBe(1);
      expect(await rows(`select language, is_sample from public.shop_profiles`)).toEqual([{ language: "en", is_sample: false }]);
    });
    await as("authenticated", B, async () => {
      expect(await rows(`select * from public.shop_profiles`)).toHaveLength(0);
      await expectDenied(db.query(`insert into public.shop_profiles (owner_id, shop_name, is_sample) values ($1, 'x', true)`, [B]));
    });
  });

  test("day closes are written by the server and read only by their owner", async () => {
    const close = (counted: number) =>
      db.query(
        `insert into public.day_closes (owner_id, business_date, opening_cash_poisha, expected_cash_poisha, counted_cash_poisha) values ($1, '2026-10-31', 200000, 432000, $2)`,
        [A, counted],
      );
    await as("authenticated", A, () => expectDenied(close(0)));
    await as("service_role", null, async () => {
      await close(432000);
      await expectDenied(close(0), /duplicate key/);
    });
    await as("authenticated", A, async () => {
      expect(await rows(`select expected_cash_poisha from public.day_closes`)).toHaveLength(1);
      await expectDenied(db.query(`update public.day_closes set counted_cash_poisha = 0`));
    });
    await as("authenticated", B, async () => {
      expect(await rows(`select * from public.day_closes`)).toHaveLength(0);
    });
  });

  test("a page has a business date its owner can change, and nobody else can", async () => {
    await as("authenticated", A, async () => {
      const [doc] = await rows(`select business_date, business_date_source from public.ledger_documents`);
      expect(doc!.business_date_source).toBe("capture");
      expect(doc!.business_date).toBeInstanceOf(Date);
      const upd = await db.query(`update public.ledger_documents set business_date = '2026-10-30', business_date_source = 'user'`);
      expect(upd.affectedRows).toBe(1);
      await expectDenied(db.query(`update public.ledger_documents set business_date_source = 'guess'`));
    });
    await as("authenticated", B, async () => {
      const [doc] = await rows(`select business_date_source from public.ledger_documents`);
      expect(doc!.business_date_source).toBe("capture");
    });
  });

  test("records accept the new money-out types but never 'unknown'", async () => {
    await as("service_role", null, async () => {
      await expectDenied(db.query(`update public.confirmed_records set transaction_type = 'unknown'`), /check constraint/);
      const upd = await db.query(`update public.confirmed_records set transaction_type = 'expense' where transaction_type = 'credit_sale'`);
      expect(upd.affectedRows).toBe(1);
    });
  });
});

describe("company memos (U4)", () => {
  const PAGE = "10000000-0000-4000-8000-000000000001";
  const memoRow = (id: string, owner: string, memoFor: string | null, kind = "memo") =>
    db.query(
      `insert into public.ledger_documents (id, owner_id, storage_path, sha256, mime_type, byte_size, width, height, kind, memo_for)
       values ($1::uuid, $2::uuid, $2::text || '/' || $1::text || '.png', $3, 'image/png', 100, 64, 64, $4, $5::uuid)`,
      [id, owner, id.slice(-2).repeat(32), kind, memoFor],
    );

  test("the server registers a memo for one of the owner's pages; every document so far is a page", async () => {
    await as("service_role", null, async () => {
      await memoRow("10000000-0000-4000-8000-0000000000c1", A, PAGE);
      const [memo] = await rows(`select kind, memo_for from public.ledger_documents where id = '10000000-0000-4000-8000-0000000000c1'`);
      expect(memo).toEqual({ kind: "memo", memo_for: PAGE });
      const [page] = await rows(`select kind, memo_for from public.ledger_documents where id = $1`, [PAGE]);
      expect(page).toEqual({ kind: "page", memo_for: null });
    });
    await as("authenticated", A, async () => {
      expect(await rows(`select id from public.ledger_documents where memo_for = $1`, [PAGE])).toHaveLength(1);
    });
    await as("authenticated", B, async () => {
      expect(await rows(`select id from public.ledger_documents where kind = 'memo'`)).toHaveLength(0);
    });
  });

  test("a memo belongs to a page of the same owner, never to another memo or to nothing", async () => {
    await as("service_role", null, async () => {
      await expectDenied(memoRow("10000000-0000-4000-8000-0000000000c2", B, PAGE), /foreign key/);
      await expectDenied(memoRow("10000000-0000-4000-8000-0000000000c3", A, "10000000-0000-4000-8000-0000000000c1"), /must belong to a page/);
      await expectDenied(memoRow("10000000-0000-4000-8000-0000000000c4", A, null), /check constraint/);
      await expectDenied(memoRow("10000000-0000-4000-8000-0000000000c5", A, PAGE, "page"), /check constraint/);
    });
  });

  test("users can neither register a memo nor turn a page into one", async () => {
    await as("authenticated", A, async () => {
      await expectDenied(memoRow("10000000-0000-4000-8000-0000000000c6", A, PAGE));
      await expectDenied(db.query(`update public.ledger_documents set kind = 'memo', memo_for = $1 where id <> $1`, [PAGE]));
      await expectDenied(db.query(`update public.ledger_documents set memo_for = null where kind = 'memo'`));
    });
  });

  test("deleting a page deletes its memos", async () => {
    const page = "10000000-0000-4000-8000-0000000000d1";
    await as("service_role", null, async () => {
      await memoRow(page, A, null, "page");
      await memoRow("10000000-0000-4000-8000-0000000000d2", A, page);
    });
    await as("authenticated", A, async () => {
      expect((await db.query(`delete from public.ledger_documents where id = $1`, [page])).affectedRows).toBe(1);
      expect(await rows(`select id from public.ledger_documents where id = '10000000-0000-4000-8000-0000000000d2'`)).toHaveLength(0);
    });
  });
});

describe("reopen a confirmed page (T4)", () => {
  const PAGE = "40000000-0000-4000-8000-000000000001";
  const RUN = "40000000-0000-4000-8000-0000000000a1";
  const NEWER_RUN = "40000000-0000-4000-8000-0000000000a2";
  const OTHER_PAGE = "40000000-0000-4000-8000-000000000002";
  const OTHER_RUN = "40000000-0000-4000-8000-0000000000b1";
  const DRAFT_PAGE = "40000000-0000-4000-8000-000000000003";
  const DRAFT_RUN = "40000000-0000-4000-8000-0000000000c1";
  const DAY = "2026-11-02";

  type Preview = { document_id: string; latest: boolean; record_ids: string[]; business_date: string; closed_days: string[] };
  const preview = async (run: string, owner = A) => (await rows(`select public.scriba_reopen_preview($1, $2) as p`, [owner, run]))[0]!.p as Preview;
  const reopen = async (run: string, owner = A) => (await rows(`select public.scriba_reopen_page($1, $2) as r`, [owner, run]))[0]!.r;
  const recordsOf = (doc: string) =>
    rows(`select id, run_id, transaction_type, amount_poisha::int as amount_poisha, party_id from public.confirmed_records where document_id = $1 order by line_order`, [doc]);

  // Karim's part, as a hand-made reading: "before" ৳260, rice ৳180, paid ৳200.
  function karimLines() {
    const line = (n: number, type: string, text: string, amount: string, poisha: number) => ({
      candidate_id: `k${n}`, line_order: n, source_text: text, transaction_type: type, customer_alias: "করিম",
      amount_text: amount, amount_poisha: poisha, crossed_out: false, review_fields: [],
      entry_values: { sourceText: text, type, customer: "করিম", item: null, quantityText: null, unit: null, rateText: null, amountText: amount, balanceText: null, crossedOut: false },
    });
    return [line(1, "opening_balance", "আগের ২৬০", "২৬০", 26000), line(2, "credit_sale", "চাল ১৮০", "১৮০", 18000), line(3, "repayment", "জমা ২০০", "২০০", 20000)];
  }

  async function reading(doc: string, run: string, key: string, startedAt: string) {
    await db.query(
      `insert into public.extraction_runs (id, document_id, owner_id, request_id, cache_key, model_id, prompt_version, schema_version, processing_mode, started_at)
       values ($1, $2, $3, gen_random_uuid(), $4, 'm', 'p6', 's3', 'baseline_original', $5)`,
      [run, doc, A, key.repeat(32), startedAt],
    );
    await db.query(`select public.scriba_complete_extraction($1, $2, $3, $4, $5, '[]')`, [
      A,
      run,
      JSON.stringify({ elapsed_ms: 1, raw_output_text: "{}", result: { ok: true }, validator_version: "v1" }),
      JSON.stringify(karimLines()),
      JSON.stringify({ ledgerType: "customer_credit", dateText: null, accountName: "করিম" }),
    ]);
  }

  async function page(doc: string, run: string, key: string) {
    await db.query(
      `insert into public.ledger_documents (id, owner_id, storage_path, sha256, mime_type, byte_size, width, height, business_date)
       values ($1::uuid, $2::uuid, $2::text || '/' || $1::text || '.png', $3, 'image/png', 100, 64, 64, $4)`,
      [doc, A, key.repeat(32), DAY],
    );
    await reading(doc, run, key, `${DAY}T10:00:00+06:00`);
  }

  /** Confirm every draft line of a reading, as the confirm route would, with one finding. */
  async function confirmAll(run: string) {
    const drafts = await rows(
      `select er.id, er.version, x.transaction_type, x.source_text, x.amount_text, x.amount_poisha::int as amount_poisha
       from public.entry_reviews er join public.extracted_entries x on x.id = er.extracted_entry_id
       where er.run_id = $1 and er.status = 'draft' order by er.line_order`,
      [run],
    );
    const records = drafts.map((d) => ({
      entry_review_id: d.id, expected_version: d.version, transaction_type: d.transaction_type, source_text: d.source_text,
      customer_alias: "করিম", amount_text: d.amount_text, amount_poisha: d.amount_poisha, was_corrected: false, acknowledgements: {},
      party_kind: "customer", party_key: "করিম", party_name: "করিম",
    }));
    const finding = { finding_key: "b", rule_id: "balance_equation", rule_version: 1, status: "pass", severity: "info", entry_refs: [], expected_poisha: null, observed_poisha: null, message: "m" };
    await db.query(`select public.scriba_confirm_entries($1, $2, gen_random_uuid(), 'v1', $3, $4)`, [A, run, JSON.stringify(records), JSON.stringify([finding])]);
  }

  let firstRecords: string[] = [];

  test("reopen: the page's records leave the khata, its lines are drafts again, and the audit trail keeps everything", async () => {
    await as("service_role", null, async () => {
      await page(PAGE, RUN, "41");
      await page(OTHER_PAGE, OTHER_RUN, "42");
      await page(DRAFT_PAGE, DRAFT_RUN, "43");
      await confirmAll(RUN);
      await confirmAll(OTHER_RUN);
    });
    const before = await as("service_role", null, () => recordsOf(PAGE));
    expect(before).toHaveLength(3);
    firstRecords = before.map((r) => r.id as string);

    await as("service_role", null, async () => {
      expect(await preview(RUN)).toEqual({ document_id: PAGE, latest: true, record_ids: firstRecords, business_date: DAY, closed_days: [] });
      // The preview changes nothing.
      expect(await recordsOf(PAGE)).toHaveLength(3);
      expect(await reopen(RUN)).toEqual({ records: 3, lines: 3, business_date: DAY, closed_days: [] });
    });

    await as("authenticated", A, async () => {
      expect(await recordsOf(PAGE)).toHaveLength(0);
      expect((await rows(`select status from public.entry_reviews where run_id = $1`, [RUN])).map((r) => r.status)).toEqual(["draft", "draft", "draft"]);
      expect(await rows(`select status from public.ledger_documents where id = $1`, [PAGE])).toEqual([{ status: "extracted" }]);

      // Each line says it was reopened...
      const lineEvents = await rows(
        `select action, previous_values ->> 'status' as was, new_values ->> 'status' as now from public.review_events
         where run_id = $1 and entry_review_id is not null order by id`,
        [RUN],
      );
      expect(lineEvents.map((e) => e.action)).toEqual(["confirm", "confirm", "confirm", "reopen", "reopen", "reopen"]);
      expect(lineEvents.slice(3).every((e) => e.was === "confirmed" && e.now === "draft")).toBe(true);
      // ...and the page's event holds the records that left, as they were.
      const [event] = await rows(`select previous_values, new_values from public.review_events where run_id = $1 and entry_review_id is null and action = 'reopen'`, [RUN]);
      const left = event!.previous_values as { status: string; records: Array<Record<string, unknown>> };
      expect(left.status).toBe("confirmed");
      expect(left.records.map((r) => [r.id, r.run_id, r.transaction_type, r.amount_poisha, r.party_id])).toEqual(
        before.map((r) => [r.id, r.run_id, r.transaction_type, r.amount_poisha, r.party_id]),
      );
      expect(event!.new_values).toEqual({ status: "extracted", lines: 3, closed_days: [] });

      // The confirmation's findings stay as history, and the party stays.
      expect(await rows(`select id from public.validation_findings where run_id = $1 and scope = 'confirmation'`, [RUN])).toHaveLength(1);
      expect(await rows(`select id from public.parties where id = $1`, [before[0]!.party_id])).toHaveLength(1);
      // He can change the lines again.
      const upd = await db.query(`update public.entry_reviews set review_fields = '{amount}' where run_id = $1 and line_order = 2`, [RUN]);
      expect(upd.affectedRows).toBe(1);

      // Another page is untouched.
      expect(await recordsOf(OTHER_PAGE)).toHaveLength(3);
      expect(await rows(`select status from public.ledger_documents where id = $1`, [OTHER_PAGE])).toEqual([{ status: "confirmed" }]);
    });
  });

  test("confirming again goes through the same function and makes new records", async () => {
    await as("service_role", null, () => confirmAll(RUN));
    await as("authenticated", A, async () => {
      const again = (await recordsOf(PAGE)).map((r) => r.id as string);
      expect(again).toHaveLength(3);
      expect(again.some((id) => firstRecords.includes(id))).toBe(false);
      expect(await rows(`select status from public.ledger_documents where id = $1`, [PAGE])).toEqual([{ status: "confirmed" }]);
    });
  });

  test("refused: another owner's reading, a page never confirmed, an older reading", async () => {
    await as("service_role", null, async () => {
      await expectDenied(reopen(RUN, B), /not a succeeded reading/);
      await expectDenied(preview(RUN, B), /not a succeeded reading/);
      await expectDenied(reopen(DRAFT_RUN), /nothing in the khata/);
      expect(await recordsOf(PAGE)).toHaveLength(3);

      // The page is read again: only the newer reading, the one the check screen shows, can reopen it.
      await reading(PAGE, NEWER_RUN, "4a", `${DAY}T11:00:00+06:00`);
      expect((await preview(RUN)).latest).toBe(false);
      await expectDenied(reopen(RUN), /not the latest reading/);
      expect(await recordsOf(PAGE)).toHaveLength(3);

      // Reopening from the newer reading takes out the records the older one put in...
      expect(await reopen(NEWER_RUN)).toMatchObject({ records: 3, lines: 3 });
      expect(await recordsOf(PAGE)).toHaveLength(0);
      expect((await rows(`select status from public.entry_reviews where run_id = $1`, [RUN])).every((r) => r.status === "draft")).toBe(true);
      const [event] = await rows(`select previous_values from public.review_events where run_id = $1 and entry_review_id is null and action = 'reopen'`, [NEWER_RUN]);
      expect((event!.previous_values as { records: Array<{ run_id: string }> }).records.every((r) => r.run_id === RUN)).toBe(true);

      // ...so the newer reading can be confirmed.
      await confirmAll(NEWER_RUN);
      expect((await recordsOf(PAGE)).map((r) => r.run_id)).toEqual([NEWER_RUN, NEWER_RUN, NEWER_RUN]);
    });
  });

  test("a closed day: the page is still reopened, the close keeps its snapshot, and both say which days", async () => {
    await as("service_role", null, async () => {
      const [record] = await recordsOf(PAGE);
      // Its own day, and the day before, closed while one of its records was dated then.
      await db.query(
        `insert into public.day_closes (owner_id, business_date, opening_cash_poisha, expected_cash_poisha, counted_cash_poisha, record_ids)
         values ($1, $2, 0, 0, 0, '{}'), ($1, '2026-11-01', 0, 0, 0, array[$3::uuid])`,
        [A, DAY, record!.id],
      );
      expect((await preview(NEWER_RUN)).closed_days).toEqual(["2026-11-01", DAY]);
      expect(await reopen(NEWER_RUN)).toEqual({ records: 3, lines: 3, business_date: DAY, closed_days: ["2026-11-01", DAY] });
      const [close] = await rows(`select record_ids from public.day_closes where owner_id = $1 and business_date = '2026-11-01'`, [A]);
      expect(close!.record_ids).toEqual([record!.id]);
    });
  });

  test("users can call neither function", async () => {
    await as("authenticated", A, async () => {
      await expectDenied(preview(NEWER_RUN));
      await expectDenied(reopen(NEWER_RUN));
    });
  });

  test("rejected → draft is still a restore", async () => {
    await as("authenticated", A, async () => {
      await db.query(`update public.entry_reviews set status = 'rejected' where run_id = $1 and line_order = 3`, [DRAFT_RUN]);
      await db.query(`update public.entry_reviews set status = 'draft' where run_id = $1 and line_order = 3`, [DRAFT_RUN]);
      const events = await rows(`select action from public.review_events where run_id = $1 order by id`, [DRAFT_RUN]);
      expect(events.map((e) => e.action)).toEqual(["reject", "restore"]);
    });
  });

  test("a client stuck in a loop is stopped after 30 reopens in an hour", async () => {
    await as("service_role", null, async () => {
      await confirmAll(NEWER_RUN);
      await db.query(
        `insert into public.review_events (owner_id, document_id, run_id, action)
         select $1, $2, $3, 'reopen' from generate_series(1, 30)`,
        [A, DRAFT_PAGE, DRAFT_RUN],
      );
      await expectDenied(reopen(NEWER_RUN), /too many pages reopened/);
      expect(await recordsOf(PAGE)).toHaveLength(3);
    });
  });
});
