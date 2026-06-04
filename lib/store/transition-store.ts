/**
 * Zustand store for UI-layer transition state (TRD §4.4, §5.4).
 *
 * TanStack Query owns confirmed server state. This store owns ONLY the
 * provisional transition state the server doesn't know about yet:
 *   - optimistic request cards (keyed by temp id, then swapped to real id)
 *   - per-cell optimistic balance deltas (so a rollback can restore the balance)
 *
 * Keeping this separate from the query cache ensures cache invalidation never
 * clears the user's in-flight action context (TRD §5.4).
 */

import { create } from "zustand";
import type { LeaveRequest } from "@/lib/domain/types";

/** Phase of a provisional request inside the transition overlay. */
export type TransitionPhase =
  | "submitting" // POST in-flight; temp id; status optimistic-pending
  | "verifying" // POST confirmed; real id; awaiting post-write verification
  | "rolled-back"; // verification contradicted the write; balance restored

export interface OptimisticEntry {
  request: LeaveRequest;
  phase: TransitionPhase;
  /** Cell available value the verification read must observe to confirm. */
  expectedAvailable: number;
  /** Cell coordinates for the verification read + delta bookkeeping. */
  employeeId: string;
  locationId: string;
}

/** Optimistic adjustment applied on top of a server balance cell. */
export interface BalanceDelta {
  available: number;
  pending: number;
}

const cellKey = (employeeId: string, locationId: string) =>
  `${employeeId}:${locationId}`;

interface TransitionState {
  /** Provisional request cards keyed by their current id (temp, then real). */
  entries: Record<string, OptimisticEntry>;
  /** Optimistic balance deltas keyed by `${employeeId}:${locationId}`. */
  deltas: Record<string, BalanceDelta>;

  addOptimistic: (key: string, entry: OptimisticEntry) => void;
  /**
   * Atomic temp→real id swap (TRD §4.4). Removes the temp-keyed entry and
   * inserts a real-id entry in a single synchronous update so no component
   * ever observes both, and none retains the temp id afterwards (TRD §12).
   */
  swapTempToReal: (tempId: string, realRequest: LeaveRequest) => void;
  setPhase: (key: string, phase: TransitionPhase) => void;
  markRolledBack: (key: string) => void;
  removeEntry: (key: string) => void;

  applyDelta: (employeeId: string, locationId: string, delta: BalanceDelta) => void;
  clearDelta: (employeeId: string, locationId: string) => void;

  getDelta: (employeeId: string, locationId: string) => BalanceDelta | undefined;
  reset: () => void;
}

export const useTransitionStore = create<TransitionState>((set, get) => ({
  entries: {},
  deltas: {},

  addOptimistic: (key, entry) =>
    set((s) => ({ entries: { ...s.entries, [key]: entry } })),

  swapTempToReal: (tempId, realRequest) =>
    set((s) => {
      const prev = s.entries[tempId];
      const nextEntries = { ...s.entries };
      delete nextEntries[tempId];
      if (prev) {
        nextEntries[realRequest.id] = {
          ...prev,
          request: realRequest,
          phase: "verifying",
        };
      }
      return { entries: nextEntries };
    }),

  setPhase: (key, phase) =>
    set((s) => {
      const prev = s.entries[key];
      if (!prev) return s;
      return { entries: { ...s.entries, [key]: { ...prev, phase } } };
    }),

  markRolledBack: (key) =>
    set((s) => {
      const prev = s.entries[key];
      if (!prev) return s;
      return {
        entries: {
          ...s.entries,
          [key]: {
            ...prev,
            phase: "rolled-back",
            request: { ...prev.request, status: "optimistic-rolled-back" },
          },
        },
      };
    }),

  removeEntry: (key) =>
    set((s) => {
      if (!(key in s.entries)) return s;
      const nextEntries = { ...s.entries };
      delete nextEntries[key];
      return { entries: nextEntries };
    }),

  applyDelta: (employeeId, locationId, delta) =>
    set((s) => ({
      deltas: { ...s.deltas, [cellKey(employeeId, locationId)]: delta },
    })),

  clearDelta: (employeeId, locationId) =>
    set((s) => {
      const key = cellKey(employeeId, locationId);
      if (!(key in s.deltas)) return s;
      const nextDeltas = { ...s.deltas };
      delete nextDeltas[key];
      return { deltas: nextDeltas };
    }),

  getDelta: (employeeId, locationId) =>
    get().deltas[cellKey(employeeId, locationId)],

  reset: () => set({ entries: {}, deltas: {} }),
}));

/** Non-hook accessor for use inside mutation callbacks. */
export const transitionStore = useTransitionStore;
