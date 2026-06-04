/**
 * Hierarchical TanStack Query keys for surgical invalidation (TRD §5.2).
 *
 *   ['balance', employeeId]              all balances for one employee (batch)
 *   ['balance', employeeId, locationId]  single cell (real-time API)
 *   ['requests', employeeId]             all requests for an employee
 *   ['requests', 'pending']              manager queue (confirmed pending)
 *   ['request', requestId]               single request detail
 */
export const queryKeys = {
  balances: (employeeId: string) => ["balance", employeeId] as const,
  balanceCell: (employeeId: string, locationId: string) =>
    ["balance", employeeId, locationId] as const,
  requests: (employeeId: string) => ["requests", employeeId] as const,
  managerQueue: () => ["requests", "pending"] as const,
  request: (id: string) => ["request", id] as const,
};
