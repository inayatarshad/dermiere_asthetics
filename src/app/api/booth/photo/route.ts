/**
 * GET /api/booth/photo?path=booth/<clinicId>/photos/<id>/<kind>.<ext>
 *
 * Same-origin streaming of booth photos. Session + clinic-scoped: the path
 * must live under the caller's own clinic prefix, so one clinic can never
 * stream another's medical photos even by guessing a path. Blobs are stored
 * PRIVATE; this route streams them with store credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { readBoothPhoto, BoothStoreError } from "@/lib/server/boothStore";

export const maxDuration = 30;

const PATH_RE =
  /^booth\/[A-Za-z0-9_-]+\/photos\/[a-z0-9-]{8,64}\/photo_(front|left|right|closeup)\.(jpg|png|webp)$/i;

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!PATH_RE.test(path) || !path.startsWith(`booth/${session.cid}/photos/`)) {
    return NextResponse.json({ error: "bad_request", message: "Invalid photo path." }, { status: 400 });
  }
  try {
    const res = await readBoothPhoto(session.cid, path);
    if (!res || !res.body) {
      return NextResponse.json({ error: "not_found", message: "Photo not found." }, { status: 404 });
    }
    const ext = path.split(".").pop()!.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(res.body, {
      headers: { "Content-Type": mime, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (err instanceof BoothStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[booth/photo]", err);
    return NextResponse.json({ error: "store_error", message: "Could not read the photo." }, { status: 502 });
  }
}
