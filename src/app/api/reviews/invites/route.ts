/**
 * /api/reviews/invites — clinic side of the review loop.
 *  POST: mint a review link for a visit (front desk / POS checkout).
 *  GET:  the monitoring dashboard's data — invites, reviews and rewards,
 *        session-scoped to the caller's clinic.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  createInvite,
  listInvites,
  listReviews,
  listRewards,
  ReviewStoreError,
} from "@/lib/server/reviewStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: {
    patient_id?: string;
    patient_name?: string;
    location_id?: string;
    treatments?: string[];
    staff_name?: string;
    invoice_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const name = (body.patient_name ?? "").trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "missing_patient_name" }, { status: 400 });
  }

  try {
    const invite = await createInvite(session.cid, {
      patient_id: body.patient_id,
      patient_name: name,
      location_id: (body.location_id ?? "experience-centre").slice(0, 60),
      treatments: Array.isArray(body.treatments)
        ? body.treatments.slice(0, 8).map((t) => String(t).slice(0, 60))
        : [],
      staff_name: body.staff_name?.slice(0, 80),
      invoice_id: body.invoice_id,
    });
    const origin = req.nextUrl.origin;
    return NextResponse.json({
      ok: true,
      invite,
      url: `${origin}/review/${invite.token}`,
    });
  } catch (err) {
    if (err instanceof ReviewStoreError) {
      return NextResponse.json({ error: err.code }, { status: 501 });
    }
    console.error("[reviews/invites POST]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  try {
    const [invites, reviews, rewards] = await Promise.all([
      listInvites(session.cid),
      listReviews(session.cid),
      listRewards(session.cid),
    ]);
    return NextResponse.json({ ok: true, invites, reviews, rewards });
  } catch (err) {
    if (err instanceof ReviewStoreError) {
      return NextResponse.json({ error: err.code }, { status: 501 });
    }
    console.error("[reviews/invites GET]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
