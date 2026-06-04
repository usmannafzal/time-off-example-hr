/**
 * Anniversary-bonus scheduler for the running app (TRD §6.2).
 *
 * Fires every `HCM_ANNIVERSARY_INTERVAL_MS` (default 90s) and increments a
 * random employee/cell's balance, so a long-lived session observes a
 * background balance increase exactly as it would against a real HCM. Disabled
 * when the interval is 0 (e.g. Playwright integration runs) or under Vitest.
 */

import { HCM_ANNIVERSARY_INTERVAL_MS, HCM_ANNIVERSARY_BONUS_DAYS } from "@/lib/config";
import { applyAnniversaryBonus, pickRandomCell } from "./store";

declare global {
  var __hcmAnniversaryTimer: ReturnType<typeof setInterval> | undefined;
}

export function startAnniversaryScheduler(): void {
  if (process.env.VITEST) return;
  if (HCM_ANNIVERSARY_INTERVAL_MS <= 0) return;
  if (globalThis.__hcmAnniversaryTimer) return; // already running (HMR-safe)

  globalThis.__hcmAnniversaryTimer = setInterval(() => {
    const cell = pickRandomCell();
    if (cell) {
      applyAnniversaryBonus(
        cell.employeeId,
        cell.locationId,
        HCM_ANNIVERSARY_BONUS_DAYS,
      );
    }
  }, HCM_ANNIVERSARY_INTERVAL_MS);

  // Don't keep the Node process alive solely for this timer.
  if (typeof globalThis.__hcmAnniversaryTimer.unref === "function") {
    globalThis.__hcmAnniversaryTimer.unref();
  }
}
