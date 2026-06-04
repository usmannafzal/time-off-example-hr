/**
 * Leave-request state machine (TRD §3.3 lifecycle rules + §4.4 transitions).
 *
 * This module is pure and has no React/network dependencies so it can be unit
 * tested in isolation (TRD §8.2 "state machine transitions") and reused by both
 * the UI layer (Zustand) and the mock HCM.
 *
 * Invariants enforced here:
 *   - Pending-first: the only path to `approved` is an explicit manager
 *     `approve` action. Submission never yields `approved` (TRD §4.4, §12).
 *   - Editing dates on an approved, future-dated request resets to `pending`
 *     (re-approval required) (TRD §3.3, §4.4).
 *   - Approved+past, cancelled, denied and rolled-back are view-only.
 */

import type { LeaveRequestStatus, UserRole } from "./types";

/** Actions a user (employee or manager) can attempt against a request. */
export type LeaveRequestAction =
  | "edit-dates"
  | "cancel"
  | "retry" // from rolled-back: create a fresh request
  | "create-new" // from denied: create a fresh request
  | "dismiss" // from rolled-back: clear the banner/card
  | "approve" // manager only
  | "deny"; // manager only

/** Internal transitions driven by the data layer, not by direct user clicks. */
export type LeaveRequestSystemEvent =
  | "confirm" // HCM confirmed the optimistic write → real ID assigned
  | "reject"; // HCM contradicted the optimistic write (silent failure / error)

export interface TransitionContext {
  /** True when the request's start date is still in the future (TRD §3.3). */
  startDateInFuture: boolean;
  /** The role attempting the action. */
  role: UserRole;
}

/**
 * The outcome of applying an action/event to a request.
 *  - `transition`: the request takes a new stored status.
 *  - `discard`:    the request is removed entirely with no audit record
 *                  (optimistic-pending cancel / rolled-back dismiss — neither
 *                  was ever persisted by HCM, so no audit trail is required).
 *  - `spawn-new`:  a brand-new request should be created; the existing record
 *                  is preserved unchanged (retry / create-new).
 */
export type TransitionResult =
  | { type: "transition"; status: LeaveRequestStatus }
  | { type: "discard" }
  | { type: "spawn-new" };

/** Statuses that allow no further mutation — view only (TRD §3.3). */
const VIEW_ONLY_STATUSES: ReadonlySet<LeaveRequestStatus> = new Set([
  "cancelled",
  "denied",
  "optimistic-rolled-back",
]);

/** True if the request is locked to view-only given its status and dates. */
export function isViewOnly(
  status: LeaveRequestStatus,
  ctx: Pick<TransitionContext, "startDateInFuture">,
): boolean {
  if (status === "approved") {
    // Approved is editable only while the start date is in the future.
    return !ctx.startDateInFuture;
  }
  return VIEW_ONLY_STATUSES.has(status);
}

/**
 * The set of actions available for a request in the given status/context.
 * Mirrors the §3.3 table and the §4.4 "User action available" column.
 */
export function getAvailableActions(
  status: LeaveRequestStatus,
  ctx: TransitionContext,
): LeaveRequestAction[] {
  const { role, startDateInFuture } = ctx;

  if (role === "manager") {
    // Managers act only on confirmed, pending requests (real server ID).
    // No manager action is possible against an optimistic (temp ID) request
    // (TRD §4.4 "no manager action can be taken until the real ID is in place").
    return status === "pending" ? ["approve", "deny"] : [];
  }

  // Employee actions.
  switch (status) {
    case "optimistic-pending":
      // Cancel reverts immediately and discards the temp ID (TRD §4.4).
      return ["cancel"];
    case "pending":
      // Not yet approved: edit/cancel freely, no re-approval implication.
      return ["edit-dates", "cancel"];
    case "approved":
      // Editable/cancellable only while the start date is in the future.
      return startDateInFuture ? ["edit-dates", "cancel"] : [];
    case "denied":
      return ["create-new"];
    case "optimistic-rolled-back":
      return ["retry", "dismiss"];
    case "cancelled":
      return [];
    default: {
      // Exhaustiveness guard — a new status must be handled explicitly.
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Whether `action` is permitted for `status` under `ctx`. */
export function canApply(
  status: LeaveRequestStatus,
  action: LeaveRequestAction,
  ctx: TransitionContext,
): boolean {
  return getAvailableActions(status, ctx).includes(action);
}

/**
 * Apply a user action, returning the resulting transition. Throws if the action
 * is not permitted for the current status/context — surfacing impossible
 * transitions as errors rather than silently corrupting state (TRD §10).
 */
export function applyAction(
  status: LeaveRequestStatus,
  action: LeaveRequestAction,
  ctx: TransitionContext,
): TransitionResult {
  if (!canApply(status, action, ctx)) {
    throw new Error(
      `Illegal action "${action}" for status "${status}" (role=${ctx.role}, futureStart=${ctx.startDateInFuture})`,
    );
  }

  switch (action) {
    case "cancel":
      // Optimistic cancel discards entirely; an approved/pending cancel is
      // preserved for the audit trail (TRD §3.3, §4.4).
      return status === "optimistic-pending"
        ? { type: "discard" }
        : { type: "transition", status: "cancelled" };
    case "edit-dates":
      // Editing an approved future request resets to pending (re-approval);
      // editing a still-pending request keeps it pending (TRD §3.3, §4.4).
      return { type: "transition", status: "pending" };
    case "approve":
      // The ONLY path to approved (TRD §4.4 pending-first invariant).
      return { type: "transition", status: "approved" };
    case "deny":
      return { type: "transition", status: "denied" };
    case "retry":
    case "create-new":
      return { type: "spawn-new" };
    case "dismiss":
      return { type: "discard" };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/**
 * Apply a system event from the data layer to an `optimistic-pending` request.
 * `confirm` enforces pending-first: a confirmed submission becomes `pending`,
 * never `approved` (TRD §4.4, §12).
 */
export function applySystemEvent(
  status: LeaveRequestStatus,
  event: LeaveRequestSystemEvent,
): LeaveRequestStatus {
  if (status !== "optimistic-pending") {
    throw new Error(
      `System event "${event}" is only valid on optimistic-pending (got "${status}")`,
    );
  }
  return event === "confirm" ? "pending" : "optimistic-rolled-back";
}

/**
 * Manager queue eligibility: only confirmed, pending requests carrying a real
 * server ID may appear in the manager's actionable queue (TRD §4.4, §4.5).
 */
export function isManagerActionable(request: {
  id: string;
  tempId?: string;
  status: LeaveRequestStatus;
}): boolean {
  const hasRealId = request.id.length > 0 && !request.tempId;
  return hasRealId && request.status === "pending";
}
