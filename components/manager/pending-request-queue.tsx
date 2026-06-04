"use client";

import { useManagerRequests } from "@/lib/queries/requests";
import { Notice, Skeleton } from "@/components/ui/primitives";
import { ManagerRequestCard } from "./manager-request-card";

/**
 * Owns the `useManagerRequests` query (TRD §5.4). Only confirmed pending
 * requests with real server ids appear here — never optimistic cards (TRD §4.4).
 */
export function PendingRequestQueue({ managerName }: { managerName: string }) {
  const { data, isLoading, isError, refetch } = useManagerRequests();

  return (
    <section aria-labelledby="queue-heading" className="flex flex-col gap-3">
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

      {!isLoading && !isError && data && data.length === 0 && (
        <Notice tone="info">No pending requests. You&apos;re all caught up.</Notice>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((request) => (
            <ManagerRequestCard
              key={request.id}
              request={request}
              managerName={managerName}
            />
          ))}
        </div>
      )}
    </section>
  );
}
