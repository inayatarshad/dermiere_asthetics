/**
 * POST /api/booth/push (T1) — the phone side of the booth handoff.
 * Accepts a patient record + consents + downscaled photo data URLs and
 * files them in the booth inbox. Demo-grade courier, not an EMR sync.
 */

import { NextRequest, NextResponse } from "next/server";
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
  let body: PushBody;
  try {
    body = (await req.json()) as PushBody;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!body.patient || typeof body.patient !== "object") {
    return NextResponse.json(
      { error: "bad_request", message: "patient is required." },
      { status: 400 }
    );
  }
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
  for (const p of photos) {
    if (
      typeof p?.dataUrl !== "string" ||
      !p.dataUrl.startsWith("data:image/") ||
      p.dataUrl.length > 2_500_000
    ) {
      return NextResponse.json(
        { error: "bad_request", message: "Invalid or oversized photo." },
        { status: 400 }
      );
    }
  }

  const id =
    typeof body.id === "string" && /^[a-z0-9-]{8,64}$/.test(body.id)
      ? body.id
      : crypto.randomUUID();

  try {
    await putBoothItem(
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
    return NextResponse.json(
      { error: "store_error", message: "Could not store the booth item." },
      { status: 502 }
    );
  }
}
