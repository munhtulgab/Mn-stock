/**
 * Symbols that have a logo at `public/logos/<SYMBOL>.png`.
 *
 * MSE publishes no company logos, so these are collected by hand from each
 * company's own site. Wordmark-style logos are deliberately left out — they
 * turn into an unreadable smudge at avatar size, where the lettered fallback
 * reads better. To add one, drop a square PNG in and list the symbol here.
 */
export const LOGO_SYMBOLS = new Set([
  "AIC",
  "KHAN",
  "QPAY",
  "RMC",
  "SBM",
  "SUU",
]);

export function hasLogo(symbol: string): boolean {
  return LOGO_SYMBOLS.has(symbol.toUpperCase());
}
