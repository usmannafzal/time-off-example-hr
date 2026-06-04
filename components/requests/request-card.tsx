"use client";

import type { LeaveRequest } from "@/lib/domain/types";
import { getAvailableActions } from "@/lib/domain/state-machine";
import { isStartDateInFuture } from "@/lib/hcm/serialization";
import { STATUS_PRESENTATION } from "@/lib/domain/status-presentation";
import {
  Badge,
  Button,
  Card,
  Spinner,
  cx,
  formatDate,
} from "@/components/ui/primitives";
import { OptimisticPendingBadge } from "./optimistic-pending-badge";
import { RolledBackBanner } from "./rolled-back-banner";

export interface RequestCardHandlers {
  onEditDates?: (request: LeaveRequest) => void;
  onCancel?: (request: LeaveRequest) => void;
  onRetry?: (request: LeaveRequest) => void;
  onDismiss?: (request: LeaveRequest) => void;
}

/**
 * State-machine-aware request card for the employee view (TRD §5.4).
 * Conditional actions are derived from {@link getAvailableActions} so the UI
 * can never offer an action the lifecycle rules forbid (TRD §3.3, §4.4).
 */
export function RequestCard({
  request,
  busy,
  onEditDates,
  onCancel,
  onRetry,
  onDismiss,
}: { request: LeaveRequest; busy?: boolean } & RequestCardHandlers) {
  const startDateInFuture = isStartDateInFuture(request.startDate);
  const actions = getAvailableActions(request.status, {
    role: "employee",
    startDateInFuture,
  });
  const presentation = STATUS_PRESENTATION[request.status];
  const isCancelled = request.status === "cancelled";

  const cardTone =
    request.status === "optimistic-rolled-back"
      ? "red"
      : request.status === "approved"
        ? "green"
        : request.status === "optimistic-pending"
          ? "info"
          : "default";

  return (
    <Card tone={cardTone} className={cx(isCancelled && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3
            className={cx(
              "text-sm font-semibold text-slate-800 dark:text-slate-100",
              isCancelled && "line-through",
            )}
          >
            {request.locationName}
          </h3>
          <p
            className={cx(
              "mt-0.5 text-sm text-slate-600 dark:text-slate-300",
              isCancelled && "line-through",
            )}
          >
            {formatDate(request.startDate)} – {formatDate(request.endDate)}
            <span className="ml-2 text-xs text-slate-400">
              {request.days} {request.days === 1 ? "day" : "days"}
            </span>
          </p>
        </div>
        {request.status === "optimistic-pending" ? (
          <OptimisticPendingBadge />
        ) : (
          <Badge tone={presentation.tone}>{presentation.label}</Badge>
        )}
      </div>

      {request.status === "approved" && request.approvedBy && (
        <p className="mt-2 text-xs text-emerald-700">
          Approved by {request.approvedBy} · {formatDate(request.updatedAt)}
        </p>
      )}

      {request.status === "denied" && request.deniedReason && (
        <p className="mt-2 text-xs text-slate-600">
          Reason: {request.deniedReason}
        </p>
      )}

      {request.status === "optimistic-rolled-back" && (
        <div className="mt-3">
          <RolledBackBanner
            onRetry={() => onRetry?.(request)}
            onDismiss={() => onDismiss?.(request)}
          />
        </div>
      )}

      {actions.length > 0 &&
        request.status !== "optimistic-rolled-back" &&
        request.status !== "denied" && (
          <div className="mt-3 flex items-center gap-2">
            {busy && <Spinner className="text-slate-400" />}
            {actions.includes("edit-dates") && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => onEditDates?.(request)}
              >
                Edit dates
              </Button>
            )}
            {actions.includes("cancel") && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => onCancel?.(request)}
              >
                Cancel
              </Button>
            )}
          </div>
        )}

      {request.status === "denied" && actions.includes("create-new") && (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => onRetry?.(request)}>
            Create new request
          </Button>
        </div>
      )}
    </Card>
  );
}
