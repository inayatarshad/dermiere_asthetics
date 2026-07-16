/**
 * POST /api/rewards/redeem — marks a Capture Circle code redeemed against
 * an invoice. Called by POS at checkout, after validate. Idempotent-safe:
 * an already-redeemed code answers 409 so a double click can never apply
 * a discount twice.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { pgListRecords, pgUpsertRecord } from "@/lib/server/db";
import type { Reward } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: { code?: string; invoiceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const code = (body.code ?? "").trim().toUpperCase();
  const invoiceId = (body.invoiceId ?? "").trim();
  if (!code || !invoiceId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  try {
    const rewards = await pgListRecords<Reward>(session.cid, "rewards");
    const reward = rewards.find((r) => r.code.toUpperCase() === code);
    if (!reward) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (reward.status !== "issued") {
      return NextResponse.json({ error: "not_redeemable" }, { status: 409 });
    }
    if (new Date(reward.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "expired" }, { status: 409 });
    }
    const updated: Reward = {
      ...reward,
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_invoice_id: invoiceId,
    };
    await pgUpsertRecord(session.cid, "rewards", reward.id, updated);
    return NextResponse.json({ ok: true, reward: updated });
  } catch (err) {
    console.error("[rewards/redeem]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
