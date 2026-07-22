/**
 * GET /api/vybero/call-audio?id=el_<conversation_id>
 *
 * Streams the recording of a synced ElevenLabs call for the Analytics
 * player. Pure proxy: the audio bytes pass through, the xi-api-key stays
 * server-side. Admin session only. 404 when ElevenLabs retained no audio
 * for the conversation (retention settings), 501 when no key is set.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (session?.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id") ?? "";
  const m = /^el_([A-Za-z0-9_-]+)$/.exec(id);
  if (!m) {
    return NextResponse.json(
      { error: "bad_request", message: "id must be a synced call id (el_<conversation>)." },
      { status: 400 }
    );
  }

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "ELEVENLABS_API_KEY is not set on the server, so recordings cannot be fetched.",
      },
      { status: 501 }
    );
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${m[1]}/audio`,
    { headers: { "xi-api-key": key }, cache: "no-store" }
  );
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      {
        error: "upstream",
        message:
          upstream.status === 404
            ? "No recording is available for this call."
            : `ElevenLabs answered ${upstream.status}.`,
      },
      { status: upstream.status === 404 ? 404 : 502 }
    );
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
