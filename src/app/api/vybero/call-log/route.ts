/**
 * POST /api/vybero/call-log — the voice agent reports a finished call
 * (requires x-vybero-key). GET returns the call log for the admin
 * analytics screen (same-origin clinic pull).
 *
 * POST body: { id?, started_at (ISO), duration_secs, direction?,
 *   caller_name?, caller_phone?, language?, outcome, topics?, questions?,
 *   summary?, appointment_id?, rating? }
 */

import { NextRequest, NextResponse } from "next/server";
import type { VyberoCall } from "@/lib/types";
import {
  agentAuthorized,
  listCalls,
  saveCall,
  VyberoStoreError,
} from "@/lib/server/vyberoStore";

export const maxDuration = 30;

const OUTCOMES = new Set(["booked", "info", "callback", "transferred", "missed"]);

export async function GET() {
  try {
    const calls = await listCalls();
    return NextResponse.json({ calls });
  } catch (err) {
    if (err instanceof VyberoStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[vybero/call-log]", err);
    return NextResponse.json(
      { error: "store_error", message: "Could not list calls." },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!agentAuthorized(req)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid x-vybero-key." },
      { status: 401 }
    );
  }

  let body: Partial<VyberoCall>;
  try {
    body = (await req.json()) as Partial<VyberoCall>;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const startedAt = (body.started_at ?? "").toString();
  if (Number.isNaN(Date.parse(startedAt)) || !OUTCOMES.has(body.outcome ?? "")) {
    return NextResponse.json(
      {
        error: "bad_request",
        message: "started_at (ISO) and a valid outcome are required.",
      },
      { status: 400 }
    );
  }

  const asStrings = (v: unknown, maxLen: number, maxItems: number): string[] =>
    Array.isArray(v)
      ? v
          .filter((x) => typeof x === "string")
          .map((x) => (x as string).slice(0, maxLen))
          .slice(0, maxItems)
      : [];

  try {
    const call: VyberoCall = {
      id: (body.id ?? "").toString() || crypto.randomUUID(),
      started_at: new Date(startedAt).toISOString(),
      duration_secs: Math.max(
        0,
        Math.min(3600, Math.round(Number(body.duration_secs) || 0))
      ),
      direction: body.direction === "outbound" ? "outbound" : "inbound",
      caller_name: body.caller_name?.toString().slice(0, 120),
      caller_phone: body.caller_phone?.toString().slice(0, 40),
      language: body.language?.toString().slice(0, 40),
      outcome: body.outcome!,
      topics: asStrings(body.topics, 40, 12),
      questions: asStrings(body.questions, 200, 12),
      summary: body.summary?.toString().slice(0, 1500),
      appointment_id: body.appointment_id?.toString().slice(0, 80),
      rating:
        typeof body.rating === "number"
          ? Math.max(1, Math.min(5, Math.round(body.rating)))
          : undefined,
    };
    await saveCall(call);
    return NextResponse.json({ ok: true, id: call.id });
  } catch (err) {
    if (err instanceof VyberoStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[vybero/call-log]", err);
    return NextResponse.json(
      { error: "store_error", message: "Could not save the call." },
      { status: 502 }
    );
  }
}
