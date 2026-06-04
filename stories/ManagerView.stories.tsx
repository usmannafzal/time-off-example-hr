import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, waitFor } from "@storybook/test";
import { PendingRequestQueue } from "@/components/manager/pending-request-queue";
import { ManagerRequestCard } from "@/components/manager/manager-request-card";
import {
  healthyBalances,
  domainRequest,
  mswRequestsOk,
  mswManagerQueueLoading,
  mswCellOk,
  mswCellLoading,
  mswCellError,
  mswApprove,
  mswDeny,
} from "./helpers";

const meta: Meta = {
  title: "Manager View",
  parameters: { role: "manager" },
};
export default meta;
type Story = StoryObj;

const pending = domainRequest("pending", { id: "req_1" });

export const QueueEmpty: Story = {
  parameters: { role: "manager", msw: { handlers: [mswRequestsOk([])] } },
  render: () => <PendingRequestQueue managerName="Dana Manager" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/all caught up/i)).toBeInTheDocument(),
    );
  },
};

export const QueueLoading: Story = {
  parameters: { role: "manager", msw: { handlers: [mswManagerQueueLoading()] } },
  render: () => <PendingRequestQueue managerName="Dana Manager" />,
};

export const RequestDetailBalanceLoading: Story = {
  parameters: { role: "manager", msw: { handlers: [mswCellLoading()] } },
  render: () => (
    <ManagerRequestCard request={pending} managerName="Dana Manager" defaultOpen />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/fetching current balance/i)).toBeInTheDocument(),
    );
    expect(canvas.getByRole("button", { name: "Approve" })).toBeDisabled();
  },
};

export const RequestDetailBalanceHealthy: Story = {
  parameters: { role: "manager", msw: { handlers: [mswCellOk(healthyBalances)] } },
  render: () => (
    <ManagerRequestCard request={pending} managerName="Dana Manager" defaultOpen />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/just fetched/i)).toBeInTheDocument(),
    );
    expect(canvas.getByRole("button", { name: "Approve" })).toBeEnabled();
  },
};

export const RequestDetailBalanceStaleOverride: Story = {
  parameters: { role: "manager", msw: { handlers: [mswCellError()] } },
  render: () => (
    <ManagerRequestCard request={pending} managerName="Dana Manager" defaultOpen />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const override = await canvas.findByLabelText(
      "Override stale balance warning",
    );
    expect(canvas.getByRole("button", { name: "Approve" })).toBeDisabled();
    await userEvent.click(override);
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Approve" })).toBeEnabled(),
    );
  },
};

export const RequestDetailApproveOptimistic: Story = {
  parameters: {
    role: "manager",
    msw: { handlers: [mswCellOk(healthyBalances), mswApprove("success")] },
  },
  render: () => (
    <ManagerRequestCard request={pending} managerName="Dana Manager" defaultOpen />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approve = await waitFor(() => {
      const btn = canvas.getByRole("button", { name: "Approve" });
      expect(btn).toBeEnabled();
      return btn;
    });
    await userEvent.click(approve);
  },
};

export const RequestDetailApproveConflict: Story = {
  parameters: {
    role: "manager",
    msw: { handlers: [mswCellOk(healthyBalances), mswApprove("conflict")] },
  },
  render: () => (
    <ManagerRequestCard request={pending} managerName="Dana Manager" defaultOpen />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const approve = await waitFor(() => {
      const btn = canvas.getByRole("button", { name: "Approve" });
      expect(btn).toBeEnabled();
      return btn;
    });
    await userEvent.click(approve);
    await waitFor(() =>
      expect(canvas.getByText(/balance changed since you opened/i)).toBeInTheDocument(),
    );
  },
};

export const RequestDetailDeny: Story = {
  parameters: {
    role: "manager",
    msw: { handlers: [mswCellOk(healthyBalances), mswDeny()] },
  },
  render: () => (
    <ManagerRequestCard request={pending} managerName="Dana Manager" defaultOpen />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Deny" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Denial reason")).toBeInTheDocument(),
    );
  },
};
