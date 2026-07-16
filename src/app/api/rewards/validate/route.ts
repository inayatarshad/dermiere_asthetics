/**
 * GET /api/rewards/validate?code=CIRCLE-XXXX — POS checks a Capture
 * Circle code before applying the discount. Session-scoped: only this
 * clinic's rewards are consulted, and codes issued seconds ago on a
 * client's phone validate immediately (server truth, not the local cache).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { pgListRecords } from "@/lib/server/db";
import type { Reward } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const code = (req.nextUrl.searchParams.get("code") ?? "")
    .trim()
    .toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }

  try {
    const rewards = await pgListRecords<Reward>(session.cid, "rewards");
    const reward = rewards.find((r) => r.code.toUpperCase() === code);
    if (!reward) {
      return NextResponse.json({ valid: false, reason: "not_found" });
    }
    if (reward.status === "redeemed") {
      return NextResponse.json({ valid: false, reason: "already_redeemed" });
    }
    if (
      reward.status === "expired" ||
      new Date(reward.expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json({ valid: false, reason: "expired" });
    }
    return NextResponse.json({
      valid: true,
      reward: {
        id: reward.id,
        code: reward.code,
        value: reward.value,
        kind: reward.kind,
        patient_name: reward.patient_name,
        expires_at: reward.expires_at,
      },
    });
  } catch (err) {
    console.error("[rewards/validate]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
