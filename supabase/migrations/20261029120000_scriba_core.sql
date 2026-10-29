-- Scriba core schema.
--
-- Security model
--   * Every table is owner-scoped and has RLS enabled.
--   * Signed-in users can READ their own rows.
--   * Users can WRITE only what they author: review edits, page edits, ground truth,
--     document labels and deletions.
--   * Records that must be server-attested (document metadata computed from the real
--     bytes, Meta extraction attempts and usage, confirmations, evaluation results)
--     are written only by the server with the secret key, after it has verified the
--     signed-in user. Users cannot forge them through the Data API.
--   * Review history is written by triggers, so it cannot be bypassed or edited.
--   * Composite foreign keys keep owner, document and run consistent on every row.

-- ---------------------------------------------------------------------------
-- Original photographs
-- ---------------------------------------------------------------------------
create table public.ledger_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  original_filename text check (char_length(original_filename) <= 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  has_gps_metadata boolean not null default false,
  uploaded_at timestamptz not null default now(),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'extracted', 'partially_confirmed', 'confirmed')),
  dataset_label text check (char_length(dataset_label) <= 80),
  sample_label text check (char_length(sample_label) <= 80),
  retention_status text not null default 'active'
    check (retention_status in ('active', 'keep_for_evaluation', 'delete_after_event')),
  constraint ledger_documents_path_in_owner_folder check (split_part(storage_path, '/', 1) = owner_id::text),
  constraint ledger_documents_one_per_image unique (owner_id, sha256),
  constraint ledger_documents_id_owner unique (id, owner_id)
);
create index ledger_documents_owner_uploaded on public.ledger_documents (owner_id, uploaded_at desc);

-- ---------------------------------------------------------------------------
-- One row per real Meta extraction attempt, including failures
-- ---------------------------------------------------------------------------
create table public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  owner_id uuid not null,
  request_id uuid not null unique,
  cache_key text not null check (cache_key ~ '^[0-9a-f]{64}$'),
  model_id text not null,
  prompt_version text not null,
  schema_version text not null,
  processing_mode text not null check (processing_mode in ('baseline_original', 'rotate_90', 'rotate_180', 'rotate_270')),
  is_fresh_request boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'incomplete', 'invalid_output', 'uncertain')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  elapsed_ms integer check (elapsed_ms >= 0),
  provider_response_id text,
  reported_model text,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  estimated_cost_usd numeric(14, 8),
  http_status integer,
  error_category text,
  error_message text check (char_length(error_message) <= 1000),
  raw_output_text text,
  result jsonb,
  validator_version text,
  constraint extraction_runs_document foreign key (document_id, owner_id)
    references public.ledger_documents (id, owner_id) on delete cascade,
  constraint extraction_runs_success_has_result check (status <> 'succeeded' or result is not null),
  constraint extraction_runs_identity unique (id, owner_id, document_id)
);
-- At most one in-flight request per image/model/prompt/schema/mode for a user.
create unique index extraction_runs_one_pending on public.extraction_runs (owner_id, cache_key)
  where status = 'pending';
create index extraction_runs_cache_lookup on public.extraction_runs (owner_id, cache_key, status, completed_at desc);
create index extraction_runs_by_document on public.extraction_runs (document_id, started_at desc);
create index extraction_runs_rate_window on public.extraction_runs (owner_id, started_at);

create table public.extraction_cache_hits (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  document_id uuid not null,
  run_id uuid not null,
  created_at timestamptz not null default now(),
  constraint extraction_cache_hits_run foreign key (run_id, owner_id, document_id)
    references public.extraction_runs (id, owner_id, document_id) on delete cascade
);
create index extraction_cache_hits_owner on public.extraction_cache_hits (owner_id, created_at);

