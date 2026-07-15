/**
 * /api/vybero/call-log
 *  GET  — the signed-in clinic's call log (admin analytics). Session-scoped.
 *  POST — the voice agent reports a finished call (x-vybero-key + x-clinic).
 */

import { NextRequest, NextResponse } from "next/server";
import type { VyberoCall } from "@/lib/types";
import { getSession } from "@/lib/server/auth";
import { agentKeyValid, resolveAgentClinic } from "@/lib/server/agentAuth";
import { listCalls, saveCall, VyberoStoreError } from "@/lib/server/vyberoStore";

export const maxDuration = 30;

const OUTCOMES = new Set(["booked", "info", "callback", "transferred", "missed"]);

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const calls = await listCalls(session.cid);
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
  if (!agentKeyValid(req)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid x-vybero-key." },
      { status: 401 }
    );
  }

  let body: Partial<VyberoCall> & { clinic?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const clinicId = await resolveAgentClinic(req, body.clinic);
  if (!clinicId) {
    return NextResponse.json(
      { error: "bad_request", message: "Unknown or missing clinic (x-clinic header)." },
      { status: 400 }
    );
  }

  const startedAt = (body.started_at ?? "").toString();
  if (Number.isNaN(Date.parse(startedAt)) || !OUTCOMES.has(body.outcome ?? "")) {
    return NextResponse.json(
      { error: "bad_request", message: "started_at (ISO) and a valid outcome are required." },
      { status: 400 }
    );
  }

  const asStrings = (v: unknown, maxLen: number, maxItems: number): string[] =>
    Array.isArray(v)
      ? v.filter((x) => typeof x === "string").map((x) => (x as string).slice(0, maxLen)).slice(0, maxItems)
      : [];

  try {
    const call: VyberoCall = {
      id: (body.id ?? "").toString() || crypto.randomUUID(),
      started_at: new Date(startedAt).toISOString(),
      duration_secs: Math.max(0, Math.min(3600, Math.round(Number(body.duration_secs) || 0))),
      direction: body.direction === "outbound" ? "outbound" : "inbound",
      caller_name: body.caller_name?.toString().slice(0, 120),
      caller_phone: body.caller_phone?.toString().slice(0, 40),
      language: body.language?.toString().slice(0, 40),
      outcome: body.outcome!,
      topics: asStrings(body.topics, 40, 12),
      questions: asStrings(body.questions, 200, 12),
      summary: body.summary?.toString().slice(0, 1500),
      appointment_id: body.appointment_id?.toString().slice(0, 80),
      rating: typeof body.rating === "number" ? Math.max(1, Math.min(5, Math.round(body.rating))) : undefined,
    };
    await saveCall(clinicId, call);
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
