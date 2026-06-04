/**
 * ID helpers (TRD §4.4 "Temporary ID Replacement", Appendix A).
 *
 * A temp ID is client-generated and exists only during `optimistic-pending`.
 * It must never be sent to any API endpoint or written to persistent storage,
 * and is replaced atomically by the real server ID in the mutation onSuccess
 * handler.
 */

const TEMP_ID_PREFIX = "temp_req_";

/** Generate a client-side temporary request ID, e.g. `temp_req_1719432000000`. */
export function createTempId(now: number = Date.now()): string {
  // Add a short random suffix so two submissions within the same ms differ.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${TEMP_ID_PREFIX}${now}_${suffix}`;
}

/** True if `id` is a client temp ID. Used to bar temp IDs from API calls. */
export function isTempId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith(TEMP_ID_PREFIX);
}
