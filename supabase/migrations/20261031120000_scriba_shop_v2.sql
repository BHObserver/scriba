-- Scriba data model v2: the shop.
--
-- Additive only. Adds money-out transaction types, parties (customers and
-- suppliers), the business date of a page, the shop profile and day closes.
-- The security model of the core migration is unchanged:
--   * every new table is owner-scoped with RLS;
--   * users write only what they author (shop profile, a party's display name,
--     a page's business date);
--   * parties are created and linked by the server inside the confirmation
--     function, and day closes (whose expected cash is computed by code) are
--     written by the server only.

-- ---------------------------------------------------------------------------
-- Transaction types: money out and payables
-- ---------------------------------------------------------------------------
alter table public.extracted_entries drop constraint extracted_entries_transaction_type_check;
alter table public.extracted_entries add constraint extracted_entries_transaction_type_check check (transaction_type in
  ('credit_sale', 'cash_sale', 'repayment', 'purchase', 'credit_purchase', 'supplier_payment', 'expense',
   'opening_balance', 'closing_balance', 'subtotal', 'adjustment', 'unknown'));

alter table public.confirmed_records drop constraint confirmed_records_transaction_type_check;
alter table public.confirmed_records add constraint confirmed_records_transaction_type_check check (transaction_type in
  ('credit_sale', 'cash_sale', 'repayment', 'purchase', 'credit_purchase', 'supplier_payment', 'expense',
   'opening_balance', 'closing_balance', 'subtotal', 'adjustment'));

-- ---------------------------------------------------------------------------
-- Business date of a page: the written date when it parses, else the capture
-- date in Bangladesh time; the user can change it.
-- ---------------------------------------------------------------------------
alter table public.ledger_documents
  add column business_date date not null default ((now() at time zone 'Asia/Dhaka')::date),
  add column business_date_source text not null default 'capture'
    check (business_date_source in ('capture', 'written', 'user'));
update public.ledger_documents set business_date = (uploaded_at at time zone 'Asia/Dhaka')::date;
create index ledger_documents_owner_business_date on public.ledger_documents (owner_id, business_date desc);

-- ---------------------------------------------------------------------------
-- Parties: the customers and suppliers named in the khata
-- ---------------------------------------------------------------------------
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('customer', 'supplier')),
  display_name text not null check (char_length(display_name) between 1 and 200),
  -- Spelling-variant key computed in TypeScript (src/lib/ledger/parties.ts).
  normalized_key text not null check (char_length(normalized_key) between 1 and 200),
  merged_into uuid,
  created_at timestamptz not null default now(),
  unique (id, owner_id),
  unique (owner_id, kind, normalized_key),
  constraint parties_not_merged_into_self check (merged_into is null or merged_into <> id),
  constraint parties_merged_into_same_owner foreign key (merged_into, owner_id)
    references public.parties (id, owner_id) on delete set null (merged_into)
);
create index parties_owner on public.parties (owner_id, kind);

alter table public.confirmed_records
  add column party_id uuid,
  add constraint confirmed_records_party foreign key (party_id, owner_id)
    references public.parties (id, owner_id) on delete set null (party_id);
create index confirmed_records_owner_party on public.confirmed_records (owner_id, party_id);

-- ---------------------------------------------------------------------------
-- Shop profile and day closes
-- ---------------------------------------------------------------------------
create table public.shop_profiles (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  shop_name text not null check (char_length(btrim(shop_name)) between 1 and 80),
  language text not null default 'bn' check (language in ('bn', 'en')),
  -- The usual cash in the drawer at the start of a day, in poisha.
  opening_cash_poisha bigint not null default 0 check (opening_cash_poisha between 0 and 100000000000),
  -- The demo shop. Set by the seed script only; drives the "sample shop" badge.
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.day_closes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_date date not null,
  opening_cash_poisha bigint not null,
  expected_cash_poisha bigint not null,
  counted_cash_poisha bigint not null check (counted_cash_poisha between 0 and 100000000000),
  -- Snapshot of how the expected cash was computed, and the records behind it.
  breakdown jsonb not null default '{}'::jsonb,
  record_ids uuid[] not null default '{}',
  note text check (char_length(note) <= 500),
  closed_at timestamptz not null default now(),
  unique (owner_id, business_date)
);

