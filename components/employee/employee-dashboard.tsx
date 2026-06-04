"use client";

import { useState } from "react";
import type { LeaveRequest } from "@/lib/domain/types";
import { useSession } from "@/components/system/session";
import { SectionErrorBoundary } from "@/components/system/error-boundary";
import { BalanceSummaryPanel } from "@/components/balance/balance-summary-panel";
import { RequestList } from "@/components/requests/request-list";
import { NewRequestForm } from "@/components/requests/new-request-form";

/**
 * EmployeeLayout (TRD §5.4): balance panel + request list + new-request form.
 * Coordinates the §4.1/§5.3 in-flight protection — while the form is mid-edit,
 * balance reconciliation toasts are suppressed.
 */
export function EmployeeDashboard() {
  const { employeeId } = useSession();
  const [midEdit, setMidEdit] = useState(false);
  const [editRequest, setEditRequest] = useState<LeaveRequest | null>(null);
  const [seed, setSeed] = useState<
    { locationId: string; startDate: Date; endDate: Date } | null
  >(null);

  const startEdit = (request: LeaveRequest) => {
    setSeed(null);
    setEditRequest(request);
  };
  const startRetry = (request: LeaveRequest) => {
    setEditRequest(null);
    setSeed({
      locationId: request.locationId,
      startDate: request.startDate,
      endDate: request.endDate,
    });
  };
  const clearForm = () => {
    setEditRequest(null);
    setSeed(null);
  };

  return (
    <div className="flex flex-col gap-8">
      <SectionErrorBoundary section="Balances">
        <BalanceSummaryPanel
          employeeId={employeeId}
          suppressReconciliation={midEdit}
        />
      </SectionErrorBoundary>

      <div className="grid gap-8 lg:grid-cols-2">
        <SectionErrorBoundary section="New request">
          <NewRequestForm
            key={editRequest?.id ?? (seed ? "seed" : "new")}
            employeeId={employeeId}
            editRequest={editRequest ?? undefined}
            seed={seed ?? undefined}
            onMidEditChange={setMidEdit}
            onDone={clearForm}
          />
        </SectionErrorBoundary>

        <SectionErrorBoundary section="Requests">
          <RequestList
            employeeId={employeeId}
            onEditDates={startEdit}
            onRetry={startRetry}
          />
        </SectionErrorBoundary>
      </div>
    </div>
  );
}
