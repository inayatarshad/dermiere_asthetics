/**
 * Session token â€” a signed JWT carried in an HTTP-only cookie. Edge-safe
 * (jose + Web Crypto only), so `src/middleware.ts` can verify it without
 * pulling node:crypto into the edge bundle. The signing key is
 * SESSION_SECRET when set, otherwise derived (SHA-256) from DATABASE_URL â€”
 * a stable secret already in the environment and never in the repo.
 */

import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "capture_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionClaims {
  cid: string; // clinic_id
  uid: string; // user_id
  role: string; // "doctor" | "front_desk" | "admin"
  email: string;
}

let cachedKey: Uint8Array | null = null;

async function key(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  const material =
    process.env.SESSION_SECRET ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    "contour-dev-secret-do-not-use-in-prod";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`contour::${material}`)
  );
  cachedKey = new Uint8Array(digest);
  return cachedKey;
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(await key());
}

export async function verifySession(
  token: string | undefined | null
): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, await key());
    if (
      typeof payload.cid === "string" &&
      typeof payload.uid === "string" &&
      typeof payload.role === "string"
    ) {
      return {
        cid: payload.cid,
        uid: payload.uid,
        role: payload.role,
        email: typeof payload.email === "string" ? payload.email : "",
      };
    }
    return null;
  } catch {
    return null;
  }
}
