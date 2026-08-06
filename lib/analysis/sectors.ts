import type { Financials } from "@/lib/types";

/**
 * What industry a listed company is in.
 *
 * The exchange does not say. There is no sector field on the securities
 * list, none on the company profile, and no tab that states one — the
 * profile's tabs are shareholders, board members, officials, financials,
 * operations and meetings, and none of them names a line of business. So it
 * is worked out here from the two things the exchange does publish.
 *
 * The first is decisive and costs nothing: which of its four report layouts
 * a company files. A company filing a deposit book is a bank, one filing
 * premiums and claims is an insurer, and one filing interest income without
 * deposits is a non-bank lender. That settles all fifteen financial
 * companies on the exchange exactly, from the exchange's own filings.
 *
 * The second is the registered name, which in this market is unusually
 * informative — "Дархан гурил тэжээл", "Улаанбаатар хивс", "Эрдэнэт ус,
 * дулаан түгээх сүлжээ". Where a name says what the company does, it is
 * taken at its word; where it does not — "Тав ХК", "Сор ХК", "Хүрд ХК" —
 * the company is left unclassified rather than guessed at, and compared
 * against the whole market instead. An invented sector would produce a
 * confident-looking peer ranking against companies in unrelated businesses,
 * which is worse than admitting the exchange never said.
 */

export type SectorKey =
  | "bank"
  | "nbfi"
  | "insurance"
  | "investment"
  | "mining"
  | "utilities"
  | "construction"
  | "food"
  | "textile"
  | "trade"
  | "transport"
  | "realestate"
  | "tech"
  | "agriculture"
  | "manufacturing"
  | "other";

export const SECTOR_LABELS: Record<SectorKey, string> = {
  bank: "Банк",
  nbfi: "ББСБ",
  insurance: "Даатгал",
  investment: "Хөрөнгө оруулалт",
  mining: "Уул уурхай",
  utilities: "Эрчим хүч, нийтийн аж ахуй",
  construction: "Барилга, барилгын материал",
  food: "Хүнс, ундаа",
  textile: "Нэхмэл, арьс ширэн",
  trade: "Худалдаа",
  transport: "Тээвэр, логистик",
  realestate: "Үл хөдлөх, зочид буудал",
  tech: "Технологи, холбоо",
  agriculture: "Хөдөө аж ахуй",
  manufacturing: "Үйлдвэрлэл",
  other: "Ангилагдаагүй",
};

/**
 * Name fragments that settle a sector, most specific first.
 *
 * Order matters where two could match: "Дархан гурил тэжээл" is animal feed
 * and flour both, and "хүнс" beats "тэжээл" for a company whose name carries
 * each. Matching is on the upper-cased name, so these are written that way.
 */
