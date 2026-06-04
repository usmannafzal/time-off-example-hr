"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useBalances } from "@/lib/queries/balances";
import { queryKeys } from "@/lib/queries/keys";
import { useAnniversaryReconciliation } from "@/lib/queries/use-anniversary-reconciliation";
import { BalanceCard } from "./balance-card";
import { StalenessBanner } from "./staleness-banner";
import { Button, Notice, Skeleton } from "@/components/ui/primitives";

/**
 * Owns the `useBalances` query (TRD §5.4). Handles loading, empty, error,
 * staleness and the manual "Refresh All" batch trigger (TRD §4.2 — batch is
 * called only on initial load and explicit refresh). Fires the anniversary
 * reconciliation toast when a background refetch returns a higher balance.
 */
export function BalanceSummaryPanel({
  employeeId,
  /** When true, defer reconciliation toasts (a form is mid-edit) (TRD §4.1). */
  suppressReconciliation,
}: {
  employeeId: string;
  suppressReconciliation?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isRefetching, refetch } =
    useBalances(employeeId);

  useAnniversaryReconciliation(data, { suppress: suppressReconciliation });

  const refreshAll = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.balances(employeeId) });

  return (
    <section aria-labelledby="balances-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2
          id="balances-heading"
          className="text-lg font-semibold text-slate-800 dark:text-slate-100"
        >
          Your balances
        </h2>
        <Button
          variant="secondary"
          onClick={refreshAll}
          disabled={isRefetching}
          aria-label="Refresh all balances"
        >
          {isRefetching ? "Refreshing…" : "Refresh all"}
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Notice tone="error">
          <div className="flex flex-col gap-2">
            <span>We couldn&apos;t load your balances from HCM.</span>
            <div>
              <Button variant="secondary" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          </div>
        </Notice>
      )}

      {!isLoading && !isError && data && data.length === 0 && (
        <Notice tone="info">
          You have no location assignments yet. Balances will appear here once
          HR assigns you to a location.
        </Notice>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <>
          <StalenessBanner balances={data} isRefetching={isRefetching} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((b) => (
              <BalanceCard key={b.locationId} balance={b} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
