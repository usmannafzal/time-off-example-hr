"use client";

import type { Balance } from "@/lib/domain/types";
import { Card, Notice, formatTime } from "@/components/ui/primitives";

/**
 * A single balance cell (TRD §5.4). Reads from cache, shows freshness, and
 * never silently presents stale data: balances older than the staleness
 * threshold are labelled "as of [timestamp]" with a soft warning (TRD §4.1).
 */
export function BalanceCard({
  balance,
  error,
}: {
  balance?: Balance;
  /** Per-cell real-time read failure (TRD §7.1 partial-load-error). */
  error?: boolean;
  locationName?: string;
}) {
  if (error) {
    return (
      <Card tone="red">
        <Notice tone="error">
          Couldn&apos;t load this location&apos;s balance. Other balances are
          unaffected.
        </Notice>
      </Card>
    );
  }
  if (!balance) return null;

  return (
    <Card tone={balance.isStale ? "amber" : "default"}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {balance.locationName}
        </h3>
        <span className="text-xs text-slate-400">{balance.locationId}</span>
      </div>

      <div className="mt-3 flex items-end gap-1">
        <span className="text-3xl font-bold tabular-nums">
          {balance.available}
        </span>
        <span className="pb-1 text-sm text-slate-500">days available</span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-slate-500">
        <div className="flex justify-between">
          <dt>Used</dt>
          <dd className="tabular-nums">{balance.used}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Pending</dt>
          <dd className="tabular-nums">{balance.pending}</dd>
        </div>
      </dl>

      <p
        className={
          balance.isStale
            ? "mt-3 text-xs font-medium text-amber-700"
            : "mt-3 text-xs text-slate-400"
        }
      >
        {balance.isStale ? "⚠ " : ""}as of {formatTime(balance.fetchedAt)}
        {balance.isStale ? " — may be out of date" : ""}
      </p>
    </Card>
  );
}