-- ---------------------------------------------------------------------------
-- Immutable AI candidates (never updated after insert)
-- ---------------------------------------------------------------------------
create table public.extracted_entries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  owner_id uuid not null,
  document_id uuid not null,
  candidate_id text not null,
  line_order integer not null,
  source_text text not null,
  transaction_type text not null check (transaction_type in
    ('credit_sale', 'cash_sale', 'repayment', 'opening_balance', 'closing_balance', 'subtotal', 'adjustment', 'unknown')),
  customer_alias text,
  item_name text,
  quantity_text text,
  quantity_milli bigint,
  unit text,
  unit_rate_text text,
  unit_rate_poisha bigint,
  amount_text text,
  amount_poisha bigint,
  balance_text text,
  balance_poisha bigint,
  crossed_out boolean not null default false,
  bbox jsonb,
  review_fields text[] not null default '{}',
  uncertainty_reason text,
  created_at timestamptz not null default now(),
  constraint extracted_entries_run foreign key (run_id, owner_id, document_id)
    references public.extraction_runs (id, owner_id, document_id) on delete cascade,
  constraint extracted_entries_candidate unique (run_id, candidate_id)
);
create index extracted_entries_run on public.extracted_entries (run_id, line_order);

-- ---------------------------------------------------------------------------
-- Human review layer: a working copy per candidate, edited by the owner
-- ---------------------------------------------------------------------------
create table public.entry_reviews (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  owner_id uuid not null,
  document_id uuid not null,
  -- Null for a line the reviewer added because the model missed it.
  extracted_entry_id uuid unique references public.extracted_entries (id) on delete cascade,
  line_order numeric not null,
  entry_values jsonb not null,
  review_fields text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'rejected', 'confirmed')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entry_reviews_run foreign key (run_id, owner_id, document_id)
    references public.extraction_runs (id, owner_id, document_id) on delete cascade
);
create index entry_reviews_run on public.entry_reviews (run_id, line_order);

create table public.page_reviews (
  run_id uuid primary key,
  owner_id uuid not null,
  document_id uuid not null,
  page_values jsonb not null,
  review_started_at timestamptz,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint page_reviews_run foreign key (run_id, owner_id, document_id)
    references public.extraction_runs (id, owner_id, document_id) on delete cascade
);

-- Append-only audit trail. Written only by triggers.
create table public.review_events (
  id bigint generated always as identity primary key,
  owner_id uuid not null,
  document_id uuid not null,
  run_id uuid not null,
  entry_review_id uuid,
  action text not null check (action in ('add_row', 'edit', 'reject', 'restore', 'confirm', 'page_edit')),
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now(),
  constraint review_events_run foreign key (run_id, owner_id, document_id)
    references public.extraction_runs (id, owner_id, document_id) on delete cascade
);
create index review_events_run on public.review_events (run_id, created_at);

-- ---------------------------------------------------------------------------
-- Deterministic validation results (at extraction and at each confirmation)
-- ---------------------------------------------------------------------------
create table public.validation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  owner_id uuid not null,
  document_id uuid not null,
  scope text not null check (scope in ('extraction', 'confirmation')),
  confirmation_id uuid,
  finding_key text not null,
  rule_id text not null,
  rule_version integer not null,
  validator_version text not null,
  status text not null check (status in ('pass', 'fail', 'unverifiable')),
  severity text not null check (severity in ('info', 'warning', 'error')),
  -- Candidate ids for extraction scope; entry_reviews ids for confirmation scope.
  entry_refs text[] not null,
  expected_poisha bigint,
  observed_poisha bigint,
  message text not null,
  created_at timestamptz not null default now(),
  constraint validation_findings_run foreign key (run_id, owner_id, document_id)
    references public.extraction_runs (id, owner_id, document_id) on delete cascade,
  constraint validation_findings_confirmation_scope check ((scope = 'confirmation') = (confirmation_id is not null))
);
create index validation_findings_run on public.validation_findings (run_id, scope);

