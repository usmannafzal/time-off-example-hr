import { test, expect } from "@playwright/test";

/**
 * Layer 3 — integration tests against the running app with the mock HCM route
 * handlers active (TRD §8.3). The Playwright config disables random silent
 * failures and the anniversary scheduler so these flows are deterministic.
 */

// Reset the mock HCM store before each test so a reused dev server starts from
// the seeded snapshot every time (TRD §6.3).
test.beforeEach(async ({ request }) => {
  await request.post("/api/hcm/admin/reset");
});

test.describe("employee leave request", () => {
  test("submit a request → confirmed pending card appears", async ({ page }) => {
    await page.goto("/dashboard");

    // Balances load (New York is seeded).
    await expect(page.getByText("New York").first()).toBeVisible();

    // Fill the new-request form (defaults to the first location, New York).
    await page.getByLabel("Start date").fill("2025-09-01");
    await page.getByLabel("End date").fill("2025-09-02");

    const submit = page.getByRole("button", { name: "Submit request" });
    await expect(submit).toBeEnabled();
    await submit.click();

    // The request list gains a Pending Approval card (post-confirmation).
    await expect(
      page.getByText("Pending Approval", { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("manager approvals", () => {
  test("a seeded pending request can be reviewed and approved", async ({ page }) => {
    await page.goto("/approvals");

    // Seeded pending requests render with a Review affordance.
    const review = page.getByRole("button", { name: "Review" }).first();
    await expect(review).toBeVisible();
    await review.click();

    // Opening review triggers a fresh balance read; Approve becomes enabled.
    const approve = page.getByRole("button", { name: "Approve" }).first();
    await expect(approve).toBeEnabled({ timeout: 10_000 });
    await approve.click();

    // After approval the queue updates (the approved item leaves "pending").
    await expect(page.getByText(/just fetched/i).first()).toBeHidden({
      timeout: 10_000,
    });
  });
});
