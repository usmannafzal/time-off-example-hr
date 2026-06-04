"use client";

/**
 * Cross-tab query synchronization (TRD §4.1 reconciliation, multi-tab).
 *
 * Each browser tab has its own TanStack Query cache, so a mutation in one tab
 * does not invalidate queries in another (e.g. an employee submitting in one
 * tab while a manager has the approval queue open in another). This broadcasts
 * the affected query keys over a `BroadcastChannel`; every other tab listens
 * and invalidates the same keys, so views stay in sync without a manual refresh.
 *
 * Only mutations broadcast; receiving a message merely invalidates locally, so
 * there is no rebroadcast loop.
 */

import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";

const CHANNEL_NAME = "examplehr-timeoff-sync";

interface InvalidateMessage {
  type: "invalidate";
  keys: ReadonlyArray<ReadonlyArray<unknown>>;
}

function isSupported(): boolean {
  return typeof window !== "undefined" && typeof BroadcastChannel !== "undefined";
}

let postChannel: BroadcastChannel | null = null;

/** Broadcast that the given query keys should be invalidated in other tabs. */
export function broadcastInvalidate(
  ...keys: ReadonlyArray<ReadonlyArray<unknown>>
): void {
  if (!isSupported()) return;
  if (!postChannel) postChannel = new BroadcastChannel(CHANNEL_NAME);
  const message: InvalidateMessage = { type: "invalidate", keys };
  postChannel.postMessage(message);
}

/** Subscribe the given QueryClient to cross-tab invalidation messages. */
export function useCrossTabSync(queryClient: QueryClient): void {
  useEffect(() => {
    if (!isSupported()) return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<InvalidateMessage>) => {
      if (event.data?.type !== "invalidate") return;
      for (const key of event.data.keys) {
        queryClient.invalidateQueries({ queryKey: key as unknown[] });
      }
    };
    return () => channel.close();
  }, [queryClient]);
}
