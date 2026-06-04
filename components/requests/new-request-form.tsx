"use client";

import { useEffect, useMemo, useState } from "react";
import { useBalances } from "@/lib/queries/balances";
import { useSubmitRequest } from "@/lib/mutations/use-submit-request";
import { useModifyRequest } from "@/lib/mutations/use-request-actions";
import { HcmError } from "@/lib/api/client";
import { countDaysInclusive } from "@/lib/hcm/serialization";
import type { Balance, LeaveRequest } from "@/lib/domain/types";
import { Button, Card, Notice } from "@/components/ui/primitives";
import { LocationSelector } from "./location-selector";
import { DateRangePicker } from "./date-range-picker";
import { BalanceSnapshot } from "./balance-snapshot";
import { StaleBalanceWarning } from "./stale-balance-warning";

/**
 * New / edit leave request form (TRD §5.4). Local state only. Captures a
 * balance snapshot at open and submits against it; a background refresh never
 * resets the form, but a changed live balance surfaces a warning (TRD §5.3).
 *
 * When `editRequest` is provided, the form edits an existing request (dates),
 * which resets it to pending — re-approval required (TRD §3.3, §4.4).
 * Remount the component (via a React `key`) to switch edit targets.
 */
export function NewRequestForm({
  employeeId,
  editRequest,
  seed,
  onMidEditChange,
  onDone,
}: {
  employeeId: string;
  /** Present → edit mode (modify existing). */
  editRequest?: LeaveRequest;
  /** Prefill for a "retry"/"create new" without editing an existing request. */
  seed?: { locationId: string; startDate: Date; endDate: Date };
  onMidEditChange?: (editing: boolean) => void;
  onDone?: () => void;
}) {
  const { data: liveBalances } = useBalances(employeeId);
  const submit = useSubmitRequest();
  const modify = useModifyRequest();
  const isEdit = !!editRequest;

  // Snapshot the balances once, when data first becomes available. Captured via
  // the supported set-state-during-render pattern so it is read safely during
  // render and a later background refresh never overwrites it (TRD §5.3).
  const [snapshotMap, setSnapshotMap] = useState<Map<string, Balance> | null>(
    null,
  );
  if (snapshotMap === null && liveBalances && liveBalances.length > 0) {
    setSnapshotMap(new Map(liveBalances.map((b) => [b.locationId, b])));
  }

  // Explicit user selection; falls back to the first available location so we
  // never need a default-setting effect.
  const [selectedLocation, setSelectedLocation] = useState<string | null>(
    editRequest?.locationId ?? seed?.locationId ?? null,
  );
  const locationId = selectedLocation ?? liveBalances?.[0]?.locationId ?? "";

  const [startDate, setStartDate] = useState<Date | null>(
    editRequest?.startDate ?? seed?.startDate ?? null,
  );
  const [endDate, setEndDate] = useState<Date | null>(
    editRequest?.endDate ?? seed?.endDate ?? null,
  );
  const [rejection, setRejection] = useState<HcmError | null>(null);

  const editing = startDate !== null || endDate !== null;
  useEffect(() => {
    onMidEditChange?.(editing);
  }, [editing, onMidEditChange]);

  const days = useMemo(
    () => (startDate && endDate ? countDaysInclusive(startDate, endDate) : 0),
    [startDate, endDate],
  );

  const snapshot = snapshotMap?.get(locationId);
  const live = liveBalances?.find((b) => b.locationId === locationId);
  const datesValid =
    startDate !== null && endDate !== null && endDate >= startDate;
  const pending = submit.isPending || modify.isPending;

  async function handleSubmit() {
    if (!locationId || !startDate || !endDate || !datesValid) return;
    setRejection(null);
    const name = snapshot?.locationName ?? live?.locationName ?? locationId;
    try {
      if (isEdit && editRequest) {
        await modify.mutateAsync({
          id: editRequest.id,
          employeeId,
          locationId,
          startDate,
          endDate,
        });
      } else {
        await submit.mutateAsync({
          employeeId,
          locationId,
          locationName: name,
          startDate,
          endDate,
        });
      }
      setStartDate(null);
      setEndDate(null);
      onDone?.();
    } catch (error) {
      if (error instanceof HcmError) setRejection(error);
      else throw error;
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {isEdit ? "Edit request" : "Request time off"}
        </h2>
        {(isEdit || seed) && (
          <Button variant="ghost" onClick={() => onDone?.()}>
            Cancel
          </Button>
        )}
      </div>

      {isEdit && (
        <Notice tone="info">
          Editing the dates resets this request to “Pending Approval” — your
          manager will need to approve it again.
        </Notice>
      )}

      {liveBalances && liveBalances.length > 0 && (
        <LocationSelector
          balances={liveBalances}
          value={locationId}
          onChange={isEdit ? () => {} : setSelectedLocation}
        />
      )}

      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={({ startDate: s, endDate: e }) => {
          setStartDate(s);
          setEndDate(e);
        }}
      />

      <BalanceSnapshot snapshot={snapshot} days={days} />

      {snapshot && live && (
        <StaleBalanceWarning
          snapshotAvailable={snapshot.available}
          liveAvailable={live.available}
        />
      )}

      {startDate && endDate && !datesValid && (
        <Notice tone="warning">End date must be on or after the start date.</Notice>
      )}

      {rejection && <RejectionNotice error={rejection} />}

      <div>
        <Button
          onClick={handleSubmit}
          disabled={!datesValid || !locationId || pending}
        >
          {pending
            ? "Submitting…"
            : isEdit
              ? "Save changes"
              : "Submit request"}
        </Button>
      </div>
    </Card>
  );
}

function RejectionNotice({ error }: { error: HcmError }) {
  const body = error.body;
  if (body && body.code === "INSUFFICIENT_BALANCE" && "requested" in body) {
    return (
      <Notice tone="error">
        Insufficient balance: you requested {body.requested} days but only{" "}
        {body.available} are available. Adjust the dates and try again.
      </Notice>
    );
  }
  if (body && body.code === "INVALID_DIMENSION") {
    return (
      <Notice tone="error">
        That location isn&apos;t valid for your account. Choose a different
        location.
      </Notice>
    );
  }
  return (
    <Notice tone="error">
      We couldn&apos;t submit your request. Please try again.
    </Notice>
  );
}
