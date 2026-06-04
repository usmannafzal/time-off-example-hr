"use client";

import { Notice } from "@/components/ui/primitives";

/**
 * Surfaced above the submit button when a background refresh changed the
 * balance while the form is open (TRD §5.3):
 *   - a LOWER live balance → warning ("your available balance may have changed")
 *   - a HIGHER live balance → info (anniversary bonus arrived mid-form)
 * Neither resets the form; they only inform (TRD §4.1 in-flight protection).
 */
export function StaleBalanceWarning({
  snapshotAvailable,
  liveAvailable,
}: {
  snapshotAvailable: number;
  liveAvailable: number;
}) {
  if (liveAvailable < snapshotAvailable) {
    return (
      <Notice tone="warning">
        Your available balance may have changed. Current balance:{" "}
        {liveAvailable} days.
      </Notice>
    );
  }
  if (liveAvailable > snapshotAvailable) {
    return (
      <Notice tone="success">
        Good news — your balance increased to {liveAvailable} days (HR update).
        You can finish this request or refresh to use the new balance.
      </Notice>
    );
  }
  return null;
}
