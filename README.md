# ExampleHR · Time-Off Module

A leave-balance and request-lifecycle frontend built against an **external HCM
system of record**. The HCM is unreliable by design — it has latency, can
silently fail to persist writes, rejects writes that conflict with a freshly
changed balance, and grants anniversary bonuses out of band. The UI is built to
be **honest, fast, and recoverable** in the face of all of that.

Implements the ExampleHR Time-Off TRD in full (balances, request lifecycle,
optimistic-but-provisional writes, post-write verification, manager approvals
against a fresh balance, and a complete mock HCM).

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4 |
| Server state | TanStack Query v5 |
| UI transition state | Zustand |
| Contracts / validation | Zod |
| Mock HCM | MSW v2 (browser + node) + Next route handlers |
| Component docs | Storybook 8 (`@storybook/react-vite`) + MSW addon |
| Tests | Vitest + Testing Library, Playwright, Storybook interactions |

> The TRD specified Next 14 / React 18; the scaffold ships Next 16 / React 19,
> so the project targets the installed versions (Async Request APIs, the React
> 19 hooks lint, Turbopack, ESLint flat config). Package manager: **npm**.

## Getting started

Requires **Node.js 20+** and **npm**.

```bash
npm install          # install dependencies
npm run dev          # http://localhost:3000 — app + mock HCM together
```

The mock HCM runs as Next route handlers under `/api/hcm/*`, so a single
`npm run dev` boots the entire system. No external services are required.

The Playwright integration tests **and** the headless Storybook test-runner
drive a real Chromium browser, so install it once before running those layers:

```bash
npx playwright install chromium
```

### Useful scripts

```bash
npm run dev                # app + mock HCM on :3000
npm run build              # production build
npm run typecheck          # tsc --noEmit (strict)
npm run lint               # eslint (flat config)

npm run test               # Vitest component/unit suite
npm run test:watch         # Vitest in watch mode
npm run test:coverage      # Vitest + V8 coverage report (./coverage)
npm run test:e2e           # Playwright integration suite (boots dev server)

npm run storybook          # Storybook dev server on :6006
npm run build-storybook    # static Storybook build
npm run test-storybook     # run play()/interaction tests against a running Storybook
npm run test-storybook:ci  # build + serve + run interaction tests headlessly, then tear down
```

Tunable behavior lives in `.env` (see `.env.example`): poll cadence, staleness
threshold, verification delay, silent-failure rate, anniversary interval.

## Architecture

```
app/                      routes + mock HCM route handlers (/api/hcm/*)
  (employee)/             dashboard, requests
  (manager)/              approvals
components/               UI tree (§5.4): balance/, requests/, manager/, system/, ui/
lib/
  domain/                 types, state machine, ids, status presentation
  hcm/                    Zod contracts + DTO↔domain serialization
  api/                    typed HCM client (validates + maps to domain)
  queries/                TanStack Query hooks + keys + reconciliation
  mutations/              submit (optimistic + verification), edit/cancel/approve/deny
  store/                  Zustand: transition overlay + toasts
mocks/                    store (behavioral core) + service + MSW handlers + seed
stories/                  31 Storybook stories (all meaningful UI states)
tests/                    components/ (Vitest), integration/ (Playwright)
```

### Key design decisions

- **Provisional optimistic writes.** A submission immediately shows an
  `optimistic-pending` card (temp id) and decrements the balance optimistically.
  On a `200/201` the temp id is **atomically swapped** for the real server id;
  a **post-write verification read** (+3s) then confirms the balance actually
  changed. If the HCM silently failed, the read contradicts the optimistic
  update and the card rolls back to `optimistic-rolled-back`, restoring the
  balance. (`lib/mutations/use-submit-request.ts`)
- **Pending-first invariant.** The only path to `approved` is an explicit
  manager action — submission can never yield `approved`. Enforced in the pure
  state machine (`lib/domain/state-machine.ts`) and asserted in the submit
  mutation.
- **Surgical cache invalidation.** Hierarchical query keys
  (`['balance', emp, loc]`, `['requests', emp]`, …) mean a write invalidates
  only the affected cell and lists, never the whole corpus.
