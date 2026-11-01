/**
 * Where a new line goes in a page's order: after `afterId`, halfway to the next line, or above
 * the first line when `afterId` is null. Null when `afterId` names no line. Shared by the add-line
 * route and Scriba's answers, so an added line lands the same way from either.
 */
export function lineOrderAfter(orders: ReadonlyArray<{ id: string; order: number }>, afterId: string | null): number | null {
  const sorted = [...orders].sort((a, b) => a.order - b.order);
  if (afterId == null) return (sorted[0]?.order ?? 1) - 1;
  const index = sorted.findIndex((r) => r.id === afterId);
  if (index < 0) return null;
  const next = sorted[index + 1];
  return next ? (sorted[index]!.order + next.order) / 2 : sorted[index]!.order + 1;
}