const NAME_RULES: [RegExp, SectorKey][] = [
  // Financial, for the handful whose report layout does not give them away.
  [/БИРЖ/, "investment"],
  [/СЕКЬЮРИТИЗ|СЕКЮРИТИЕС|БРОКЕР/, "investment"],
  [/ДААТГАЛ/, "insurance"],
  [/ББСБ|КРЕДИТ|ЛИЗИНГ|ФАЙНАНС/, "nbfi"],

  // Mining and the trades that only exist around it.
  [/УУЛ УУРХАЙ|ГЕОЛОГИ|ХАЙГУУЛ|РЕСУРС|МАЙНИНГ/, "mining"],
  [/НҮҮРС|ЖОНШ|ХҮДЭР|ФЛЮОРИТ|АЛТАН ДУУЛГА|БАЗАЛЬТ/, "mining"],
  [/ОЙЛ|НЕФТЬ/, "mining"],

  // Networks: power, heat and water.
  [/ЦАХИЛГААН ТҮГЭЭХ|ЦАХИЛГААН СҮЛЖЭЭ|ЭРЧИМ ХҮЧ|ДУЛААН|УС СУВАГ|УС, ДУЛААН/, "utilities"],

  // Ahead of the roadbuilders, because a railway is a road by name and a
  // haulier by trade: "Монголын төмөр зам" ends in "зам" like "Алтайн зам"
  // and is the only one of the two that carries freight.
  [/ТЭЭВЭР|ЛОЖИСТИК|ЛОГИСТИК|ТӨМӨР ЗАМ|ШУУДАН|АГААРЫН/, "transport"],

  [/БАРИЛГА|ЦЕМЕНТ|БЕТОН|КЕРАМИК|СИЛИКАТ|БАРМАТ|ГАН ХИЙЦ|АВТО ЗАМ|ЗАМ$/, "construction"],

  [/ХҮНС|ГУРИЛ|ТАЛХ|ЧИХЭР|МАХ|СҮҮ|УНДАА|СПИРТ|АРХИ|ПИВО|ЧАЦАРГАНА|ШУВУУТ/, "food"],

  [/НЭХМЭЛ|НЭХИЙ|ХИВС|САВХИ|ШЕВРО|БУЛИГААР|НООС|НООЛУУР|ХӨВӨН|ГУТАЛ|НЭХЭЭСГҮЙ/, "textile"],

  [/ТЭЖЭЭЛ|ХӨДӨӨ АЖ АХУЙ|ГАЗАР ШИМ/, "agriculture"],

  [/ЗОЧИД БУУДАЛ|ПРОПЕРТИ|ДЕВЕЛОПМЕНТ|ЛЭНД ГРУПП|ҮЛ ХӨДЛӨХ/, "realestate"],

  [/ХОЛБОО|МЕДИА|ТЕХНОЛОГИ|КРИПТО|СИСТЕМС|ОЛЛОО|АЙТҮҮЛС/, "tech"],

  [/ХУДАЛДАА|ДЭЛГҮҮР|ИМПЕКС|ИМПЭКС|ИМПОРТ|ТРЕЙД|ДЮТИ ФРИ|ЦЕНТР|ТУР БЮРО/, "trade"],

  [/ЗАВОД|ҮЙЛДВЭР|ДИЗЕЛЬ|ТАВИЛГА|ХӨХ ГАН/, "manufacturing"],

  // Last, so that a holding company named after the industry it holds is
  // filed under that industry: "Монложистикс Холдинг" is a haulier, and
  // reading the word "холдинг" first would have made it a fund.
  [/ХОЛДИНГ|ИНВЕСТМЕНТ|ИНВЭСТ|КАПИТАЛ|САНХҮҮГИЙН НЭГДЭЛ/, "investment"],
];

/**
 * Companies whose business is well established but whose registered name
 * does not carry it — "Таван толгой" is a coalfield, "Говь" is a cashmere
 * house, "АПУ" is a brewery, and none of the three says so.
 *
 * Only listings whose line of business is not in doubt are here. The point
 * of the table is to rescue the ones a reader is most likely to look up
 * from the unclassified bucket, not to fill that bucket in.
 */
const SYMBOL_SECTORS: Record<string, SectorKey> = {
  APU: "food",
  ATR: "food",
  MGLA: "food",
  GOV: "textile",
  JGV: "textile",
  BDS: "investment",
  // The coalfields and the hard-rock mines.
  TTL: "mining",
  BAN: "mining",
  SHG: "mining",
  SHV: "mining",
  BTG: "mining",
  BDL: "mining",
  ERS: "mining",
  MOG: "mining",
  HSX: "mining",
  BEU: "mining",
  TUS: "mining",
  SVR: "mining",
  RMC: "construction",
  BUK: "construction",
  MIB: "construction",
  BOE: "utilities",
};

/**
 * The report layout is the exchange's own word on the matter, so it outranks
 * anything read out of a name.
 */
const LAYOUT_SECTORS: Record<NonNullable<Financials["reportKind"]>, SectorKey | null> = {
  bank: "bank",
  nbfi: "nbfi",
  insurance: "insurance",
  general: null,
};

/**
 * The trailing legal form, in both alphabets.
 *
 * Half a dozen listings are registered with a Latin "XK" rather than a
 * Cyrillic "ХК" — Э-Транс ложистикс and Хүрд among them — and the two look
 * identical on screen. A rule anchored to the end of a name, like the one
 * that reads "Алтайн зам" as roadbuilding, only fires once this is gone.
 */
const LEGAL_FORM = /\s+(ХК|XK|ХХК|ТӨХК|АА)\s*$/iu;

export function classifySector(
  name: string,
  symbol: string,
  reportKind?: Financials["reportKind"],
): SectorKey {
  // What the company files with the exchange outranks what it calls itself.
  const fromLayout = reportKind ? LAYOUT_SECTORS[reportKind] : null;
  if (fromLayout) return fromLayout;

  const known = SYMBOL_SECTORS[symbol.toUpperCase()];
  if (known) return known;

  const upper = name.toUpperCase().replace(LEGAL_FORM, "");
  for (const [pattern, sector] of NAME_RULES) {
    if (pattern.test(upper)) return sector;
  }
  return "other";
}
