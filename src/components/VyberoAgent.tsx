"use client";

/**
 * Background sync with the VYBERO integration store: pulls the shared
 * appointment book + call log every 20s so bookings made by the voice
 * agent appear on clinic screens without a refresh. Mirrors BoothAgent's
 * graceful degradation: a deployment without Blob storage answers 501
 * once and the poller stands down for the session (local seed data keeps
 * the modules alive).
 */

import { useEffect, useRef } from "react";
import { useStore, useSessionUser } from "@/lib/store";
import type { Appointment, VyberoCall } from "@/lib/types";

const PULL_MS = 20_000;

export function VyberoAgent() {
  const user = useSessionUser();
  const mergeAppointments = useStore((s) => s.mergeAppointments);
  const mergeVyberoCalls = useStore((s) => s.mergeVyberoCalls);
  const dead = useRef(false); // 501 = storage not configured: stop for session

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const pull = async () => {
      if (dead.current || cancelled) return;
      try {
        const [ar, cr] = await Promise.all([
          fetch("/api/vybero/appointments", { cache: "no-store" }),
          fetch("/api/vybero/call-log", { cache: "no-store" }),
        ]);
        if (ar.status === 501 || cr.status === 501) {
          dead.current = true;
          return;
        }
        if (ar.ok) {
          const data = (await ar.json()) as { appointments?: Appointment[] };
          if (!cancelled && data.appointments?.length) {
            mergeAppointments(data.appointments);
          }
        }
        if (cr.ok) {
          const data = (await cr.json()) as { calls?: VyberoCall[] };
          if (!cancelled && data.calls?.length) {
            mergeVyberoCalls(data.calls);
          }
        }
      } catch {
        // transient network problems: try again next tick
      }
    };

    void pull();
    const timer = setInterval(() => void pull(), PULL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, mergeAppointments, mergeVyberoCalls]);

  return null;
}
