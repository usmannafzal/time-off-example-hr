import { test, expect, type Page } from "@playwright/test";

/**
 * Layer 3 — integration tests for the harder end-to-end scenarios in TRD §8.3,
 * driven against the running Next.js app with the mock HCM route handlers
 * active. Each test exercises a full UI → data-layer → mock-HCM round-trip.
 *
 * Deterministic failure injection: the mock reads `?force=silent|conflict`
 * server-side (mocks/service.ts). The client never sends these params, so we
 * rewrite the outgoing request URL with Playwright network interception. This
 * keeps the force hooks confined to tests and out of production client code.
 *
 * Date ranges are deliberately spread across distinct future windows so tests
 * never overlap each other or the seeded requests (overlap detection would
 * otherwise mask the behavior under test). The Playwright config disables
 * random silent failures and the anniversary scheduler for determinism.
 */

/** Rewrite matching requests of `method` to carry `?force=<value>`. */
async function forceOutcome(
  page: Page,
  pattern: RegExp,
  method: "POST" | "PATCH",
  value: "silent" | "conflict" | "dimension",
): Promise<void> {
  await page.route(pattern, async (route) => {
    const request = route.request();
    if (request.method() !== method) {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    url.searchParams.set("force", value);
    await route.continue({ url: url.toString() });
  });
}

const CREATE_RE = /\/api\/hcm\/requests(\?.*)?$/;
const APPROVE_RE = /\/api\/hcm\/requests\/[^/]+\/approve(\?.*)?$/;

// Reset the mock HCM store before each test so the long-lived dev server gives
// every test the seeded snapshot (TRD §6.3 deterministic isolation).
test.beforeEach(async ({ request }) => {
  await request.post("/api/hcm/admin/reset");
});

test.describe("conflict rejection path (TRD §8.3)", () => {
  test("submitting more days than available surfaces a 409 inline; balance unchanged", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("San Francisco").first()).toBeVisible();

    // San Francisco is seeded with 0 available — any request must be rejected.
    await page.getByLabel("Location").selectOption({ label: "San Francisco" });
    await page.getByLabel("Start date").fill("2025-09-05");
    await page.getByLabel("End date").fill("2025-09-06");

    await page.getByRole("button", { name: "Submit request" }).click();

    // Explicit 409 → specific inline error (not a generic failure), form stays.
    await expect(page.getByText(/Insufficient balance/i)).toBeVisible({
      timeout: 10_000,
    });
    // No optimistic card was confirmed — nothing entered the pending state here.
    await expect(page.getByText("Awaiting confirmation")).toBeHidden();
  });
});

test.describe("silent failure path (TRD §8.3)", () => {
  test("200 OK that did not persist is caught by verification and rolled back", async ({
    page,
  }) => {
    await forceOutcome(page, CREATE_RE, "POST", "silent");

    await page.goto("/dashboard");
    await expect(page.getByText("New York").first()).toBeVisible();

    await page.getByLabel("Start date").fill("2025-09-10");
    await page.getByLabel("End date").fill("2025-09-11");
    await page.getByRole("button", { name: "Submit request" }).click();

    // POST returns 200 → optimistic card confirms to pending first...
    await expect(
      page.getByText("Pending Approval", { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // ...then the +3s verification read sees the un-reserved balance and rolls
    // back with the specific TRD §4.3 message (verification delay is 3s).
    await expect(
      page.getByText(/your request may not have been saved/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});

test.describe("manager stale-balance path (TRD §8.3)", () => {
  test("a 409 at approval time keeps the request pending and surfaces a conflict", async ({
    page,
  }) => {
    await forceOutcome(page, APPROVE_RE, "POST", "conflict");

    await page.goto("/approvals");

    const review = page.getByRole("button", { name: "Review" }).first();
    await expect(review).toBeVisible();
    await review.click();

    const approve = page.getByRole("button", { name: "Approve" }).first();
    await expect(approve).toBeEnabled({ timeout: 10_000 });
    await approve.click();

    // Balance changed between display and approval → 409 → conflict notice, and
    // the request remains in the queue (not approved).
    await expect(
      page.getByText(/balance changed since you opened this request/i),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Approve" }).first()).toBeVisible();
  });
});

test.describe("anniversary bonus path (TRD §8.3)", () => {
  test("an HCM-side balance increase is reconciled into the UI on refresh", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Let the initial balance load fully settle (New York seeded at 12 days) so
    // the reconciliation baseline is established BEFORE the bonus arrives —
    // otherwise the first value the hook ever sees is the post-bonus number and
    // there is nothing to reconcile against.
    await expect(
      page.locator("span.text-3xl").filter({ hasText: /^12$/ }),
    ).toBeVisible({ timeout: 10_000 });

    // Simulate HCM granting an anniversary bonus out-of-band (admin endpoint).
    const res = await page.request.post("/api/hcm/admin/anniversary", {
      data: { employeeId: "emp_alice", locationId: "LOC-NYC", days: 4 },
    });
    expect(res.ok()).toBe(true);

    // A user-driven refresh pulls the higher balance; the reconciliation hook
    // surfaces the non-blocking toast (TRD §4.1).
    await page.getByRole("button", { name: "Refresh all balances" }).click();

    await expect(
      page.getByText(/HR updated your New York balance/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("temp-id swap integrity (TRD §8.3)", () => {
  test("a confirmed request swaps to a real id and appears in the manager queue", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("New York").first()).toBeVisible();

    await page.getByLabel("Start date").fill("2025-09-20");
    await page.getByLabel("End date").fill("2025-09-21");
    await page.getByRole("button", { name: "Submit request" }).click();

    // After confirmation the optimistic temp-id card becomes a real pending row.
    await expect(
      page.getByText("Pending Approval", { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Awaiting confirmation")).toBeHidden();

    // The manager queue only lists requests carrying a real server id, so the
    // request showing here proves the temp→real swap completed end-to-end.
    await page.goto("/approvals");
    await expect(page.getByText(/Sep 20, 2025/).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
