/**
 * What the two admin lists can be narrowed by, and what each choice means.
 *
 * A plain module for the same reason `lib/adminPeriod.ts` is one: the pages
 * that read these parameters render on the server and the bar that sets them
 * runs in the browser. Putting the vocabulary behind a "use client" boundary
 * would leave the server able to render the control but not to parse what it
 * produced.
 *
 * Every list here is also the wording the chips use. A filter whose label
 * lived next to the control and whose value lived in the query string drifts
 * the moment one of the two is edited, and the chip is then quietly lying
 * about what the list is showing.
 */

export interface FilterOption {
  /** Empty means "no filter", and is never written into the URL. */
  value: string;
  label: string;
}

/**
 * The value a parameter asks for, or none.
 *
 * Anything not on the list falls back to no filter rather than being passed
 * through: these reach a database query, and a hand-typed `role=root` should
 * show the whole list rather than an error or an empty one.
 */
export function pick(
  value: string | string[] | undefined,
  options: readonly FilterOption[],
): string {
  const raw = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  return options.some((o) => o.value !== "" && o.value === raw) ? raw : "";
}

/** How a chosen value is worded once it is a chip. */
export function labelOf(options: readonly FilterOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

/**
 * How far back a list looks.
 *
 * Shared by both pages, and by both the "registered" and the "placed"
 * question, because "the last week" means the same thing whichever date it is
 * asked about and two separate vocabularies for it would be two.
 */
export const RANGES: readonly FilterOption[] = [
  { value: "", label: "Бүх хугацаа" },
  { value: "1", label: "Сүүлийн 24 цаг" },
  { value: "7", label: "Сүүлийн 7 хоног" },
  { value: "30", label: "Сүүлийн 30 хоног" },
  { value: "90", label: "Сүүлийн 90 хоног" },
];

/** The instant a range starts, or nothing when no range was chosen. */
export function rangeSince(value: string): Date | undefined {
  const days = Number(value);
  return days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined;
}

export const USER_ROLES: readonly FilterOption[] = [
  { value: "", label: "Бүх эрх" },
  { value: "admin", label: "Админ" },
  { value: "user", label: "Хэрэглэгч" },
];

/**
 * Whether an account has ever traded.
 *
 * The question behind "who signed up and never used it", which is the one
 * thing this list is asked that a search box cannot answer at all.
 */
export const USER_ACTIVITY: readonly FilterOption[] = [
  { value: "", label: "Бүх данс" },
  { value: "with", label: "Захиалга хийсэн" },
  { value: "without", label: "Захиалга хийгээгүй" },
];

export const ORDER_SIDES: readonly FilterOption[] = [
  { value: "", label: "Авсан ба зарсан" },
  { value: "BUY", label: "Авсан" },
  { value: "SELL", label: "Зарсан" },
];

/**
 * How a row got here, which is what an administrator checking a correction
 * is actually looking for.
 */
export const ORDER_MARKS: readonly FilterOption[] = [
  { value: "", label: "Бүх захиалга" },
  { value: "imported", label: "Хуулгаар орсон" },
  { value: "manual", label: "Аппаас хийсэн" },
  { value: "reversal", label: "Буцаалт" },
  { value: "edited", label: "Зассан" },
];
