/**
 * Voice-agent (VYBERO) authentication + clinic resolution.
 *
 * The agent authenticates with the platform key (x-vybero-key, constant-time
 * compare) and names its clinic with an x-clinic header (clinic id or slug)
 * - so clinic A's agent can only ever write to clinic A. On a single-clinic
 * deployment with no header, it falls back to the only clinic. Clinic-screen
 * pulls use the session cookie instead (see the route handlers).
 */

import { timingSafeEqual } from "node:crypto";
import {
  pgGetClinic,
  pgGetClinicBySlug,
  pgCountClinics,
  pgListClinics,
} from "./db";

/** The key the caller presented, by any accepted route. */
function presentedKey(req: Request): string {
  const header = req.headers.get("x-vybero-key");
  if (header) return header;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (bearer) return bearer;
  // Query param: the agent platform's tool builder makes headers awkward to
  // configure, and a URL is one field. Same secret, weaker channel (URLs can
  // land in logs) - so it stays a convenience, not the documented default.
  try {
    return new URL(req.url).searchParams.get("key") ?? "";
  } catch {
    return "";
  }
}

export function agentKeyValid(req: Request): boolean {
  const key = process.env.VYBERO_API_KEY;
  const sent = presentedKey(req);
  if (key) {
    const a = Buffer.from(sent);
    const b = Buffer.from(key);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  // No key configured: accept only outside production (dev/testing).
  return process.env.NODE_ENV !== "production" || !process.env.VERCEL;
}

/** True when the request even ATTEMPTS agent auth (key header or ?key=). */
export function agentKeyPresented(req: Request): boolean {
  return !!presentedKey(req);
}

/** Resolve the clinic a voice-agent request targets, or null. */
export async function resolveAgentClinic(
  req: Request,
  bodyRef?: string | null
): Promise<string | null> {
  const ref = req.headers.get("x-clinic") ?? bodyRef ?? null;
  if (ref) {
    const byId = await pgGetClinic(ref);
    if (byId) return byId.id;
    const bySlug = await pgGetClinicBySlug(ref);
    if (bySlug) return bySlug.id;
    return null; // an explicit, unknown ref must not silently hit another clinic
  }
  // No ref: only safe on a single-clinic deployment.
  if ((await pgCountClinics()) === 1) {
    const all = await pgListClinics();
    return all[0]?.id ?? null;
  }
  return null;
}
