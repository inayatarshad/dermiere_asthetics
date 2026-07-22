/**
 * GET /api/vybero/sync-elevenlabs — pull Noor's call history from the
 * ElevenLabs API into the analytics call log.
 *
 * The push path (post-call webhook) is real-time; THIS route is the pull
 * path that makes call history part of the system without any ElevenLabs
 * dashboard configuration: Vercel Cron hits it daily, and the VYBERO page
 * has a "Sync calls" button for on-demand refresh. Both paths write the
 * same id (el_<conversation_id>), so they coexist idempotently.
 *
 * Requires ELEVENLABS_API_KEY in the environment. Callers:
 *   - Vercel Cron (Authorization: Bearer <CRON_SECRET>, when set)
 *   - signed-in admins (session cookie — the page button)
 *   - ?key=<VYBERO_API_KEY> for manual/scripted runs
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import type { CallOutcome, VyberoCall } from "@/lib/types";
import { getSession } from "@/lib/server/auth";
import { listClinicConfigs, ensureSeedClinic } from "@/lib/server/clinicStore";
import { listCalls, saveCall } from "@/lib/server/vyberoStore";
import { detectTopics } from "@/lib/vyberoAnalytics";

export const runtime = "nodejs";
export const maxDuration = 60;

const EL_BASE = "https://api.elevenlabs.io";
const LOOKBACK_DAYS = 30;
const DETAIL_FETCH_CAP = 25;

// ---- ElevenLabs shapes (fields we consume) ----------------------------
interface ElConversationListItem {
  conversation_id?: string;
  agent_id?: string;
  start_time_unix_secs?: number;
  call_duration_secs?: number;
  status?: string;
  call_successful?: string;
  transcript_summary?: string;
}

interface ElConversationDetail {
  conversation_id?: string;
  transcript?: Array<{
    role?: string;
    message?: string | null;
    tool_calls?: Array<{ tool_name?: string; name?: string }> | null;
  }>;
  metadata?: {
    start_time_unix_secs?: number;
    call_duration_secs?: number;
    phone_call?: { direction?: string; external_number?: string } | null;
  };
  analysis?: {
    transcript_summary?: string;
    call_successful?: string;
    data_collection_results?: Record<string, { value?: unknown } | unknown>;
  };
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function authorized(req: NextRequest): Promise<boolean> {
  // Vercel Cron
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (cronSecret && bearer && safeEqual(bearer, cronSecret)) return true;
  // Manual key
  const apiKey = process.env.VYBERO_API_KEY ?? "";
  const urlKey = req.nextUrl.searchParams.get("key") ?? "";
  if (apiKey && urlKey && safeEqual(urlKey, apiKey)) return true;
  // Signed-in admin (the page button)
  const session = await getSession(req);
  return session?.role === "admin";
}

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
  }
  return undefined;
}

/** Map one conversation (list item + optional detail) onto a VyberoCall. */
function toCall(item: ElConversationListItem, detail: ElConversationDetail | null): VyberoCall {
  const transcript = detail?.transcript ?? [];
  const toolNames = transcript.flatMap((t) =>
    (t.tool_calls ?? []).map((c) => (c.tool_name ?? c.name ?? "").toLowerCase())
  );
  const booked = toolNames.some((n) => n.includes("book"));
  const successful = (detail?.analysis?.call_successful ?? item.call_successful ?? "").toLowerCase();
  const outcome: CallOutcome = booked
    ? "booked"
    : successful === "failure"
      ? "callback"
      : item.status === "failed"
        ? "missed"
        : "info";

  const questions = transcript
    .filter((t) => t.role === "user" && typeof t.message === "string")
    .map((t) => (t.message as string).trim())
    .filter((m) => m.includes("?") && m.length > 8)
    .slice(0, 8)
    .map((m) => m.slice(0, 200));

  const summary = (
    detail?.analysis?.transcript_summary ??
    item.transcript_summary ??
    ""
  ).slice(0, 1500);

  const results = detail?.analysis?.data_collection_results as
    | Record<string, unknown>
    | undefined;
  const startUnix =
    detail?.metadata?.start_time_unix_secs ?? item.start_time_unix_secs;

  return {
    id: `el_${item.conversation_id}`,
    started_at: new Date((startUnix ?? Date.now() / 1000) * 1000).toISOString(),
    duration_secs: Math.max(
      0,
      Math.min(3600, Math.round(detail?.metadata?.call_duration_secs ?? item.call_duration_secs ?? 0))
    ),
    direction:
      detail?.metadata?.phone_call?.direction === "outbound" ? "outbound" : "inbound",
    caller_name: collected(results, ["name", "customer", "caller"]),
    caller_phone:
      detail?.metadata?.phone_call?.external_number ??
      collected(results, ["phone", "number", "whatsapp"]),
    language: collected(results, ["language"]) ?? "English",
    outcome,
    topics: detectTopics(`${summary} ${questions.join(" ")} ${toolNames.join(" ")}`),
    questions,
    summary: summary || "Voice conversation with Noor.",
  };
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const elKey = process.env.ELEVENLABS_API_KEY;
  if (!elKey) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "Set ELEVENLABS_API_KEY in the environment to sync call history.",
      },
      { status: 501 }
    );
  }

  try {
    await ensureSeedClinic();
    const configs = await listClinicConfigs();
    const clinic = configs.find((c) => c.vyberoAgentId) ?? configs[0];
    if (!clinic?.vyberoAgentId) {
      return NextResponse.json(
        { error: "no_agent", message: "No ElevenLabs agent id in the clinic config." },
        { status: 400 }
      );
    }

    // conversations already known (either path) — only detail-fetch new ones
    const existing = new Set((await listCalls(clinic.id)).map((c) => c.id));

    const after = Math.floor(Date.now() / 1000) - LOOKBACK_DAYS * 86400;
    const items: ElConversationListItem[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 3; page++) {
      const url = new URL(`${EL_BASE}/v1/convai/conversations`);
      url.searchParams.set("agent_id", clinic.vyberoAgentId);
      url.searchParams.set("call_start_after_unix", String(after));
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("cursor", cursor);
      const res = await fetch(url, { headers: { "xi-api-key": elKey } });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return NextResponse.json(
          { error: "elevenlabs_error", status: res.status, detail: detail.slice(0, 300) },
          { status: 502 }
        );
      }
      const data = (await res.json()) as {
        conversations?: ElConversationListItem[];
        has_more?: boolean;
        next_cursor?: string;
      };
      items.push(...(data.conversations ?? []));
      if (!data.has_more || !data.next_cursor) break;
      cursor = data.next_cursor;
    }

    let synced = 0;
    let detailed = 0;
    for (const item of items) {
      if (!item.conversation_id) continue;
      // skip conversations still in progress — they arrive on the next run
      if (item.status && item.status !== "done" && item.status !== "failed") continue;

      const isNew = !existing.has(`el_${item.conversation_id}`);
      let detail: ElConversationDetail | null = null;
      if (isNew && detailed < DETAIL_FETCH_CAP) {
        try {
          const res = await fetch(
            `${EL_BASE}/v1/convai/conversations/${item.conversation_id}`,
            { headers: { "xi-api-key": elKey } }
          );
          if (res.ok) {
            detail = (await res.json()) as ElConversationDetail;
            detailed++;
          }
        } catch {
          // list-level mapping still works
        }
      }
      if (isNew || detail) {
        await saveCall(clinic.id, toCall(item, detail));
        if (isNew) synced++;
      }
    }

    return NextResponse.json({
      ok: true,
      agent: clinic.vyberoAgentId,
      fetched: items.length,
      new_calls: synced,
      detail_fetched: detailed,
    });
  } catch (err) {
    console.error("[sync-elevenlabs]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
