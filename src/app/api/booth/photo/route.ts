/**
 * GET /api/booth/photo?path=booth/photos/<id>/<kind>.<ext>
 *
 * Same-origin streaming of booth photos. Blobs are stored PRIVATE (medical
 * images never get public URLs); this route validates the exact path shape
 * and streams the bytes with store credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { readBoothPhoto, BoothStoreError } from "@/lib/server/boothStore";

export const maxDuration = 30;

const PATH_RE =
  /^booth\/photos\/[a-z0-9-]{8,64}\/photo_(front|left|right|closeup)\.(jpg|png|webp)$/i;

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!PATH_RE.test(path)) {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid photo path." },
      { status: 400 }
    );
  }
  try {
    const res = await readBoothPhoto(path);
    if (!res || !res.body) {
      return NextResponse.json(
        { error: "not_found", message: "Photo not found." },
        { status: 404 }
      );
    }
    const ext = path.split(".").pop()!.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    if (err instanceof BoothStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[booth/photo]", err);
    return NextResponse.json(
      { error: "store_error", message: "Could not read the photo." },
      { status: 502 }
    );
  }
}
