"use client";

import { useManagerRequests } from "@/lib/queries/requests";
import { Notice, Skeleton } from "@/components/ui/primitives";
import { ManagerRequestCard } from "./manager-request-card";

/**
 * Owns the `useManagerRequests` query (TRD §5.4, §4.5). Confirmed pending
 * requests (actionable) are listed first, followed by cancelled requests
 * (view-only) so a cancellation is never a surprise to the manager. Optimistic
 * cards never appear here (TRD §4.4).
 */
export function PendingRequestQueue({ managerName }: { managerName: string }) {
  const { data, isLoading, isError, refetch } = useManagerRequests();

  const pending = (data ?? []).filter((r) => r.status === "pending");
  const cancelled = (data ?? []).filter((r) => r.status === "cancelled");
  const isEmpty = !isLoading && !isError && (data?.length ?? 0) === 0;

  return (
    <section aria-labelledby="queue-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2
          id="queue-heading"
          className="text-lg font-semibold text-slate-800 dark:text-slate-100"
        >
          Pending approvals
        </h2>

        {isLoading && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {isError && (
          <Notice tone="error">
            <button className="underline" onClick={() => refetch()}>
              Couldn&apos;t load the approval queue. Retry.
            </button>
          </Notice>
        )}

        {isEmpty && (
          <Notice tone="info">
            No pending requests. You&apos;re all caught up.
          </Notice>
        )}

        {!isLoading && !isError && pending.length === 0 && cancelled.length > 0 && (
          <Notice tone="info">No pending requests awaiting your decision.</Notice>
        )}

        {pending.length > 0 && (
          <div className="flex flex-col gap-3">
            {pending.map((request) => (
              <ManagerRequestCard
                key={request.id}
                request={request}
                managerName={managerName}
              />
            ))}
          </div>
        )}
      </div>

      {cancelled.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Cancelled
          </h2>
          <div className="flex flex-col gap-3">
            {cancelled.map((request) => (
              <ManagerRequestCard
                key={request.id}
                request={request}
                managerName={managerName}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
