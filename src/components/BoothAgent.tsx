"use client";

/**
 * Background booth-link agent (T1), mounted once in the clinic layout:
 *  - retries queued/failed pushes every 12s and on reconnect (venue wifi)
 *  - polls the booth inbox every 4s while "Booth link" is ON
 *  - renders the arrival toast
 */

import { useEffect, useRef, useState } from "react";
import { UserPlus } from "lucide-react";
import { useStore } from "@/lib/store";
import { pullBoothInbox, pushPatientToBooth } from "@/lib/booth";

const PULL_MS = 4000;
const RETRY_MS = 12000;
const TOAST_MS = 5000;

export function BoothAgent() {
  const boothLink = useStore((s) => s.boothLink);
  const boothToast = useStore((s) => s.boothToast);
  const setBoothToast = useStore((s) => s.setBoothToast);
  const pulling = useRef(false);
  const [toastVisible, setToastVisible] = useState(false);

  // ---- push retry loop -------------------------------------------------
  useEffect(() => {
    const retry = () => {
      const s = useStore.getState();
      if (s.boothAvailable === false) return; // feature dormant, no spam
      for (const [patientId, sync] of Object.entries(s.boothSync)) {
        if (sync.code === "not_configured") continue; // never auto-retried
        if (sync.status === "pending" || sync.status === "error") {
          void pushPatientToBooth(patientId);
        }
      }
    };
    const t = setInterval(retry, RETRY_MS);
    window.addEventListener("online", retry);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", retry);
    };
  }, []);

  // ---- inbox pull loop -------------------------------------------------
  useEffect(() => {
    if (!boothLink) return;
    const tick = async () => {
      if (pulling.current) return;
      pulling.current = true;
      try {
        const result = await pullBoothInbox();
        // No storage on the server: switch the toggle off instead of
        // polling a 501 every 4 seconds.
        if (result.code === "not_configured") {
          useStore.getState().setBoothLink(false);
        }
      } finally {
        pulling.current = false;
      }
    };
    void tick();
    const t = setInterval(tick, PULL_MS);
    return () => clearInterval(t);
  }, [boothLink]);

  // ---- arrival toast -----------------------------------------------------
  useEffect(() => {
    if (!boothToast) return;
    setToastVisible(true);
    const t = setTimeout(() => {
      setToastVisible(false);
      setBoothToast(null);
    }, TOAST_MS);
    return () => clearTimeout(t);
  }, [boothToast, setBoothToast]);

  if (!toastVisible || !boothToast) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 no-print fade-up">
      <div className="glass-strong flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl">
        <span className="w-9 h-9 rounded-xl bg-mint-500 text-white flex items-center justify-center pulse-mint">
          <UserPlus size={17} />
        </span>
        <div>
          <div className="text-sm font-medium text-ink-900">
            {boothToast.name} arrived from the booth
          </div>
          <div className="caption">Photos and consents merged. Ready to consult.</div>
        </div>
      </div>
    </div>
  );
}
