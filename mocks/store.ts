/**
 * In-memory HCM state + business logic (TRD §6.2, §6.3).
 *
 * This is the single behavioral core for the mock HCM. Both the MSW handlers
 * (browser + node) and the Next.js route handlers call into it, so the
 * simulated HCM behaves identically across Storybook, Vitest and the running
 * app. The store is a plain module-level `Map` and is reset between test runs
 * via {@link resetStore} for full determinism.
 *
 * Balance accounting model:
 *   available = days still bookable (already net of `used` and `pending`)
 *   pending   = days currently reserved by pending/approved-future requests
 *   used      = days consumed by approved requests whose period has begun
 *
 * Creating a request reserves days (available -= d, pending += d). Approval
 * consumes them (pending -= d, used += d). Cancel/deny release them.
 */

import {
  DEFAULT_EMPLOYEE_ID,
  SEED_ASSIGNMENTS,
  seedBalances,
  seedRequests,
} from "./fixtures/hcm-seed";
import type {
  BalanceDto,
  CreateRequestPayload,
  DenyRequestPayload,
  LeaveRequestDto,
  PatchRequestPayload,
} from "@/lib/hcm/contracts";
import { HCM_ANNIVERSARY_BONUS_DAYS } from "@/lib/config";

interface StoreState {
  /** key: `${employeeId}:${locationId}` */
  balances: Map<string, BalanceDto>;
  /** key: request id */
  requests: Map<string, LeaveRequestDto>;
  /** Monotonic counters for deterministic-ish id/audit generation. */
  seq: number;
}

const cellKey = (employeeId: string, locationId: string) =>
  `${employeeId}:${locationId}`;

let store: StoreState = createEmpty();

function createEmpty(): StoreState {
  return { balances: new Map(), requests: new Map(), seq: 0 };
}

