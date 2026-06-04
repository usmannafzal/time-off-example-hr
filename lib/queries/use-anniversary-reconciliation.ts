"use client";

/**
 * Detects anniversary-bonus reconciliation (TRD §4.1): when a background
 * refetch returns a HIGHER available balance than previously seen for a cell, a
 * non-blocking toast informs the user. A LOWER balance is treated differently
 * by the form (a stale-balance warning) per TRD §5.3/§11.1 and is not toasted
 * here.
 *
 * Pass `suppress: true` while a form is mid-edit so the reconciliation toast is
 * deferred and never interrupts an in-flight action (TRD §4.1 key invariant).
 */

import { useEffect, useRef } from "react";
import type { Balance } from "@/lib/domain/types";
import { useToastStore } from "@/lib/store/toast-store";

export function useAnniversaryReconciliation(
  balances: Balance[] | undefined,
  options?: { suppress?: boolean },
) {
  const push = useToastStore((s) => s.push);
  const previous = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!balances) return;
    const suppress = options?.suppress ?? false;

    for (const b of balances) {
      const key = `${b.employeeId}:${b.locationId}`;
      const prior = previous.current.get(key);
      if (prior !== undefined && b.available > prior && !suppress) {
        push(
          "success",
          `Your ${b.locationName} balance is now ${b.available} days.`,
        );
      }
      // Only advance the baseline when not suppressed, so an increase that
      // happens mid-form is still surfaced once the form closes.
      if (!suppress) previous.current.set(key, b.available);
      else if (prior === undefined) previous.current.set(key, b.available);
    }
  }, [balances, options?.suppress, push]);
}