-- ---------------------------------------------------------------------------
-- Approved Scriba records (inside Scriba only; not an accounting posting)
-- ---------------------------------------------------------------------------
create table public.confirmed_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  document_id uuid not null,
  run_id uuid not null,
  entry_review_id uuid not null unique references public.entry_reviews (id) on delete cascade,
  extracted_entry_id uuid references public.extracted_entries (id) on delete set null,
  confirmation_id uuid not null,
  line_order numeric not null,
  transaction_type text not null check (transaction_type in
    ('credit_sale', 'cash_sale', 'repayment', 'opening_balance', 'closing_balance', 'subtotal', 'adjustment')),
  source_text text not null,
  customer_alias text,
  item_name text,
  quantity_text text,
  quantity_milli bigint,
  unit text,
  unit_rate_text text,
  unit_rate_poisha bigint,
  amount_text text not null,
  amount_poisha bigint not null,
  balance_text text,
  balance_poisha bigint,
  was_corrected boolean not null,
  acknowledgements jsonb not null default '{}'::jsonb,
  validator_version text not null,
  confirmed_at timestamptz not null default now(),
  constraint confirmed_records_run foreign key (run_id, owner_id, document_id)
    references public.extraction_runs (id, owner_id, document_id) on delete cascade
);
create index confirmed_records_owner on public.confirmed_records (owner_id, confirmed_at desc);

-- ---------------------------------------------------------------------------
-- Evaluation: private ground truth (versioned, immutable) and benchmark runs
-- ---------------------------------------------------------------------------
create table public.ground_truth_annotations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  document_id uuid not null,
  gt_version integer not null check (gt_version >= 1),
  annotation jsonb not null,
  created_at timestamptz not null default now(),
  constraint ground_truth_document foreign key (document_id, owner_id)
    references public.ledger_documents (id, owner_id) on delete cascade,
  constraint ground_truth_version unique (document_id, gt_version)
);

