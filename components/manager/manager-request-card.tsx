"use client";

import { useState } from "react";
import type { LeaveRequest } from "@/lib/domain/types";
import { useBalanceCell } from "@/lib/queries/balances";
import {
  useApproveRequest,
  useDenyRequest,
} from "@/lib/mutations/use-request-actions";
import { HcmError } from "@/lib/api/client";
import {
  Badge,
  Button,
  Card,
  Notice,
  formatDate,
} from "@/components/ui/primitives";
import { FreshBalanceDisplay } from "./fresh-balance-display";
import { ApprovalControls } from "./approval-controls";
import { StaleBalanceOverrideWarning } from "./stale-balance-override-warning";

/**
 * Manager queue card (TRD §5.4, §4.5). Opening "Review" triggers a fresh
 * real-time balance fetch (cache bypassed). Approve is gated on a confirmed
 * fresh balance, or an explicit override if the fetch failed. Approval/denial
 * go through the optimistic→verified mutation flow; a 409 on approve returns
 * the request to pending and surfaces a conflict.
 */
export function ManagerRequestCard({
  request,
  managerName,
  defaultOpen = false,
}: {
  request: LeaveRequest;
  managerName: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [overridden, setOverridden] = useState(false);

  const cell = useBalanceCell(request.employeeId, request.locationId, {
    enabled: open,
  });
  const approve = useApproveRequest();
  const deny = useDenyRequest();

  const freshConfirmed = open && cell.isSuccess && !!cell.data;
  const fetchFailed = open && cell.isError;
  const canApprove = freshConfirmed || (fetchFailed && overridden);
  const busy = approve.isPending || deny.isPending;

  const conflict =
    approve.error instanceof HcmError && approve.error.status === 409;

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {request.employeeId} · {request.locationName}
          </h3>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
            {formatDate(request.startDate)} – {formatDate(request.endDate)}
            <span className="ml-2 text-xs text-slate-400">
              {request.days} {request.days === 1 ? "day" : "days"}
            </span>
          </p>
        </div>
        <Badge tone="amber">Pending Approval</Badge>
      </div>

      {!open ? (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Review
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <FreshBalanceDisplay
            balance={cell.data}
            isLoading={cell.isLoading}
            isError={cell.isError}
          />

          {fetchFailed && (
            <StaleBalanceOverrideWarning
              overridden={overridden}
              onOverrideChange={setOverridden}
            />
          )}

          {conflict && (
            <Notice tone="error">
              The balance changed since you opened this request. Approval was
              rejected and the request remains pending. Re-review the current
              balance before approving.
            </Notice>
          )}

          <ApprovalControls
            canApprove={canApprove}
            busy={busy}
            onApprove={() =>
              approve.mutate({
                id: request.id,
                employeeId: request.employeeId,
                locationId: request.locationId,
                by: managerName,
              })
            }
            onDeny={(reason) =>
              deny.mutate({
                id: request.id,
                employeeId: request.employeeId,
                locationId: request.locationId,
                reason,
                by: managerName,
              })
            }
          />
        </div>
      )}
    </Card>
  );
}
