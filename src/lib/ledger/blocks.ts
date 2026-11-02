/**
 * Blocks (schema 3): writing on a page that belongs together, wherever it sits. A block's
 * kind, not the page's, decides who is on the other side of its lines and which checks run.
 * Pure helpers shared by the parser, parties, the checks and review.
 */
import type { PartyKind } from "./parties";
import type { BlockKind, BlockValues, EntryValues, PageValues } from "./types";

const PARTY_KIND_OF: Record<BlockKind, PartyKind | null> = {
  customer_account: "customer",
  supplier_visit: "supplier",
  supplier_account: "supplier",
  day_sales: null,
  expenses: null,
  other: null,
};

/** The party kind every line of the block deals with, or null when each line decides (day sales) or none does. */
export function blockPartyKind(kind: BlockKind): PartyKind | null {
  return PARTY_KIND_OF[kind];
}

/** The page's blocks; empty on readings without blocks (prompt 4 and earlier). */
export function pageBlocks(page: PageValues): BlockValues[] {
  return page.blocks ?? [];
}

/** The block a line belongs to, or null when the page has no blocks or the id names none. */
export function blockOf(values: EntryValues, page: PageValues): BlockValues | null {
  if (!values.block) return null;
  return pageBlocks(page).find((b) => b.id === values.block) ?? null;
}

export type BlockGroup<T> = { block: BlockValues | null; entries: T[] };

/**
 * Lines grouped by block, in the page's block order, each group in the given line order.
 * A page without blocks is one group with block null, so the page-level rules apply as before.
 * Lines whose block is missing form a last group with block null.
 */
export function groupByBlock<T extends { values: EntryValues }>(page: PageValues, entries: readonly T[]): BlockGroup<T>[] {
  const blocks = pageBlocks(page);
  if (blocks.length === 0) return [{ block: null, entries: [...entries] }];
  const groups: BlockGroup<T>[] = blocks.map((block) => ({ block, entries: [] }));
  const byId = new Map(groups.map((g) => [g.block!.id, g]));
  const orphans: T[] = [];
  for (const e of entries) {
    const group = e.values.block ? byId.get(e.values.block) : undefined;
    if (group) group.entries.push(e);
    else orphans.push(e);
  }
  if (orphans.length > 0) groups.push({ block: null, entries: orphans });
  return groups;
}

/** The id for a block made after the reading (a split part, T2): one past the highest `bN` on the page. */
export function nextBlockId(blocks: readonly BlockValues[]): string {
  return `b${Math.max(0, ...blocks.map((b) => Number(/^b(\d+)$/.exec(b.id)?.[1] ?? 0))) + 1}`;
}

/** Goods with no price yet: an item is written and no amount. Never counted as zero. */
export function isUnpricedGoods(values: EntryValues): boolean {
  return (values.item?.trim().length ?? 0) > 0 && (values.amountText?.trim().length ?? 0) === 0;
}

const NAME_WITH_PERSON = /^(.*\S)\s*[(（]\s*([^()（）]*\S)\s*[)）]$/u;

/**
 * "Praan (Selim)" → party "Praan", person "Selim". A name without a bracketed part is the party
 * alone. Used when the model put both in the party field.
 */
export function splitPartyPerson(text: string): { party: string; person: string | null } {
  const m = text.trim().match(NAME_WITH_PERSON);
  return m ? { party: m[1]!.trim(), person: m[2]!.trim() } : { party: text.trim(), person: null };
}
