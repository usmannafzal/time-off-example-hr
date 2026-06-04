/**
 * HTTP adapter over the in-memory store (TRD §6.1, §6.2).
 *
 * Every function takes a Web `Request` and returns a Web `Response`, so the
 * exact same code backs both the MSW handlers (browser + node) and the Next.js
 * route handlers. This guarantees identical behavior across Storybook, Vitest
 * and the running app.
 *
 * Per-request controls (query params), used by stories and tests to pin a
 * deterministic outcome (TRD §6.2):
 *   ?delay=<ms>            override simulated latency (loading-state stories)
 *   ?force=silent          force a silent failure (200 OK, not persisted)
 *   ?force=conflict        force a 409 conflict
 *   ?force=dimension       force a 422 invalid dimension
 *   ?force=server-error    force a 500 (batch-fetch-error / partial-load-error)
 *   ?employeeId=<id>       override the authenticated employee (default header)
 */

import {
  approveRequestSchema,
  createRequestSchema,
  denyRequestSchema,
  patchRequestSchema,
  anniversarySchema,
} from "@/lib/hcm/contracts";
import {
  DEFAULT_EMPLOYEE_ID,
  approveRequest,
  createRequest,
  denyRequest,
  getBalanceCell,
  getRequest,
  listBalances,
  listManagerQueue,
  listRequests,
  patchRequest,
  applyAnniversaryBonus,
  resetStore,
  type WriteOptions,
} from "./store";

/* ----------------------------- latency ------------------------------- */

const LATENCY = {
  batch: [400, 800] as const, // expensive batch endpoint (TRD §6.1)
  cell: [50, 150] as const, // fast real-time cell (TRD §6.1)
};

function randomInRange([min, max]: readonly [number, number]): number {
  return min + Math.random() * (max - min);
}

async function delay(profile: keyof typeof LATENCY, url: URL): Promise<void> {
  // Latency is disabled under Vitest so component tests stay fast/deterministic.
  if (process.env.VITEST) return;
  const override = url.searchParams.get("delay");
  const ms =
    override !== null ? Number(override) : randomInRange(LATENCY[profile]);
  if (Number.isFinite(ms) && ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/* ------------------------- request parsing --------------------------- */

function employeeIdFrom(request: Request, url: URL): string {
  // Assumption (TRD §11.1): auth handled upstream; the employee is identified
  // by a header. A query override exists purely for Storybook convenience.
  return (
    url.searchParams.get("employeeId") ||
    request.headers.get("x-employee-id") ||
    DEFAULT_EMPLOYEE_ID
  );
}

function writeOptionsFrom(url: URL): WriteOptions {
  const force = url.searchParams.get("force");
  return {
    forceSilentFailure: force === "silent",
    forceConflict: force === "conflict",
    forceInvalidDimension: force === "dimension",
  };
}

function isServerErrorForced(url: URL): boolean {
  return url.searchParams.get("force") === "server-error";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/* ------------------------------ reads -------------------------------- */

export async function handleGetBalances(request: Request): Promise<Response> {
  const url = new URL(request.url);
  await delay("batch", url);
  if (isServerErrorForced(url)) {
    return json({ code: "HCM_UNAVAILABLE", message: "Batch endpoint failed" }, 500);
  }
  const employeeId = employeeIdFrom(request, url);
  return json({ employeeId, balances: listBalances(employeeId) });
}

export async function handleGetBalanceCell(
  request: Request,
  locationId: string,
): Promise<Response> {
  const url = new URL(request.url);
  await delay("cell", url);
  if (isServerErrorForced(url)) {
    return json({ code: "HCM_UNAVAILABLE", message: "Cell read failed" }, 500);
  }
  const employeeId = employeeIdFrom(request, url);
  const result = getBalanceCell(employeeId, locationId);
  if (result.kind === "invalid-dimension") {
    return json({ code: "INVALID_DIMENSION", employeeId, locationId }, 422);
  }
  return json(result.balance);
}

export async function handleGetRequests(request: Request): Promise<Response> {
  const url = new URL(request.url);
  await delay("cell", url);
  // Manager queue: ?scope=pending returns the manager queue across employees —
  // actionable pending requests followed by view-only cancelled ones (TRD §4.5).
  // Otherwise the authenticated employee's requests.
  if (url.searchParams.get("scope") === "pending") {
    return json({ scope: "pending", requests: listManagerQueue() });
  }
  const employeeId = employeeIdFrom(request, url);
  return json({ employeeId, requests: listRequests(employeeId) });
}

export async function handleGetRequest(
  request: Request,
  id: string,
): Promise<Response> {
  const url = new URL(request.url);
  await delay("cell", url);
  const found = getRequest(id);
  if (!found) return json({ code: "NOT_FOUND", message: "Request not found" }, 404);
  return json(found);
}

/* ------------------------------ writes ------------------------------- */

export async function handleCreateRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  await delay("cell", url);
  const raw = await request.json().catch(() => null);
  const parsed = createRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ code: "BAD_REQUEST", message: parsed.error.message }, 400);
  }

  const result = createRequest(parsed.data, writeOptionsFrom(url));
  switch (result.kind) {
    case "invalid-dimension":
      return json(
        {
          code: "INVALID_DIMENSION",
          employeeId: parsed.data.employeeId,
          locationId: parsed.data.locationId,
        },
        422,
      );
    case "conflict":
      return json(
        {
          code: "INSUFFICIENT_BALANCE",
          available: result.available,
          requested: result.requested,
        },
        409,
      );
    case "overlap":
      return json(
        {
          code: "OVERLAPPING_LEAVE",
          conflictStart: result.conflict.startDate,
          conflictEnd: result.conflict.endDate,
          conflictStatus: result.conflict.status,
        },
        409,
      );
    case "silent-failure":
      // 200 OK that looks successful; nothing persisted (TRD §6.2).
      return json(result.request, 200);
    case "created":
      return json(result.request, 201);
  }
}

