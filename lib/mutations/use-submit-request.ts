"use client";

/**
 * Submit-request mutation — provisional optimistic update with mandatory
 * post-write verification (TRD §4.3, §4.4, §5.1).
 *
 * Flow:
 *   1. Create an optimistic card with a client temp id; reserve the balance
 *      optimistically (status `optimistic-pending`).
 *   2. POST to HCM. On explicit rejection (409/422) → remove the card, restore
 *      the balance, surface the error inline (status would be `hcm-rejected`).
 *   3. On 200/201 → atomic temp→real id swap (status `pending`), assert the
 *      status is never `approved` (pending-first invariant), invalidate the
 *      request list, and schedule a verification read.
 *   4. Verification read (+3s): if the cell reflects the reservation → confirm
 *      and drop the overlay; if it contradicts (silent failure) → roll back to
 *      `optimistic-rolled-back` and restore the balance.
 */

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createRequest, fetchBalanceCell, HcmError } from "@/lib/api/client";
import { queryKeys } from "@/lib/queries/keys";
import { createTempId } from "@/lib/domain/ids";
import { countDaysInclusive } from "@/lib/hcm/serialization";
import { VERIFICATION_DELAY_MS } from "@/lib/config";
import { useTransitionStore } from "@/lib/store/transition-store";
import { broadcastInvalidate } from "@/lib/sync/cross-tab-sync";
import type { Balance, LeaveRequest } from "@/lib/domain/types";

export interface SubmitRequestInput {
  employeeId: string;
  locationId: string;
  locationName: string;
  startDate: Date;
  endDate: Date;
}

/** Read the current server-side available days for a cell from the cache. */
function getServerAvailable(
  queryClient: QueryClient,
  employeeId: string,
  locationId: string,
): number {
  const cell = queryClient.getQueryData<Balance>(
    queryKeys.balanceCell(employeeId, locationId),
  );
  if (cell) return cell.available;
  const batch = queryClient.getQueryData<Balance[]>(
    queryKeys.balances(employeeId),
  );
  const found = batch?.find((b) => b.locationId === locationId);
  return found?.available ?? 0;
}

/**
 * Run the post-write verification read for a confirmed (real-id) entry.
 * Exported so tests can invoke it deterministically without timers.
 */
export async function verifyEntry(
  queryClient: QueryClient,
  realId: string,
): Promise<"confirmed" | "rolled-back" | "skipped"> {
  const store = useTransitionStore.getState();
  const entry = store.entries[realId];
  if (!entry || entry.phase !== "verifying") return "skipped";

  let fresh: Balance;
  try {
    fresh = await fetchBalanceCell(entry.employeeId, entry.locationId);
  } catch {
    // If verification itself fails, conservatively roll back (TRD §4.3).
    store.markRolledBack(realId);
    store.clearDelta(entry.employeeId, entry.locationId);
    return "rolled-back";
  }

  queryClient.setQueryData(
    queryKeys.balanceCell(entry.employeeId, entry.locationId),
    fresh,
  );

  if (fresh.available === entry.expectedAvailable) {
    // Confirmed: the write persisted. Drop the overlay; server is source of truth.
    store.removeEntry(realId);
    store.clearDelta(entry.employeeId, entry.locationId);
    queryClient.invalidateQueries({ queryKey: queryKeys.balances(entry.employeeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.requests(entry.employeeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.managerQueue() });
    broadcastInvalidate(
      queryKeys.balances(entry.employeeId),
      queryKeys.requests(entry.employeeId),
      queryKeys.managerQueue(),
    );
    return "confirmed";
  }

  // Contradiction → silent failure. Roll back and restore the balance.
  store.markRolledBack(realId);
  store.clearDelta(entry.employeeId, entry.locationId);
  return "rolled-back";
}

export function useSubmitRequest() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: SubmitRequestInput) => {
      const store = useTransitionStore.getState();
      const tempId = createTempId();
      const days = countDaysInclusive(input.startDate, input.endDate);
      const now = new Date();

      const optimistic: LeaveRequest = {
        id: "",
        tempId,
        employeeId: input.employeeId,
        locationId: input.locationId,
        locationName: input.locationName,
        startDate: input.startDate,
        endDate: input.endDate,
        days,
        status: "optimistic-pending",
        submittedAt: now,
        updatedAt: now,
        auditTrail: [
          {
            id: `${tempId}_audit`,
            at: now,
            message: "Submitting — awaiting HCM confirmation",
            toStatus: "optimistic-pending",
          },
        ],
      };

      const serverAvailable = getServerAvailable(
        queryClient,
        input.employeeId,
        input.locationId,
      );

      store.addOptimistic(tempId, {
        request: optimistic,
        phase: "submitting",
        expectedAvailable: serverAvailable - days,
        employeeId: input.employeeId,
        locationId: input.locationId,
      });
      // Optimistically reserve the balance (TRD §7.2 "balance decremented").
      store.applyDelta(input.employeeId, input.locationId, {
        available: -days,
        pending: days,
      });

      try {
        const server = await createRequest({
          employeeId: input.employeeId,
          locationId: input.locationId,
          startDate: input.startDate.toISOString(),
          endDate: input.endDate.toISOString(),
          days,
        });

        // Pending-first invariant (TRD §4.4, §12): a fresh submission must be
        // pending, never approved. Treat any deviation as an anomaly.
        if (server.status !== "pending") {
          console.error(
            "HCM returned unexpected status on new request:",
            server.status,
          );
          store.removeEntry(tempId);
          store.clearDelta(input.employeeId, input.locationId);
          throw new Error(
            `Unexpected status "${server.status}" — expected "pending"`,
          );
        }

        // Atomic temp→real id swap (TRD §4.4). After this, no temp id remains.
        store.swapTempToReal(tempId, server);
        queryClient.invalidateQueries({
          queryKey: queryKeys.requests(input.employeeId),
        });
        // The request is now a real pending row → it belongs in the manager
        // queue. Invalidate locally and in other tabs so an open manager view
        // shows it without a manual refresh (TRD §4.1 multi-tab).
        queryClient.invalidateQueries({ queryKey: queryKeys.managerQueue() });
        broadcastInvalidate(
          queryKeys.requests(input.employeeId),
          queryKeys.managerQueue(),
        );

        // Schedule the post-write verification read (TRD §4.3).
        if (VERIFICATION_DELAY_MS > 0) {
          setTimeout(() => {
            void verifyEntry(queryClient, server.id);
          }, VERIFICATION_DELAY_MS);
        } else {
          await verifyEntry(queryClient, server.id);
        }

        return server;
      } catch (error) {
        // Explicit rejection or anomaly: discard the optimistic card + delta.
        if (error instanceof HcmError) {
          store.removeEntry(tempId);
          store.clearDelta(input.employeeId, input.locationId);
        }
        throw error;
      }
    },
  });

  return mutation;
}
