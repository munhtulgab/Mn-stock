/**
 * Dates as Ulaanbaatar states them.
 *
 * Everything the app shows — a closing report, an alert, a headline — happened
 * on a Mongolian trading day, so it is grouped and labelled in Mongolian time
 * rather than the reader's. A phone in another zone would otherwise file this
 * morning's alert under yesterday.
 */

const ULAANBAATAR_TZ = "Asia/Ulaanbaatar";

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ULAANBAATAR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ULAANBAATAR_TZ,
  hour: "2-digit",
  minute: "2-digit",
  // Midnight is 00:00 and not 24:00: the second form reads as the end of the
  // day rather than the start of it, and sorts after every other hour of a
  // day it does not belong to.
  hourCycle: "h23",
});

const STAMP_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ULAANBAATAR_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** `YYYY-MM-DD` in Ulaanbaatar. */
export function ulaanbaatarDay(date: Date): string {
  return DAY_FORMAT.format(date);
}

/** `HH:MM` in Ulaanbaatar. */
export function ulaanbaatarTime(date: Date): string {
  return TIME_FORMAT.format(date);
}

/**
 * `YYYY-MM-DDTHH:MM:SS` in Ulaanbaatar: one sortable string for a moment.
 *
 * The form the news feed stores a stated publication time in. Compared as
 * text, so the seconds matter — a page that posts twice in a minute orders
 * correctly only if the second it happened survives.
 */
export function ulaanbaatarStamp(date: Date): string {
  return `${ulaanbaatarDay(date)}T${STAMP_FORMAT.format(date)}`;
}

/**
 * `YYYY-MM-DD HH:MM` in Ulaanbaatar, for a stamp on something the app itself
 * recorded — an order, an analyst run. Written from the exchange's clock and
 * not the reader's: a filled order is an event on a Mongolian trading day,
 * and a phone in another zone would date it to the wrong session.
 */
export function ulaanbaatarDateTime(date: Date | string): string {
  const at = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(at.getTime())) return "";
  return `${ulaanbaatarDay(at)} ${ulaanbaatarTime(at)}`;
}

/** The Ulaanbaatar day `days` before today, as `YYYY-MM-DD`. */
export function ulaanbaatarDaysAgo(days: number): string {
  return ulaanbaatarDay(new Date(Date.now() - days * 86_400_000));
}

const MONTHS = [
  "1 сарын",
  "2 сарын",
  "3 сарын",
  "4 сарын",
  "5 сарын",
  "6 сарын",
  "7 сарын",
  "8 сарын",
  "9 сарын",
  "10 сарын",
  "11 сарын",
  "12 сарын",
];

const WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];

/**
 * Heading for a day of items: "Өнөөдөр", "Өчигдөр", else "Лхагва, 8 сарын 5".
 * Built from the digits rather than through the reader's locale, for the same
 * reason the day itself is.
 */
export function dayHeading(date: string, today: string, yesterday: string): string {
  const day = date.slice(0, 10);
  if (day === today) return "Өнөөдөр";
  if (day === yesterday) return "Өчигдөр";
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}`;
}

/** Ulaanbaatar's today and yesterday, for the two named headings. */
export function todayAndYesterday(): { today: string; yesterday: string } {
  const now = Date.now();
  return {
    today: ulaanbaatarDay(new Date(now)),
    yesterday: ulaanbaatarDay(new Date(now - 86_400_000)),
  };
}

/* -------------------------------------------------------------------------
   Calendar arithmetic on `YYYY-MM-DD`.

   Done on the digits, in UTC, because these are already Ulaanbaatar days:
   handing them to a local Date would shift a few of them by one.
   ------------------------------------------------------------------------- */

export function shiftDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The Monday of the week a date falls in. */
export function mondayOf(date: string): string {
  // getUTCDay is 0 on Sunday, which belongs to the week that started six days
  // earlier rather than to the one about to start.
  const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDays(date, -weekday);
}

/** First and last day of the calendar month before the one `date` is in. */
export function previousMonth(date: string): { from: string; to: string } {
  const [year, month] = date.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10),
  };
}
