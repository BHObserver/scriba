/**
 * Where the check flow's back button goes. A screen that opens /check says where it came from
 * with `?from=`, so back returns to the History day or Close the day instead of Today. Only
 * known screens are accepted, so the parameter can't send anyone off the app.
 */
const RETURN_TO = /^\/(?:history(?:\/\d{4}-\d{2}-\d{2})?|close|parties)?$/;

export function checkBackHref(from: string | string[] | undefined): string {
  return typeof from === "string" && RETURN_TO.test(from) ? from : "/";
}

/** `/check/<id>` with the page queue and the screen to come back to; Today needs no `from`. */
export function checkHref(documentId: string, opts: { pages?: readonly string[]; from?: string } = {}): string {
  const query = [opts.pages?.length ? `pages=${opts.pages.join(",")}` : null, opts.from && opts.from !== "/" ? `from=${opts.from}` : null].filter(Boolean);
  return `/check/${documentId}${query.length ? `?${query.join("&")}` : ""}`;
}
