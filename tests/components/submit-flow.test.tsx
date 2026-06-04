import { describe, expect, it, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { server } from "@/mocks/node";
import { useSubmitRequest, verifyEntry } from "@/lib/mutations/use-submit-request";
import { fetchBalances } from "@/lib/api/client";
import { queryKeys } from "@/lib/queries/keys";
import { useTransitionStore } from "@/lib/store/transition-store";
import { HcmError } from "@/lib/api/client";

const EMP = "emp_alice";

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

async function primeBalances(queryClient: QueryClient) {
  const balances = await fetchBalances(EMP);
  queryClient.setQueryData(queryKeys.balances(EMP), balances);
}

beforeEach(() => {
  useTransitionStore.getState().reset();
});

describe("submit-request optimistic flow (TRD §4.3, §4.4)", () => {
  it("happy path: optimistic-pending → real id swap → verified → overlay cleared", async () => {
    const { queryClient, wrapper } = setup();
    await primeBalances(queryClient);

    const { result } = renderHook(() => useSubmitRequest(), { wrapper });

    let serverId = "";
    await act(async () => {
      const server = await result.current.mutateAsync({
        employeeId: EMP,
        locationId: "LOC-NYC",
        locationName: "New York",
        startDate: new Date("2025-08-01"),
        endDate: new Date("2025-08-02"), // 2 days
      });
      serverId = server.id;
      expect(server.status).toBe("pending");
    });

    // After POST success the temp id is gone; a real-id entry is verifying.
    const afterSwap = useTransitionStore.getState();
    expect(serverId).toMatch(/^req_/);
    expect(afterSwap.entries[serverId]?.phase).toBe("verifying");
    expect(Object.keys(afterSwap.entries).some((k) => k.startsWith("temp_"))).toBe(false);

    // Run verification: NYC reserved 2 of 12 → cell shows 10 === expected.
    await act(async () => {
      const outcome = await verifyEntry(queryClient, serverId);
      expect(outcome).toBe("confirmed");
    });

    // Overlay and delta cleared; server is now the source of truth.
    const done = useTransitionStore.getState();
    expect(done.entries[serverId]).toBeUndefined();
    expect(done.deltas[`${EMP}:LOC-NYC`]).toBeUndefined();
  });

  it("silent failure: 200 OK but balance unchanged → rolled back, balance restored", async () => {
    const { queryClient, wrapper } = setup();
    await primeBalances(queryClient);

    // Override POST to look successful WITHOUT persisting/reserving (TRD §6.2).
    server.use(
      http.post("*/api/hcm/requests", () =>
        HttpResponse.json(
          {
            id: "req_silent_1",
            employeeId: EMP,
            locationId: "LOC-NYC",
            locationName: "New York",
            startDate: "2025-08-01",
            endDate: "2025-08-02",
            days: 2,
            status: "pending",
            submittedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            auditTrail: [],
          },
          { status: 200 },
        ),
      ),
    );

    const { result } = renderHook(() => useSubmitRequest(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        employeeId: EMP,
        locationId: "LOC-NYC",
        locationName: "New York",
        startDate: new Date("2025-08-01"),
        endDate: new Date("2025-08-02"),
      });
    });

    await act(async () => {
      const outcome = await verifyEntry(queryClient, "req_silent_1");
      expect(outcome).toBe("rolled-back");
    });

    const state = useTransitionStore.getState();
    expect(state.entries["req_silent_1"].phase).toBe("rolled-back");
    expect(state.entries["req_silent_1"].request.status).toBe("optimistic-rolled-back");
    // Balance delta cleared → optimistic decrement restored (TRD §4.3).
    expect(state.deltas[`${EMP}:LOC-NYC`]).toBeUndefined();
  });

  it("explicit 409 conflict: card removed, balance restored, error surfaced", async () => {
    const { queryClient, wrapper } = setup();
    await primeBalances(queryClient);

    const { result } = renderHook(() => useSubmitRequest(), { wrapper });

    let caught: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({
          employeeId: EMP,
          locationId: "LOC-SF", // available 0
          locationName: "San Francisco",
          startDate: new Date("2025-08-01"),
          endDate: new Date("2025-08-01"), // 1 day
        });
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(HcmError);
    expect((caught as HcmError).status).toBe(409);

    const state = useTransitionStore.getState();
    expect(Object.keys(state.entries)).toHaveLength(0);
    expect(state.deltas[`${EMP}:LOC-SF`]).toBeUndefined();
  });
});
