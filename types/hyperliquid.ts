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
