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

export interface AiSignal {
  companyCode: number;
  symbol: string;
  createdAt: Date;
  raw: string;
  parsed: {
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
  } | null;
  error?: string;
}
