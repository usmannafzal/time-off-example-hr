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
import { OCCUPYING_STATUSES, rangesOverlap } from "@/lib/domain/overlap";

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

declare global {
  var __hcmStore: StoreState | undefined;
}

// Pin the store to `globalThis` so every consumer shares ONE instance. Next.js
// dev (HMR) and per-route bundling can otherwise hand different route handlers
// their own module copy, which splits the in-memory state and makes cross-route
// reads (and resets) inconsistent. Binding the object once here — and only ever
// mutating it in place (see resetStore) — guarantees a single source of truth.
const store: StoreState = (globalThis.__hcmStore ??= createEmpty());

function createEmpty(): StoreState {
  return { balances: new Map(), requests: new Map(), seq: 0 };
}

/**
 * Reset to the seed snapshot. Call between test runs (TRD §6.3). Mutates the
 * shared store object in place (rather than reassigning) so any module instance
 * that captured the reference still observes the reset.
 */
export function resetStore(now: Date = new Date()): void {
  store.balances.clear();
  store.requests.clear();
  store.seq = 0;
  for (const b of seedBalances(now)) {
    store.balances.set(cellKey(b.employeeId, b.locationId), { ...b });
  }
  for (const r of seedRequests()) {
    store.requests.set(r.id, structuredCloneSafe(r));
  }
  reconcileSeededReservations();
}

/**
 * Make seed balances internally consistent with the seeded requests. Seed
 * `available` is defined as already net of reservations, but the seed file does
 * not populate the matching `pending` counter. Without this, cancelling or
 * editing a seeded pending request would release days that were never reflected
 * in `pending`, driving it negative and failing the non-negative balance schema
 * on the next read. Approved/denied/cancelled seed rows need no adjustment:
 * approved days live in `used` and the rest hold no reservation.
 */