/** Reset to the seed snapshot. Call between test runs (TRD §6.3). */
export function resetStore(now: Date = new Date()): void {
  store = createEmpty();
  for (const b of seedBalances(now)) {
    store.balances.set(cellKey(b.employeeId, b.locationId), { ...b });
  }
  for (const r of seedRequests()) {
    store.requests.set(r.id, structuredCloneSafe(r));
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Seed eagerly on first import so the running app and Storybook have data.
resetStore();

/* --------------------------------------------------------------------- *
 * IDs, randomness and "force" controls                                  *
 * --------------------------------------------------------------------- */

let rng: () => number = Math.random;
/** Override the RNG for deterministic silent-failure tests. */
export function setRandom(fn: () => number): void {
  rng = fn;
}

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}_${Date.now().toString(36)}${store.seq.toString(36)}`;
}

/** Per-write overrides, typically sourced from query params (TRD §6.2). */
export interface WriteOptions {
  forceSilentFailure?: boolean;
  forceConflict?: boolean;
  forceInvalidDimension?: boolean;
}

function effectiveSilentFailureRate(): number {
  // Disable randomness under Vitest unless a test forces it, so component
  // tests are deterministic without per-test seeding.
  if (process.env.VITEST) return 0;
  const raw = Number(process.env.HCM_SILENT_FAILURE_RATE);
  return Number.isFinite(raw) ? raw : 0.1;
}

function shouldSilentlyFail(options: WriteOptions): boolean {
  if (options.forceSilentFailure) return true;
  return rng() < effectiveSilentFailureRate();
}

/* --------------------------------------------------------------------- *
 * Reads                                                                 *
 * --------------------------------------------------------------------- */

export function listBalances(employeeId: string): BalanceDto[] {
  const now = new Date().toISOString();
  return [...store.balances.values()]
    .filter((b) => b.employeeId === employeeId)
    .map((b) => ({ ...b, fetchedAt: now }));
}

export function isValidDimension(
  employeeId: string,
  locationId: string,
): boolean {
  const assignments = SEED_ASSIGNMENTS[employeeId];
  if (!assignments) return false;
  return assignments.some((a) => a.locationId === locationId);
}

export type CellResult =
  | { kind: "ok"; balance: BalanceDto }
  | { kind: "invalid-dimension" };

export function getBalanceCell(
  employeeId: string,
  locationId: string,
): CellResult {
  if (!isValidDimension(employeeId, locationId)) {
    return { kind: "invalid-dimension" };
  }
  const existing = store.balances.get(cellKey(employeeId, locationId));
  const now = new Date().toISOString();
  if (!existing) {
    // Valid assignment but no balance row yet → zeroed cell.
    const assignment = SEED_ASSIGNMENTS[employeeId].find(
      (a) => a.locationId === locationId,
    )!;
    return {
      kind: "ok",
      balance: {
        employeeId,
        locationId,
        locationName: assignment.locationName,
        available: 0,
        used: 0,
        pending: 0,
        fetchedAt: now,
      },
    };
  }
  return { kind: "ok", balance: { ...existing, fetchedAt: now } };
}

export function listRequests(employeeId: string): LeaveRequestDto[] {
  return [...store.requests.values()]
    .filter((r) => r.employeeId === employeeId)
    .map(structuredCloneSafe);
}

/** All confirmed pending requests across employees — the manager queue. */
export function listPendingRequests(): LeaveRequestDto[] {
  return [...store.requests.values()]
    .filter((r) => r.status === "pending")
    .map(structuredCloneSafe);
}

export function getRequest(id: string): LeaveRequestDto | undefined {
  const r = store.requests.get(id);
  return r ? structuredCloneSafe(r) : undefined;
}

/* --------------------------------------------------------------------- *
 * Balance mutation helpers                                              *
 * --------------------------------------------------------------------- */

function locationName(employeeId: string, locationId: string): string {
  const assignment = SEED_ASSIGNMENTS[employeeId]?.find(
    (a) => a.locationId === locationId,
  );
  return assignment?.locationName ?? locationId;
}

function ensureCell(employeeId: string, locationId: string): BalanceDto {
  const key = cellKey(employeeId, locationId);
  let cell = store.balances.get(key);
  if (!cell) {
    cell = {
      employeeId,
      locationId,
      locationName: locationName(employeeId, locationId),
      available: 0,
      used: 0,
      pending: 0,
      fetchedAt: new Date().toISOString(),
    };
    store.balances.set(key, cell);
  }
  return cell;
}

function reserve(employeeId: string, locationId: string, days: number): void {
  const cell = ensureCell(employeeId, locationId);
  cell.available -= days;
  cell.pending += days;
  cell.fetchedAt = new Date().toISOString();
}

function release(employeeId: string, locationId: string, days: number): void {
  const cell = ensureCell(employeeId, locationId);
  cell.available += days;
  cell.pending -= days;
  cell.fetchedAt = new Date().toISOString();
}

function consume(employeeId: string, locationId: string, days: number): void {
  const cell = ensureCell(employeeId, locationId);
  cell.pending -= days;
  cell.used += days;
  cell.fetchedAt = new Date().toISOString();
}

function pushAudit(
  req: LeaveRequestDto,
  message: string,
  toStatus: LeaveRequestDto["status"],
  by?: string,
): void {
  req.auditTrail.push({
    id: nextId("ae"),
    at: new Date().toISOString(),
    message,
    fromStatus: req.status,
    toStatus,
    by,
  });
}

/* --------------------------------------------------------------------- *
 * Writes                                                                *
 * --------------------------------------------------------------------- */

export type CreateResult =
  | { kind: "created"; request: LeaveRequestDto }
  // 200 OK, looks successful, but nothing was persisted (TRD §6.2 silent failure).
  | { kind: "silent-failure"; request: LeaveRequestDto }
  | { kind: "conflict"; available: number; requested: number }
  | { kind: "invalid-dimension" };

/**
 * File a new leave request. Always returns `status: "pending"` and a real
 * server id — never `approved` (TRD §4.4, §12). May simulate a 409 conflict,
 * a 422 invalid dimension, or a silent failure.
 */
export function createRequest(
  payload: CreateRequestPayload,
  options: WriteOptions = {},
): CreateResult {
  const { employeeId, locationId, days } = payload;

  if (options.forceInvalidDimension || !isValidDimension(employeeId, locationId)) {
    return { kind: "invalid-dimension" };
  }

  const cell = getBalanceCell(employeeId, locationId);
  const available = cell.kind === "ok" ? cell.balance.available : 0;

  if (options.forceConflict || days > available) {
    return { kind: "conflict", available, requested: days };
  }

  const now = new Date().toISOString();
  const request: LeaveRequestDto = {
    id: nextId("req"),
    employeeId,
    locationId,
    locationName: locationName(employeeId, locationId),
    startDate: payload.startDate,
    endDate: payload.endDate,
    days,
    status: "pending", // enforced: never "approved" on submission
    submittedAt: now,
    updatedAt: now,
    auditTrail: [
      { id: nextId("ae"), at: now, message: "Request submitted", toStatus: "pending" },
    ],
  };

  if (shouldSilentlyFail(options)) {
    // Accept + return 200, but persist nothing. A verification read will see
    // the un-reserved balance and trigger rollback (TRD §4.3, §6.2).
    return { kind: "silent-failure", request };
  }

  store.requests.set(request.id, request);
  reserve(employeeId, locationId, days);
  return { kind: "created", request: structuredCloneSafe(request) };
}

export type PatchResult =
  | { kind: "updated"; request: LeaveRequestDto }
  | { kind: "silent-failure"; request: LeaveRequestDto }
  | { kind: "conflict"; available: number; requested: number }
  | { kind: "not-found" };

/** Update an existing request: edit dates (re-approval) or cancel (TRD §3.3, §6.1). */
export function patchRequest(
  id: string,
  payload: PatchRequestPayload,
  options: WriteOptions = {},
): PatchResult {
  const req = store.requests.get(id);
  if (!req) return { kind: "not-found" };

  // Cancellation path.
  if (payload.status === "cancelled") {
    if (req.status === "pending" || req.status === "approved") {
      release(req.employeeId, req.locationId, req.days);
    }
    pushAudit(req, "Cancelled by employee", "cancelled");
    req.status = "cancelled";
    req.updatedAt = new Date().toISOString();
    return { kind: "updated", request: structuredCloneSafe(req) };
  }

  // Date-edit path → recompute reservation and reset to pending (re-approval).
  const newDays = payload.days ?? req.days;
  const delta = newDays - req.days;
  if (delta > 0) {
    const cell = getBalanceCell(req.employeeId, req.locationId);
    const available = cell.kind === "ok" ? cell.balance.available : 0;
    if (options.forceConflict || delta > available) {
      return { kind: "conflict", available, requested: newDays };
    }
  }

  if (shouldSilentlyFail(options)) {
    return { kind: "silent-failure", request: structuredCloneSafe(req) };
  }

  if (delta !== 0) {
    if (delta > 0) reserve(req.employeeId, req.locationId, delta);
    else release(req.employeeId, req.locationId, -delta);
  }
  if (payload.startDate) req.startDate = payload.startDate;
  if (payload.endDate) req.endDate = payload.endDate;
  req.days = newDays;
  pushAudit(req, "Dates edited — re-approval required", "pending");
  req.status = "pending";
  req.updatedAt = new Date().toISOString();
  return { kind: "updated", request: structuredCloneSafe(req) };
}

export type ApproveResult =
  | { kind: "approved"; request: LeaveRequestDto }
  | { kind: "conflict"; available: number; requested: number }
  | { kind: "not-found" };

/**
 * Manager approval. Re-reads balance before approving and may return 409 if
 * the balance changed since the request was displayed (TRD §4.5, §6.1).
 */
export function approveRequest(
  id: string,
  by: string,
  options: WriteOptions = {},
): ApproveResult {
  const req = store.requests.get(id);
  if (!req) return { kind: "not-found" };

  const cell = getBalanceCell(req.employeeId, req.locationId);
  const available = cell.kind === "ok" ? cell.balance.available : 0;

  // The days are already reserved (available net of pending), so a healthy
  // approval needs available >= 0. A forced conflict models a concurrent change.
  if (options.forceConflict || available < 0) {
    return { kind: "conflict", available, requested: req.days };
  }

  consume(req.employeeId, req.locationId, req.days);
  pushAudit(req, `Approved by ${by}`, "approved", by);
  req.status = "approved";
  req.approvedBy = by;
  req.updatedAt = new Date().toISOString();
  return { kind: "approved", request: structuredCloneSafe(req) };
}

export type DenyResult =
  | { kind: "denied"; request: LeaveRequestDto }
  | { kind: "not-found" };

/** Manager denial. Always succeeds — denial requires no balance (TRD §6.1). */
export function denyRequest(id: string, payload: DenyRequestPayload): DenyResult {
  const req = store.requests.get(id);
  if (!req) return { kind: "not-found" };

  if (req.status === "pending") {
    // Release the reservation since the request will not be honoured.
    release(req.employeeId, req.locationId, req.days);
  }
  pushAudit(req, `Denied: ${payload.reason}`, "denied", payload.by);
  req.status = "denied";
  req.deniedReason = payload.reason;
  req.updatedAt = new Date().toISOString();
  return { kind: "denied", request: structuredCloneSafe(req) };
}

export type AnniversaryResult =
  | { kind: "applied"; balance: BalanceDto }
  | { kind: "invalid-dimension" };

/** Apply an anniversary bonus to a cell (TRD §6.1 admin endpoint, §6.2). */
export function applyAnniversaryBonus(
  employeeId: string,
  locationId: string,
  days: number = HCM_ANNIVERSARY_BONUS_DAYS,
): AnniversaryResult {
  if (!isValidDimension(employeeId, locationId)) {
    return { kind: "invalid-dimension" };
  }
  const cell = ensureCell(employeeId, locationId);
  cell.available += days; // anniversary bonuses only increase (TRD §11.1)
  cell.fetchedAt = new Date().toISOString();
  return { kind: "applied", balance: { ...cell } };
}

/** Pick a random employee+cell for the anniversary scheduler (TRD §6.2). */
export function pickRandomCell(): { employeeId: string; locationId: string } | null {
  const cells = [...store.balances.values()];
  if (cells.length === 0) return null;
  const choice = cells[Math.floor(rng() * cells.length)];
  return { employeeId: choice.employeeId, locationId: choice.locationId };
}

export { DEFAULT_EMPLOYEE_ID };
