/**
 * Deterministic seed data for the mock HCM (TRD §6.3).
 *
 * The store is reset to this snapshot between test runs so every test starts
 * from a known state. The "authenticated employee" defaults to `emp_alice`;
 * a manager queue is populated from pending requests across employees.
 */

import type { BalanceDto, LeaveRequestDto } from "@/lib/hcm/contracts";

/** Default authenticated employee when no `x-employee-id` header is present. */
export const DEFAULT_EMPLOYEE_ID = "emp_alice";

export interface SeedLocation {
  locationId: string;
  locationName: string;
}

/** Known (employeeId → locations) assignments. Drives dimension validation. */
export const SEED_ASSIGNMENTS: Record<string, SeedLocation[]> = {
  emp_alice: [
    { locationId: "LOC-NYC", locationName: "New York" },
    { locationId: "LOC-LON", locationName: "London" },
    { locationId: "LOC-SF", locationName: "San Francisco" },
  ],
  emp_ben: [{ locationId: "LOC-NYC", locationName: "New York" }],
  // emp_empty has assignments but no balance rows → drives the "empty" story.
  emp_empty: [],
};

/** A fixed reference timestamp so seeded ISO dates are stable across runs. */
const SEED_NOW = new Date("2025-06-01T09:00:00.000Z");

function iso(offsetDays: number): string {
  const d = new Date(SEED_NOW);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString();
}

export function seedBalances(now: Date = new Date()): BalanceDto[] {
  const fetchedAt = now.toISOString();
  return [
    {
      employeeId: "emp_alice",
      locationId: "LOC-NYC",
      locationName: "New York",
      available: 12,
      used: 8,
      pending: 0,
      fetchedAt,
    },
    {
      employeeId: "emp_alice",
      locationId: "LOC-LON",
      locationName: "London",
      available: 5,
      used: 20,
      pending: 0,
      fetchedAt,
    },
    {
      employeeId: "emp_alice",
      locationId: "LOC-SF",
      locationName: "San Francisco",
      available: 0,
      used: 15,
      pending: 0,
      fetchedAt,
    },
    {
      employeeId: "emp_ben",
      locationId: "LOC-NYC",
      locationName: "New York",
      available: 10,
      used: 5,
      pending: 0,
      fetchedAt,
    },
  ];
}

export function seedRequests(): LeaveRequestDto[] {
  return [
    {
      id: "req_pending_1",
      employeeId: "emp_alice",
      locationId: "LOC-NYC",
      locationName: "New York",
      startDate: iso(30),
      endDate: iso(32),
      days: 3,
      status: "pending",
      submittedAt: iso(-2),
      updatedAt: iso(-2),
      auditTrail: [
        {
          id: "ae_1",
          at: iso(-2),
          message: "Request submitted",
          toStatus: "pending",
        },
      ],
    },
    {
      id: "req_approved_future_1",
      employeeId: "emp_alice",
      locationId: "LOC-LON",
      locationName: "London",
      startDate: iso(45),
      endDate: iso(46),
      days: 2,
      status: "approved",
      submittedAt: iso(-10),
      updatedAt: iso(-5),
      approvedBy: "Dana Manager",
      auditTrail: [
        { id: "ae_2", at: iso(-10), message: "Request submitted", toStatus: "pending" },
        {
          id: "ae_3",
          at: iso(-5),
          message: "Approved by Dana Manager",
          fromStatus: "pending",
          toStatus: "approved",
          by: "Dana Manager",
        },
      ],
    },
    {
      id: "req_approved_past_1",
      employeeId: "emp_alice",
      locationId: "LOC-NYC",
      locationName: "New York",
      startDate: iso(-20),
      endDate: iso(-18),
      days: 3,
      status: "approved",
      submittedAt: iso(-40),
      updatedAt: iso(-35),
      approvedBy: "Dana Manager",
      auditTrail: [
        { id: "ae_4", at: iso(-40), message: "Request submitted", toStatus: "pending" },
        {
          id: "ae_5",
          at: iso(-35),
          message: "Approved by Dana Manager",
          fromStatus: "pending",
          toStatus: "approved",
          by: "Dana Manager",
        },
      ],
    },
    {
      id: "req_denied_1",
      employeeId: "emp_alice",
      locationId: "LOC-SF",
      locationName: "San Francisco",
      startDate: iso(15),
      endDate: iso(19),
      days: 5,
      status: "denied",
      submittedAt: iso(-8),
      updatedAt: iso(-7),
      deniedReason: "Insufficient coverage during release week.",
      auditTrail: [
        { id: "ae_6", at: iso(-8), message: "Request submitted", toStatus: "pending" },
        {
          id: "ae_7",
          at: iso(-7),
          message: "Denied: Insufficient coverage during release week.",
          fromStatus: "pending",
          toStatus: "denied",
          by: "Dana Manager",
        },
      ],
    },
    {
      id: "req_cancelled_1",
      employeeId: "emp_alice",
      locationId: "LOC-NYC",
      locationName: "New York",
      startDate: iso(60),
      endDate: iso(60),
      days: 1,
      status: "cancelled",
      submittedAt: iso(-3),
      updatedAt: iso(-1),
      auditTrail: [
        { id: "ae_8", at: iso(-3), message: "Request submitted", toStatus: "pending" },
        {
          id: "ae_9",
          at: iso(-1),
          message: "Cancelled by employee",
          fromStatus: "pending",
          toStatus: "cancelled",
        },
      ],
    },
    // A pending request from another employee → populates the manager queue.
    {
      id: "req_pending_ben_1",
      employeeId: "emp_ben",
      locationId: "LOC-NYC",
      locationName: "New York",
      startDate: iso(20),
      endDate: iso(24),
      days: 5,
      status: "pending",
      submittedAt: iso(-1),
      updatedAt: iso(-1),
      auditTrail: [
        { id: "ae_10", at: iso(-1), message: "Request submitted", toStatus: "pending" },
      ],
    },
  ];
}
