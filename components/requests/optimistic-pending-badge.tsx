"use client";

import { Spinner } from "@/components/ui/primitives";

/**
 * Spinner badge shown during the provisional window, before HCM confirms an
 * optimistic submission (TRD §4.4 optimistic-pending UI treatment).
 */
export function OptimisticPendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-inset ring-sky-200">
      <Spinner className="h-3 w-3" />
      Awaiting confirmation
    </span>
  );
}
