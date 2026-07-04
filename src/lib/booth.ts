"use client";

/**
 * Booth handoff client (T1): push a locally-registered patient to the booth
 * inbox (phone side) and merge inbox arrivals into the local store (desktop
 * side). Merged records reuse the standard Asset + IndexedDB pattern, so
 * landmarking, the 3D canvas and AI generation work on pushed photos with
 * zero special-casing.
 */

import { useStore } from "./store";
import { resolveImageUrl, saveImage } from "./db";
import { loadImage, downscale, canvasToDataUrl } from "./img";
import type { AssetKind, ConsentType, Patient } from "./types";

const PHOTO_KINDS: AssetKind[] = ["photo_front", "photo_left", "photo_right"];

export interface BoothPullItem {
  id: string;
  created_at: string;
  patient: Partial<Patient> & { name?: string };
  consents: {
    type?: string;
    granted?: boolean;
    granted_at?: string;
    text_version?: string;
  }[];
  photos: { kind: string; url: string }[];
}

// ---------------------------------------------------------------------
// Push (phone side)
// ---------------------------------------------------------------------

const NOT_CONFIGURED_MSG =
  "Booth link is not set up on this deployment. In Vercel: Storage, Create, Blob, connect to the project. Everything else works without it.";

export async function pushPatientToBooth(
  patientId: string,
  opts: { manual?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  const st = useStore.getState();
  const patient = st.patients.find((p) => p.id === patientId);
  if (!patient) return { ok: false, error: "Patient not found." };

  const boothId =
    st.boothSync[patientId]?.boothId ?? patient.booth_id ?? crypto.randomUUID();
  st.setBoothSync(patientId, { status: "sending", boothId });

  try {
    // Latest photo per kind, downscaled for transfer
    const photos: { kind: string; dataUrl: string }[] = [];
    for (const kind of PHOTO_KINDS) {
      const asset = st.assets
        .filter((a) => a.patient_id === patientId && a.kind === kind)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!asset) continue;
      const url = await resolveImageUrl(asset.storage_url);
      if (!url) continue;
      const img = await loadImage(url);
      photos.push({ kind, dataUrl: canvasToDataUrl(downscale(img, 900), 0.88) });
    }

    const consents = st.consents
      .filter((c) => c.patient_id === patientId)
      .map((c) => ({
        type: c.type,
        granted: c.granted,
        granted_at: c.granted_at,
        text_version: c.text_version,
      }));

    const res = await fetch("/api/booth/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: boothId,
        patient: {
          name: patient.name,
          phone: patient.phone,
          email: patient.email,
          age: patient.age,
          gender: patient.gender,
          city: patient.city,
          language: patient.language,
          source: patient.source,
          clinical_flags: patient.clinical_flags,
        },
        consents,
        photos,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
    };
    if (!res.ok || !data.ok) {
      // Booth storage absent: the feature is dormant, not broken. Auto
      // pushes vanish silently; a manual send explains the setup once.
      if (data.error === "not_configured") {
        st.setBoothAvailable(false);
        if (opts.manual) {
          st.setBoothSync(patientId, {
            status: "error",
            code: "not_configured",
            error: NOT_CONFIGURED_MSG,
          });
        } else {
          st.clearBoothSync(patientId);
        }
        return { ok: false, error: NOT_CONFIGURED_MSG };
      }
      const message = data.message ?? `Push failed (${res.status}).`;
      st.setBoothSync(patientId, {
        status: "error",
        code: data.error,
        error: message,
      });
      return { ok: false, error: message };
    }
    // Own pushes must never merge back on this device
    st.setBoothAvailable(true);
    st.addMergedBoothId(boothId);
    st.updatePatient(patientId, { booth_id: boothId });
    st.setBoothSync(patientId, {
      status: "sent",
      error: undefined,
      code: undefined,
    });
    return { ok: true };
  } catch {
    const message = "No connection. Queued; will retry automatically.";
    useStore.getState().setBoothSync(patientId, {
      status: "error",
      code: "network",
      error: message,
    });
    return { ok: false, error: message };
  }
}

/** Queue a push (used right after registration); the agent retries it. */
export function queueBoothPush(patientId: string) {
  // Feature dormant on this deployment: skip quietly
  if (useStore.getState().boothAvailable === false) return;
  useStore.getState().setBoothSync(patientId, { status: "pending" });
  void pushPatientToBooth(patientId);
}

// ---------------------------------------------------------------------
// Pull + merge (desktop side)
// ---------------------------------------------------------------------

const VALID_KINDS = new Set<string>(PHOTO_KINDS);

export async function mergeBoothItem(item: BoothPullItem): Promise<void> {
  const st = useStore.getState();
  if (st.mergedBoothIds.includes(item.id)) return;

  const p = item.patient ?? {};
  const patient = st.registerPatient({
    name: typeof p.name === "string" && p.name.trim() ? p.name : "Booth patient",
    phone: typeof p.phone === "string" ? p.phone : "",
    email: typeof p.email === "string" ? p.email : undefined,
    age: typeof p.age === "number" ? p.age : undefined,
    gender: p.gender === "male" || p.gender === "other" ? p.gender : "female",
    city: typeof p.city === "string" ? p.city : "",
    language:
      p.language === "english" || p.language === "other" ? p.language : "urdu",
    source:
      p.source === "vibro" ||
      p.source === "referral" ||
      p.source === "social" ||
      p.source === "tourism"
        ? p.source
        : "walk_in",
    clinical_flags:
      p.clinical_flags && typeof p.clinical_flags === "object"
        ? p.clinical_flags
        : {},
    booth_id: item.id,
  });

  const capturedBy = st.sessionUserId ?? "booth";
  for (const c of item.consents ?? []) {
    if (c?.type === "treatment" || c?.type === "photography" || c?.type === "marketing") {
      st.setConsent(patient.id, c.type as ConsentType, !!c.granted, capturedBy);
    }
  }

  for (const photo of item.photos ?? []) {
    if (!VALID_KINDS.has(photo.kind)) continue;
    try {
      const res = await fetch(photo.url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const key = crypto.randomUUID();
      await saveImage(key, blob);
      useStore.getState().addAsset({
        patient_id: patient.id,
        kind: photo.kind as AssetKind,
        storage_url: `idb:${key}`,
      });
    } catch {
      // photo fetch failed; patient still merges, photo can be recaptured
    }
  }

  const after = useStore.getState();
  after.addMergedBoothId(item.id);
  after.addNewArrival(patient.id);
  after.setBoothToast({ name: patient.name, at: Date.now() });
}

export async function pullBoothInbox(): Promise<{
  merged: number;
  error?: string;
  code?: string;
}> {
  try {
    const res = await fetch("/api/booth/pull", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as {
      items?: BoothPullItem[];
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      if (data.error === "not_configured") {
        useStore.getState().setBoothAvailable(false);
      }
      return {
        merged: 0,
        code: data.error,
        error: data.message ?? `Pull failed (${res.status}).`,
      };
    }
    useStore.getState().setBoothAvailable(true);
    const fresh = (data.items ?? []).filter(
      (item) => !useStore.getState().mergedBoothIds.includes(item.id)
    );
    for (const item of fresh) {
      await mergeBoothItem(item);
    }
    return { merged: fresh.length };
  } catch {
    return { merged: 0, error: "Booth inbox unreachable." };
  }
}

/** Delete the server copy of a booth item (patient deletion privacy path). */
export async function deleteBoothServerCopy(boothId: string): Promise<void> {
  try {
    await fetch(`/api/booth/${boothId}`, { method: "DELETE" });
  } catch {
    // best effort; items expire after 24h regardless
  }
}