function reconcileSeededReservations(): void {
  for (const req of store.requests.values()) {
    if (req.status !== "pending") continue;
    const cell = ensureCell(req.employeeId, req.locationId);
    cell.pending += req.days;
  }
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Seed eagerly on first import so the running app and Storybook have data, but
// only when the shared store is still empty — a module re-eval (HMR) must not
// wipe live state. Tests call resetStore() explicitly for isolation.
if (store.balances.size === 0 && store.requests.size === 0) {
  resetStore();
}

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

/**
 * The manager queue: actionable pending requests followed by cancelled ones
 * (view-only). Cancelled requests are surfaced so a cancellation is not a
 * surprise to the manager; they are ordered after all pending requests.
 */
export function listManagerQueue(): LeaveRequestDto[] {
  const all = [...store.requests.values()];
  const pending = all
    .filter((r) => r.status === "pending")
    .map(structuredCloneSafe);
  const cancelled = all
    .filter((r) => r.status === "cancelled")
    .map(structuredCloneSafe);
  return [...pending, ...cancelled];
}

export function getRequest(id: string): LeaveRequestDto | undefined {
  const r = store.requests.get(id);
  return r ? structuredCloneSafe(r) : undefined;
}

/**
 * Find an existing active request for the employee whose dates overlap the given
 * range, regardless of location (you can't be on leave twice on the same day).
 * `excludeId` skips the request being edited (TRD §3.3 conflicting leaves).
 */
function findOverlappingRequest(
  employeeId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): LeaveRequestDto | undefined {
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (const r of store.requests.values()) {
    if (r.employeeId !== employeeId) continue;
    if (r.id === excludeId) continue;
    if (!OCCUPYING_STATUSES.has(r.status)) continue;
    if (rangesOverlap(start, end, new Date(r.startDate), new Date(r.endDate))) {
      return r;
    }
  }
  return undefined;
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

/**
 * Commit days to `used` on approval. Days are drawn from the request's existing
 * reservation (`pending`) first, then from `available` for any shortfall. The
 * caller guards `days <= available + pending`, so neither counter goes negative
 * — this keeps approval authoritative against the live balance even if a
 * request's reservation drifted (TRD §4.5 "balance at decision time").
 */
function commit(employeeId: string, locationId: string, days: number): void {
  const cell = ensureCell(employeeId, locationId);
  const fromPending = Math.min(Math.max(cell.pending, 0), days);
  cell.pending -= fromPending;
  cell.available -= days - fromPending;
  cell.used += days;
  cell.fetchedAt = new Date().toISOString();
}

/** Reverse a {@link commit}: an approved request is cancelled/edited (TRD §3.3). */
function unconsume(employeeId: string, locationId: string, days: number): void {
  const cell = ensureCell(employeeId, locationId);
  cell.used -= days;
  cell.available += days;
  cell.fetchedAt = new Date().toISOString();
}

/** Return a request's currently-reserved days to `available`, from the bucket
 *  that holds them: pending requests sit in `pending`, approved in `used`. */
function unreserveCurrent(req: LeaveRequestDto): void {
  if (req.status === "pending") {
    release(req.employeeId, req.locationId, req.days);
  } else if (req.status === "approved") {
    unconsume(req.employeeId, req.locationId, req.days);
  }
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
  | { kind: "overlap"; conflict: LeaveRequestDto }
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

  // Reject dates that overlap an existing active request (TRD §3.3).
  const overlap = findOverlappingRequest(
    employeeId,
    payload.startDate,
    payload.endDate,
  );
  if (overlap) {
    return { kind: "overlap", conflict: structuredCloneSafe(overlap) };
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
  | { kind: "overlap"; conflict: LeaveRequestDto }
  | { kind: "not-found" };

/** Update an existing request: edit dates (re-approval) or cancel (TRD §3.3, §6.1). */
export function patchRequest(
  id: string,
  payload: PatchRequestPayload,
  options: WriteOptions = {},
): PatchResult {
  const req = store.requests.get(id);
  if (!req) return { kind: "not-found" };

  // Cancellation path: return the reservation from its current bucket.
  if (payload.status === "cancelled") {
    unreserveCurrent(req);
    pushAudit(req, "Cancelled by employee", "cancelled");
    req.status = "cancelled";
    req.updatedAt = new Date().toISOString();
    return { kind: "updated", request: structuredCloneSafe(req) };
  }

  // Date-edit path → reset to pending (re-approval). Returning this request's
  // current reservation frees `req.days` back to available, so the ceiling for
  // the new request is `available + req.days`.
  const newDays = payload.days ?? req.days;

  // Reject edits whose new dates overlap a *different* active request (TRD §3.3).
  const editStart = payload.startDate ?? req.startDate;
  const editEnd = payload.endDate ?? req.endDate;
  const overlap = findOverlappingRequest(
    req.employeeId,
    editStart,
    editEnd,
    req.id,
  );
  if (overlap) {
    return { kind: "overlap", conflict: structuredCloneSafe(overlap) };
  }

  const cell = getBalanceCell(req.employeeId, req.locationId);
  const availableNow = cell.kind === "ok" ? cell.balance.available : 0;
  const availableIfReturned = availableNow + req.days;
  if (options.forceConflict || newDays > availableIfReturned) {
    return { kind: "conflict", available: availableIfReturned, requested: newDays };
  }

  if (shouldSilentlyFail(options)) {
    return { kind: "silent-failure", request: structuredCloneSafe(req) };
  }

  // Return the old reservation, then re-reserve the new amount as pending.
  unreserveCurrent(req);
  reserve(req.employeeId, req.locationId, newDays);
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
  const pending = cell.kind === "ok" ? cell.balance.pending : 0;

  // Authoritatively check the live balance at approval time (TRD §4.5). The
  // employee can only be granted what the cell can back right now: the request's
  // own reservation (`pending`) plus any remaining `available`. This prevents
  // approving more than the granted balance even when two requests are reviewed
  // concurrently — approving the first reduces the pool the second sees here.
  if (options.forceConflict || req.days > available + pending) {
    return { kind: "conflict", available, requested: req.days };
  }

  commit(req.employeeId, req.locationId, req.days);
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
