/**
 * Server auth (node runtime): password hashing (scrypt) + request→session
 * resolution + role guards. The real tenant boundary: every protected API
 * route calls requireSession()/requireRole() and scopes its data by the
 * returned clinic_id - never by anything the client sends.
 */

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
  type SessionClaims,
} from "./session";

// ---------------------------------------------------------------------
// Passwords - scrypt with a per-user random salt, constant-time compare.
// Stored as "scrypt:<saltHex>:<hashHex>".
// ---------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "hex");
    const expected = Buffer.from(parts[2], "hex");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Session cookie helpers
// ---------------------------------------------------------------------

const isProd = process.env.NODE_ENV === "production";

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await signSession(claims);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Attach the session cookie to a specific NextResponse (used by login). */
export async function attachSessionCookie(
  res: NextResponse,
  claims: SessionClaims
): Promise<NextResponse> {
  const token = await signSession(claims);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function clearSessionCookie(res: NextResponse): Promise<void> {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ---------------------------------------------------------------------
// Request → session (for route handlers)
// ---------------------------------------------------------------------

export async function getSession(req: Request): Promise<SessionClaims | null> {
  const cookie = req.headers.get("cookie") ?? "";
  const token = readCookie(cookie, SESSION_COOKIE);
  return verifySession(token);
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Returns the session or throws AuthError(401). */
export async function requireSession(req: Request): Promise<SessionClaims> {
  const s = await getSession(req);
  if (!s) throw new AuthError(401, "Not authenticated.");
  return s;
}

/** Returns the session if the role is allowed, else throws AuthError(403). */
export async function requireRole(
  req: Request,
  roles: string[]
): Promise<SessionClaims> {
  const s = await requireSession(req);
  if (!roles.includes(s.role)) throw new AuthError(403, "Not authorized.");
  return s;
}

/** Standard JSON error for an AuthError (or a generic 500). */
export function authErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: "unauthorized", message: err.message }, {
      status: err.status,
    });
  }
  throw err;
}
