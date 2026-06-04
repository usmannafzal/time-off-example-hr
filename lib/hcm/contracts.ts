/**
 * HCM wire contracts (TRD §6.1, §9).
 *
 * The mock HCM and the client both validate against these Zod schemas, so the
 * request/response shape is a single typed source of truth. Dates travel as ISO
 * strings on the wire and are converted to `Date` at the domain boundary.
 */

import { z } from "zod";

/**
 * Statuses HCM itself can return. The optimistic client-only states
 * (`optimistic-pending`, `optimistic-rolled-back`) never appear on the wire.
 * Note `approved` IS a valid stored status (set by the manager approve
 * endpoint) but the POST /requests handler must never return it (TRD §4.4).
 */
export const hcmRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "cancelled",
]);
export type HcmRequestStatus = z.infer<typeof hcmRequestStatusSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  at: z.string(), // ISO timestamp
  message: z.string(),
  fromStatus: z.string().optional(),
  toStatus: z.string().optional(),
  by: z.string().optional(),
});

/** A balance cell as returned by GET /balances and GET /balance/:locationId. */
export const balanceDtoSchema = z.object({
  employeeId: z.string(),
  locationId: z.string(),
  locationName: z.string(),
  available: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  fetchedAt: z.string(), // ISO timestamp of this read
});
export type BalanceDto = z.infer<typeof balanceDtoSchema>;

export const balancesResponseSchema = z.object({
  employeeId: z.string(),
  balances: z.array(balanceDtoSchema),
});
export type BalancesResponse = z.infer<typeof balancesResponseSchema>;

/** A leave request as stored/returned by HCM. */
export const leaveRequestDtoSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  locationId: z.string(),
  locationName: z.string(),
  startDate: z.string(), // ISO date
  endDate: z.string(), // ISO date
  days: z.number().int().positive(),
  status: hcmRequestStatusSchema,
  submittedAt: z.string(),
  updatedAt: z.string(),
  approvedBy: z.string().optional(),
  deniedReason: z.string().optional(),
  auditTrail: z.array(auditEventSchema),
});
export type LeaveRequestDto = z.infer<typeof leaveRequestDtoSchema>;

export const requestsResponseSchema = z.object({
  employeeId: z.string(),
  requests: z.array(leaveRequestDtoSchema),
});
export type RequestsResponse = z.infer<typeof requestsResponseSchema>;

/* --------------------------- write payloads --------------------------- */

/** POST /api/hcm/requests body. */
export const createRequestSchema = z.object({
  employeeId: z.string().min(1),
  locationId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  days: z.number().int().positive(),
});
export type CreateRequestPayload = z.infer<typeof createRequestSchema>;

/** PATCH /api/hcm/requests/:id body — date edit and/or cancellation. */
export const patchRequestSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  days: z.number().int().positive().optional(),
  /** Set to "cancelled" to cancel the request. */
  status: z.literal("cancelled").optional(),
});
export type PatchRequestPayload = z.infer<typeof patchRequestSchema>;

/** POST /api/hcm/requests/:id/deny body. */
export const denyRequestSchema = z.object({
  reason: z.string().min(1),
  by: z.string().min(1),
});
export type DenyRequestPayload = z.infer<typeof denyRequestSchema>;

/** POST /api/hcm/requests/:id/approve body. */
export const approveRequestSchema = z.object({
  by: z.string().min(1),
});
export type ApproveRequestPayload = z.infer<typeof approveRequestSchema>;

/** POST /api/hcm/admin/anniversary body (test-only). */
export const anniversarySchema = z.object({
  employeeId: z.string().min(1),
  locationId: z.string().min(1),
  days: z.number().int().positive().optional(),
});
export type AnniversaryPayload = z.infer<typeof anniversarySchema>;

/* ----------------------------- error bodies ---------------------------- */

export const insufficientBalanceErrorSchema = z.object({
  code: z.literal("INSUFFICIENT_BALANCE"),
  available: z.number(),
  requested: z.number(),
});

export const invalidDimensionErrorSchema = z.object({
  code: z.literal("INVALID_DIMENSION"),
  employeeId: z.string(),
  locationId: z.string(),
});

export const overlappingLeaveErrorSchema = z.object({
  code: z.literal("OVERLAPPING_LEAVE"),
  conflictStart: z.string(),
  conflictEnd: z.string(),
  conflictStatus: z.string(),
});

export const genericErrorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
});

export type HcmErrorBody =
  | z.infer<typeof insufficientBalanceErrorSchema>
  | z.infer<typeof invalidDimensionErrorSchema>
  | z.infer<typeof overlappingLeaveErrorSchema>
  | z.infer<typeof genericErrorSchema>;
