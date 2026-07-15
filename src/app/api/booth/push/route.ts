/**
 * POST /api/booth/push (T1) — the phone side of the booth handoff. The
 * phone is a signed-in clinic device, so the write is scoped to its
 * session's clinic_id. Accepts a patient record + consents + downscaled
 * photos and files them in that clinic's booth inbox.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  putBoothItem,
  BoothStoreError,
  type BoothPhotoIn,
} from "@/lib/server/boothStore";

export const maxDuration = 30;

interface PushBody {
  id?: string;
  patient: Record<string, unknown>;
  consents: Record<string, unknown>[];
  photos: BoothPhotoIn[];
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: PushBody;
  try {
    body = (await req.json()) as PushBody;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.patient || typeof body.patient !== "object") {
    return NextResponse.json({ error: "bad_request", message: "patient is required." }, { status: 400 });
  }
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
  for (const p of photos) {
    if (
      typeof p?.dataUrl !== "string" ||
      !p.dataUrl.startsWith("data:image/") ||
      p.dataUrl.length > 2_500_000
    ) {
      return NextResponse.json({ error: "bad_request", message: "Invalid or oversized photo." }, { status: 400 });
    }
  }

  const id =
    typeof body.id === "string" && /^[a-z0-9-]{8,64}$/.test(body.id)
      ? body.id
      : crypto.randomUUID();

  try {
    await putBoothItem(
      session.cid,
      {
        id,
        created_at: new Date().toISOString(),
        patient: body.patient,
        consents: Array.isArray(body.consents) ? body.consents : [],
      },
      photos
    );
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    if (err instanceof BoothStoreError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.code === "not_configured" ? 501 : 502 }
      );
    }
    console.error("[booth/push]", err);
    return NextResponse.json({ error: "store_error", message: "Could not store the booth item." }, { status: 502 });
  }
}
