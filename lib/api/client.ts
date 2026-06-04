/**
 * Typed client for the (mock) HCM API.
 *
 * Each call validates the response against the Zod contracts (TRD §6.1) and
 * maps DTOs to domain models. Failures throw {@link HcmError}, carrying the
 * parsed error body so mutations can surface specific messages (409
 * INSUFFICIENT_BALANCE, 422 INVALID_DIMENSION) inline (TRD §4.4).
 *
 * The auth token is assumed to be handled upstream; we pass the employee id as
 * a header on every call (TRD §11.1).
 */

import {
  balanceDtoSchema,
  balancesResponseSchema,
  leaveRequestDtoSchema,
  requestsResponseSchema,
  type ApproveRequestPayload,
  type CreateRequestPayload,
  type DenyRequestPayload,
  type HcmErrorBody,
  type PatchRequestPayload,
} from "@/lib/hcm/contracts";
import { toBalance, toLeaveRequest } from "@/lib/hcm/serialization";
import type { Balance, LeaveRequest } from "@/lib/domain/types";
import { isTempId } from "@/lib/domain/ids";

const BASE = "/api/hcm";

export class HcmError extends Error {
  constructor(
    readonly status: number,
    readonly body: HcmErrorBody | null,
  ) {
    super(`HCM request failed (${status})`);
    this.name = "HcmError";
  }
}

function headers(employeeId?: string): HeadersInit {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (employeeId) h["x-employee-id"] = employeeId;
  return h;
}

async function parseError(res: Response): Promise<never> {
  let body: HcmErrorBody | null = null;
  try {
    body = (await res.json()) as HcmErrorBody;
  } catch {
    body = null;
  }
  throw new HcmError(res.status, body);
}

/* ------------------------------- reads ------------------------------- */

export async function fetchBalances(employeeId: string): Promise<Balance[]> {
  const res = await fetch(`${BASE}/balances`, { headers: headers(employeeId) });
  if (!res.ok) return parseError(res);
  const data = balancesResponseSchema.parse(await res.json());
  const now = Date.now();
  return data.balances.map((b) => toBalance(b, now));
}

export async function fetchBalanceCell(
  employeeId: string,
  locationId: string,
): Promise<Balance> {
  const res = await fetch(`${BASE}/balance/${encodeURIComponent(locationId)}`, {
    headers: headers(employeeId),
    // The manager decision view must bypass any cache (TRD §4.5).
    cache: "no-store",
  });
  if (!res.ok) return parseError(res);
  const dto = balanceDtoSchema.parse(await res.json());
  return toBalance(dto);
}

export async function fetchRequests(employeeId: string): Promise<LeaveRequest[]> {
  const res = await fetch(`${BASE}/requests`, { headers: headers(employeeId) });
  if (!res.ok) return parseError(res);
  const data = requestsResponseSchema.parse(await res.json());
  return data.requests.map(toLeaveRequest);
}

export async function fetchPendingRequests(): Promise<LeaveRequest[]> {
  const res = await fetch(`${BASE}/requests?scope=pending`, {
    headers: headers(),
  });
  if (!res.ok) return parseError(res);
  const json = (await res.json()) as { requests: unknown[] };
  return json.requests
    .map((r) => leaveRequestDtoSchema.parse(r))
    .map(toLeaveRequest);
}

export async function fetchRequest(id: string): Promise<LeaveRequest> {
  const res = await fetch(`${BASE}/requests/${encodeURIComponent(id)}`, {
    headers: headers(),
  });
  if (!res.ok) return parseError(res);
  return toLeaveRequest(leaveRequestDtoSchema.parse(await res.json()));
}

/* ------------------------------- writes ------------------------------ */

export async function createRequest(
  payload: CreateRequestPayload,
): Promise<LeaveRequest> {
  const res = await fetch(`${BASE}/requests`, {
    method: "POST",
    headers: headers(payload.employeeId),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseError(res);
  return toLeaveRequest(leaveRequestDtoSchema.parse(await res.json()));
}

export async function patchRequest(
  id: string,
  payload: PatchRequestPayload,
  employeeId?: string,
): Promise<LeaveRequest> {
  if (isTempId(id)) {
    // Guard: a temp id must never reach the API (TRD §4.4, Appendix A).
    throw new Error("Refusing to send a temporary id to the HCM API");
  }
  const res = await fetch(`${BASE}/requests/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(employeeId),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseError(res);
  return toLeaveRequest(leaveRequestDtoSchema.parse(await res.json()));
}

export async function approveRequest(
  id: string,
  payload: ApproveRequestPayload,
): Promise<LeaveRequest> {
  if (isTempId(id)) throw new Error("Cannot approve a temporary id");
  const res = await fetch(`${BASE}/requests/${encodeURIComponent(id)}/approve`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseError(res);
  return toLeaveRequest(leaveRequestDtoSchema.parse(await res.json()));
}

export async function denyRequest(
  id: string,
  payload: DenyRequestPayload,
): Promise<LeaveRequest> {
  if (isTempId(id)) throw new Error("Cannot deny a temporary id");
  const res = await fetch(`${BASE}/requests/${encodeURIComponent(id)}/deny`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseError(res);
  return toLeaveRequest(leaveRequestDtoSchema.parse(await res.json()));
}

export async function triggerAnniversary(
  employeeId: string,
  locationId: string,
  days?: number,
): Promise<Balance> {
  const res = await fetch(`${BASE}/admin/anniversary`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ employeeId, locationId, days }),
  });
  if (!res.ok) return parseError(res);
  return toBalance(balanceDtoSchema.parse(await res.json()));
}
