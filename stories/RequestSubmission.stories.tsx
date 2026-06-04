import type { Meta, StoryObj } from "@storybook/react";
import { within, fireEvent, userEvent, expect, waitFor } from "@storybook/test";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { RequestCard } from "@/components/requests/request-card";
import { StaleBalanceWarning } from "@/components/requests/stale-balance-warning";
import {
  EMP,
  healthyBalances,
  mswBalancesOk,
  mswCreate,
  domainRequest,
} from "./helpers";

const meta: Meta = { title: "Request Submission" };
export default meta;
type Story = StoryObj;

const balancesHealthy = { msw: { handlers: [mswBalancesOk(healthyBalances)] } };

export const FormIdle: Story = {
  parameters: balancesHealthy,
  render: () => <NewRequestForm employeeId={EMP} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: /submit request/i })).toBeDisabled(),
    );
  },
};

export const FormFilling: Story = {
  parameters: balancesHealthy,
  render: () => <NewRequestForm employeeId={EMP} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = await canvas.findByLabelText("Start date");
    const end = canvas.getByLabelText("End date");
    fireEvent.change(start, { target: { value: "2025-09-01" } });
    fireEvent.change(end, { target: { value: "2025-09-03" } });
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: /submit request/i })).toBeEnabled(),
    );
  },
};

export const OptimisticPending: Story = {
  render: () => <RequestCard request={domainRequest("optimistic-pending")} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/awaiting confirmation/i)).toBeInTheDocument();
  },
};

export const OptimisticConfirmedPending: Story = {
  render: () => <RequestCard request={domainRequest("pending")} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/pending approval/i)).toBeInTheDocument();
  },
};

export const OptimisticRolledBack: Story = {
  render: () => <RequestCard request={domainRequest("optimistic-rolled-back")} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByText(/your request may not have been saved/i),
    ).toBeInTheDocument();
  },
};

export const HcmRejectedInsufficient: Story = {
  parameters: { msw: { handlers: [mswBalancesOk(healthyBalances), mswCreate("conflict")] } },
  render: () => <NewRequestForm employeeId={EMP} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = await canvas.findByLabelText("Start date");
    const end = canvas.getByLabelText("End date");
    fireEvent.change(start, { target: { value: "2025-09-01" } });
    fireEvent.change(end, { target: { value: "2025-09-03" } });
    const submitBtn = canvas.getByRole("button", { name: /submit request/i });
    // The button enables a render tick after the dates change; clicking a
    // still-disabled button silently no-ops, so wait for it first.
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await userEvent.click(submitBtn);
    await waitFor(() =>
      expect(canvas.getByText(/insufficient balance/i)).toBeInTheDocument(),
    );
  },
};

export const HcmRejectedInvalidDimension: Story = {
  parameters: { msw: { handlers: [mswBalancesOk(healthyBalances), mswCreate("dimension")] } },
  render: () => <NewRequestForm employeeId={EMP} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const start = await canvas.findByLabelText("Start date");
    const end = canvas.getByLabelText("End date");
    fireEvent.change(start, { target: { value: "2025-09-01" } });
    fireEvent.change(end, { target: { value: "2025-09-03" } });
    const submitBtn = canvas.getByRole("button", { name: /submit request/i });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    await userEvent.click(submitBtn);
    await waitFor(() =>
      expect(canvas.getByText(/isn’t valid for your account|isn't valid for your account/i)).toBeInTheDocument(),
    );
  },
};

export const StaleBalanceWarningMidForm: Story = {
  render: () => (
    <div className="max-w-md">
      <StaleBalanceWarning snapshotAvailable={10} liveAvailable={5} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByText(/available balance may have changed/i),
    ).toBeInTheDocument();
    expect(canvas.getByText(/current balance: 5 days/i)).toBeInTheDocument();
  },
};

export const AnniversaryBonusMidForm: Story = {
  render: () => (
    <div className="max-w-md">
      <StaleBalanceWarning snapshotAvailable={10} liveAvailable={14} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(
      canvas.getByText(/balance increased to 14 days/i),
    ).toBeInTheDocument();
  },
};
