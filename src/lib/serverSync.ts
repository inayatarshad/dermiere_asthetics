"use client";

/**
 * Client <-> server sync. The server (Neon) is the source of truth; the
 * zustand store is a live cache. This module:
 *  - talks to the auth + config endpoints,
 *  - and installs a write-through subscription that pushes record diffs to
 *    /api/records (clinic-scoped server-side) whenever the local store
 *    changes — so a clinic's data persists and is shared across its devices.
 *
 * It imports the store lazily (inside functions) to avoid an import cycle.
 */

import type { BootstrapPayload } from "@/lib/server/bootstrap";

export interface LoginResult {
  ok: boolean;
  bootstrap?: BootstrapPayload;
  error?: string;
}

export async function loginRequest(
  email: string,
  password: string
): Promise<LoginResult> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      bootstrap?: BootstrapPayload;
      message?: string;
    };
    if (!res.ok || !data.ok || !data.bootstrap) {
      return { ok: false, error: data.message ?? "Sign in failed." };
    }
    return { ok: true, bootstrap: data.bootstrap };
  } catch {
    return { ok: false, error: "No connection. Please try again." };
  }
}

export async function fetchBootstrap(): Promise<BootstrapPayload | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { bootstrap?: BootstrapPayload };
    return data.bootstrap ?? null;
  } catch {
    return null;
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore; cookie clears client-side on reload regardless
  }
}

// ---------------------------------------------------------------------
// Clinic config + staff write-through (admin actions)
// ---------------------------------------------------------------------

export async function pushClinicConfig(
  patch: Record<string, unknown>
): Promise<void> {
  try {
    await fetch("/api/clinic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    // best-effort; retried on next edit
  }
}

export async function pushAddStaff(data: {
  name: string;
  email: string;
  role: string;
  title?: string;
  password?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch("/api/clinic/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: { id: string };
      message?: string;
    };
    if (!res.ok || !body.ok) return { ok: false, error: body.message };
    return { ok: true, id: body.user?.id };
  } catch {
    return { ok: false, error: "No connection." };
  }
}

export async function pushSetStaffActive(id: string, active: boolean): Promise<void> {
  try {
    await fetch("/api/clinic/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    });
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------
// Record write-through (diff-based subscription)
// ---------------------------------------------------------------------

interface Change {
  table: string;
  op: "upsert" | "delete";
  id: string;
  payload?: unknown;
}

/** store collection key -> server table name. vyberoCalls is read-only. */
const COLLECTIONS: Array<[string, string]> = [
  ["patients", "patients"],
  ["consents", "consents"],
  ["assets", "assets"],
  ["consultations", "consultations"],
  ["visualizations", "visualizations"],
  ["plans", "plans"],
  ["planItems", "plan_items"],
  ["reports", "reports"],
  ["appointments", "appointments"],
];

let installed = false;
let paused = false;
const snapshots = new Map<string, Map<string, string>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: Change[] = [];

function snapshotOf(list: Array<{ id: string }>): Map<string, string> {
  const m = new Map<string, string>();
  for (const item of list) m.set(item.id, JSON.stringify(item));
  return m;
}

/** Reset the diff baseline to the current store (called after hydrate). */
export function resetSyncBaseline(state: Record<string, unknown>): void {
  for (const [key] of COLLECTIONS) {
    const list = (state[key] as Array<{ id: string }>) ?? [];
    snapshots.set(key, snapshotOf(list));
  }
}

export function pauseSync(): void {
  paused = true;
}
export function resumeSync(): void {
  paused = false;
}

function queue(changes: Change[]) {
  if (changes.length === 0) return;
  pending.push(...changes);
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 800);
}

async function flush() {
  flushTimer = null;
  const batch = pending.splice(0, 400);
  if (batch.length === 0) return;
  try {
    await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: batch }),
    });
  } catch {
    // drop on failure; next store change re-diffs from the last snapshot,
    // and a full re-sync happens on next login/bootstrap
  }
  if (pending.length > 0 && !flushTimer) flushTimer = setTimeout(flush, 800);
}

/**
 * Subscribe once to the store and push per-collection diffs to the server.
 * `store` is the zustand hook (passed in from the layout to avoid a cycle).
 */
export function installRecordSync(store: {
  getState: () => Record<string, unknown>;
  subscribe: (fn: (state: Record<string, unknown>) => void) => void;
}): void {
  if (installed) return;
  installed = true;
  resetSyncBaseline(store.getState());

  store.subscribe((state) => {
    if (paused) return;
    const changes: Change[] = [];
    for (const [key, table] of COLLECTIONS) {
      const list = (state[key] as Array<{ id: string }>) ?? [];
      const prev = snapshots.get(key) ?? new Map<string, string>();
      const next = new Map<string, string>();
      for (const item of list) {
        const json = JSON.stringify(item);
        next.set(item.id, json);
        if (prev.get(item.id) !== json) {
          changes.push({ table, op: "upsert", id: item.id, payload: item });
        }
      }
      for (const id of prev.keys()) {
        if (!next.has(id)) changes.push({ table, op: "delete", id });
      }
      snapshots.set(key, next);
    }
    queue(changes);
  });
}
