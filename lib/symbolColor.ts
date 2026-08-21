/**
 * A stable colour for a ticker.
 *
 * Lived inside StockAvatar, which was the only thing that needed one. The
 * allocation donut needs the same colours: a reader who has learnt that APU is
 * the blue circle in every list should not have to learn a second time that it
 * is the orange wedge in the chart.
 *
 * Hashed rather than assigned, so a colour survives a company being bought,
 * sold and bought again, and so nothing has to keep a list of four hundred
 * tickers in step.
 */
const PALETTE = [
  "#4C6FFF",
  "#FF6B81",
  "#17C674",
  "#FFA726",
  "#8E63FF",
  "#22C1D6",
  "#F4483D",
  "#2FB8A4",
];

export function colorFor(symbol: string): string {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/**
 * Colours for a set of symbols shown together, no two the same.
 *
 * A hash is fine for an avatar, which is only ever seen next to its own
 * ticker. It is not fine for a pie: eight holdings against eight colours
 * collide about as often as not — Хаан банк, MFC and Боди all came out the
 * same green, and two neighbouring slices in one colour read as one slice.
 *
 * Each symbol keeps its hashed colour where that colour is still free, so a
 * ticker looks the same here as it does in a list wherever possible, and
 * takes the next unused one where it is not. Past the end of the palette
 * there is nothing left to promise, and colours repeat.
 */
export function distinctColors(symbols: string[]): Map<string, string> {
  const taken = new Set<string>();
  const chosen = new Map<string, string>();

  for (const symbol of symbols) {
    const preferred = colorFor(symbol);
    const color = taken.has(preferred)
      ? (PALETTE.find((candidate) => !taken.has(candidate)) ??
        PALETTE[chosen.size % PALETTE.length])
      : preferred;
    taken.add(color);
    chosen.set(symbol, color);
  }
  return chosen;
}
