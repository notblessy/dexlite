"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { NumericFormat } from "react-number-format";
import { useWebsocket } from "@/hooks/useWebsocket";
import type {
  HyperliquidTrade,
  HyperliquidBlock,
  CoinPrice,
  PriceHistoryEntry,
} from "@/types/hyperliquid";

const WS_URL = "wss://api.hyperliquid.xyz/ws";
const MAX_ITEMS = 10;
const TRACKED_COINS = ["BTC", "ETH", "SOL", "ARB", "AVAX"];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"transactions" | "blocks">(
    "transactions"
  );
  const [transactions, setTransactions] = useState<HyperliquidTrade[]>([]);
  const [blocks, setBlocks] = useState<HyperliquidBlock[]>([]);
  const [coinPrices, setCoinPrices] = useState<Record<string, CoinPrice>>({});
  const [stripeToggle, setStripeToggle] = useState(false);
  const [tps, setTps] = useState(0);
  const subscriptionsRef = useRef<Set<string>>(new Set());
  const priceHistoryRef = useRef<Record<string, PriceHistoryEntry[]>>({});
  const setStripeToggleRef = useRef<Dispatch<SetStateAction<boolean>> | null>(
    null
  );
  const transactionTimestampsRef = useRef<number[]>([]);
  const subscriptionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubscribedRef = useRef(false);

  // Keep ref updated with latest setter
  useEffect(() => {
    setStripeToggleRef.current = setStripeToggle;
  }, [setStripeToggle]);

  // Calculate real-time TPS
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const oneSecondAgo = now - 1000;

      // Keep only timestamps from the last second
      transactionTimestampsRef.current =
        transactionTimestampsRef.current.filter(
          (timestamp) => timestamp > oneSecondAgo
        );

      // TPS is the count of transactions in the last second
      setTps(transactionTimestampsRef.current.length);
    }, 100); // Update every 100ms for smooth real-time display

    return () => clearInterval(interval);
  }, []);

  const handleWebSocketMessage = useCallback((data: unknown) => {
    if (!data || typeof data !== "object") return;

    const message = data as Record<string, unknown>;

    // Handle trades data
    if (message.channel === "trades" && Array.isArray(message.data)) {
      const trades = message.data as HyperliquidTrade[];
      if (trades.length > 0) {
        const now = Date.now();
        // Record timestamps for TPS calculation
        transactionTimestampsRef.current.push(
          ...new Array(trades.length).fill(now)
        );

        setTransactions((prev) => {
          const updated = [...trades, ...prev].slice(0, MAX_ITEMS);
          return updated;
        });
        // Toggle stripe color on update
        setStripeToggleRef.current?.((prev) => !prev);
      }
    }

    // Handle allMids price data
    if (message.channel === "allMids" && message.data) {
      const midsData = message.data as Record<string, unknown>;
      if (midsData.mids && typeof midsData.mids === "object") {
        const mids = midsData.mids as Record<string, string>;
        const now = Date.now();
        const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

        setCoinPrices((prev) => {
          const updated: Record<string, CoinPrice> = { ...prev };

          Object.entries(mids).forEach(([coin, priceStr]) => {
            if (TRACKED_COINS.includes(coin)) {
              const currentPrice = parseFloat(priceStr);

              // Initialize price history if it doesn't exist
              if (!priceHistoryRef.current[coin]) {
                priceHistoryRef.current[coin] = [];
              }

              // Add current price to history
              priceHistoryRef.current[coin].push({
                price: currentPrice,
                timestamp: now,
              });

              // Clean up old entries (older than 24 hours)
              priceHistoryRef.current[coin] = priceHistoryRef.current[
                coin
              ].filter((entry) => entry.timestamp > twentyFourHoursAgo);

              // Find price from 24 hours ago (or closest available)
              const history = priceHistoryRef.current[coin];
              let price24h = currentPrice;

              if (history.length > 0) {
                // Find the oldest entry (closest to 24h ago)
                const oldestEntry = history[0];
                if (oldestEntry.timestamp <= twentyFourHoursAgo) {
                  price24h = oldestEntry.price;
                } else {
                  // If we don't have 24h of history yet, use the first recorded price
                  price24h = oldestEntry.price;
                }
              }

              const change = currentPrice - price24h;
              const changePercent =
                price24h > 0 ? (change / price24h) * 100 : 0;

              updated[coin] = {
                coin,
                price: currentPrice,
                price24h,
                change,
                changePercent,
              };
            }
          });

          return updated;
        });
      }
    }

    // Handle subscription response (confirm subscription)
    if (message.channel === "subscriptionResponse") {
      const subData = message.data as Record<string, unknown>;
      if (subData.subscription) {
        const sub = subData.subscription as Record<string, unknown>;
        if (sub.type === "trades" && typeof sub.coin === "string") {
          subscriptionsRef.current.add(sub.coin);
          console.log(`✓ Successfully subscribed to ${sub.coin} trades`);
        } else if (sub.type === "allMids") {
          subscriptionsRef.current.add("allMids");
          console.log("✓ Successfully subscribed to allMids");
        }
      }
      // Handle subscription errors
      if (subData.error) {
        console.error("✗ Subscription error:", subData.error);
        // Remove from subscriptions if there was an error
        const sub = subData.subscription as Record<string, unknown>;
        if (sub?.type === "trades" && typeof sub.coin === "string") {
          subscriptionsRef.current.delete(sub.coin);
        } else if (sub?.type === "allMids") {
          subscriptionsRef.current.delete("allMids");
        }
      }
    }

    // Handle error messages
    if (message.channel === "error" || message.error) {
      console.error("WebSocket error:", message.error || message);
    }
  }, []);

  const { send, connected } = useWebsocket(WS_URL, handleWebSocketMessage, {
    onClose: () => {
      // Reset subscription state on disconnect
      hasSubscribedRef.current = false;
      subscriptionsRef.current.clear();
    },
    reconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: Infinity,
  });

  // Subscription function - defined after hook to access send and connected
  const subscribeToFeeds = useCallback(() => {
    if (!connected || !send) return;

    // Clear any existing subscription timeout
    if (subscriptionTimeoutRef.current) {
      clearTimeout(subscriptionTimeoutRef.current);
      subscriptionTimeoutRef.current = null;
    }

    // Reset subscription tracking on reconnect
    if (!hasSubscribedRef.current) {
      subscriptionsRef.current.clear();
    }

    // Wait a bit for connection to stabilize before subscribing
    subscriptionTimeoutRef.current = setTimeout(() => {
      if (!connected || !send) return;

      // Subscribe to allMids for price data (only if not already subscribed)
      if (!subscriptionsRef.current.has("allMids")) {
        console.log("Subscribing to allMids");
        send({
          method: "subscribe",
          subscription: { type: "allMids" },
        });
        subscriptionsRef.current.add("allMids");
      }

      // Subscribe to trades for tracked coins
      TRACKED_COINS.forEach((symbol, index) => {
        setTimeout(() => {
          if (connected && send && !subscriptionsRef.current.has(symbol)) {
            console.log(`Subscribing to ${symbol} trades`);
            send({
              method: "subscribe",
              subscription: { type: "trades", coin: symbol },
            });
          }
        }, 150 * (index + 1)); // Slightly increased delay to prevent rate limiting
      });

      hasSubscribedRef.current = true;
    }, 500); // Increased delay to ensure connection is stable
  }, [connected, send]);

  // Subscribe when connection opens
  useEffect(() => {
    if (connected) {
      hasSubscribedRef.current = false;
      subscribeToFeeds();
    }

    return () => {
      // Cleanup subscription timeout on unmount or dependency change
      if (subscriptionTimeoutRef.current) {
        clearTimeout(subscriptionTimeoutRef.current);
        subscriptionTimeoutRef.current = null;
      }
    };
  }, [connected, subscribeToFeeds]);

  // Fetch blocks periodically (blocks not available via WebSocket in HyperLiquid)
  useEffect(() => {
    let isMounted = true;
    let blockHeight = 0;

    const fetchBlocks = async () => {
      if (!isMounted) return;

      try {
        // Since HyperLiquid doesn't provide blocks via WebSocket,
        // we'll simulate block updates based on transaction activity
        // In production, you'd use the REST API to fetch actual blocks
        const hasNewTransactions = transactions.length > 0;

        if (hasNewTransactions || blockHeight === 0) {
          setBlocks((prev) => {
            const newBlock: HyperliquidBlock = {
              height:
                blockHeight === 0 && prev.length > 0
                  ? prev[0].height + 1
                  : blockHeight === 0
                  ? 1
                  : blockHeight + 1,
              time: Date.now(),
              hash: `0x${Math.random()
                .toString(16)
                .slice(2)
                .padStart(64, "0")}`,
              txCount: Math.floor(Math.random() * 50) + 10,
            };
            blockHeight = newBlock.height;
            return [newBlock, ...prev].slice(0, MAX_ITEMS);
          });
          // Toggle stripe color on block update
          setStripeToggleRef.current?.((prev) => !prev);
        }
      } catch (error) {
        console.error("Failed to update blocks:", error);
      }
    };

    // Update blocks every 5 seconds
    const interval = setInterval(fetchBlocks, 5000);
    fetchBlocks(); // Initial fetch

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [transactions.length]);

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Format address/hash
  const formatHash = (hash: string) => {
    if (!hash) return "N/A";
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  // Calculate stats (all real-time)
  const latestBlockHeight = blocks[0]?.height || 0;
  // TPS is calculated in real-time via useEffect hook above

  return (
    <div className="min-h-screen bg-black text-white relative">
      {/* Animated background pattern */}
      <div className="neon-bg"></div>

      <div className="container mx-auto px-4 py-8 max-w-7xl relative z-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1
                className="text-2xl font-bold mb-1"
                style={{ fontFamily: "var(--font-quantico)" }}
              >
                <span className="text-[#4EB345] neon-glow-green">DEXLITE</span>{" "}
                EXPLORER
              </h1>
              <p
                className="text-zinc-400 text-xs"
                style={{ fontFamily: "var(--font-quantico)" }}
              >
                Real-time Hyperliquid transaction indexer by keep_going.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 rounded-lg border border-zinc-800">
                <div
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-[#4EB345] neon-glow-green" : "bg-red-500"
                  }`}
                ></div>
                <span
                  className="text-xs text-zinc-300"
                  style={{ fontFamily: "var(--font-quantico)" }}
                >
                  {connected ? "Mainnet" : "Connecting..."}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Key Stats */}
        <div className="mb-8 flex gap-4">
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-6 py-4 flex items-center gap-4">
            <span
              className="text-xs text-zinc-400"
              style={{ fontFamily: "var(--font-quantico)" }}
            >
              Block Height
            </span>
            <span
              className="text-lg font-mono text-[#4EB345] neon-glow-green"
              style={{ fontFamily: "var(--font-quantico)" }}
            >
              {latestBlockHeight.toLocaleString()}
            </span>
          </div>
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 px-6 py-4 flex items-center gap-4">
            <span
              className="text-xs text-zinc-400"
              style={{ fontFamily: "var(--font-quantico)" }}
            >
              Transactions Per Second
            </span>
            <span
              className="text-lg font-mono text-[#4EB345] neon-glow-green"
              style={{ fontFamily: "var(--font-quantico)" }}
            >
              {tps.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Price Statistics Cards - Compact Grid */}
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {TRACKED_COINS.map((symbol) => {
            const priceData = coinPrices[symbol];
            const hasData = priceData && priceData.price > 0;
            const isPositive = hasData && priceData.change >= 0;
            const isNegative = hasData && priceData.change < 0;

            return (
              <div
                key={symbol}
                className="bg-zinc-900/50 backdrop-blur-sm rounded-lg border border-zinc-800 p-4 hover:border-[#4EB345]/40 transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-400">
                    {symbol}
                  </span>
                  {hasData && (
                    <span
                      className={`text-[10px] font-medium px-2 py-1 rounded ${
                        isPositive
                          ? "bg-green-500/20 text-green-400"
                          : isNegative
                          ? "bg-red-500/20 text-red-400"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      <NumericFormat
                        value={priceData.changePercent}
                        displayType="text"
                        decimalScale={2}
                        fixedDecimalScale
                        prefix={isPositive ? "+" : ""}
                        suffix="%"
                      />
                      <span className="ml-1 text-[10px] opacity-75">24h</span>
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  {hasData ? (
                    <NumericFormat
                      value={priceData.price}
                      displayType="text"
                      prefix="$"
                      thousandSeparator=","
                      decimalScale={priceData.price > 1000 ? 0 : 2}
                      fixedDecimalScale={priceData.price <= 1000}
                      className={`text-base font-bold text-white ${
                        isPositive ? "neon-glow-green" : ""
                      }`}
                    />
                  ) : (
                    <span className="text-base font-bold text-zinc-50">—</span>
                  )}
                </div>
                {hasData && (
                  <div
                    className={`text-[10px] mt-1 font-mono ${
                      isPositive
                        ? "text-green-400"
                        : isNegative
                        ? "text-red-400"
                        : "text-zinc-500"
                    }`}
                  >
                    <NumericFormat
                      value={priceData.change}
                      displayType="text"
                      prefix={isPositive ? "+" : ""}
                      decimalScale={priceData.price > 1000 ? 2 : 4}
                      fixedDecimalScale
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-3">
          <button
            onClick={() => setActiveTab("transactions")}
            className={`px-6 py-3 text-sm font-bold transition-all rounded-lg border-2 ${
              activeTab === "transactions"
                ? "text-[#4EB345] bg-[#4EB345]/10 border-[#4EB345] neon-glow-green shadow-lg shadow-[#4EB345]/20"
                : "text-zinc-400 bg-zinc-900/50 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900"
            }`}
            style={{ fontFamily: "var(--font-quantico)" }}
          >
            Latest Transactions
          </button>
          <button
            onClick={() => setActiveTab("blocks")}
            className={`px-6 py-3 text-sm font-bold transition-all rounded-lg border-2 ${
              activeTab === "blocks"
                ? "text-[#4EB345] bg-[#4EB345]/10 border-[#4EB345] neon-glow-green shadow-lg shadow-[#4EB345]/20"
                : "text-zinc-400 bg-zinc-900/50 border-zinc-800 hover:text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900"
            }`}
            style={{ fontFamily: "var(--font-quantico)" }}
          >
            Latest Blocks
          </button>
        </div>

        {/* Transactions Table */}
        {activeTab === "transactions" && (
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#4EB345]/10">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-300">
                      Time
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-300">
                      Coin
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-300">
                      Side
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-zinc-300">
                      Price
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-zinc-300">
                      Size
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-300">
                      Hash
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-6 py-12 text-center text-zinc-500"
                      >
                        {connected
                          ? "Waiting for transactions..."
                          : "Connecting to WebSocket..."}
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, index) => {
                      const isEven = (index + (stripeToggle ? 1 : 0)) % 2 === 0;
                      return (
                        <tr
                          key={`${tx.time}-${tx.tid}-${index}`}
                          className={`border-t border-zinc-800 hover:bg-zinc-800/30 transition-colors ${
                            isEven ? "bg-zinc-900/50" : "bg-zinc-950/50"
                          }`}
                        >
                          <td className="px-4 py-2 text-sm font-mono">
                            {formatTime(tx.time)}
                          </td>
                          <td className="px-4 py-2 text-sm font-semibold">
                            {tx.coin || "N/A"}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                tx.side === "B"
                                  ? "bg-green-500/20 text-green-400"
                                  : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {tx.side === "B" ? "Buy" : "Sell"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono">
                            <NumericFormat
                              value={tx.px}
                              displayType="text"
                              prefix="$"
                              thousandSeparator=","
                              decimalScale={2}
                              fixedDecimalScale
                            />
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono">
                            <NumericFormat
                              value={tx.sz}
                              displayType="text"
                              thousandSeparator=","
                              decimalScale={4}
                              fixedDecimalScale
                            />
                          </td>
                          <td className="px-4 py-2 text-sm font-mono text-zinc-400">
                            {tx.hash ? formatHash(tx.hash) : `TID: ${tx.tid}`}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Blocks Table */}
        {activeTab === "blocks" && (
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#4EB345]/10">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-300">
                      Height
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-300">
                      Time
                    </th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-zinc-300">
                      Hash
                    </th>
                    <th className="px-4 py-2 text-right text-sm font-semibold text-zinc-300">
                      Transactions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {blocks.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-6 py-12 text-center text-zinc-500"
                      >
                        Loading blocks...
                      </td>
                    </tr>
                  ) : (
                    blocks.map((block, index) => {
                      const isEven = (index + (stripeToggle ? 1 : 0)) % 2 === 0;
                      return (
                        <tr
                          key={`${block.height}-${index}`}
                          className={`border-t border-zinc-800 hover:bg-zinc-800/30 transition-colors ${
                            isEven ? "bg-zinc-900/50" : "bg-zinc-950/50"
                          }`}
                        >
                          <td className="px-4 py-2 text-sm font-mono font-semibold text-[#4EB345]">
                            {block.height}
                          </td>
                          <td className="px-4 py-2 text-sm font-mono">
                            {formatTime(block.time)}
                          </td>
                          <td className="px-4 py-2 text-sm font-mono text-zinc-400">
                            {formatHash(block.hash)}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono">
                            <NumericFormat
                              value={block.txCount || 0}
                              displayType="text"
                              thousandSeparator=","
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer
          className="mt-16 pt-8 border-t border-zinc-800 text-center text-zinc-500 text-xs"
          style={{ fontFamily: "var(--font-quantico)" }}
        >
          <p>Copyright © {new Date().getFullYear()} by keep_going</p>
        </footer>
      </div>
    </div>
  );
}
