export interface HyperliquidTrade {
  coin: string;
  side: "A" | "B"; // A = Ask (sell), B = Bid (buy)
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
}

export interface HyperliquidBlock {
  height: number;
  time: number;
  hash: string;
  txCount: number;
}

export interface HyperliquidWebSocketMessage {
  channel?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface CoinPrice {
  coin: string;
  price: number;
  price24h: number;
  change: number;
  changePercent: number;
}

export interface PriceHistoryEntry {
  price: number;
  timestamp: number;
}

export interface AllMidsData {
  mids: Record<string, string>;
}

export interface BackendPriceData {
  coin: string;
  prices: Array<{
    coin: string;
    price: number;
    created_at: string;
  }>;
  count: number;
}

export interface PriceComparison {
  wsPrice: number; // WebSocket price
  backendPrice: number | null; // Latest backend price (index 0)
  priceDiff: number | null; // Difference between WS and backend
  priceDiffPercent: number | null;
  durationFromLatest: number | null; // Duration in ms from now to oldest backend price's created_at
}
