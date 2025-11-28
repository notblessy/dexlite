"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface UseWebSocketOptions {
  onMessage?: (data: unknown) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebsocket(
  url: string | null,
  handler: (data: unknown) => void,
  options: UseWebSocketOptions = {}
) {
  const {
    onError,
    onOpen,
    onClose,
    reconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = Infinity,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const handlerRef = useRef(handler);
  const urlRef = useRef(url);
  const connectRef = useRef<(() => void) | null>(null);
  const isManualCloseRef = useRef(false);
  const isConnectingRef = useRef(false);
  const messageQueueRef = useRef<Record<string, unknown>[]>([]);
  const [connected, setConnected] = useState(false);

  // Update handler ref when it changes
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  // Update url ref when it changes
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const connect = useCallback(() => {
    if (!urlRef.current || isManualCloseRef.current) return;

    // Check if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (isConnectingRef.current) {
      console.log("WebSocket connection already in progress");
      return;
    }

    // Check max reconnect attempts
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error("Max reconnection attempts reached");
      return;
    }

    // Clean up any existing connection first, but only if it's not connecting
    if (wsRef.current) {
      const currentState = wsRef.current.readyState;
      // Only clean up if it's already open or closed, not if it's connecting
      if (
        currentState === WebSocket.OPEN ||
        currentState === WebSocket.CLOSED
      ) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          if (currentState === WebSocket.OPEN) {
            wsRef.current.close();
          }
        } catch {
          // Ignore cleanup errors
        }
        wsRef.current = null;
      } else if (currentState === WebSocket.CONNECTING) {
        // If it's connecting, wait a bit and check again
        console.log("Previous connection still connecting, waiting...");
        return;
      }
    }

    isConnectingRef.current = true;

    try {
      console.log(`Connecting to WebSocket: ${urlRef.current}`);
      const ws = new WebSocket(urlRef.current);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected successfully");
        isConnectingRef.current = false;
        setConnected(true);
        reconnectAttemptsRef.current = 0;

        // Send any queued messages
        const queue = messageQueueRef.current;
        messageQueueRef.current = [];
        queue.forEach((msg) => {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(msg));
            }
          } catch (error) {
            console.error("Error sending queued message:", error);
          }
        });

        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handlerRef.current(data);
        } catch (error) {
          console.error("Error parsing WebSocket message:", error, event.data);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error event:", error);
        isConnectingRef.current = false;
        // Don't set connected to false here - let onclose handle it
        onError?.(error);
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        isConnectingRef.current = false;
        setConnected(false);

        // Clear message queue on close to prevent stale messages
        messageQueueRef.current = [];

        onClose?.();

        // Clean up the reference
        if (wsRef.current === ws) {
          wsRef.current = null;
        }

        // Only reconnect if not manually closed and reconnect is enabled
        if (
          !isManualCloseRef.current &&
          reconnect &&
          urlRef.current &&
          connectRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(
            reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1),
            30000
          );
          console.log(
            `Scheduling reconnection in ${delay}ms (attempt ${reconnectAttemptsRef.current})...`
          );
          reconnectTimeoutRef.current = setTimeout(() => {
            if (
              connectRef.current &&
              !isManualCloseRef.current &&
              !isConnectingRef.current
            ) {
              connectRef.current();
            }
          }, delay);
        }
      };
    } catch (error) {
      console.error("Error creating WebSocket:", error);
      isConnectingRef.current = false;
      setConnected(false);

      // Schedule reconnection on error
      if (
        !isManualCloseRef.current &&
        reconnect &&
        urlRef.current &&
        connectRef.current &&
        reconnectAttemptsRef.current < maxReconnectAttempts
      ) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(
          reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1),
          30000
        );
        reconnectTimeoutRef.current = setTimeout(() => {
          if (connectRef.current && !isManualCloseRef.current) {
            connectRef.current();
          }
        }, delay);
      }
    }
  }, [
    onError,
    onOpen,
    onClose,
    reconnect,
    reconnectInterval,
    maxReconnectAttempts,
  ]);

  // Store connect function in ref
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = wsRef.current;

    if (!ws) {
      // If no WebSocket exists yet, queue the message
      messageQueueRef.current.push(message);
      return;
    }

    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error("Error sending WebSocket message:", error);
        // Queue message for retry if connection is still open
        if (ws.readyState === WebSocket.OPEN) {
          messageQueueRef.current.push(message);
        }
      }
    } else if (ws.readyState === WebSocket.CONNECTING) {
      // Queue message if connection is in progress
      messageQueueRef.current.push(message);
    } else {
      // Connection is closed or closing, queue for when it reconnects
      messageQueueRef.current.push(message);
    }
  }, []);

  const disconnect = useCallback(() => {
    isManualCloseRef.current = true;
    isConnectingRef.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        if (
          wsRef.current.readyState === WebSocket.CONNECTING ||
          wsRef.current.readyState === WebSocket.OPEN
        ) {
          wsRef.current.close();
        }
      } catch {
        // Ignore cleanup errors
      }
      wsRef.current = null;
    }

    setConnected(false);
  }, []);

  // Main connection effect - only runs when url changes
  useEffect(() => {
    // Reset manual close flag when URL changes
    isManualCloseRef.current = false;
    reconnectAttemptsRef.current = 0;

    if (url && !isManualCloseRef.current) {
      // Small delay to ensure component is fully mounted
      const timeoutId = setTimeout(() => {
        if (!isManualCloseRef.current && urlRef.current === url) {
          connect();
        }
      }, 100);

      return () => {
        clearTimeout(timeoutId);
        // Only disconnect if this is a cleanup (not a URL change)
        if (urlRef.current !== url) {
          isManualCloseRef.current = true;
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
          }
          if (wsRef.current) {
            try {
              wsRef.current.onopen = null;
              wsRef.current.onmessage = null;
              wsRef.current.onerror = null;
              wsRef.current.onclose = null;
              if (
                wsRef.current.readyState === WebSocket.CONNECTING ||
                wsRef.current.readyState === WebSocket.OPEN
              ) {
                wsRef.current.close();
              }
            } catch {
              // Ignore cleanup errors
            }
            wsRef.current = null;
          }
          setConnected(false);
        }
      };
    }

    // Cleanup on unmount
    return () => {
      isManualCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.onopen = null;
          wsRef.current.onmessage = null;
          wsRef.current.onerror = null;
          wsRef.current.onclose = null;
          if (
            wsRef.current.readyState === WebSocket.CONNECTING ||
            wsRef.current.readyState === WebSocket.OPEN
          ) {
            wsRef.current.close();
          }
        } catch {
          // Ignore cleanup errors
        }
        wsRef.current = null;
      }
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { send, disconnect, connected };
}
