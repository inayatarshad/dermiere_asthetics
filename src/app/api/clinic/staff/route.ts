/**
 * Clinic staff management (admin only), scoped to the caller's clinic.
 *  GET   - list staff
 *  POST  - add a staff user { name, email, role, title?, password? }
 *  PATCH - set active { id, active } OR reset password { id, password }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  addStaff,
  listStaff,
  setStaffActive,
  setStaffPassword,
} from "@/lib/server/clinicStore";
import type { Role } from "@/lib/types";

export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (session.role !== "admin")
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const { session, error } = await requireAdmin(req);
  if (error) return error;
  const staff = await listStaff(session.cid);
  return NextResponse.json({ staff });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin(req);
  if (error) return error;
  let body: { name?: string; email?: string; role?: Role; title?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.name || !body.email || !body.role) {
    return NextResponse.json({ error: "bad_request", message: "name, email and role are required." }, { status: 400 });
  }
  try {
    const user = await addStaff(session.cid, {
      name: body.name,
      email: body.email,
      role: body.role,
      title: body.title,
      password: body.password,
    });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    return NextResponse.json(
      { error: "conflict", message: err instanceof Error ? err.message : "Could not add user." },
      { status: 409 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireAdmin(req);
  if (error) return error;
  let body: { id?: string; active?: boolean; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // password reset branch
  if (typeof body.password === "string") {
    const pw = body.password;
    if (pw.length < 8 || pw.length > 128) {
      return NextResponse.json(
        { error: "weak_password", message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }
    try {
      await setStaffPassword(session.cid, body.id, pw);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: "not_found", message: err instanceof Error ? err.message : "User not found." },
        { status: 404 }
      );
    }
  }

  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  await setStaffActive(session.cid, body.id, body.active);
  return NextResponse.json({ ok: true });
}
