/**
 * POST /api/records — clinic-scoped write-through for the app's records.
 * The client sends a batch of {table, op, id, payload} diffs; every write
 * is scoped to the session's clinic_id (never anything the client claims),
 * so one clinic can never write into another's data.
 *
 * Accepts the clinical record tables plus appointments / vybero_calls (both
 * of which also receive writes from the voice agent and booth).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession, AuthError } from "@/lib/server/auth";
import {
  RECORD_TABLES,
  pgUpsertRecord,
  pgDeleteRecord,
  pgUpsertAppointment,
  pgUpsertCall,
} from "@/lib/server/db";
import { ensureContactForPatient } from "@/lib/server/crmRegistry";
import type { Patient } from "@/lib/types";

export const runtime = "nodejs";

const RECORD_SET = new Set<string>(RECORD_TABLES);
const OPERATIONAL = new Set(["appointments", "vybero_calls"]);

interface Change {
  table: string;
  op: "upsert" | "delete";
  id: string;
  payload?: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await getSession(req);
  } catch {
    session = null;
  }
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const clinicId = session.cid;

  let body: { changes?: Change[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const changes = Array.isArray(body.changes) ? body.changes : [];
  if (changes.length === 0) return NextResponse.json({ ok: true, written: 0 });
  if (changes.length > 500) {
    return NextResponse.json({ error: "too_many" }, { status: 413 });
  }

  let written = 0;
  try {
    for (const c of changes) {
      if (!c || typeof c.id !== "string" || !c.table) continue;

      if (RECORD_SET.has(c.table)) {
        if (c.op === "delete") {
          await pgDeleteRecord(clinicId, c.table, c.id);
        } else if (c.payload) {
          await pgUpsertRecord(clinicId, c.table, c.id, c.payload);
          // A patient registered anywhere in Clinic OS must appear in the
          // CRM too — one list of people, not two. Best-effort: a CRM
          // bookkeeping failure must never fail the clinical write.
          if (c.table === "patients") {
            try {
              await ensureContactForPatient(
                clinicId,
                c.payload as unknown as Patient,
                { actorId: session.uid }
              );
            } catch (err) {
              console.error("[records] CRM link failed", err);
            }
          }
        }
        written++;
        continue;
      }

      if (OPERATIONAL.has(c.table) && c.op === "upsert" && c.payload) {
        if (c.table === "appointments") {
          const start = String(c.payload.start ?? new Date().toISOString());
          const status = String(c.payload.status ?? "booked");
          await pgUpsertAppointment(clinicId, c.id, start, status, c.payload);
        } else {
          const startedAt = String(c.payload.started_at ?? new Date().toISOString());
          await pgUpsertCall(clinicId, c.id, startedAt, c.payload);
        }
        written++;
      }
    }
    return NextResponse.json({ ok: true, written });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: err.status });
    }
    console.error("[records]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
