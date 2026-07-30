/**
 * POST /api/review/[token]/submit - the client submits their review.
 * Server-side validation is the source of truth (rating bounds, comment
 * length, highlight whitelist, per-IP rate limit). On success the invite
 * flips COMPLETED and the Capture Circle reward is issued and returned so
 * the thank-you screen can reveal it immediately - the §5.5 loop, live.
 */

import { NextRequest, NextResponse } from "next/server";
import type { ClinicReview } from "@/lib/types";
import {
  getInviteByToken,
  saveInvite,
  saveReview,
  issueReward,
  rateLimited,
  ReviewStoreError,
} from "@/lib/server/reviewStore";
import { getClinicConfig } from "@/lib/server/clinicStore";

export const runtime = "nodejs";

const HIGHLIGHTS = new Set([
  "visible results",
  "no pain at all",
  "staff care",
  "clean & luxurious",
  "worth the price",
  "booking was easy",
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ip";
  if (rateLimited(`review:${ip}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: {
    rating?: number;
    comment?: string;
    highlights?: string[];
    website?: string; // honeypot
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // honeypot: silently accept and drop
  if (body.website) {
    return NextResponse.json({ ok: true });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
  }
  const comment = (body.comment ?? "").toString().trim().slice(0, 900);
  const highlights = Array.isArray(body.highlights)
    ? body.highlights.filter((h) => HIGHLIGHTS.has(h)).slice(0, 6)
    : [];

  try {
    const hit = await getInviteByToken(token);
    if (!hit) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const { clinicId, invite } = hit;
    if (invite.status === "COMPLETED") {
      return NextResponse.json({ error: "already_submitted" }, { status: 409 });
    }

    const review: ClinicReview = {
      id: crypto.randomUUID(),
      invite_id: invite.id,
      patient_id: invite.patient_id,
      patient_name: invite.patient_name,
      location_id: invite.location_id,
      treatments: invite.treatments,
      staff_name: invite.staff_name,
      rating,
      comment: comment || undefined,
      highlights,
      invoice_id: invite.invoice_id,
      created_at: new Date().toISOString(),
    };
    await saveReview(clinicId, review);

    invite.status = "COMPLETED";
    invite.completed_at = review.created_at;
    invite.review_id = review.id;
    await saveInvite(clinicId, invite);

    const config = await getClinicConfig(clinicId);
    const incentive = config?.reviewIncentive ?? {
      kind: "discount" as const,
      value: 10,
      validityDays: 60,
    };
    const reward = await issueReward(clinicId, review, incentive);

    return NextResponse.json({
      ok: true,
      reward: {
        code: reward.code,
        value: reward.value,
        expires_at: reward.expires_at,
      },
    });
  } catch (err) {
    if (err instanceof ReviewStoreError) {
      return NextResponse.json({ error: err.code }, { status: 501 });
    }
    console.error("[review submit]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
