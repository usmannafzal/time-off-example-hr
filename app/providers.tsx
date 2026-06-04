"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GC_TIME_MS, STALE_TIME_MS } from "@/lib/config";
import { useCrossTabSync } from "@/lib/sync/cross-tab-sync";

/**
 * Builds the app-wide TanStack Query client with the cache policy mandated by
 * TRD §5.2:
 *   - staleTime  = 4 min  → balances served from cache during the fresh window
 *   - gcTime     = 10 min → unused cache retained before garbage collection
 *   - refetchOnWindowFocus → focus/visibility reconciliation (TRD §4.1)
 *
 * Note: the 60s balance `refetchInterval` is applied per-query in the balance
 * hooks (TRD §4.1) rather than globally, so request queries are not polled.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        gcTime: GC_TIME_MS,
        refetchOnWindowFocus: true,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session; never recreate on re-render.
  const [queryClient] = useState(makeQueryClient);

  // Keep this tab's cache in sync with writes made in other tabs.
  useCrossTabSync(queryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
