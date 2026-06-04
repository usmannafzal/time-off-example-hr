"use client";

import { Notice } from "@/components/ui/primitives";

/**
 * Shown when the manager's fresh balance fetch fails (TRD §4.5, §7.4). The
 * Approve button stays disabled until the manager explicitly overrides the
 * warning (default policy from §11.2 open question — allow with override).
 */
export function StaleBalanceOverrideWarning({
  overridden,
  onOverrideChange,
}: {
  overridden: boolean;
  onOverrideChange: (next: boolean) => void;
}) {
  return (
    <Notice tone="warning">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={overridden}
          onChange={(e) => onOverrideChange(e.target.checked)}
          className="mt-0.5"
          aria-label="Override stale balance warning"
        />
        <span>
          The current balance couldn&apos;t be verified. Approve anyway based on
          potentially stale data.
        </span>
      </label>
    </Notice>
  );
}
