/**
 * AI spend control. Both paid endpoints (/api/generate, /api/assessment/skin)
 * pass through aiGuard() BEFORE calling any provider: it requires a session,
 * rate-limits per clinic+IP, and enforces the clinic's monthly cap. On
 * success the route calls recordAi() to attribute the spend to the clinic -
 * so the owner can always see who spent what, and no clinic can run the bill
 * away.
 */

import { NextResponse } from "next/server";
import { getSession } from "./auth";
import { getClinicConfig } from "./clinicStore";
import { pgGetUsage, pgIncrUsage } from "./db";
import { currentMonth } from "./bootstrap";

export type AiKind = "generations" | "assessments";

const hits = new Map<string, number[]>();
function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

export interface GuardOk {
  ok: true;
  clinicId: string;
}
export interface GuardFail {
  ok: false;
  response: NextResponse;
}

/**
 * Per-minute burst limit per clinic+IP (blunt abuse) - the monthly cap is the
 * real budget control. Generous enough for normal consultation use.
 */
const PER_MINUTE = 20;

export async function aiGuard(
  req: Request,
  kind: AiKind
): Promise<GuardOk | GuardFail> {
  const session = await getSession(req);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
  }
  const clinicId = session.cid;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "ip";
  if (rateLimited(`${clinicId}:${ip}:${kind}`, PER_MINUTE, 60_000)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited", message: "Too many AI requests. Try again shortly." },
        { status: 429 }
      ),
    };
  }

  const config = await getClinicConfig(clinicId);
  const cap = config?.aiCaps?.[kind] ?? 0;
  if (cap > 0) {
    const usage = await pgGetUsage(clinicId, currentMonth());
    if (usage[kind] >= cap) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "quota_exceeded",
            message: `This clinic has reached its monthly limit for ${kind}. Contact your administrator to raise the cap.`,
          },
          { status: 429 }
        ),
      };
    }
  }

  return { ok: true, clinicId };
}

export async function recordAi(clinicId: string, kind: AiKind): Promise<void> {
  try {
    await pgIncrUsage(clinicId, currentMonth(), kind);
  } catch (err) {
    // metering must never break a successful generation
    console.error("[usage] record failed", err);
  }
}
