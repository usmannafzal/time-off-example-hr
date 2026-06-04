"use client";

/**
 * Request read hooks (TRD §4.4, §4.5, §5.2).
 *
 * `useRequests` merges confirmed server requests with the optimistic transition
 * overlay so provisional (optimistic-pending / verifying / rolled-back) cards
 * appear alongside real ones. `useManagerRequests` returns only confirmed
 * pending requests (real server ids) — the manager never sees optimistic cards
 * (TRD §4.4).
 */

import { useQuery } from "@tanstack/react-query";
import { fetchPendingRequests, fetchRequest, fetchRequests } from "@/lib/api/client";
import { queryKeys } from "./keys";
import type { LeaveRequest } from "@/lib/domain/types";
import { useTransitionStore } from "@/lib/store/transition-store";

function mergeOverlay(
  serverRequests: LeaveRequest[],
  overlay: LeaveRequest[],
): LeaveRequest[] {
  const byKey = new Map<string, LeaveRequest>();
  for (const r of serverRequests) byKey.set(r.id, r);
  // Overlay entries win and are keyed by temp id (if present) or real id.
  for (const r of overlay) byKey.set(r.tempId ?? r.id, r);
  return [...byKey.values()].sort(
    (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
  );
}

export function useRequests(employeeId: string) {
  const entries = useTransitionStore((s) => s.entries);

  const query = useQuery({
    queryKey: queryKeys.requests(employeeId),
    queryFn: () => fetchRequests(employeeId),
  });

  const overlay = Object.values(entries)
    .map((e) => e.request)
    .filter((r) => r.employeeId === employeeId);

  return { ...query, data: mergeOverlay(query.data ?? [], overlay) };
}

export function useManagerRequests() {
  return useQuery({
    queryKey: queryKeys.managerQueue(),
    queryFn: fetchPendingRequests,
  });
}

export function useRequest(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.request(id),
    queryFn: () => fetchRequest(id),
    enabled: options?.enabled ?? true,
  });
}
