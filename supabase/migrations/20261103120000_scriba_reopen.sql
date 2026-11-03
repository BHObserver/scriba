-- T4 (docs/PLAN_V3.md, "Trust fixes"): reopen a confirmed page. Additive only.
--
-- A confirmed page can be opened again to fix it. Its records leave the khata and its lines go
-- back to drafts. Confirming again goes through the same approval rules (the confirm route and
-- scriba_confirm_entries, unchanged).
--
-- Nothing is lost. Each line's audit event says it was reopened, and one event for the page
-- holds every record that left, as it was.
--
-- What stays:
--   * the lines' values and his answers (page_reviews);
--   * the confirmation's validation findings, as history;
--   * the parties: with no records they owe nothing and don't show on dues;
--   * a closed day's snapshot. Its record ids then name records that are gone; the functions say
--     which closed days held the page, so the app can warn.
--
-- A page is reopened from the reading the check screen shows: its latest succeeded run. Every
-- record the page has leaves, whichever reading it was confirmed from, so the reading shown can
-- then be confirmed (the confirm route refuses a second reading while another one's records stand).

-- ---------------------------------------------------------------------------
-- The audit trail learns the new action
-- ---------------------------------------------------------------------------
alter table public.review_events drop constraint review_events_action_check;
alter table public.review_events add constraint review_events_action_check
  check (action in ('add_row', 'edit', 'reject', 'restore', 'confirm', 'page_edit', 'reopen'));

-- The page-level reopen events, counted for the rate limit below.
create index review_events_page_reopens on public.review_events (owner_id, created_at)
  where action = 'reopen' and entry_review_id is null;

-- Same as the core migration, except that confirmed -> draft is a reopen, not a restore.
create or replace function public.scriba_audit_entry_review() returns trigger
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
    v_action := case
      when new.status = 'rejected' then 'reject'
      when new.status = 'confirmed' then 'confirm'
      when old.status = 'confirmed' then 'reopen'
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

revoke all on function public.scriba_audit_entry_review() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Server-only operations (EXECUTE granted to service_role only)
-- ---------------------------------------------------------------------------

-- What reopening the page of this reading would do, without doing it. The reopen below uses it
-- too, so the warning he reads before tapping is the rule that runs.
--   latest:       this run is the page's latest succeeded reading (only that one can reopen it);
--   record_ids:   the page's records in the khata, from any of its readings;
--   closed_days:  the closed days that hold the page: its own day, or a close naming one of its
--                 records (a page whose date was moved after its day was closed).
create function public.scriba_reopen_preview(p_owner_id uuid, p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_document_id uuid;
  v_business_date date;
  v_latest uuid;
  v_ids uuid[];
  v_closed jsonb;
begin
  select d.id, d.business_date into v_document_id, v_business_date
  from public.extraction_runs r
  join public.ledger_documents d on d.id = r.document_id and d.owner_id = r.owner_id
  where r.id = p_run_id and r.owner_id = p_owner_id and r.status = 'succeeded' and d.kind = 'page';
  if v_document_id is null then
    raise exception 'run % is not a succeeded reading of a page of this owner', p_run_id using errcode = 'P0002';
  end if;

  select r.id into v_latest from public.extraction_runs r
  where r.document_id = v_document_id and r.status = 'succeeded'
  order by r.started_at desc, r.id desc
  limit 1;

  select coalesce(array_agg(c.id order by c.line_order, c.id), '{}') into v_ids
  from public.confirmed_records c
  where c.document_id = v_document_id and c.owner_id = p_owner_id;

  select coalesce(jsonb_agg(dc.business_date order by dc.business_date), '[]'::jsonb) into v_closed
  from public.day_closes dc
  where dc.owner_id = p_owner_id and (dc.business_date = v_business_date or dc.record_ids && v_ids);

  return jsonb_build_object(
    'document_id', v_document_id,
    'latest', v_latest = p_run_id,
    'record_ids', to_jsonb(v_ids),
    'business_date', v_business_date,
    'closed_days', v_closed
  );
end;
$$;

-- Reopen the page of this reading: its records leave the khata, its confirmed lines become drafts,
-- and the page is back to 'extracted'. All or nothing. Returns what it did, as the preview names it.
create function public.scriba_reopen_page(p_owner_id uuid, p_run_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_document_id uuid;
  v_status text;
  v_preview jsonb;
  v_records jsonb;
  v_rows integer;
begin
  select r.document_id into v_document_id from public.extraction_runs r
  where r.id = p_run_id and r.owner_id = p_owner_id and r.status = 'succeeded';
  if v_document_id is null then
    raise exception 'run % is not a succeeded reading of a page of this owner', p_run_id using errcode = 'P0002';
  end if;

  -- Every line of the page, of every reading, before anything is read: a confirmation running at
  -- the same time either finishes first (and its records leave too) or waits for this one.
  perform 1 from public.entry_reviews er
  where er.document_id = v_document_id and er.owner_id = p_owner_id
  for update;

  select d.status into v_status from public.ledger_documents d where d.id = v_document_id;
  v_preview := public.scriba_reopen_preview(p_owner_id, p_run_id);
  if not (v_preview ->> 'latest')::boolean then
    raise exception 'run % is not the latest reading of its page', p_run_id
      using errcode = '55000', hint = 'not_latest';
  end if;
  if jsonb_array_length(v_preview -> 'record_ids') = 0 then
    raise exception 'this page has nothing in the khata to reopen' using errcode = '55000', hint = 'not_confirmed';
  end if;

  -- A bound on a client stuck in a loop; a shopkeeper fixing pages never comes near it.
  if (select count(*) from public.review_events e
      where e.owner_id = p_owner_id and e.action = 'reopen' and e.entry_review_id is null
        and e.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many pages reopened in the last hour' using errcode = '53400', hint = 'busy';
  end if;

  -- The records as they were, for the audit trail.
  select jsonb_agg(to_jsonb(c) order by c.line_order, c.id) into v_records
  from public.confirmed_records c
  where c.document_id = v_document_id and c.owner_id = p_owner_id;

  delete from public.confirmed_records c
  where c.document_id = v_document_id and c.owner_id = p_owner_id;

  -- The audit trigger writes a 'reopen' event for each line.
  update public.entry_reviews er set status = 'draft'
  where er.document_id = v_document_id and er.owner_id = p_owner_id and er.status = 'confirmed';
  get diagnostics v_rows = row_count;

  update public.ledger_documents d set status = 'extracted' where d.id = v_document_id;

  insert into public.review_events (owner_id, document_id, run_id, action, previous_values, new_values)
  values (
    p_owner_id, v_document_id, p_run_id, 'reopen',
    jsonb_build_object('status', v_status, 'records', v_records),
    jsonb_build_object('status', 'extracted', 'lines', v_rows, 'closed_days', v_preview -> 'closed_days')
  );

  return jsonb_build_object(
    'records', jsonb_array_length(v_preview -> 'record_ids'),
    'lines', v_rows,
    'business_date', v_preview -> 'business_date',
    'closed_days', v_preview -> 'closed_days'
  );
end;
$$;

revoke all on function public.scriba_reopen_preview(uuid, uuid) from public, anon, authenticated;
revoke all on function public.scriba_reopen_page(uuid, uuid) from public, anon, authenticated;
grant execute on function public.scriba_reopen_preview(uuid, uuid) to service_role;
grant execute on function public.scriba_reopen_page(uuid, uuid) to service_role;
