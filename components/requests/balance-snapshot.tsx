"use client";

import type { Balance } from "@/lib/domain/types";
import { formatTime } from "@/components/ui/primitives";

/**
 * Displays the balance captured when the form opened (TRD §5.3). The form
 * submits against this snapshot, not against a value that may change mid-edit.
 */
export function BalanceSnapshot({
  snapshot,
  days,
}: {
  snapshot: Balance | undefined;
  days: number;
}) {
  if (!snapshot) return null;
  const remaining = snapshot.available - days;
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
      <div className="flex justify-between">
        <span className="text-slate-500">Available at open</span>
        <span className="font-medium tabular-nums">
          {snapshot.available} days
        </span>
      </div>
      {days > 0 && (
        <div className="mt-1 flex justify-between">
          <span className="text-slate-500">After this request</span>
          <span
            className={
              remaining < 0
                ? "font-medium tabular-nums text-red-600"
                : "font-medium tabular-nums"
            }
          >
            {remaining} days
          </span>
        </div>
      )}
      <p className="mt-1 text-xs text-slate-400">
        snapshot as of {formatTime(snapshot.fetchedAt)}
      </p>
    </div>
  );
}
