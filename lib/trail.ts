/**
 * Correlation-ID trail across three synthetic local services
 * with structured log redaction for Authorization / cookies.
 */

export type ServiceName = "gateway" | "orders" | "billing";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type TrailHeaders = Record<string, string>;

export type LogEvent = {
  ts: number;
  service: ServiceName;
  level: LogLevel;
  correlationId: string;
  message: string;
  headers?: TrailHeaders;
  fields?: Record<string, unknown>;
};

export type HopResult = {
  service: ServiceName;
  ok: boolean;
  status: number;
  durationMs: number;
  logs: LogEvent[];
};

export type TrailResult = {
  correlationId: string;
  hops: HopResult[];
  logs: LogEvent[];
};

export const REDACTED = "[REDACTED]";

const SENSITIVE_HEADER = /^(authorization|cookie|set-cookie)$/i;
const SENSITIVE_FIELD =
  /^(authorization|cookie|set-cookie|password|token|access_token|refresh_token|secret|api[_-]?key)$/i;

export function newCorrelationId(rng: () => string = () => crypto.randomUUID()): string {
  return rng();
}

export function redactHeaders(headers: TrailHeaders): TrailHeaders {
  const out: TrailHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADER.test(key) ? REDACTED : value;
  }
  return out;
}

export function redactFields(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_FIELD.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = redactFields(value as Record<string, unknown>);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function redactEvent(event: LogEvent): LogEvent {
  return {
    ...event,
    headers: event.headers ? redactHeaders(event.headers) : undefined,
    fields: event.fields ? redactFields(event.fields) : undefined,
  };
}

export function redactTrail(logs: LogEvent[]): LogEvent[] {
  return logs.map(redactEvent);
}

function log(
  service: ServiceName,
  correlationId: string,
  level: LogLevel,
  message: string,
  extra?: { headers?: TrailHeaders; fields?: Record<string, unknown>; ts?: number }
): LogEvent {
  return {
    ts: extra?.ts ?? Date.now(),
    service,
    level,
    correlationId,
    message,
    headers: extra?.headers,
    fields: extra?.fields,
  };
}

/**
 * Simulate gateway → orders → billing with a shared correlation id.
 * All timing is synthetic; no network I/O.
 */
export function runTrail(options: {
  correlationId?: string;
  authorization?: string;
  cookie?: string;
  orderId?: string;
  failAt?: ServiceName | null;
  now?: number;
  idFactory?: () => string;
}): TrailResult {
  const correlationId =
    options.correlationId ?? newCorrelationId(options.idFactory);
  const base = options.now ?? 1_700_000_000_000;
  const orderId = options.orderId ?? "ord_demo_42";
  const inboundHeaders: TrailHeaders = {
    "x-correlation-id": correlationId,
    "content-type": "application/json",
  };
  if (options.authorization) {
    inboundHeaders.Authorization = options.authorization;
  }
  if (options.cookie) {
    inboundHeaders.Cookie = options.cookie;
  }

  const hops: HopResult[] = [];
  const allLogs: LogEvent[] = [];
  let t = base;

  // --- gateway ---
  {
    const logs: LogEvent[] = [];
    logs.push(
      log("gateway", correlationId, "info", "accepted inbound request", {
        ts: t,
        headers: { ...inboundHeaders },
        fields: { path: "/v1/checkout", method: "POST" },
      })
    );
    t += 4;
    logs.push(
      log("gateway", correlationId, "debug", "forwarding to orders", {
        ts: t,
        headers: {
          "x-correlation-id": correlationId,
          Authorization: options.authorization ?? "Bearer unused",
        },
        fields: { target: "orders", orderId },
      })
    );
    const fail = options.failAt === "gateway";
    const hop: HopResult = {
      service: "gateway",
      ok: !fail,
      status: fail ? 500 : 202,
      durationMs: 6,
      logs,
    };
    hops.push(hop);
    allLogs.push(...logs);
    if (fail) {
      return { correlationId, hops, logs: redactTrail(allLogs) };
    }
  }

  // --- orders ---
  {
    const logs: LogEvent[] = [];
    t += 12;
    logs.push(
      log("orders", correlationId, "info", "create order draft", {
        ts: t,
        headers: {
          "x-correlation-id": correlationId,
          Cookie: options.cookie ?? "session=abc",
        },
        fields: { orderId, items: 2 },
      })
    );
    t += 9;
    const fail = options.failAt === "orders";
    if (fail) {
      logs.push(
        log("orders", correlationId, "error", "inventory reservation failed", {
          ts: t,
          fields: { orderId, reason: "sku_out_of_stock" },
        })
      );
    } else {
      logs.push(
        log("orders", correlationId, "info", "calling billing.authorize", {
          ts: t,
          headers: {
            "x-correlation-id": correlationId,
            Authorization: "Bearer svc-orders-to-billing",
          },
          fields: { orderId, amountCents: 4299 },
        })
      );
    }
    const hop: HopResult = {
      service: "orders",
      ok: !fail,
      status: fail ? 409 : 201,
      durationMs: 21,
      logs,
    };
    hops.push(hop);
    allLogs.push(...logs);
    if (fail) {
      return { correlationId, hops, logs: redactTrail(allLogs) };
    }
  }

  // --- billing ---
  {
    const logs: LogEvent[] = [];
    t += 15;
    logs.push(
      log("billing", correlationId, "info", "authorize payment", {
        ts: t,
        headers: {
          "x-correlation-id": correlationId,
          Authorization: "Bearer svc-billing",
          "Set-Cookie": "billing_csrf=xyz; HttpOnly",
        },
        fields: {
          orderId,
          amountCents: 4299,
          token: "tok_live_should_not_leak",
        },
      })
    );
    t += 11;
    const fail = options.failAt === "billing";
    if (fail) {
      logs.push(
        log("billing", correlationId, "error", "card declined", {
          ts: t,
          fields: { orderId, code: "card_declined" },
        })
      );
    } else {
      logs.push(
        log("billing", correlationId, "info", "payment authorized", {
          ts: t,
          fields: { orderId, authCode: "AUTH-77" },
        })
      );
    }
    const hop: HopResult = {
      service: "billing",
      ok: !fail,
      status: fail ? 402 : 200,
      durationMs: 26,
      logs,
    };
    hops.push(hop);
    allLogs.push(...logs);
  }

  return { correlationId, hops, logs: redactTrail(allLogs) };
}

export function filterByCorrelation(
  logs: LogEvent[],
  correlationId: string
): LogEvent[] {
  return logs.filter((l) => l.correlationId === correlationId);
}

export function groupByService(
  logs: LogEvent[]
): Record<ServiceName, LogEvent[]> {
  const groups: Record<ServiceName, LogEvent[]> = {
    gateway: [],
    orders: [],
    billing: [],
  };
  for (const event of logs) {
    groups[event.service].push(event);
  }
  return groups;
}

export function assertNoSensitiveLeak(logs: LogEvent[]): string[] {
  const leaks: string[] = [];
  const rawSensitive =
    /(Bearer\s+\S+|session=\S+|tok_live_\S+|billing_csrf=\S+)/i;

  for (const event of logs) {
    const blob = JSON.stringify(event);
    if (rawSensitive.test(blob) && !blob.includes(REDACTED)) {
      leaks.push(`${event.service}:${event.message}`);
    }
    // Also fail if redaction token missing where headers existed
    if (event.headers) {
      for (const [k, v] of Object.entries(event.headers)) {
        if (SENSITIVE_HEADER.test(k) && v !== REDACTED) {
          leaks.push(`header ${k} not redacted`);
        }
      }
    }
    if (event.fields) {
      for (const [k, v] of Object.entries(event.fields)) {
        if (SENSITIVE_FIELD.test(k) && v !== REDACTED) {
          leaks.push(`field ${k} not redacted`);
        }
      }
    }
  }
  return leaks;
}
