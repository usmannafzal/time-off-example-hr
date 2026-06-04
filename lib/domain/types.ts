/**
 * Core domain models for the Time-Off module.
 *
 * These mirror TRD §9 exactly. Dates are modelled as `Date` in the domain;
 * the wire format (ISO strings) is handled by the HCM contracts layer.
 */

/** Who is acting on a request. Auth itself is out of scope (TRD §3.2). */
export type UserRole = "employee" | "manager";

/**
 * The leave-request state machine (TRD §9.2 / §4.4).
 *
 * `hcm-rejected` from §4.4 is intentionally *not* a member: an explicit HCM
 * rejection on submission (409/422) never produces a stored request — it is a
 * transient mutation error surfaced inline on the form, leaving the balance
 * unchanged. It is represented by {@link HcmRejection} instead.
 */
export type LeaveRequestStatus =
  | "optimistic-pending" // client temp ID; HCM write in-flight
  | "pending" // real server ID; HCM confirmed; awaiting manager
  | "approved" // manager approved; never set by HCM on submission
  | "denied" // manager denied
  | "cancelled" // employee cancelled; preserved for audit
  | "optimistic-rolled-back"; // HCM contradicted optimistic write; temp ID discarded

/** A single immutable entry in a request's audit trail (TRD §2.2, §9.2). */
export interface AuditEvent {
  id: string;
  at: Date;
  /** Human-readable description of what happened. */
  message: string;
  /** Status before this event, if it was a transition. */
  fromStatus?: LeaveRequestStatus;
  /** Status after this event, if it was a transition. */
  toStatus?: LeaveRequestStatus;
  /** Actor responsible, when known (e.g. manager name on approve/deny). */
  by?: string;
}

/** A single (employeeId, locationId) balance cell (TRD §9.1, Appendix A). */
export interface Balance {
  employeeId: string;
  locationId: string;
  locationName: string;
  /** Days available. */
  available: number;
  /** Days used this period. */
  used: number;
  /** Days held by pending requests (optimistic). */
  pending: number;
  /** Timestamp of the last HCM read for this cell. */
  fetchedAt: Date;
  /** True once `fetchedAt` is older than the staleness display threshold. */
  isStale: boolean;
}

/** A leave request in any lifecycle state (TRD §9.2). */
export interface LeaveRequest {
  /** Real server ID once confirmed; empty string until then (use `tempId`). */
  id: string;
  /** Client-generated; only present during `optimistic-pending`. */
  tempId?: string;
  employeeId: string;
  locationId: string;
  locationName: string;
  startDate: Date;
  endDate: Date;
  /** Whole days only — partial days are out of scope (TRD §11.1). */
  days: number;
  status: LeaveRequestStatus;
  submittedAt: Date;
  updatedAt: Date;
  approvedBy?: string;
  deniedReason?: string;
  /** Full history, never deleted (TRD §2.2 HR Admin need, §9.2). */
  auditTrail: AuditEvent[];
}

/**
 * An explicit, synchronous HCM rejection of a write (TRD §4.4 `hcm-rejected`).
 * Surfaced inline on the form; the balance is left unchanged and the form is
 * re-enabled for correction.
 */
export type HcmRejection =
  | {
      code: "INSUFFICIENT_BALANCE";
      /** Days currently available in the affected cell. */
      available: number;
      /** Days the user attempted to request. */
      requested: number;
    }
  | {
      code: "INVALID_DIMENSION";
      /** The (employeeId, locationId) pair that was rejected. */
      employeeId: string;
      locationId: string;
    };
