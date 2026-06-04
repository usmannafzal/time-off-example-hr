import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { within, expect, waitFor } from "@storybook/test";
import { BalanceSummaryPanel } from "@/components/balance/balance-summary-panel";
import { BalanceCard } from "@/components/balance/balance-card";
import { useToastStore } from "@/lib/store/toast-store";
import {
  EMP,
  healthyBalances,
  staleBalances,
  mswBalancesOk,
  mswBalancesLoading,
  mswBalancesError,
} from "./helpers";

const meta: Meta<typeof BalanceSummaryPanel> = {
  title: "Balance Display",
  component: BalanceSummaryPanel,
  args: { employeeId: EMP },
};
export default meta;

type Story = StoryObj<typeof BalanceSummaryPanel>;

export const Loading: Story = {
  parameters: { msw: { handlers: [mswBalancesLoading()] } },
};

export const Empty: Story = {
  parameters: { msw: { handlers: [mswBalancesOk([])] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/no location assignments/i)).toBeInTheDocument(),
    );
  },
};

export const Healthy: Story = {
  parameters: { msw: { handlers: [mswBalancesOk(healthyBalances)] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("New York")).toBeInTheDocument(),
    );
  },
};

export const Stale: Story = {
  parameters: { msw: { handlers: [mswBalancesOk(staleBalances)] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/may be out of date/i)).toBeInTheDocument(),
    );
  },
};

/** Background poll returned a higher balance → reconciliation toast visible. */
function RefreshedMidSession() {
  const push = useToastStore((s) => s.push);
  useEffect(() => {
    push(
      "success",
      "Your New York balance has been updated by HR (12 → 14 days).",
    );
  }, [push]);
  return <BalanceSummaryPanel employeeId={EMP} />;
}

export const BalanceRefreshedMidSession: Story = {
  parameters: {
    msw: {
      handlers: [
        mswBalancesOk([
          { ...healthyBalances[0], available: 14 },
          ...healthyBalances.slice(1),
        ]),
      ],
    },
  },
  render: () => <RefreshedMidSession />,
};

export const BatchFetchError: Story = {
  parameters: { msw: { handlers: [mswBalancesError()] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/couldn’t load your balances|couldn't load your balances/i)).toBeInTheDocument(),
    );
    expect(canvas.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  },
};

/** One location's real-time read failed; that cell errors, others are healthy. */
export const PartialLoadError: Story = {
  render: () => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <BalanceCard
        balance={{
          employeeId: EMP,
          locationId: "LOC-NYC",
          locationName: "New York",
          available: 12,
          used: 8,
          pending: 0,
          fetchedAt: new Date(),
          isStale: false,
        }}
      />
      <BalanceCard error locationName="London" />
      <BalanceCard
        balance={{
          employeeId: EMP,
          locationId: "LOC-SF",
          locationName: "San Francisco",
          available: 0,
          used: 15,
          pending: 0,
          fetchedAt: new Date(),
          isStale: false,
        }}
      />
    </div>
  ),
};
