/**
 * POST /api/vybero/elevenlabs-webhook - ElevenLabs post-call webhook sink.
 *
 * Fires after every Noor conversation with the full transcript + analysis.
 * We translate ElevenLabs' payload into our VyberoCall shape so the calls
 * land in the same store the Analytics dashboard already reads - real call
 * history, not seeded.
 *
 * Auth (either):
 *   1. ?key=<VYBERO_API_KEY> on the webhook URL - the documented-and-certain
 *      route, since ElevenLabs' HMAC header format is not published.
 *   2. HMAC: set ELEVENLABS_WEBHOOK_SECRET and we verify the
 *      `elevenlabs-signature: t=<unix>,v0=<hex>` header (sha256 over
 *      "<t>.<rawBody>", timing-safe, 30-minute replay window). When that
 *      secret is set it becomes mandatory.
 *
 * Payload reference (elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks):
 *   { type: "post_call_transcription", event_timestamp, data: {
 *       agent_id, conversation_id, status, transcript: [{role, message,
 *       time_in_call_secs, tool_calls, ...}], metadata: {
 *       start_time_unix_secs, call_duration_secs, ... }, analysis: {
 *       transcript_summary, call_successful, data_collection_results, ... } } }
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import type { CallOutcome, VyberoCall } from "@/lib/types";
import { resolveAgentClinic } from "@/lib/server/agentAuth";
import { saveCall, VyberoStoreError } from "@/lib/server/vyberoStore";
import { detectTopics } from "@/lib/vyberoAnalytics";

export const runtime = "nodejs";
export const maxDuration = 30;

// --- ElevenLabs payload (only the fields we consume) --------------------
interface ElevenTurn {
  role?: string;
  message?: string | null;
  time_in_call_secs?: number;
  tool_calls?: Array<{
    tool_name?: string;
    name?: string;
    params_as_json?: string;
    request_id?: string;
  }> | null;
}

interface ElevenPayload {
  type?: string;
  event_timestamp?: number;
  data?: {
    agent_id?: string;
    conversation_id?: string;
    status?: string;
    transcript?: ElevenTurn[];
    metadata?: {
      start_time_unix_secs?: number;
      call_duration_secs?: number;
      termination_reason?: string;
      phone_call?: {
        direction?: string;
        external_number?: string;
      } | null;
    };
    analysis?: {
      transcript_summary?: string;
      call_successful?: string;
      data_collection_results?: Record<
        string,
        { value?: unknown; rationale?: string } | unknown
      >;
    };
    conversation_initiation_client_data?: {
      dynamic_variables?: Record<string, unknown>;
    };
  };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** `t=<unix>,v0=<hex>` - sha256 over "<t>.<rawBody>". */
function hmacValid(secret: string, header: string | null, rawBody: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  ) as { t?: string; v0?: string };
  if (!parts.t || !parts.v0) return false;

  const ts = Number(parts.t);
  if (!Number.isFinite(ts)) return false;
  // replay window: 30 minutes either side
  if (Math.abs(Date.now() / 1000 - ts) > 1800) return false;

  const expected = createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");
  return safeEqual(parts.v0.replace(/^v0=/, ""), expected);
}

/** Pull a named value out of ElevenLabs' data_collection_results. */
function collected(
  results: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  if (!results) return undefined;
  for (const key of Object.keys(results)) {
    if (!keys.some((k) => key.toLowerCase().includes(k))) continue;
    const entry = results[key] as { value?: unknown } | string | undefined;
    const value =
      typeof entry === "object" && entry !== null && "value" in entry
        ? (entry as { value?: unknown }).value
        : entry;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  // raw body first: HMAC must hash exactly what was sent
  const rawBody = await req.text();

  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  const urlKey = req.nextUrl.searchParams.get("key") ?? "";
  const apiKey = process.env.VYBERO_API_KEY ?? "";

  if (secret) {
    if (!hmacValid(secret, req.headers.get("elevenlabs-signature"), rawBody)) {
      return NextResponse.json({ error: "bad_signature" }, { status: 401 });
    }
  } else if (!apiKey || !safeEqual(urlKey, apiKey)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Append ?key=<VYBERO_API_KEY> to the webhook URL." },
      { status: 401 }
    );
  }

  let body: ElevenPayload;
  try {
    body = JSON.parse(rawBody) as ElevenPayload;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Only transcription events carry a finished conversation.
  if (body.type && body.type !== "post_call_transcription") {
    return NextResponse.json({ ok: true, ignored: body.type });
  }
  const d = body.data;
  if (!d) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const clinicId = await resolveAgentClinic(req);
  if (!clinicId) {
    return NextResponse.json({ error: "unknown_clinic" }, { status: 400 });
  }

  try {
    const meta = d.metadata ?? {};
    const analysis = d.analysis ?? {};
    const transcript = Array.isArray(d.transcript) ? d.transcript : [];

    // Did she actually book? The tool call in the transcript is the truth,
    // not the model's closing words.
    const toolNames = transcript.flatMap((t) =>
      (t.tool_calls ?? []).map((c) => (c.tool_name ?? c.name ?? "").toLowerCase())
    );
    const booked = toolNames.some((n) => n.includes("book"));

    const successful = (analysis.call_successful ?? "").toLowerCase();
    const outcome: CallOutcome = booked
      ? "booked"
      : successful === "failure"
        ? "callback"
        : meta.termination_reason?.toLowerCase().includes("error")
          ? "missed"
          : "info";

    // The caller's own questions, verbatim-ish, for the analytics mining.
    const questions = transcript
      .filter((t) => t.role === "user" && typeof t.message === "string")
      .map((t) => (t.message as string).trim())
      .filter((m) => m.includes("?") && m.length > 8)
      .slice(0, 8)
      .map((m) => m.slice(0, 200));

    const collectedResults = analysis.data_collection_results as
      | Record<string, unknown>
      | undefined;
    const dyn = d.conversation_initiation_client_data?.dynamic_variables ?? {};

    const summary = (analysis.transcript_summary ?? "").slice(0, 1500);
    // Reuse the CAPTURE topic taxonomy the dashboard already charts.
    const topics = detectTopics(
      `${summary} ${questions.join(" ")} ${toolNames.join(" ")}`
    );

    const startUnix = meta.start_time_unix_secs;
    const startedAt = startUnix
      ? new Date(startUnix * 1000).toISOString()
      : new Date((body.event_timestamp ?? Date.now() / 1000) * 1000).toISOString();

    const call: VyberoCall = {
      // conversation_id keeps re-deliveries idempotent (upsert by id)
      id: d.conversation_id ? `el_${d.conversation_id}` : crypto.randomUUID(),
      started_at: startedAt,
      duration_secs: Math.max(0, Math.min(3600, Math.round(meta.call_duration_secs ?? 0))),
      direction: meta.phone_call?.direction === "outbound" ? "outbound" : "inbound",
      caller_name:
        collected(collectedResults, ["name", "customer", "caller"]) ??
        (typeof dyn.customer_name === "string" ? dyn.customer_name : undefined),
      caller_phone:
        meta.phone_call?.external_number ??
        collected(collectedResults, ["phone", "number", "whatsapp"]),
      language: collected(collectedResults, ["language"]) ?? "English",
      outcome,
      topics,
      questions,
      summary: summary || "Voice conversation with Noor.",
    };

    await saveCall(clinicId, call);
    return NextResponse.json({ ok: true, id: call.id, outcome });
  } catch (err) {
    if (err instanceof VyberoStoreError) {
      return NextResponse.json({ error: err.code }, { status: 502 });
    }
    console.error("[elevenlabs-webhook]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