- **Layered reconciliation.** 60s polling + focus refetch keep balances fresh;
  balances older than the threshold are labelled "as of [time]"; an anniversary
  bonus arriving via background refetch raises a non-blocking toast — and is
  **suppressed while a form is mid-edit** so it never resets in-flight work.
- **Manager decides on fresh data.** Opening a request triggers a cache-bypassing
  real-time cell read; Approve is gated on a confirmed fresh balance (or an
  explicit override if the read fails), and a stale-balance `409` returns the
  request to pending with a conflict message.
- **One behavioral core for the mock HCM.** `mocks/store.ts` holds the logic;
  `mocks/service.ts` adapts it to Web `Request`/`Response`, shared verbatim by
  the MSW handlers (Storybook, Vitest) and the Next route handlers (app,
  Playwright).

## Mock HCM behaviors (`mocks/`)

- Batch `GET /balances` (400–800ms) vs fast real-time `GET /balance/:loc` (50–150ms).
- Silent write failures (`200 OK`, nothing persisted) at a configurable rate.
- `409 INSUFFICIENT_BALANCE` and `422 INVALID_DIMENSION` rejections.
- Anniversary-bonus scheduler that raises balances out of band.
- Per-request overrides for deterministic stories/tests:
  `?force=silent|conflict|dimension|server-error`, `?delay=<ms>`, `?employeeId=`.

## Testing (three layers)

Each layer guards a different class of regression. To run everything:

```bash
npm run typecheck          # types
npm run lint               # lint
npm run test:coverage      # 1. component/unit (with coverage)
npm run test-storybook:ci  # 2. Storybook interaction tests (headless)
npm run test:e2e           # 3. Playwright integration (boots the app)
```

1. **Component/unit tests** — Vitest + Testing Library (`tests/components/`):
   the full state machine, the optimistic→verify→confirm /
   silent-failure-rollback / 409-conflict flows, the in-flight form not
   resetting on a background refresh, and manager decision-time balance gating.

   ```bash
   npm run test            # run once
   npm run test:watch      # watch mode
   npm run test:coverage   # text + HTML + lcov report in ./coverage (open coverage/index.html)
   ```

2. **Interaction tests** — Storybook `play` functions on the 31 stories drive
   real user flows against per-story MSW handlers.

   ```bash
   # Option A — one command (builds, serves, tests, tears down):
   npm run test-storybook:ci

   # Option B — against a running Storybook (faster while iterating):
   npm run storybook         # terminal 1
   npm run test-storybook    # terminal 2
   ```

3. **Integration tests** — Playwright drives the running app + mock HCM end to
   end (submit → confirmed pending; manager review → approve; silent-failure
   rollback; stale-balance conflict; anniversary reconciliation; temp→real id
   swap). Playwright boots `npm run dev` automatically.

   ```bash
   npm run test:e2e
   ```

All three layers, plus typecheck and lint, run on every push/PR via GitHub
Actions (`.github/workflows/ci.yml`).

## TRD §12 success-criteria mapping

| Criterion | Where |
| --- | --- |
| Single-command mock HCM | `npm run dev` (route handlers under `/api/hcm`) |
| Balances honest about freshness | `BalanceCard` "as of [time]", `StalenessBanner` |
| Optimistic but provisional + verification | `use-submit-request.ts`, `verifyEntry` |
| Pending-first (never auto-approve) | `state-machine.ts`, submit assertion + tests |
| Temp id never persisted / swapped atomically | `ids.ts`, `transition-store.swapTempToReal`, client guards |
| Silent failure detected & rolled back | submit verification + `submit-flow.test.tsx` |
| Surgical invalidation | `queryKeys`, `use-request-actions.invalidateAfterWrite` |
| Anniversary reconciliation, never interrupts a form | `use-anniversary-reconciliation.ts` + `suppress` |
| Manager fresh balance + conflict handling | `manager-request-card.tsx`, `use-request-actions` |
| State-machine-driven conditional actions | `getAvailableActions` → `RequestCard` |
| 31 stories for every meaningful state | `stories/` |
| Three test layers green | `npm run test-storybook:ci`, `npm run test:coverage`, `npm run test:e2e` |
| Proof of coverage | `npm run test:coverage` → `./coverage` (lcov + HTML) |
| Strict TypeScript, no lint errors | `npm run typecheck`, `npm run lint` |
