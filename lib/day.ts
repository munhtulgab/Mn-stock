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
});

/** `YYYY-MM-DD` in Ulaanbaatar. */
export function ulaanbaatarDay(date: Date): string {
  return DAY_FORMAT.format(date);
}

/** `HH:MM` in Ulaanbaatar. */
export function ulaanbaatarTime(date: Date): string {
  return TIME_FORMAT.format(date);
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
