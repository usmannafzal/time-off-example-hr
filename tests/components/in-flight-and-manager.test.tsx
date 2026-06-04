import { describe, expect, it, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { server } from "@/mocks/node";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { ManagerRequestCard } from "@/components/manager/manager-request-card";
import { queryKeys } from "@/lib/queries/keys";
import { useTransitionStore } from "@/lib/store/transition-store";
import type { Balance, LeaveRequest } from "@/lib/domain/types";

const EMP = "emp_alice";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function balance(locationId: string, available: number): Balance {
  return {
    employeeId: EMP,
    locationId,
    locationName: locationId === "LOC-NYC" ? "New York" : locationId,
    available,
    used: 0,
    pending: 0,
    fetchedAt: new Date(),
    isStale: false,
  };
}

beforeEach(() => useTransitionStore.getState().reset());

describe("background refresh vs in-flight form (TRD §5.3, §8.2)", () => {
  it("does not reset the form mid-edit and surfaces a stale-balance warning", async () => {
    const queryClient = makeClient();
    queryClient.setQueryData(queryKeys.balances(EMP), [balance("LOC-NYC", 12)]);
    const Wrapper = wrapperFor(queryClient);

    render(
      <Wrapper>
        <NewRequestForm employeeId={EMP} />
      </Wrapper>,
    );

    const start = (await screen.findByLabelText("Start date")) as HTMLInputElement;
    const end = screen.getByLabelText("End date") as HTMLInputElement;
    fireEvent.change(start, { target: { value: "2025-09-01" } });
    fireEvent.change(end, { target: { value: "2025-09-03" } });
    expect(start.value).toBe("2025-09-01");

    // Simulate a background poll lowering the balance while the form is open.
    act(() => {
      queryClient.setQueryData(queryKeys.balances(EMP), [balance("LOC-NYC", 3)]);
    });

    // The form inputs must NOT reset (TRD §5.3 key behavior)...
    expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe(
      "2025-09-01",
    );
    expect((screen.getByLabelText("End date") as HTMLInputElement).value).toBe(
      "2025-09-03",
    );
    // ...and a stale-balance warning appears with the current balance.
    await waitFor(() =>
      expect(screen.getByText(/Current balance: 3 days/i)).toBeInTheDocument(),
    );
  });
});

function pendingRequest(): LeaveRequest {
  return {
    id: "req_pending_1",
    employeeId: EMP,
    locationId: "LOC-NYC",
    locationName: "New York",
    startDate: new Date("2025-09-10"),
    endDate: new Date("2025-09-12"),
    days: 3,
    status: "pending",
    submittedAt: new Date("2025-06-01"),
    updatedAt: new Date("2025-06-01"),
    auditTrail: [],
  };
}

describe("manager balance-at-decision-time (TRD §4.5, §8.2)", () => {
  it("Approve is disabled until a fresh balance is confirmed", async () => {
    const queryClient = makeClient();
    const Wrapper = wrapperFor(queryClient);

    render(
      <Wrapper>
        <ManagerRequestCard request={pendingRequest()} managerName="Dana" />
      </Wrapper>,
    );

    // Before review, only the Review button is shown — no Approve yet.
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    // Once the fresh cell read resolves, Approve becomes enabled.
    await waitFor(() => {
      const approve = screen.getByRole("button", { name: "Approve" });
      expect(approve).toBeEnabled();
    });
  });

  it("on a failed fresh fetch, Approve stays disabled until the warning is overridden", async () => {
    server.use(
      http.get("*/api/hcm/balance/:locationId", () =>
        HttpResponse.json({ code: "HCM_UNAVAILABLE" }, { status: 500 }),
      ),
    );
    const queryClient = makeClient();
    const Wrapper = wrapperFor(queryClient);

    render(
      <Wrapper>
        <ManagerRequestCard request={pendingRequest()} managerName="Dana" />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review" }));

    const override = await screen.findByLabelText("Override stale balance warning");
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();

    fireEvent.click(override);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled(),
    );
  });
});
