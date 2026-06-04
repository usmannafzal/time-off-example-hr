/**
 * Date-range overlap detection for leave requests (TRD §3.3 conflicting leaves).
 *
 * An employee cannot hold two active (pending/approved) requests whose inclusive
 * date ranges intersect — they can't be on leave for the same day twice. Ranges
 * are treated as inclusive on both ends, so touching days count as an overlap.
 */

import type { LeaveRequestStatus } from "./types";

/** Statuses that occupy dates and therefore block an overlapping request. */
export const OCCUPYING_STATUSES: ReadonlySet<LeaveRequestStatus> = new Set([
  "optimistic-pending",
  "pending",
  "approved",
]);

/** True if [aStart, aEnd] and [bStart, bEnd] intersect (inclusive). */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}
