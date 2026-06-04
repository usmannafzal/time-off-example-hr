"use client";

/**
 * Request lifecycle mutations beyond submission (TRD §3.3, §4.5).
 *
 * - `useModifyRequest`  edit dates → resets to pending (re-approval)
 * - `useCancelRequest`  cancel → preserved for audit
 * - `useApproveRequest` manager approve (may 409 on a stale balance)
 * - `useDenyRequest`    manager deny (always succeeds)
 *
 * All write operations invalidate only the affected balance cell and request
 * lists — never the whole balance corpus (TRD §5.2 surgical invalidation).
 */

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  approveRequest,
  denyRequest,
  patchRequest,
} from "@/lib/api/client";
import { queryKeys } from "@/lib/queries/keys";
import { countDaysInclusive } from "@/lib/hcm/serialization";
import { broadcastInvalidate } from "@/lib/sync/cross-tab-sync";

function invalidateAfterWrite(
  queryClient: QueryClient,
  employeeId: string,
  locationId?: string,
) {
  // Surgical invalidation (TRD §5.2): the affected cell + request lists only.
  if (locationId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.balanceCell(employeeId, locationId),
    });
  }
  queryClient.invalidateQueries({ queryKey: queryKeys.balances(employeeId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.requests(employeeId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.managerQueue() });

  // Mirror the same invalidation into other open tabs (TRD §4.1 multi-tab):
  // e.g. cancel/modify in the employee tab updates an open manager queue, and
  // approve/deny in the manager tab updates an open employee request list.
  broadcastInvalidate(
    ...(locationId ? [queryKeys.balanceCell(employeeId, locationId)] : []),
    queryKeys.balances(employeeId),
    queryKeys.requests(employeeId),
    queryKeys.managerQueue(),
  );
}

export interface ModifyRequestInput {
  id: string;
  employeeId: string;
  locationId: string;
  startDate: Date;
  endDate: Date;
}

export function useModifyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ModifyRequestInput) =>
      patchRequest(
        input.id,
        {
          startDate: input.startDate.toISOString(),
          endDate: input.endDate.toISOString(),
          days: countDaysInclusive(input.startDate, input.endDate),
        },
        input.employeeId,
      ),
    onSuccess: (_data, input) =>
      invalidateAfterWrite(queryClient, input.employeeId, input.locationId),
  });
}

export interface CancelRequestInput {
  id: string;
  employeeId: string;
  locationId: string;
}

export function useCancelRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CancelRequestInput) =>
      patchRequest(input.id, { status: "cancelled" }, input.employeeId),
    onSuccess: (_data, input) =>
      invalidateAfterWrite(queryClient, input.employeeId, input.locationId),
  });
}

export interface ApproveRequestInput {
  id: string;
  employeeId: string;
  locationId: string;
  by: string;
}

export function useApproveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApproveRequestInput) =>
      approveRequest(input.id, { by: input.by }),
    onSuccess: (_data, input) =>
      invalidateAfterWrite(queryClient, input.employeeId, input.locationId),
  });
}

export interface DenyRequestInput {
  id: string;
  employeeId: string;
  locationId: string;
  reason: string;
  by: string;
}

export function useDenyRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DenyRequestInput) =>
      denyRequest(input.id, { reason: input.reason, by: input.by }),
    onSuccess: (_data, input) =>
      invalidateAfterWrite(queryClient, input.employeeId, input.locationId),
  });
}
