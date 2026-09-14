/**
 * A sum of money short enough to sit in a gutter or on a card.
 *
 * сая at a million, тэрбум at a thousand million, written out rather than as
 * "3.3M" — the pages these appear on are in Mongolian, and M is not a
 * Mongolian abbreviation for anything.
 *
 * One decimal and no more. The point of the short form is that the magnitude
 * is read without counting digits; "12.4 сая ₮" does that and "12.37 сая ₮"
 * spends a character undoing it. Where the exact figure matters the page
 * prints it in full with `Num` instead.
 *
 * The sign is separated by a non-breaking space, the way `Num` separates it.
 * Not only for consistency: Geist has no ₮, so it comes from a fallback face
 * whose metrics are not Geist's, and set tight against a Cyrillic letter the
 * two glyphs overlap — "сая₮" renders as though the ₮ had been struck through
 * the я. The space is non-breaking so the unit never wraps away from its
 * figure.
 */
export function compactTugrug(value: number): string {
  const sign = value < 0 ? "-" : "";
  const size = Math.abs(value);
  if (size >= 1e9) return `${sign}${(size / 1e9).toFixed(1)} тэрбум\u00A0₮`;
  if (size >= 1e6) return `${sign}${(size / 1e6).toFixed(1)} сая\u00A0₮`;
  if (size >= 1e3) return `${sign}${Math.round(size / 1e3)} мянга\u00A0₮`;
  return `${sign}${Math.round(size)}\u00A0₮`;
}
