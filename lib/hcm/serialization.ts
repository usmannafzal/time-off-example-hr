/**
 * Conversions between HCM wire DTOs (ISO strings) and domain models (`Date`).
 */

import { STALENESS_DISPLAY_THRESHOLD_MS } from "@/lib/config";
import type { AuditEvent, Balance, LeaveRequest } from "@/lib/domain/types";
import type { BalanceDto, LeaveRequestDto } from "./contracts";

/**
 * Map a balance DTO to the domain model, computing `isStale` against the
 * staleness display threshold (TRD §4.1: balances older than 5 min are flagged).
 */
export function toBalance(dto: BalanceDto, now: number = Date.now()): Balance {
  const fetchedAt = new Date(dto.fetchedAt);
  const isStale = now - fetchedAt.getTime() > STALENESS_DISPLAY_THRESHOLD_MS;
  return {
    employeeId: dto.employeeId,
    locationId: dto.locationId,
    locationName: dto.locationName,
    available: dto.available,
    used: dto.used,
    pending: dto.pending,
    fetchedAt,
    isStale,
  };
}

function toAuditEvent(dto: {
  id: string;
  at: string;
  message: string;
  fromStatus?: string;
  toStatus?: string;
  by?: string;
}): AuditEvent {
  return {
    id: dto.id,
    at: new Date(dto.at),
    message: dto.message,
    fromStatus: dto.fromStatus as AuditEvent["fromStatus"],
    toStatus: dto.toStatus as AuditEvent["toStatus"],
    by: dto.by,
  };
}

/** Map a leave-request DTO to the domain model. */
export function toLeaveRequest(dto: LeaveRequestDto): LeaveRequest {
  return {
    id: dto.id,
    employeeId: dto.employeeId,
    locationId: dto.locationId,
    locationName: dto.locationName,
    startDate: new Date(dto.startDate),
    endDate: new Date(dto.endDate),
    days: dto.days,
    status: dto.status,
    submittedAt: new Date(dto.submittedAt),
    updatedAt: new Date(dto.updatedAt),
    approvedBy: dto.approvedBy,
    deniedReason: dto.deniedReason,
    auditTrail: dto.auditTrail.map(toAuditEvent),
  };
}

/** Inclusive whole-day count between two dates (TRD §11.1: whole days only). */
export function countDaysInclusive(start: Date, end: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const startUtc = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.floor((endUtc - startUtc) / MS_PER_DAY) + 1;
}

/** True if `start` is strictly after today (used for §3.3 future-date rules). */
export function isStartDateInFuture(start: Date, now: number = Date.now()): boolean {
  const today = new Date(now);
  const startDay = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const todayDay = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return startDay > todayDay;
}
