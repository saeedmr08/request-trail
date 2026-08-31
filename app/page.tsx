"use client";

import { useCallback, useEffect, useState } from "react";
import type { ServiceName, TrailResult } from "@/lib/trail";

const EXAMPLES: {
  label: string;
  failAt: ServiceName | "none";
  auth: string;
  cookie: string;
}[] = [
  {
    label: "Happy path",
    failAt: "none",
    auth: "Bearer demo-user-token",
    cookie: "session=demo; theme=dusk",
  },
  {
    label: "Fail at orders",
    failAt: "orders",
    auth: "Bearer demo-user-token",
    cookie: "session=demo; theme=dusk",
  },
  {
    label: "Fail at billing",
    failAt: "billing",
    auth: "Bearer checkout-token",
    cookie: "session=pay; cart=1",
  },
];

export default function HomePage() {
  const [auth, setAuth] = useState("Bearer demo-user-token");
  const [cookie, setCookie] = useState("session=demo; theme=dusk");
  const [failAt, setFailAt] = useState<ServiceName | "none">("none");
  const [trail, setTrail] = useState<TrailResult | null>(null);
  const [history, setHistory] = useState<TrailResult[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/trace");
      if (!res.ok) throw new Error("Failed to load traces");
      const json = await res.json();
      const traces = Array.isArray(json.traces) ? json.traces : [];
      setHistory(traces);
      setSavedAt(json.savedAt || null);
      setTrail((current) => current ?? traces[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (override?: {
    auth?: string;
    cookie?: string;
    failAt?: ServiceName | "none";
  }) => {
    setBusy(true);
    setError(null);
    const nextAuth = override?.auth ?? auth;
    const nextCookie = override?.cookie ?? cookie;
    const nextFail = override?.failAt ?? failAt;
    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorization: nextAuth,
          cookie: nextCookie,
          failAt: nextFail === "none" ? null : nextFail,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Trace failed");
      setTrail(json.trail);
      setSavedAt(json.savedAt ?? null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trace failed");
    } finally {
      setBusy(false);
    }
  };

  const runFailureExample = async () => {
    const ex = EXAMPLES.find((e) => e.failAt === "orders")!;
    setAuth(ex.auth);
    setCookie(ex.cookie);
    setFailAt(ex.failAt);
    await run({ auth: ex.auth, cookie: ex.cookie, failAt: ex.failAt });
  };

  if (loading) {
    return (
      <main>
        <p className="note">Loading persisted traces…</p>
      </main>
    );
  }

  return (
    <main>
      <div className="brand">Saeed Rumaneh · RequestTrail</div>
      <h1>One ID. Three services. Redacted logs.</h1>
      <p className="lede">
        A checkout request hops gateway → orders → billing via{" "}
        <code>POST /api/trace</code>. Every structured log line carries the same
        correlation ID. Authorization, Cookie, Set-Cookie, and token fields are
        scrubbed before they hit the viewer. Last runs persist in{" "}
        <code>data/traces.json</code>.
      </p>

      <div className="toolbar">
        <label>
          Authorization header
          <input value={auth} onChange={(e) => setAuth(e.target.value)} />
        </label>
        <label>
          Cookie header
          <input value={cookie} onChange={(e) => setCookie(e.target.value)} />
        </label>
        <label>
          Fail at
          <select
            value={failAt}
            onChange={(e) =>
              setFailAt(e.target.value as ServiceName | "none")
            }
          >
            <option value="none">None (happy path)</option>
            <option value="gateway">gateway</option>
            <option value="orders">orders</option>
            <option value="billing">billing</option>
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => void run()}>
          Run trail
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runFailureExample()}
        >
          Example failure (orders)
        </button>
      </div>

      <div className="toolbar">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            disabled={busy}
            onClick={() => {
              setAuth(ex.auth);
              setCookie(ex.cookie);
              setFailAt(ex.failAt);
            }}
          >
            Example: {ex.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="note" style={{ color: "#f07178" }} role="alert">
          {error}
        </p>
      ) : null}
      {savedAt ? (
        <p className="note">
          Last persisted: {savedAt} · {history.length} trace(s)
        </p>
      ) : (
        <p className="note">
          No traces yet — click Run trail or Example failure to persist redacted
          logs.
        </p>
      )}

      {history.length > 1 && (
        <div className="toolbar">
          <span className="note">History</span>
          {history.slice(0, 5).map((t) => (
            <button
              key={t.correlationId}
              type="button"
              onClick={() => setTrail(t)}
            >
              {t.correlationId.slice(0, 18)}…
            </button>
          ))}
        </div>
      )}

      {trail ? (
        <>
          <div className="cid">correlation_id = {trail.correlationId}</div>

          <div className="hops">
            {trail.hops.map((hop) => (
              <div className={`hop ${hop.ok ? "" : "bad"}`} key={hop.service}>
                <h2>{hop.service}</h2>
                <div className="status">
                  HTTP {hop.status} · {hop.durationMs} ms ·{" "}
                  {hop.ok ? "ok" : "failed"}
                </div>
              </div>
            ))}
          </div>

          <div className="log-list">
            {trail.logs.map((event, i) => (
              <div className="log-row" key={`${event.ts}-${i}`}>
                <div className="svc">{event.service}</div>
                <div className={`lvl ${event.level}`}>{event.level}</div>
                <div className="msg">
                  {event.message}
                  {(event.headers || event.fields) && (
                    <pre>
                      {JSON.stringify(
                        {
                          headers: event.headers,
                          fields: event.fields,
                        },
                        null,
                        2
                      )}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="note">
          Empty trail viewer — run a trace to see redacted hops and logs.
        </p>
      )}

      <p className="note">
        Demo secrets only. See SECURITY.md — this is not a production redaction
        pipeline.
      </p>
    </main>
  );
}
