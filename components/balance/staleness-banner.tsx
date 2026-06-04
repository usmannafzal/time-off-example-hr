"use client";

import type { Balance } from "@/lib/domain/types";
import { Notice } from "@/components/ui/primitives";

/**
 * Shown when any balance is older than the staleness threshold (TRD §4.1,
 * §5.4). Reassures the user that a background refresh is in progress.
 */
export function StalenessBanner({
  balances,
  isRefetching,
}: {
  balances: Balance[];
  isRefetching?: boolean;
}) {
  const staleCount = balances.filter((b) => b.isStale).length;
  if (staleCount === 0) return null;

  return (
    <Notice tone="warning">
      {staleCount === 1
        ? "1 balance may be out of date."
        : `${staleCount} balances may be out of date.`}{" "}
      {isRefetching ? "Refreshing…" : "It will refresh automatically."}
    </Notice>
  );
}
