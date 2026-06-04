"use client";

import { useSession } from "@/components/system/session";
import { SectionErrorBoundary } from "@/components/system/error-boundary";
import { PendingRequestQueue } from "./pending-request-queue";

/** ManagerLayout (TRD §5.4): the pending-request approval queue. */
export function ManagerDashboard() {
  const { managerName } = useSession();
  return (
    <div className="flex flex-col gap-6">
      <SectionErrorBoundary section="Approval queue">
        <PendingRequestQueue managerName={managerName} />
      </SectionErrorBoundary>
    </div>
  );
}
