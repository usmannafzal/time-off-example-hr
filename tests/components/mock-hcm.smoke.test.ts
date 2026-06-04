import { describe, expect, it } from "vitest";
import { balancesResponseSchema, type BalanceDto } from "@/lib/hcm/contracts";

const BASE = "http://localhost";
const alice = { "x-employee-id": "emp_alice", "content-type": "application/json" };

async function getBalances() {
  const res = await fetch(`${BASE}/api/hcm/balances`, { headers: alice });
  expect(res.status).toBe(200);
  // The client validates with this schema; a negative counter would throw here
  // and surface as a failed balances fetch in the UI.
  const parsed = balancesResponseSchema.parse(await res.json());
  return parsed.balances;
}

function nyc(balances: BalanceDto[]) {
  return balances.find((b) => b.locationId === "LOC-NYC")!;
}

/** Compare the numeric counters only (`fetchedAt` changes on every read). */
function counters(b: BalanceDto) {
  return { available: b.available, used: b.used, pending: b.pending };
}

describe("mock HCM (store + service + MSW)", () => {
  it("returns seeded balances for the authenticated employee", async () => {
    const res = await fetch(`${BASE}/api/hcm/balances`, { headers: alice });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.employeeId).toBe("emp_alice");
    expect(body.balances).toHaveLength(3);
    const nyc = body.balances.find((b: { locationId: string }) => b.locationId === "LOC-NYC");
    expect(nyc.available).toBe(12);
  });

  it("files a new request as pending with a real id — never approved", async () => {
    const res = await fetch(`${BASE}/api/hcm/requests`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({
        employeeId: "emp_alice",
        locationId: "LOC-NYC",
        startDate: "2025-08-01",
        endDate: "2025-08-02",
        days: 2,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pending");
    expect(body.id).toMatch(/^req_/);
    expect(body.id).not.toMatch(/^temp_/);
  });

  it("returns 409 INSUFFICIENT_BALANCE when days exceed availability", async () => {
    const res = await fetch(`${BASE}/api/hcm/requests`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({
        employeeId: "emp_alice",
        locationId: "LOC-LON",
        startDate: "2025-08-01",
        endDate: "2025-08-10",
        days: 99,
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_BALANCE");
    expect(body.available).toBe(5);
    expect(body.requested).toBe(99);
  });

  it("returns 422 for an invalid (employee, location) dimension", async () => {
    const res = await fetch(`${BASE}/api/hcm/balance/LOC-TOKYO`, { headers: alice });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("INVALID_DIMENSION");
  });

  it("forces a silent failure: 200 OK but balance unchanged", async () => {
    const before = await (
      await fetch(`${BASE}/api/hcm/balance/LOC-NYC`, { headers: alice })
    ).json();
    const res = await fetch(`${BASE}/api/hcm/requests?force=silent`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({
        employeeId: "emp_alice",
        locationId: "LOC-NYC",
        startDate: "2025-08-01",
        endDate: "2025-08-02",
        days: 2,
      }),
    });
    expect(res.status).toBe(200);
    const after = await (
      await fetch(`${BASE}/api/hcm/balance/LOC-NYC`, { headers: alice })
    ).json();
    // Silent failure must NOT have reserved any days.
    expect(after.available).toBe(before.available);
  });

  it("cancelling a seeded pending request keeps balances valid (no negative pending)", async () => {
    const before = nyc(await getBalances());

    const res = await fetch(`${BASE}/api/hcm/requests/req_pending_1`, {
      method: "PATCH",
      headers: alice,
      body: JSON.stringify({ status: "cancelled" }),
    });
    expect(res.status).toBe(200);

    // getBalances() re-parses with the real schema; pre-fix this threw because
    // `pending` underflowed below zero (TRD balance non-negativity).
    const after = nyc(await getBalances());
    expect(after.pending).toBeGreaterThanOrEqual(0);
    expect(after.pending).toBe(before.pending - 3);
    expect(after.available).toBe(before.available + 3);
  });

  it("editing a seeded pending request re-reserves and keeps balances valid", async () => {
    const before = nyc(await getBalances());

    const res = await fetch(`${BASE}/api/hcm/requests/req_pending_1`, {
      method: "PATCH",
      headers: alice,
      body: JSON.stringify({
        startDate: "2025-07-01",
        endDate: "2025-07-05",
        days: 5, // was 3
      }),
    });
    expect(res.status).toBe(200);

    const after = nyc(await getBalances());
    // +2 days reserved: pending up 2, available down 2, both non-negative.
    expect(after.pending).toBe(before.pending + 2);
    expect(after.available).toBe(before.available - 2);
  });

  it("approving then cancelling returns days from used without going negative", async () => {
    const before = nyc(await getBalances());

    await fetch(`${BASE}/api/hcm/requests/req_pending_1/approve`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({ by: "Dana Manager" }),
    });
    // After approval the reserved days move pending → used.
    const approved = nyc(await getBalances());
    expect(approved.pending).toBe(before.pending - 3);
    expect(approved.used).toBe(before.used + 3);

    const res = await fetch(`${BASE}/api/hcm/requests/req_pending_1`, {
      method: "PATCH",
      headers: alice,
      body: JSON.stringify({ status: "cancelled" }),
    });
    expect(res.status).toBe(200);

    // Cancelling an approved request must return days from `used`, not `pending`.
    const after = nyc(await getBalances());
    expect(after.used).toBe(before.used);
    expect(after.available).toBe(before.available + 3);
    expect(after.pending).toBe(approved.pending);
    expect(after.pending).toBeGreaterThanOrEqual(0);
  });

  it("approving commits days from the reservation and keeps balances valid", async () => {
    const before = nyc(await getBalances()); // available 12, pending 3, used 8

    const res = await fetch(`${BASE}/api/hcm/requests/req_pending_1/approve`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({ by: "Dana Manager" }),
    });
    expect(res.status).toBe(200);

    const after = nyc(await getBalances());
    expect(after.pending).toBe(before.pending - 3); // reservation consumed
    expect(after.used).toBe(before.used + 3);
    expect(after.pending).toBeGreaterThanOrEqual(0);
    expect(after.available).toBeGreaterThanOrEqual(0);
  });

  it("rejects an approval that would exceed the remaining balance (409, no mutation)", async () => {
    const before = nyc(await getBalances());

    // `force=conflict` models the balance being insufficient at decision time —
    // e.g. another request for the same employee was just approved in parallel.
    const res = await fetch(
      `${BASE}/api/hcm/requests/req_pending_1/approve?force=conflict`,
      {
        method: "POST",
        headers: alice,
        body: JSON.stringify({ by: "Dana Manager" }),
      },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("INSUFFICIENT_BALANCE");

    // The rejected approval must not have changed the balance or the request.
    const after = nyc(await getBalances());
    expect(counters(after)).toEqual(counters(before));
    const reqRes = await fetch(`${BASE}/api/hcm/requests/req_pending_1`, {
      headers: alice,
    });
    expect((await reqRes.json()).status).toBe("pending");
  });

  it("manager queue (scope=pending) lists pending first, then cancelled", async () => {
    const res = await fetch(`${BASE}/api/hcm/requests?scope=pending`, {
      headers: alice,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      requests: { id: string; status: string }[];
    };
    const statuses = body.requests.map((r) => r.status);

    // Both seeded pending requests (alice + ben) and the cancelled one appear.
    expect(statuses.filter((s) => s === "pending").length).toBeGreaterThanOrEqual(2);
    expect(statuses).toContain("cancelled");

    // Every pending entry must come before every cancelled entry.
    const lastPending = statuses.lastIndexOf("pending");
    const firstCancelled = statuses.indexOf("cancelled");
    expect(lastPending).toBeLessThan(firstCancelled);

    // The queue never surfaces approved or denied requests.
    expect(statuses).not.toContain("approved");
    expect(statuses).not.toContain("denied");
  });

  it("rejects a new request that overlaps an existing active request (409 OVERLAPPING_LEAVE)", async () => {
    // Seeded req_pending_1 is emp_alice / LOC-NYC / 2025-07-01..07-03 (pending).
    const res = await fetch(`${BASE}/api/hcm/requests`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({
        employeeId: "emp_alice",
        locationId: "LOC-NYC",
        startDate: "2025-07-02",
        endDate: "2025-07-04",
        days: 3,
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("OVERLAPPING_LEAVE");
    expect(body.conflictStart).toBeTruthy();
    expect(body.conflictEnd).toBeTruthy();
  });

  it("detects overlap across locations (can't be on leave twice the same day)", async () => {
    // Overlaps the NYC pending request even though this request is for London.
    const res = await fetch(`${BASE}/api/hcm/requests`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({
        employeeId: "emp_alice",
        locationId: "LOC-LON",
        startDate: "2025-07-02",
        endDate: "2025-07-03",
        days: 2,
      }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("OVERLAPPING_LEAVE");
  });

  it("does not block dates that only overlap a cancelled/denied request", async () => {
    // Cancel the seeded pending request, freeing its dates...
    await fetch(`${BASE}/api/hcm/requests/req_pending_1`, {
      method: "PATCH",
      headers: alice,
      body: JSON.stringify({ status: "cancelled" }),
    });
    // ...then a request on those same dates is accepted.
    const res = await fetch(`${BASE}/api/hcm/requests`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({
        employeeId: "emp_alice",
        locationId: "LOC-NYC",
        startDate: "2025-07-01",
        endDate: "2025-07-02",
        days: 2,
      }),
    });
    expect(res.status).toBe(201);
  });

  it("approve is the only path to approved status", async () => {
    const created = await (
      await fetch(`${BASE}/api/hcm/requests`, {
        method: "POST",
        headers: alice,
        body: JSON.stringify({
          employeeId: "emp_alice",
          locationId: "LOC-NYC",
          startDate: "2025-08-01",
          endDate: "2025-08-02",
          days: 2,
        }),
      })
    ).json();

    const approved = await fetch(`${BASE}/api/hcm/requests/${created.id}/approve`, {
      method: "POST",
      headers: alice,
      body: JSON.stringify({ by: "Dana Manager" }),
    });
    expect(approved.status).toBe(200);
    const body = await approved.json();
    expect(body.status).toBe("approved");
    expect(body.approvedBy).toBe("Dana Manager");
  });
});
