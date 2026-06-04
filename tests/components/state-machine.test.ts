import { describe, expect, it } from "vitest";
import {
  applyAction,
  applySystemEvent,
  getAvailableActions,
  isManagerActionable,
  isViewOnly,
  type LeaveRequestAction,
} from "@/lib/domain/state-machine";
import type { LeaveRequestStatus } from "@/lib/domain/types";

const employeeFuture = { role: "employee" as const, startDateInFuture: true };
const employeePast = { role: "employee" as const, startDateInFuture: false };
const manager = { role: "manager" as const, startDateInFuture: true };

describe("state machine — available actions (TRD §3.3, §4.4)", () => {
  it("optimistic-pending → cancel only", () => {
    expect(getAvailableActions("optimistic-pending", employeeFuture)).toEqual([
      "cancel",
    ]);
  });

  it("pending → edit + cancel", () => {
    expect(getAvailableActions("pending", employeeFuture)).toEqual([
      "edit-dates",
      "cancel",
    ]);
  });

  it("approved + future start → edit + cancel", () => {
    expect(getAvailableActions("approved", employeeFuture)).toEqual([
      "edit-dates",
      "cancel",
    ]);
  });

  it("approved + past start → no actions (locked, view only)", () => {
    expect(getAvailableActions("approved", employeePast)).toEqual([]);
    expect(isViewOnly("approved", { startDateInFuture: false })).toBe(true);
    expect(isViewOnly("approved", { startDateInFuture: true })).toBe(false);
  });

  it("denied → create-new; cancelled → none; rolled-back → retry+dismiss", () => {
    expect(getAvailableActions("denied", employeePast)).toEqual(["create-new"]);
    expect(getAvailableActions("cancelled", employeePast)).toEqual([]);
    expect(getAvailableActions("optimistic-rolled-back", employeePast)).toEqual([
      "retry",
      "dismiss",
    ]);
  });

  it("manager can only act on confirmed pending requests", () => {
    expect(getAvailableActions("pending", manager)).toEqual(["approve", "deny"]);
    for (const s of [
      "optimistic-pending",
      "approved",
      "denied",
      "cancelled",
      "optimistic-rolled-back",
    ] as LeaveRequestStatus[]) {
      expect(getAvailableActions(s, manager)).toEqual([]);
    }
  });
});

describe("state machine — transitions", () => {
  it("pending-first: approve is the ONLY path to approved", () => {
    // No employee action and no system event yields "approved".
    const employeeActions: LeaveRequestAction[] = [
      "edit-dates",
      "cancel",
      "retry",
      "create-new",
      "dismiss",
    ];
    for (const action of employeeActions) {
      try {
        const result = applyAction("pending", action, employeeFuture);
        if (result.type === "transition") {
          expect(result.status).not.toBe("approved");
        }
      } catch {
        /* illegal action for status — fine */
      }
    }
    // Only the manager approve action produces approved.
    expect(applyAction("pending", "approve", manager)).toEqual({
      type: "transition",
      status: "approved",
    });
  });

  it("editing an approved future request resets to pending (re-approval)", () => {
    expect(applyAction("approved", "edit-dates", employeeFuture)).toEqual({
      type: "transition",
      status: "pending",
    });
  });

  it("cancel on optimistic-pending discards; cancel on pending is preserved", () => {
    expect(applyAction("optimistic-pending", "cancel", employeeFuture)).toEqual({
      type: "discard",
    });
    expect(applyAction("pending", "cancel", employeeFuture)).toEqual({
      type: "transition",
      status: "cancelled",
    });
  });

  it("deny transitions to denied", () => {
    expect(applyAction("pending", "deny", manager)).toEqual({
      type: "transition",
      status: "denied",
    });
  });

  it("illegal actions throw", () => {
    expect(() => applyAction("cancelled", "edit-dates", employeeFuture)).toThrow();
    expect(() => applyAction("approved", "approve", employeeFuture)).toThrow();
  });

  it("system events: confirm → pending, reject → rolled-back (only from optimistic-pending)", () => {
    expect(applySystemEvent("optimistic-pending", "confirm")).toBe("pending");
    expect(applySystemEvent("optimistic-pending", "reject")).toBe(
      "optimistic-rolled-back",
    );
    expect(() => applySystemEvent("pending", "confirm")).toThrow();
  });
});

describe("manager actionability (TRD §4.4)", () => {
  it("requires a real id and pending status; rejects temp ids", () => {
    expect(
      isManagerActionable({ id: "req_1", status: "pending" }),
    ).toBe(true);
    expect(
      isManagerActionable({ id: "", tempId: "temp_req_1", status: "pending" }),
    ).toBe(false);
    expect(
      isManagerActionable({ id: "req_1", tempId: "temp_req_1", status: "pending" }),
    ).toBe(false);
    expect(isManagerActionable({ id: "req_1", status: "approved" })).toBe(false);
  });
});
