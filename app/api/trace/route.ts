import { NextRequest, NextResponse } from "next/server";
import { appendTrace, readTraces } from "@/lib/traces-store";
import { runTrail, type ServiceName } from "@/lib/trail";

export const runtime = "nodejs";

const SERVICES: ServiceName[] = ["gateway", "orders", "billing"];

/** GET /api/trace — last persisted traces. */
export async function GET() {
  const stored = await readTraces();
  return NextResponse.json(stored);
}

/**
 * POST /api/trace — run the 3-service simulation and persist to data/traces.json.
 */
export async function POST(request: NextRequest) {
  let body: {
    authorization?: string;
    cookie?: string;
    orderId?: string;
    failAt?: ServiceName | null | "none";
    correlationId?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  let failAt: ServiceName | null = null;
  if (body.failAt && body.failAt !== "none") {
    if (!SERVICES.includes(body.failAt)) {
      return NextResponse.json(
        { error: "failAt must be gateway | orders | billing | none" },
        { status: 400 }
      );
    }
    failAt = body.failAt;
  }

  const trail = runTrail({
    authorization: body.authorization ?? "Bearer demo-user-token",
    cookie: body.cookie ?? "session=demo; theme=dusk",
    orderId: body.orderId,
    failAt,
    correlationId: body.correlationId,
  });

  const stored = await appendTrace(trail);

  return NextResponse.json({
    ok: true,
    trail,
    savedAt: stored.savedAt,
    traceCount: stored.traces.length,
  });
}
