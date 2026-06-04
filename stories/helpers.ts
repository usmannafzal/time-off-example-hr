/**
 * Shared Storybook helpers: sample DTOs and per-story MSW handler builders.
 * Each story pins HCM behavior via these handlers (TRD §7).
 */

import { http, HttpResponse, delay } from "msw";
import type { BalanceDto, LeaveRequestDto } from "@/lib/hcm/contracts";
import type { LeaveRequest, LeaveRequestStatus } from "@/lib/domain/types";

export const EMP = "emp_alice";

/** Build a domain LeaveRequest (Date-based) for stories that render cards directly. */
export function domainRequest(
  status: LeaveRequestStatus,
  overrides: Partial<LeaveRequest> = {},
): LeaveRequest {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const futureEnd = new Date(Date.now() + 32 * 24 * 60 * 60 * 1000);
  return {
    id: status === "optimistic-pending" ? "" : "req_1",
    tempId: status === "optimistic-pending" ? "temp_req_1" : undefined,
    employeeId: EMP,
    locationId: "LOC-NYC",
    locationName: "New York",
    startDate: future,
    endDate: futureEnd,
    days: 3,
    status,
    submittedAt: new Date(),
    updatedAt: new Date(),
    auditTrail: [],
    ...overrides,
  };
}

export function balanceDto(
  locationId: string,
  locationName: string,
  available: number,
  opts?: { used?: number; pending?: number; fetchedAt?: Date },
): BalanceDto {
  return {
    employeeId: EMP,
    locationId,
    locationName,
    available,
    used: opts?.used ?? 0,
    pending: opts?.pending ?? 0,
    fetchedAt: (opts?.fetchedAt ?? new Date()).toISOString(),
  };
}

export const healthyBalances: BalanceDto[] = [
  balanceDto("LOC-NYC", "New York", 12, { used: 8 }),
  balanceDto("LOC-LON", "London", 5, { used: 20 }),
  balanceDto("LOC-SF", "San Francisco", 0, { used: 15 }),
];

const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
export const staleBalances: BalanceDto[] = healthyBalances.map((b) => ({
  ...b,
  fetchedAt: tenMinutesAgo.toISOString(),
}));

export function leaveRequestDto(
  partial: Partial<LeaveRequestDto> & Pick<LeaveRequestDto, "id" | "status">,
): LeaveRequestDto {
  return {
    employeeId: EMP,
    locationId: "LOC-NYC",
    locationName: "New York",
    startDate: "2025-09-10",
    endDate: "2025-09-12",
    days: 3,
    submittedAt: "2025-06-01T09:00:00.000Z",
    updatedAt: "2025-06-01T09:00:00.000Z",
    auditTrail: [],
    ...partial,
  };
}

/* -------------------------- handler builders -------------------------- */

export const mswBalancesOk = (balances: BalanceDto[]) =>
  http.get("*/api/hcm/balances", () =>
    HttpResponse.json({ employeeId: EMP, balances }),
  );

export const mswBalancesLoading = () =>
  http.get("*/api/hcm/balances", async () => {
    await delay("infinite");
    return HttpResponse.json({ employeeId: EMP, balances: [] });
  });

export const mswBalancesError = () =>
  http.get("*/api/hcm/balances", () =>
    HttpResponse.json({ code: "HCM_UNAVAILABLE" }, { status: 500 }),
  );

export const mswCellOk = (balances: BalanceDto[]) =>
  http.get("*/api/hcm/balance/:locationId", ({ params }) => {
    const found = balances.find((b) => b.locationId === params.locationId);
    return found
      ? HttpResponse.json({ ...found, fetchedAt: new Date().toISOString() })
      : HttpResponse.json({ code: "INVALID_DIMENSION" }, { status: 422 });
  });

export const mswCellLoading = () =>
  http.get("*/api/hcm/balance/:locationId", async () => {
    await delay("infinite");
    return HttpResponse.json({});
  });

export const mswCellError = () =>
  http.get("*/api/hcm/balance/:locationId", () =>
    HttpResponse.json({ code: "HCM_UNAVAILABLE" }, { status: 500 }),
  );

export const mswRequestsOk = (requests: LeaveRequestDto[]) =>
  http.get("*/api/hcm/requests", ({ request }) => {
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope === "pending") {
      return HttpResponse.json({
        scope: "pending",
        requests: requests.filter((r) => r.status === "pending"),
      });
    }
    return HttpResponse.json({ employeeId: EMP, requests });
  });

export const mswManagerQueueLoading = () =>
  http.get("*/api/hcm/requests", async ({ request }) => {
    const scope = new URL(request.url).searchParams.get("scope");
    if (scope === "pending") {
      await delay("infinite");
    }
    return HttpResponse.json({ employeeId: EMP, requests: [] });
  });

export type CreateBehavior = "success" | "conflict" | "dimension" | "silent";

export const mswCreate = (behavior: CreateBehavior) =>
  http.post("*/api/hcm/requests", async ({ request }) => {
    const body = (await request.json()) as { days?: number };
    if (behavior === "conflict") {
      return HttpResponse.json(
        { code: "INSUFFICIENT_BALANCE", available: 0, requested: body.days ?? 1 },
        { status: 409 },
      );
    }
    if (behavior === "dimension") {
      return HttpResponse.json(
        { code: "INVALID_DIMENSION", employeeId: EMP, locationId: "LOC-NYC" },
        { status: 422 },
      );
    }
    const dto = leaveRequestDto({
      id: `req_${Date.now()}`,
      status: "pending",
      days: body.days ?? 2,
    });
    // "silent" returns 200 (looks successful); "success" returns 201.
    return HttpResponse.json(dto, { status: behavior === "silent" ? 200 : 201 });
  });

export const mswApprove = (behavior: "success" | "conflict") =>
  http.post("*/api/hcm/requests/:id/approve", async () => {
    if (behavior === "conflict") {
      return HttpResponse.json(
        { code: "INSUFFICIENT_BALANCE", available: 0, requested: 3 },
        { status: 409 },
      );
    }
    return HttpResponse.json(
      leaveRequestDto({ id: "req_1", status: "approved", approvedBy: "Dana Manager" }),
    );
  });

export const mswDeny = () =>
  http.post("*/api/hcm/requests/:id/deny", async ({ request }) => {
    const body = (await request.json()) as { reason?: string };
    return HttpResponse.json(
      leaveRequestDto({
        id: "req_1",
        status: "denied",
        deniedReason: body.reason ?? "Denied",
      }),
    );
  });
