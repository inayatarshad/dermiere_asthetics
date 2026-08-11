/**
 * Shared plumbing for the /api/crm/* routes.
 *
 * requireCrm() is the server-side gate every CRM route calls first. It
 * resolves the signed session, checks the capability against the SAME
 * permission table the UI uses, and hands back the clinic id that scopes
 * every subsequent query. A request that forges a clinic_id in its body gets
 * nowhere: the body is never consulted for tenancy.
 */

import { NextResponse } from "next/server";
import { AuthError, requireSession } from "./auth";
import type { SessionClaims } from "./session";
import { crmCan, type CrmCapability } from "@/lib/crm/permissions";
import { sessionBranchId } from "./branchAccess";

export interface CrmContext {
  clinicId: string;
  userId: string;
  role: string;
  email: string;
  /** Undefined only for roles allowed to see the whole clinic. */
  branchId?: string;
  canViewAllBranches: boolean;
}

export async function requireCrm(
  req: Request,
  capability: CrmCapability
): Promise<CrmContext> {
  const session: SessionClaims = await requireSession(req);
  if (session.ws !== "crm") {
    throw new AuthError(403, "This account does not belong to the CRM workspace.");
  }
  if (!crmCan(session.role, capability)) {
    throw new AuthError(403, "Your role does not have access to this.");
  }
  const canViewAllBranches = crmCan(session.role, "view_all_branches");
  const assignedBranch = await sessionBranchId(session);
  if (!canViewAllBranches && !assignedBranch) {
    throw new AuthError(403, "Your account is not assigned to a clinic branch.");
  }
  return {
    clinicId: session.cid,
    userId: session.uid,
    role: session.role,
    email: session.email,
    branchId: canViewAllBranches ? undefined : assignedBranch ?? undefined,
    canViewAllBranches,
  };
}

/** Branch-scoped roles may only read rows owned by their assigned branch. */
export function crmScopeRows<T extends { branch_id?: string }>(
  ctx: CrmContext,
  rows: T[]
): T[] {
  return ctx.branchId
    ? rows.filter((row) => row.branch_id === ctx.branchId)
    : rows;
}

/** Resolve a write branch without trusting a branch-scoped client's body. */
export function crmWriteBranch(
  ctx: CrmContext,
  requested?: string,
  fallback?: string
): string | undefined {
  if (ctx.branchId) return ctx.branchId;
  return requested ?? fallback;
}

/** Fail closed before exposing or mutating a single branch-owned row. */
export function requireCrmRowAccess(
  ctx: CrmContext,
  row: { branch_id?: string } | null | undefined
): void {
  if (ctx.branchId && row?.branch_id !== ctx.branchId) {
    throw new AuthError(403, "This record belongs to another clinic branch.");
  }
}

/** Uniform error response; unexpected errors become a 500 without leaking. */
export function crmError(err: unknown): NextResponse {
  if (err instanceof AuthError) {
    return NextResponse.json(
      { error: "unauthorized", message: err.message },
      { status: err.status }
    );
  }
  const message = err instanceof Error ? err.message : "Something went wrong.";
  console.error("[crm]", err);
  return NextResponse.json({ error: "server_error", message }, { status: 500 });
}

/** 400 with a message the UI can show verbatim. */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: "bad_request", message }, { status: 400 });
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------
// Input validation helpers - small, explicit, no dependency
// ---------------------------------------------------------------------

export function str(
  v: unknown,
  { max = 2000, trim = true }: { max?: number; trim?: boolean } = {}
): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = trim ? v.trim() : v;
  if (!s) return undefined;
  return s.slice(0, max);
}

export function num(v: unknown, min = -Infinity, max = Infinity): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

export function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

export function strList(v: unknown, max = 25): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => str(x, { max: 120 }))
    .filter((x): x is string => !!x)
    .slice(0, max);
}

export function oneOf<T extends string>(
  v: unknown,
  allowed: readonly T[]
): T | undefined {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : undefined;
}

/** Parse an ISO date/datetime, rejecting garbage. */
export function isoDate(v: unknown): string | undefined {
  const s = str(v, { max: 40 });
  if (!s) return undefined;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? undefined : t.toISOString();
}