-- ---------------------------------------------------------------------------
-- Confirmation now links each record to its party, creating the party if new.
-- Same signature and grants as the core migration; only the party lines are new.
-- ---------------------------------------------------------------------------
create or replace function public.scriba_confirm_entries(
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

  -- Parties named on these lines. The server computed kind and normalized key.
  insert into public.parties (owner_id, kind, display_name, normalized_key)
  select distinct on (rec.party_kind, rec.party_key) p_owner_id, rec.party_kind, rec.party_name, rec.party_key
  from jsonb_to_recordset(p_records) as rec(party_kind text, party_key text, party_name text)
  where rec.party_key is not null
  order by rec.party_kind, rec.party_key
  on conflict (owner_id, kind, normalized_key) do nothing;

  insert into public.confirmed_records (
    owner_id, document_id, run_id, entry_review_id, extracted_entry_id, confirmation_id, line_order,
    transaction_type, source_text, customer_alias, item_name, quantity_text, quantity_milli, unit,
    unit_rate_text, unit_rate_poisha, amount_text, amount_poisha, balance_text, balance_poisha,
    was_corrected, acknowledgements, validator_version, party_id
  )
  select p_owner_id, v_document_id, p_run_id, rec.entry_review_id, er.extracted_entry_id, p_confirmation_id, er.line_order,
    rec.transaction_type, rec.source_text, rec.customer_alias, rec.item_name, rec.quantity_text, rec.quantity_milli, rec.unit,
    rec.unit_rate_text, rec.unit_rate_poisha, rec.amount_text, rec.amount_poisha, rec.balance_text, rec.balance_poisha,
    rec.was_corrected, coalesce(rec.acknowledgements, '{}'::jsonb), p_validator_version, coalesce(p.merged_into, p.id)
  from jsonb_to_recordset(p_records) as rec(
    entry_review_id uuid, transaction_type text, source_text text, customer_alias text, item_name text,
    quantity_text text, quantity_milli bigint, unit text, unit_rate_text text, unit_rate_poisha bigint,
    amount_text text, amount_poisha bigint, balance_text text, balance_poisha bigint,
    was_corrected boolean, acknowledgements jsonb, party_kind text, party_key text
  )
  join public.entry_reviews er on er.id = rec.entry_review_id
  left join public.parties p
    on p.owner_id = p_owner_id and p.kind = rec.party_kind and p.normalized_key = rec.party_key;

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

revoke all on function public.scriba_confirm_entries(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.scriba_confirm_entries(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on public.parties, public.shop_profiles, public.day_closes from anon, authenticated;

grant update (business_date, business_date_source) on public.ledger_documents to authenticated;
grant select on public.parties, public.day_closes to authenticated;
grant update (display_name) on public.parties to authenticated;
grant select on public.shop_profiles to authenticated;
grant insert (owner_id, shop_name, language, opening_cash_poisha) on public.shop_profiles to authenticated;
grant update (shop_name, language, opening_cash_poisha) on public.shop_profiles to authenticated;

grant all on public.parties, public.shop_profiles, public.day_closes to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.parties enable row level security;
alter table public.shop_profiles enable row level security;
alter table public.day_closes enable row level security;

create policy "owner reads parties" on public.parties
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner renames parties" on public.parties
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "owner reads shop profile" on public.shop_profiles
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "owner creates shop profile" on public.shop_profiles
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "owner edits shop profile" on public.shop_profiles
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "owner reads day closes" on public.day_closes
  for select to authenticated using (owner_id = (select auth.uid()));
