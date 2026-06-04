"use client";

/**
 * Balance read hooks (TRD §4.1, §4.2, §5.2).
 *
 * - `useBalances` hydrates the full corpus and polls every 60s (configurable),
 *   refetching on window focus. Optimistic deltas from the transition store are
 *   layered on top so a provisional request shows immediately.
 * - `useBalanceCell` reads a single real-time cell, bypassing cache — used by
 *   the manager decision view (TRD §4.5).
 */

import { useQuery } from "@tanstack/react-query";
import { fetchBalances, fetchBalanceCell } from "@/lib/api/client";
import { queryKeys } from "./keys";
import { BALANCE_REFETCH_INTERVAL_MS } from "@/lib/config";
import type { Balance } from "@/lib/domain/types";
import {
  useTransitionStore,
  type BalanceDelta,
} from "@/lib/store/transition-store";

function applyDelta(balance: Balance, delta: BalanceDelta | undefined): Balance {
  if (!delta) return balance;
  return {
    ...balance,
    available: balance.available + delta.available,
    pending: balance.pending + delta.pending,
  };
}

export function useBalances(employeeId: string) {
  const deltas = useTransitionStore((s) => s.deltas);

  const query = useQuery({
    queryKey: queryKeys.balances(employeeId),
    queryFn: () => fetchBalances(employeeId),
    refetchInterval: BALANCE_REFETCH_INTERVAL_MS,
  });

  const data = query.data?.map((b) =>
    applyDelta(b, deltas[`${b.employeeId}:${b.locationId}`]),
  );

  return { ...query, data };
}

export function useBalanceCell(
  employeeId: string,
  locationId: string,
  options?: { enabled?: boolean },
) {
  const delta = useTransitionStore(
    (s) => s.deltas[`${employeeId}:${locationId}`],
  );

  const query = useQuery({
    queryKey: queryKeys.balanceCell(employeeId, locationId),
    queryFn: () => fetchBalanceCell(employeeId, locationId),
    enabled: options?.enabled ?? true,
    // Always treat a cell read as immediately stale so the manager view fetches
    // fresh at decision time (TRD §4.5).
    staleTime: 0,
    gcTime: 0,
  });

  return { ...query, data: query.data ? applyDelta(query.data, delta) : query.data };
}
