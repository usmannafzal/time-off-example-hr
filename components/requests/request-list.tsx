"use client";

import { useRequests } from "@/lib/queries/requests";
import { useCancelRequest } from "@/lib/mutations/use-request-actions";
import { useTransitionStore } from "@/lib/store/transition-store";
import type { LeaveRequest } from "@/lib/domain/types";
import { Notice, Skeleton } from "@/components/ui/primitives";
import { RequestCard } from "./request-card";

/**
 * Owns the `useRequests` query (TRD §5.4) and wires the employee lifecycle
 * actions. Provisional optimistic/rolled-back cards come from the transition
 * overlay merged inside the hook.
 */
export function RequestList({
  employeeId,
  /** Called to prefill the form for an edit/retry (TRD §3.3, §4.4). */
  onEditDates,
  onRetry,
}: {
  employeeId: string;
  onEditDates?: (request: LeaveRequest) => void;
  onRetry?: (request: LeaveRequest) => void;
}) {
  const { data, isLoading, isError, refetch } = useRequests(employeeId);
  const cancel = useCancelRequest();
  const removeEntry = useTransitionStore((s) => s.removeEntry);

  const handleCancel = (request: LeaveRequest) =>
    cancel.mutate({
      id: request.id,
      employeeId: request.employeeId,
      locationId: request.locationId,
    });

  const handleDismiss = (request: LeaveRequest) =>
    removeEntry(request.tempId ?? request.id);

  const handleRetry = (request: LeaveRequest) => {
    removeEntry(request.tempId ?? request.id);
    onRetry?.(request);
  };

  return (
    <section aria-labelledby="requests-heading" className="flex flex-col gap-3">
      <h2
        id="requests-heading"
        className="text-lg font-semibold text-slate-800 dark:text-slate-100"
      >
        Your requests
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
            Couldn&apos;t load your requests. Retry.
          </button>
        </Notice>
      )}

      {!isLoading && !isError && data.length === 0 && (
        <Notice tone="info">You have no leave requests yet.</Notice>
      )}

      {!isLoading && !isError && data.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.map((request) => (
            <RequestCard
              key={request.tempId ?? request.id}
              request={request}
              busy={
                cancel.isPending &&
                cancel.variables?.id === request.id
              }
              onCancel={handleCancel}
              onDismiss={handleDismiss}
              onRetry={handleRetry}
              onEditDates={onEditDates}
            />
          ))}
        </div>
      )}
    </section>
  );
}
