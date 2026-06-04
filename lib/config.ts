/**
 * Central runtime configuration.
 *
 * Values are sourced from environment variables so they can be tuned per
 * deployment (TRD §4.1 "configurable per deployment", §11.2 open question on
 * polling interval). All durations are expressed in milliseconds.
 */

function readNumberEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** TanStack Query: how long a balance is considered fresh (TRD §5.2: 4 min). */
export const STALE_TIME_MS = readNumberEnv(
  process.env.NEXT_PUBLIC_STALE_TIME_MS,
  4 * 60 * 1000,
);

/** TanStack Query: cache retention after a query goes unused (TRD §5.2: 10 min). */
export const GC_TIME_MS = readNumberEnv(
  process.env.NEXT_PUBLIC_GC_TIME_MS,
  10 * 60 * 1000,
);

/** Background poll cadence for balance queries (TRD §4.1: 60s, configurable). */
export const BALANCE_REFETCH_INTERVAL_MS = readNumberEnv(
  process.env.NEXT_PUBLIC_BALANCE_REFETCH_INTERVAL_MS,
  60 * 1000,
);

/**
 * Background poll cadence for the manager approval queue (TRD §4.1). Cross-tab
 * `BroadcastChannel` sync makes writes appear instantly when tabs are in the
 * same browser; this poll is the fallback that keeps the queue fresh when a
 * write originates outside this browser (e.g. another device) or a broadcast
 * is missed. Defaults to 20s.
 */
export const MANAGER_QUEUE_REFETCH_INTERVAL_MS = readNumberEnv(
  process.env.NEXT_PUBLIC_MANAGER_QUEUE_REFETCH_INTERVAL_MS,
  20 * 1000,
);

/**
 * A balance older than this is surfaced with an "as of [timestamp]" staleness
 * warning to the user (TRD §4.1 staleness indicator: 5 minutes). This is the
 * *display* threshold and is intentionally distinct from {@link STALE_TIME_MS},
 * which governs cache revalidation.
 */
export const STALENESS_DISPLAY_THRESHOLD_MS = readNumberEnv(
  process.env.NEXT_PUBLIC_STALENESS_DISPLAY_THRESHOLD_MS,
  5 * 60 * 1000,
);

/**
 * Delay before the post-write verification read fires after a mutation
 * (TRD §4.3: 3 seconds).
 */
export const VERIFICATION_DELAY_MS = readNumberEnv(
  process.env.NEXT_PUBLIC_VERIFICATION_DELAY_MS,
  3 * 1000,
);

/* ------------------------------------------------------------------ *
 * Mock-HCM-only configuration (server side; not prefixed NEXT_PUBLIC) *
 * ------------------------------------------------------------------ */

/** Probability a POST/PATCH silently fails — 200 OK but no persistence (TRD §6.2: 10%). */
export const HCM_SILENT_FAILURE_RATE = readNumberEnv(
  process.env.HCM_SILENT_FAILURE_RATE,
  0.1,
);

/** Anniversary-bonus interval for the mock scheduler (TRD §6.2: 90s, configurable). */
export const HCM_ANNIVERSARY_INTERVAL_MS = readNumberEnv(
  process.env.HCM_ANNIVERSARY_INTERVAL_MS,
  90 * 1000,
);

/** Days granted by an anniversary bonus tick (TRD §6.1 admin endpoint). */
export const HCM_ANNIVERSARY_BONUS_DAYS = readNumberEnv(
  process.env.HCM_ANNIVERSARY_BONUS_DAYS,
  2,
);
