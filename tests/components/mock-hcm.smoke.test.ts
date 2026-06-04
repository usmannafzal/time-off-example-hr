import { describe, expect, it } from "vitest";

const BASE = "http://localhost";
const alice = { "x-employee-id": "emp_alice", "content-type": "application/json" };

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
        startDate: "2025-07-01",
        endDate: "2025-07-02",
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
        startDate: "2025-07-01",
        endDate: "2025-07-10",
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
        startDate: "2025-07-01",
        endDate: "2025-07-02",
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

  it("approve is the only path to approved status", async () => {
    const created = await (
      await fetch(`${BASE}/api/hcm/requests`, {
        method: "POST",
        headers: alice,
        body: JSON.stringify({
          employeeId: "emp_alice",
          locationId: "LOC-NYC",
          startDate: "2025-07-01",
          endDate: "2025-07-02",
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
