import { describe, expect, it } from "vitest";
import {
  REDACTED,
  assertNoSensitiveLeak,
  filterByCorrelation,
  groupByService,
  newCorrelationId,
  redactFields,
  redactHeaders,
  runTrail,
} from "./trail";

describe("newCorrelationId", () => {
  it("uses the provided factory", () => {
    expect(newCorrelationId(() => "cid-fixed")).toBe("cid-fixed");
  });
});

describe("redactHeaders", () => {
  it("masks Authorization and Cookie", () => {
    const out = redactHeaders({
      Authorization: "Bearer secret-token",
      Cookie: "session=abc; theme=dark",
      "x-correlation-id": "cid-1",
    });
    expect(out.Authorization).toBe(REDACTED);
    expect(out.Cookie).toBe(REDACTED);
    expect(out["x-correlation-id"]).toBe("cid-1");
  });

  it("masks Set-Cookie case-insensitively", () => {
    const out = redactHeaders({ "Set-Cookie": "a=b" });
    expect(out["Set-Cookie"]).toBe(REDACTED);
  });
});

describe("redactFields", () => {
  it("masks token-like keys recursively", () => {
    const out = redactFields({
      orderId: "ord_1",
      token: "tok_live_x",
      nested: { api_key: "k", ok: true },
    });
    expect(out.token).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).api_key).toBe(REDACTED);
    expect((out.nested as Record<string, unknown>).ok).toBe(true);
    expect(out.orderId).toBe("ord_1");
  });
});

describe("runTrail", () => {
  it("propagates one correlation id across three services", () => {
    const trail = runTrail({
      correlationId: "cid-demo",
      authorization: "Bearer user-jwt",
      cookie: "session=raw",
      now: 1000,
    });
    expect(trail.correlationId).toBe("cid-demo");
    expect(trail.hops.map((h) => h.service)).toEqual([
      "gateway",
      "orders",
      "billing",
    ]);
    expect(trail.hops.every((h) => h.ok)).toBe(true);
    const ids = new Set(trail.logs.map((l) => l.correlationId));
    expect([...ids]).toEqual(["cid-demo"]);
  });

  it("stops at failing service", () => {
    const trail = runTrail({ failAt: "orders", correlationId: "cid-fail" });
    expect(trail.hops.map((h) => h.service)).toEqual(["gateway", "orders"]);
    expect(trail.hops[1].ok).toBe(false);
    expect(trail.hops[1].status).toBe(409);
  });

  it("redacts secrets in the returned log stream", () => {
    const trail = runTrail({
      correlationId: "cid-safe",
      authorization: "Bearer super-secret",
      cookie: "session=rawcookie",
    });
    const leaks = assertNoSensitiveLeak(trail.logs);
    expect(leaks).toEqual([]);
    const authHeaders = trail.logs.flatMap((l) =>
      l.headers ? Object.entries(l.headers) : []
    );
    for (const [k, v] of authHeaders) {
      if (/authorization|cookie|set-cookie/i.test(k)) {
        expect(v).toBe(REDACTED);
      }
    }
  });
});

describe("filter / group", () => {
  it("filters by correlation id and groups by service", () => {
    const a = runTrail({ correlationId: "a", idFactory: () => "a" });
    const b = runTrail({ correlationId: "b", idFactory: () => "b" });
    const merged = [...a.logs, ...b.logs];
    expect(filterByCorrelation(merged, "a")).toHaveLength(a.logs.length);
    const grouped = groupByService(a.logs);
    expect(grouped.gateway.length).toBeGreaterThan(0);
    expect(grouped.orders.length).toBeGreaterThan(0);
    expect(grouped.billing.length).toBeGreaterThan(0);
  });
});