create table public.evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  label text not null default 'exploratory',
  dataset_label text,
  model_id text not null,
  prompt_version text not null,
  schema_version text not null,
  processing_mode text not null,
  validator_version text not null,
  metrics_version text not null,
  sample_count integer not null check (sample_count >= 0),
  summary jsonb not null,
  samples jsonb not null
);
create index evaluation_runs_owner on public.evaluation_runs (owner_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers: versioning and audit history
-- ---------------------------------------------------------------------------
create function public.scriba_bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger entry_reviews_bump_version before update on public.entry_reviews
  for each row execute function public.scriba_bump_version();
create trigger page_reviews_bump_version before update on public.page_reviews
  for each row execute function public.scriba_bump_version();

create function public.scriba_audit_entry_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    if new.extracted_entry_id is not null then
      return new; -- initial copy of an AI candidate, not a human action
    end if;
    v_action := 'add_row';
  elsif new.status is distinct from old.status then
    v_action := case new.status
      when 'rejected' then 'reject'
      when 'confirmed' then 'confirm'
      else 'restore'
    end;
  elsif new.entry_values is distinct from old.entry_values
     or new.review_fields is distinct from old.review_fields
     or new.line_order is distinct from old.line_order then
    v_action := 'edit';
  else
    return new;
  end if;

  insert into public.review_events
    (owner_id, document_id, run_id, entry_review_id, action, previous_values, new_values)
  values (
    new.owner_id, new.document_id, new.run_id, new.id, v_action,
    case when tg_op = 'UPDATE' then
      jsonb_build_object('entry_values', old.entry_values, 'review_fields', to_jsonb(old.review_fields), 'status', old.status)
    end,
    jsonb_build_object('entry_values', new.entry_values, 'review_fields', to_jsonb(new.review_fields), 'status', new.status)
  );
  return new;
end;
$$;

create trigger entry_reviews_audit after insert or update on public.entry_reviews
  for each row execute function public.scriba_audit_entry_review();

create function public.scriba_audit_page_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.page_values is distinct from old.page_values then
    insert into public.review_events (owner_id, document_id, run_id, action, previous_values, new_values)
    values (new.owner_id, new.document_id, new.run_id, 'page_edit', old.page_values, new.page_values);
  end if;
  return new;
end;
$$;

create trigger page_reviews_audit after update on public.page_reviews
  for each row execute function public.scriba_audit_page_review();

-- AI candidates are immutable, even for the server.
create function public.scriba_reject_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'extracted_entries are immutable; record corrections in entry_reviews';
end;
$$;

create trigger extracted_entries_immutable before update on public.extracted_entries
  for each row execute function public.scriba_reject_update();

-- ---------------------------------------------------------------------------
-- Server-only atomic operations (EXECUTE granted to service_role only)
-- ---------------------------------------------------------------------------

-- Record a successful extraction: run result, immutable candidates, review copies,
-- page review and extraction-time findings, all or nothing.
create function public.scriba_complete_extraction(
  p_owner_id uuid,
  p_run_id uuid,
  p_run jsonb,
  p_entries jsonb,
  p_page jsonb,
  p_findings jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_document_id uuid;
begin
  update public.extraction_runs r set
    status = 'succeeded',
    completed_at = now(),
    elapsed_ms = (p_run ->> 'elapsed_ms')::integer,
    provider_response_id = p_run ->> 'provider_response_id',
    reported_model = p_run ->> 'reported_model',
    input_tokens = (p_run ->> 'input_tokens')::integer,
    cached_input_tokens = (p_run ->> 'cached_input_tokens')::integer,
    output_tokens = (p_run ->> 'output_tokens')::integer,
    reasoning_tokens = (p_run ->> 'reasoning_tokens')::integer,
    total_tokens = (p_run ->> 'total_tokens')::integer,
    estimated_cost_usd = (p_run ->> 'estimated_cost_usd')::numeric,
    raw_output_text = p_run ->> 'raw_output_text',
    result = p_run -> 'result',
    validator_version = p_run ->> 'validator_version'
  where r.id = p_run_id and r.owner_id = p_owner_id and r.status = 'pending'
  returning r.document_id into v_document_id;

  if v_document_id is null then
    raise exception 'run % is not a pending run of this owner', p_run_id using errcode = 'P0002';
  end if;

  insert into public.extracted_entries (
    run_id, owner_id, document_id, candidate_id, line_order, source_text, transaction_type,
    customer_alias, item_name, quantity_text, quantity_milli, unit, unit_rate_text, unit_rate_poisha,
    amount_text, amount_poisha, balance_text, balance_poisha, crossed_out, bbox, review_fields, uncertainty_reason
  )
  select p_run_id, p_owner_id, v_document_id, e.candidate_id, e.line_order, e.source_text, e.transaction_type,
    e.customer_alias, e.item_name, e.quantity_text, e.quantity_milli, e.unit, e.unit_rate_text, e.unit_rate_poisha,
    e.amount_text, e.amount_poisha, e.balance_text, e.balance_poisha, e.crossed_out, e.bbox,
    coalesce(e.review_fields, '{}'), e.uncertainty_reason
  from jsonb_to_recordset(p_entries) as e(
    candidate_id text, line_order integer, source_text text, transaction_type text,
    customer_alias text, item_name text, quantity_text text, quantity_milli bigint, unit text,
    unit_rate_text text, unit_rate_poisha bigint, amount_text text, amount_poisha bigint,
    balance_text text, balance_poisha bigint, crossed_out boolean, bbox jsonb, review_fields text[],
    uncertainty_reason text, entry_values jsonb
  );

  insert into public.entry_reviews (run_id, owner_id, document_id, extracted_entry_id, line_order, entry_values, review_fields)
  select p_run_id, p_owner_id, v_document_id, x.id, x.line_order, e.entry_values, x.review_fields
  from jsonb_to_recordset(p_entries) as e(candidate_id text, entry_values jsonb)
  join public.extracted_entries x on x.run_id = p_run_id and x.candidate_id = e.candidate_id;

  insert into public.page_reviews (run_id, owner_id, document_id, page_values)
  values (p_run_id, p_owner_id, v_document_id, p_page);

  insert into public.validation_findings (
    run_id, owner_id, document_id, scope, finding_key, rule_id, rule_version, validator_version,
    status, severity, entry_refs, expected_poisha, observed_poisha, message
  )
  select p_run_id, p_owner_id, v_document_id, 'extraction', f.finding_key, f.rule_id, f.rule_version,
    p_run ->> 'validator_version', f.status, f.severity, f.entry_refs, f.expected_poisha, f.observed_poisha, f.message
  from jsonb_to_recordset(p_findings) as f(
    finding_key text, rule_id text, rule_version integer, status text, severity text,
    entry_refs text[], expected_poisha bigint, observed_poisha bigint, message text
  );

  update public.ledger_documents d set status = 'extracted'
  where d.id = v_document_id and d.status = 'uploaded';
end;
$$;

-- Confirm reviewed entries. The server has already re-run validation and the
-- approval rules; this function re-checks ownership, draft status and the exact
-- version that was assessed, then writes everything atomically.
create function public.scriba_confirm_entries(
  p_owner_id uuid,
  p_run_id uuid,
  p_confirmation_id uuid,
  p_validator_version text,
  p_records jsonb,
  p_findings jsonb
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_document_id uuid;
  v_expected integer;
  v_locked integer;
  v_open integer;
begin
  select r.document_id into v_document_id from public.extraction_runs r
  where r.id = p_run_id and r.owner_id = p_owner_id and r.status = 'succeeded';
  if v_document_id is null then
    raise exception 'run % is not a succeeded run of this owner', p_run_id using errcode = 'P0002';
  end if;

  v_expected := jsonb_array_length(p_records);
  if v_expected = 0 then
    raise exception 'nothing to confirm' using errcode = '22023';
  end if;

  -- Lock exactly the assessed versions of draft rows belonging to this run.
  select count(*) into v_locked from (
    select er.id from public.entry_reviews er
    join jsonb_to_recordset(p_records) as rec(entry_review_id uuid, expected_version integer)
      on rec.entry_review_id = er.id
    where er.run_id = p_run_id and er.owner_id = p_owner_id
      and er.status = 'draft' and er.version = rec.expected_version
    for update of er
  ) locked;
  if v_locked <> v_expected then
    raise exception 'entries changed since they were checked; reload and review again' using errcode = '40001';
  end if;

  insert into public.confirmed_records (
    owner_id, document_id, run_id, entry_review_id, extracted_entry_id, confirmation_id, line_order,
    transaction_type, source_text, customer_alias, item_name, quantity_text, quantity_milli, unit,
    unit_rate_text, unit_rate_poisha, amount_text, amount_poisha, balance_text, balance_poisha,
    was_corrected, acknowledgements, validator_version
  )
  select p_owner_id, v_document_id, p_run_id, rec.entry_review_id, er.extracted_entry_id, p_confirmation_id, er.line_order,
    rec.transaction_type, rec.source_text, rec.customer_alias, rec.item_name, rec.quantity_text, rec.quantity_milli, rec.unit,
    rec.unit_rate_text, rec.unit_rate_poisha, rec.amount_text, rec.amount_poisha, rec.balance_text, rec.balance_poisha,
    rec.was_corrected, coalesce(rec.acknowledgements, '{}'::jsonb), p_validator_version
  from jsonb_to_recordset(p_records) as rec(
    entry_review_id uuid, transaction_type text, source_text text, customer_alias text, item_name text,
    quantity_text text, quantity_milli bigint, unit text, unit_rate_text text, unit_rate_poisha bigint,
    amount_text text, amount_poisha bigint, balance_text text, balance_poisha bigint,
    was_corrected boolean, acknowledgements jsonb
  )
  join public.entry_reviews er on er.id = rec.entry_review_id;

  update public.entry_reviews er set status = 'confirmed'
  from jsonb_to_recordset(p_records) as rec(entry_review_id uuid)
  where er.id = rec.entry_review_id;

  insert into public.validation_findings (
    run_id, owner_id, document_id, scope, confirmation_id, finding_key, rule_id, rule_version, validator_version,
    status, severity, entry_refs, expected_poisha, observed_poisha, message
  )
  select p_run_id, p_owner_id, v_document_id, 'confirmation', p_confirmation_id, f.finding_key, f.rule_id, f.rule_version,
    p_validator_version, f.status, f.severity, f.entry_refs, f.expected_poisha, f.observed_poisha, f.message
  from jsonb_to_recordset(p_findings) as f(
    finding_key text, rule_id text, rule_version integer, status text, severity text,
    entry_refs text[], expected_poisha bigint, observed_poisha bigint, message text
  );

  select count(*) into v_open from public.entry_reviews er
  where er.run_id = p_run_id and er.status = 'draft';
  update public.ledger_documents d
  set status = case when v_open = 0 then 'confirmed' else 'partially_confirmed' end
  where d.id = v_document_id;

  return v_expected;
end;
$$;

revoke all on function public.scriba_complete_extraction(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.scriba_confirm_entries(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.scriba_complete_extraction(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.scriba_confirm_entries(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;
revoke all on function public.scriba_audit_entry_review() from public, anon, authenticated;
revoke all on function public.scriba_audit_page_review() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants: explicit and minimal. Anonymous visitors get nothing.
-- ---------------------------------------------------------------------------
revoke all on
  public.ledger_documents, public.extraction_runs, public.extraction_cache_hits, public.extracted_entries,
  public.entry_reviews, public.page_reviews, public.review_events, public.validation_findings,
  public.confirmed_records, public.ground_truth_annotations, public.evaluation_runs
from anon, authenticated;

grant select, delete on public.ledger_documents to authenticated;
grant update (dataset_label, sample_label, retention_status) on public.ledger_documents to authenticated;
grant select on public.extraction_runs, public.extraction_cache_hits, public.extracted_entries,
  public.review_events, public.validation_findings, public.confirmed_records, public.evaluation_runs to authenticated;
grant select, insert on public.entry_reviews to authenticated;
grant update (line_order, entry_values, review_fields, status) on public.entry_reviews to authenticated;
grant select on public.page_reviews to authenticated;
grant update (page_values, review_started_at) on public.page_reviews to authenticated;
grant select, insert, delete on public.ground_truth_annotations to authenticated;

grant all on
  public.ledger_documents, public.extraction_runs, public.extraction_cache_hits, public.extracted_entries,
  public.entry_reviews, public.page_reviews, public.review_events, public.validation_findings,
  public.confirmed_records, public.ground_truth_annotations, public.evaluation_runs
to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.ledger_documents enable row level security;
alter table public.extraction_runs enable row level security;
alter table public.extraction_cache_hits enable row level security;
alter table public.extracted_entries enable row level security;
alter table public.entry_reviews enable row level security;
alter table public.page_reviews enable row level security;
alter table public.review_events enable row level security;
alter table public.validation_findings enable row level security;
alter table public.confirmed_records enable row level security;
alter table public.ground_truth_annotations enable row level security;
alter table public.evaluation_runs enable row level security;

create policy "owner reads documents" on public.ledger_documents
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner labels documents" on public.ledger_documents
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "owner deletes documents" on public.ledger_documents
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "owner reads runs" on public.extraction_runs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner reads cache hits" on public.extraction_cache_hits
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner reads candidates" on public.extracted_entries
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner reads review events" on public.review_events
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner reads findings" on public.validation_findings
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner reads records" on public.confirmed_records
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner reads evaluations" on public.evaluation_runs
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "owner reads reviews" on public.entry_reviews
  for select to authenticated using (owner_id = (select auth.uid()));
-- A reviewer may add a missed line to their own succeeded run, as a draft only.
create policy "owner adds missed lines" on public.entry_reviews
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and extracted_entry_id is null
    and status = 'draft'
    and exists (
      select 1 from public.extraction_runs r
      where r.id = run_id and r.owner_id = (select auth.uid()) and r.status = 'succeeded'
    )
  );
-- Drafts can be edited or rejected; only the server can confirm, and confirmed rows are locked.
create policy "owner edits drafts" on public.entry_reviews
  for update to authenticated
  using (owner_id = (select auth.uid()) and status <> 'confirmed')
  with check (owner_id = (select auth.uid()) and status in ('draft', 'rejected'));

create policy "owner reads page reviews" on public.page_reviews
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner edits page reviews" on public.page_reviews
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "owner reads ground truth" on public.ground_truth_annotations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner adds ground truth" on public.ground_truth_annotations
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner deletes ground truth" on public.ground_truth_annotations
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private storage for original photographs
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scriba-originals', 'scriba-originals', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects live under "<user id>/<random uuid>.<ext>". No UPDATE policy exists, so an
-- uploaded original can never be overwritten in place.
create policy "scriba originals: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'scriba-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scriba originals: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'scriba-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scriba originals: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'scriba-originals' and (storage.foldername(name))[1] = (select auth.uid())::text);
