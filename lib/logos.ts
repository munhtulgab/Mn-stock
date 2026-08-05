/**
 * Symbols that have a logo at `public/logos/<SYMBOL>.png`.
 *
 * Collected from TDB Securities' datalab, whose public API answers
 * `GET https://api.tdbsecurities.mn/tdbs/stock/datalab/<stockcode>` with a
 * `fileDownloadUri` pointing at the company's logo — and whose stockcode is
 * the same company code MSE publishes, so ours index it directly. (The rest
 * of that API needs a TDB login; this one path does not.) Each file is
 * resized to 128px on transparent, which is four times what the avatar
 * renders and enough for a retina screen.
 *
 * Not every listing has one: 72 of the symbols below came from there, AIG
 * and TGS were collected by hand from the companies' own sites before it,
 * and the dormant end of the exchange has none at all — those keep the
 * lettered fallback. To add one by hand, drop a square PNG in and list the
 * symbol here.
 */
const LOGO_SYMBOLS = new Set([
  "AARD",
  "ADB",
  "ADL",
  "ADU",
  "AIC",
  "AIG",
  "AMT",
  "APU",
  "ATR",
  "BAN",
  "BDL",
  "BDS",
  "BNG",
  "BODI",
  "BOGD",
  "BTG",
  "BUK",
  "CNF",
  "CUMN",
  "ERDN",
  "ETR",
  "GAZR",
  "GHC",
  "GLMT",
  "GOV",
  "GTL",
  "HBO",
  "HGN",
  "HHN",
  "HML",
  "HRM",
  "HUN",
  "INV",
  "ITLS",
  "JTB",
  "KHAN",
  "LEND",
  "LOT",
  "MBG",
  "MBW",
  "MCH",
  "MDIC",
  "MFC",
  "MIE",
  "MIK",
  "MLG",
  "MMX",
  "MNDL",
  "MNP",
  "MRX",
  "MSE",
  "MSH",
  "NEH",
  "NRS",
  "QPAY",
  "RMC",
  "SBM",
  "SEND",
  "SHG",
  "SHV",
  "SUU",
  "TAH",
  "TAND",
  "TCK",
  "TDB",
  "TEX",
  "TGI",
  "TGS",
  "TNGR",
  "TTL",
  "TUM",
  "UBH",
  "UID",
  "XAC",
]);

export function hasLogo(symbol: string): boolean {
  return LOGO_SYMBOLS.has(symbol.toUpperCase());
}
