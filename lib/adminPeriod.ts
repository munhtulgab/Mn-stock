/**
 * How far back the dashboard's comparisons look.
 *
 * The figures on that page are counts with a change beside them, and a change
 * is only ever a change *since* something. That something was seven days,
 * fixed, written into the code — the right default and the wrong only answer:
 * an installation with a handful of accounts sees nothing move in a week, and
 * one with thousands sees a week of noise. Three windows, carried in the URL,
 * so a view worth coming back to can be linked to.
 *
 * Plain module rather than part of the picker, because the page that reads
 * the parameter runs on the server and the control that sets it runs in the
 * browser. Exporting the parser from the client component put it behind the
 * "use client" boundary, where the server may render it but not call it — a
 * runtime error on every load of the page, not a build one.
 */
export const PERIODS = [
  { days: 7, label: "7 хоног" },
  { days: 30, label: "30 хоног" },
  { days: 90, label: "90 хоног" },
] as const;

export const DEFAULT_PERIOD_DAYS = 7;

/**
 * The window a `?days=` parameter asks for, or the default.
 *
 * Anything not on the list falls back rather than being honoured: the value
 * reaches a date computation and a page heading, and a hand-typed `days=99999`
 * should be a seven-day page, not a query over the whole collection.
 */
export function periodFrom(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const days = Number(raw);
  return PERIODS.some((p) => p.days === days) ? days : DEFAULT_PERIOD_DAYS;
}

/** The path the picker navigates to. The default is the absence of the
 *  parameter, so a plain /admin and a seven-day /admin are one page. */
export function periodHref(days: number, params?: URLSearchParams): string {
  const query = new URLSearchParams(params?.toString() ?? "");
  if (days === DEFAULT_PERIOD_DAYS) query.delete("days");
  else query.set("days", String(days));
  const search = query.toString();
  return search ? `/admin?${search}` : "/admin";
}
