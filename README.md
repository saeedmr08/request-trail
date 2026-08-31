# RequestTrail

Follow a **correlation ID** across three synthetic local services (`gateway` → `orders` → `billing`) and inspect structured logs with **Authorization / cookie redaction**.

## Features

- In-process trail via `POST /api/trace` (no live network hops)
- Shared `x-correlation-id` on every hop
- Structured log viewer
- Redacts `Authorization`, `Cookie`, `Set-Cookie`, and common token field names
- Optional failure injection per service
- Persists last traces to `data/traces.json`

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test
npm run typecheck
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/trace` | Run 3-service simulation; append to `data/traces.json` |
| `GET` | `/api/trace` | Load persisted traces |

```bash
curl -X POST http://localhost:3000/api/trace \
  -H 'Content-Type: application/json' \
  -d '{"authorization":"Bearer demo","cookie":"session=x","failAt":null}'
```

Body fields: `authorization`, `cookie`, `orderId`, `failAt` (`gateway` \| `orders` \| `billing` \| `null`), `correlationId`.

## Library

`lib/trail.ts` — `runTrail`, `redactHeaders`, `redactFields`, `filterByCorrelation`, `assertNoSensitiveLeak`.

Uses Web Crypto `crypto.randomUUID` (no `node:crypto` import).

## Security

See [SECURITY.md](./SECURITY.md).

## Author

Saeed Rumaneh · MIT License · 2026

## Complete product flows

1. Click **Run trail** (happy path) — three hops share one correlation ID; secrets show as `[REDACTED]`.
2. Click **Example failure (orders)** — trail stops at orders with an error log and persists.
3. Reload — history loads from `data/traces.json`; pick a prior correlation ID to re-open logs.
