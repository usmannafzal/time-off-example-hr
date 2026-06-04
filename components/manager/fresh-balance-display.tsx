"use client";

import type { Balance } from "@/lib/domain/types";
import { Notice, Spinner, formatTime } from "@/components/ui/primitives";

/**
 * Always-fresh balance shown at the manager's decision time (TRD §4.5).
 * Never served from stale cache; includes a "just fetched" timestamp.
 */
export function FreshBalanceDisplay({
  balance,
  isLoading,
  isError,
}: {
  balance?: Balance;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner /> Fetching current balance…
      </div>
    );
  }
  if (isError || !balance) {
    return (
      <Notice tone="warning">
        Unable to verify current balance. Proceeding may be based on stale data.
      </Notice>
    );
  }
  return (
    <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/40">
      <span className="font-medium tabular-nums">{balance.available} days</span>{" "}
      available · Balance as of {formatTime(balance.fetchedAt)} — just fetched.
    </div>
  );
}
