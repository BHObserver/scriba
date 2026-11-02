-- U4 (docs/PLAN_V3.md): company memos (challans). Additive only.
--
-- A company's rep leaves a printed memo with the goods, their quantities and prices. It is
-- photographed with the page and read on its own (prompt scriba-memo-1). Code matches its lines
-- to the visit's goods and proposes their prices; the shopkeeper confirms them on the page.
--
-- A memo is a photo like a page, so it is a ledger_documents row: the same private bucket,
-- integrity checks and credit-controlled runs. Its reading is its run's result. It has no review
-- rows and is never confirmed, so it never becomes a record by itself.
--
-- kind: 'page' (every document so far) or 'memo'. memo_for: the page it was photographed with,
-- of the same owner. Deleting the page deletes its memos' rows (the route removes their photos).

alter table public.ledger_documents
  add column kind text not null default 'page' check (kind in ('page', 'memo')),
  add column memo_for uuid,
  add constraint ledger_documents_memo_page foreign key (memo_for, owner_id)
    references public.ledger_documents (id, owner_id) on delete cascade,
  add constraint ledger_documents_memo_has_page check ((kind = 'memo') = (memo_for is not null));

create index ledger_documents_memos on public.ledger_documents (memo_for) where memo_for is not null;

-- A memo belongs to a page, never to another memo.
create function public.scriba_memo_for_a_page() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.memo_for is not null and not exists (
    select 1 from public.ledger_documents d where d.id = new.memo_for and d.kind = 'page'
  ) then
    raise exception 'A memo must belong to a page.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.scriba_memo_for_a_page() from public, anon, authenticated;

create trigger ledger_documents_memo_for_a_page
  before insert or update of kind, memo_for on public.ledger_documents
  for each row execute function public.scriba_memo_for_a_page();

-- Written only by the server (service role) when it registers the photo. The existing grants give
-- the owner select, delete and update of the labels only, so kind and memo_for can't be changed.
