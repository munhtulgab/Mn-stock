export type SecurityClassification = "I" | "II" | "III" | "unknown";

export interface Security {
  companyCode: number;
  symbol: string;
  name: string;
  classification: SecurityClassification;
  status: "active" | "delisted";
  isin?: string;
  listedDate?: string;
  updatedAt: Date;
  /** Last time this company's price history was pulled from the exchange. */
  pricesSyncedAt?: Date;
  /** The market session that pull covered, so it is not repeated for it. */
  pricesSyncedSession?: string;
}

export interface PricePoint {
  companyCode: number;
  date: string; // YYYY-MM-DD
  open: number;
  close: number;
  high: number;
  low: number;
  vwap: number;
  volume: number;
  turnover: number;
  trades: number;
  previousClose: number;
}

export interface Financials {
  companyCode: number;
  period: string; // e.g. "2026-Q2"
  year: number;
  quarter: number;
  totalAssets: number | null;
  totalLiabilities: number | null;
  equity: number | null;
  sharesOutstanding: number | null;
  revenue: number | null;
  costOfSales: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  bookValuePerShare: number | null;
  roa: number | null;
  roe: number | null;
  rota: number | null;
  eps: number | null;
  pe: number | null;
  fetchedAt: Date;
}

export type Signal = "BUY" | "SELL" | "HOLD";

/** One wording for the three signals, wherever they are named to a reader. */
export const SIGNAL_LABELS: Record<Signal, string> = {
  BUY: "АВАХ",
  SELL: "ЗАРАХ",
  HOLD: "ХҮЛЭЭХ",
};

export interface Recommendation {
  signal: Signal;
  score: number; // -100..100
  technicalScore: number;
  fundamentalScore: number;
  reasons: string[];
  indicators: {
    sma20: number | null;
    sma50: number | null;
    rsi14: number | null;
    momentum20: number | null;
    weekHigh52: number | null;
    weekLow52: number | null;
    pricePositionInRange: number | null;
  };
}

export interface AiSignalParsed {
  ticker: string;
  company_name: string;
  timestamp: string;
  signal: Signal;
  signal_confidence: number;
  price_data: {
    current_price: number;
    target_price_1: number;
    target_price_2: number;
    stop_loss: number;
  };
  risk_assessment: {
    risk_level: "LOW" | "MEDIUM" | "HIGH";
    risk_reward_ratio: string;
    liquidity_risk: "LOW" | "MEDIUM" | "HIGH";
  };
  analysis_summary: {
    technical_reason: string;
    fundamental_reason: string;
    overall_logic: string;
  };
}

export interface AiSignalProviderSummary {
  provider: "anthropic" | "gemini" | "groq" | "openrouter";
  ok: boolean;
  signal?: Signal;
  confidence?: number;
  error?: string;
}

export interface AiSignal {
  companyCode: number;
  symbol: string;
  createdAt: Date;
  consensus: AiSignalParsed;
  agreement: number;
  providersUsed: number;
  providers: AiSignalProviderSummary[];
}

export interface User {
  _id?: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  fullName?: string;
  email?: string;
  phone?: string;
  createdAt: Date;
  /**
   * Profile picture as a `data:image/...` URL. Held on the user document
   * rather than in object storage: it is cropped and shrunk to a couple of
   * hundred pixels before it is sent, which is a few tens of kilobytes, and
   * this app has no bucket to put it in.
   */
  avatar?: string;
  /**
   * Legacy read cutoff: everything created before it counts as read.
   *
   * Kept as a floor rather than maintained. Read is per alert now — an alert
   * is read when the reader opens it — and dropping this would resurrect
   * every alert a reader had already cleared under the old rule.
   */
  notificationsReadAt?: Date;
  /** Alert ids this reader has opened. */
  notificationsRead?: string[];
  /** Alert ids this reader has swiped away. */
  notificationsDismissed?: string[];
  /** When the user last opened the news page; stories newer than it are new. */
  newsSeenAt?: Date;
}

export interface AppNotification {
  _id?: string;
  title: string;
  body: string;
  url?: string;
  kind: "signal" | "news" | "system";
  createdAt: Date;
  /**
   * Set on signal alerts, so the feed can show the company the way the rest
   * of the app does — logo, ticker, and the badge it moved to — instead of
   * spelling all of it out in the body text.
   */
  symbol?: string;
  signal?: Signal;
  previousSignal?: Signal | "NEW";
}

export type SafeUser = Pick<
  User,
  "username" | "fullName" | "email" | "phone" | "avatar"
> & {
  id: string;
};

export interface Session {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export const STARTING_CASH_BALANCE = 10_000_000;

export interface Portfolio {
  userId: string;
  cashBalance: number;
  updatedAt: Date;
}

export interface Holding {
  userId: string;
  companyCode: number;
  symbol: string;
  quantity: number;
  avgCost: number;
  updatedAt: Date;
}

export type OrderSide = "BUY" | "SELL";

export interface Transaction {
  userId: string;
  companyCode: number;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  total: number;
  createdAt: Date;
}

export interface WatchlistItem {
  userId: string;
  companyCode: number;
  symbol: string;
  addedAt: Date;
}
