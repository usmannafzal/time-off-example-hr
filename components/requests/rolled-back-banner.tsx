"use client";

import { Button, Notice } from "@/components/ui/primitives";

/**
 * Shown when a post-write verification contradicts an optimistic write
 * (silent failure) (TRD §4.3, §4.4 optimistic-rolled-back). Offers Retry
 * (creates a new request) or Dismiss. Uses the specific message mandated by
 * TRD §4.3 — not a generic error.
 */
export function RolledBackBanner({
  onRetry,
  onDismiss,
}: {
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <Notice tone="error">
      <div className="flex flex-col gap-2">
        <span>
          Something went wrong — your request may not have been saved. Please
          try again.
        </span>
        <div className="flex gap-2">
          <Button variant="danger" onClick={onRetry}>
            Retry
          </Button>
          <Button variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </Notice>
  );
}
