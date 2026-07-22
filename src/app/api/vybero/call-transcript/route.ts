/**
 * GET /api/vybero/call-transcript?id=el_<conversation_id>
 *
 * On-demand transcript for a synced ElevenLabs call. The turns are fetched
 * from the conversation detail endpoint rather than stored — call rows stay
 * light and the transcript is always the provider's authoritative copy.
 * Admin session only; the ElevenLabs key never leaves the server.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface TranscriptTurn {
  role: "agent" | "caller";
  text: string;
  /** Seconds into the call. */
  t: number;
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  const m = /^el_([A-Za-z0-9_-]+)$/.exec(id);
  if (!m) {
    return NextResponse.json(
      {
        error: "bad_request",
        message: "id must be a synced call id (el_<conversation>). Demo calls have no transcript.",
      },
      { status: 400 }
    );
  }

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "ELEVENLABS_API_KEY is not set on the server, so transcripts cannot be fetched.",
      },
      { status: 501 }
    );
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${m[1]}`,
    { headers: { "xi-api-key": key }, cache: "no-store" }
  );
  if (!res.ok) {
    return NextResponse.json(
      {
        error: "upstream",
        message:
          res.status === 404
            ? "ElevenLabs no longer has this conversation."
            : `ElevenLabs answered ${res.status}.`,
      },
      { status: res.status === 404 ? 404 : 502 }
    );
  }

  const data = (await res.json()) as {
    transcript?: {
      role?: string;
      message?: string | null;
      time_in_call_secs?: number;
    }[];
  };
  const turns: TranscriptTurn[] = (data.transcript ?? [])
    .filter((t) => typeof t.message === "string" && t.message.trim().length > 0)
    .map((t) => ({
      role: t.role === "agent" ? "agent" : "caller",
      text: String(t.message).trim(),
      t: typeof t.time_in_call_secs === "number" ? t.time_in_call_secs : 0,
    }));

  return NextResponse.json(
    { turns },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