export async function handlePatchRequest(
  request: Request,
  id: string,
): Promise<Response> {
  const url = new URL(request.url);
  await delay("cell", url);
  const raw = await request.json().catch(() => null);
  const parsed = patchRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ code: "BAD_REQUEST", message: parsed.error.message }, 400);
  }

  const result = patchRequest(id, parsed.data, writeOptionsFrom(url));
  switch (result.kind) {
    case "not-found":
      return json({ code: "NOT_FOUND", message: "Request not found" }, 404);
    case "conflict":
      return json(
        {
          code: "INSUFFICIENT_BALANCE",
          available: result.available,
          requested: result.requested,
        },
        409,
      );
    case "overlap":
      return json(
        {
          code: "OVERLAPPING_LEAVE",
          conflictStart: result.conflict.startDate,
          conflictEnd: result.conflict.endDate,
          conflictStatus: result.conflict.status,
        },
        409,
      );
    case "silent-failure":
      return json(result.request, 200);
    case "updated":
      return json(result.request, 200);
  }
}

export async function handleApproveRequest(
  request: Request,
  id: string,
): Promise<Response> {
  const url = new URL(request.url);
  await delay("cell", url);
  const raw = await request.json().catch(() => ({}));
  const parsed = approveRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ code: "BAD_REQUEST", message: parsed.error.message }, 400);
  }
  const result = approveRequest(id, parsed.data.by, writeOptionsFrom(url));
  switch (result.kind) {
    case "not-found":
      return json({ code: "NOT_FOUND", message: "Request not found" }, 404);
    case "conflict":
      return json(
        {
          code: "INSUFFICIENT_BALANCE",
          available: result.available,
          requested: result.requested,
        },
        409,
      );
    case "approved":
      return json(result.request, 200);
  }
}

export async function handleDenyRequest(
  request: Request,
  id: string,
): Promise<Response> {
  const url = new URL(request.url);
  await delay("cell", url);
  const raw = await request.json().catch(() => null);
  const parsed = denyRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ code: "BAD_REQUEST", message: parsed.error.message }, 400);
  }
  const result = denyRequest(id, parsed.data);
  if (result.kind === "not-found") {
    return json({ code: "NOT_FOUND", message: "Request not found" }, 404);
  }
  return json(result.request, 200);
}

/**
 * Test-only: reset the in-memory store to its seeded snapshot (TRD §6.3). This
 * gives integration tests deterministic isolation against a long-lived dev
 * server. Disabled in production so it can never wipe real-looking state.
 */
export async function handleReset(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return json({ code: "FORBIDDEN", message: "Reset is not available" }, 403);
  }
  resetStore();
  return json({ ok: true }, 200);
}

export async function handleAnniversary(request: Request): Promise<Response> {
  const raw = await request.json().catch(() => null);
  const parsed = anniversarySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ code: "BAD_REQUEST", message: parsed.error.message }, 400);
  }
  const result = applyAnniversaryBonus(
    parsed.data.employeeId,
    parsed.data.locationId,
    parsed.data.days,
  );
  if (result.kind === "invalid-dimension") {
    return json(
      {
        code: "INVALID_DIMENSION",
        employeeId: parsed.data.employeeId,
        locationId: parsed.data.locationId,
      },
      422,
    );
  }
  return json(result.balance, 200);
}
