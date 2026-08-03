/**
 * Symbols that have a logo at `public/logos/<SYMBOL>.png`.
 *
 * Neither MSE nor TDB's datalab exposes company logos without credentials, so
 * these are collected from each company's own site and normalised to 128px.
 * Wordmark-heavy logos and photographs are left out on purpose — they turn
 * into an unreadable smudge at avatar size, where the lettered fallback reads
 * better. To add one, drop a square PNG in and list the symbol here.
 */
export const LOGO_SYMBOLS = new Set([
  "AARD",
  "AIC",
  "AIG",
  "INV",
  "KHAN",
  "MLG",
  "NEH",
  "QPAY",
  "RMC",
  "SBM",
  "SEND",
  "SUU",
  "TGS",
  "TUM",
  "UBH",
]);

export function hasLogo(symbol: string): boolean {
  return LOGO_SYMBOLS.has(symbol.toUpperCase());
}
