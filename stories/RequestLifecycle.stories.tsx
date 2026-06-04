import type { Meta, StoryObj } from "@storybook/react";
import { within, expect } from "@storybook/test";
import { RequestCard } from "@/components/requests/request-card";
import { domainRequest } from "./helpers";

const past = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
const pastEnd = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000);

const meta: Meta<typeof RequestCard> = {
  title: "Request Lifecycle",
  component: RequestCard,
};
export default meta;
type Story = StoryObj<typeof RequestCard>;

export const RequestPending: Story = {
  args: { request: domainRequest("pending") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole("button", { name: /edit dates/i })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  },
};

export const RequestApprovedFuture: Story = {
  args: {
    request: domainRequest("approved", { approvedBy: "Dana Manager" }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/approved by dana manager/i)).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: /edit dates/i })).toBeInTheDocument();
  },
};

export const RequestApprovedPast: Story = {
  args: {
    request: domainRequest("approved", {
      approvedBy: "Dana Manager",
      startDate: past,
      endDate: pastEnd,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Locked: no action buttons (TRD §3.3 approved + past start = view only).
    expect(canvas.queryByRole("button", { name: /edit dates/i })).toBeNull();
    expect(canvas.queryByRole("button", { name: /^cancel$/i })).toBeNull();
  },
};

export const RequestDenied: Story = {
  args: {
    request: domainRequest("denied", {
      deniedReason: "Insufficient coverage during release week.",
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/insufficient coverage/i)).toBeInTheDocument();
    expect(
      canvas.getByRole("button", { name: /create new request/i }),
    ).toBeInTheDocument();
  },
};

export const RequestCancelled: Story = {
  args: { request: domainRequest("cancelled") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/cancelled/i)).toBeInTheDocument();
  },
};

export const RequestRolledBack: Story = {
  args: { request: domainRequest("optimistic-rolled-back") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(canvas.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  },
};

/** After editing an approved-future request, status is reset to pending. */
export const RequestEditedReApproval: Story = {
  args: {
    request: domainRequest("pending", {
      auditTrail: [
        {
          id: "ae_edit",
          at: new Date(),
          message: "Dates edited — re-approval required",
          fromStatus: "approved",
          toStatus: "pending",
        },
      ],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The approval badge is gone; it is back to Pending Approval.
    expect(canvas.getByText(/pending approval/i)).toBeInTheDocument();
    expect(canvas.queryByText(/approved by/i)).toBeNull();
  },
};
