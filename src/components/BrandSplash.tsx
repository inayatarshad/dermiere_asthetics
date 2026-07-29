"use client";

/**
 * Dermiere brand splash (owner 2026-07-23: "a proper page when you load the
 * system — the logo starts closed and expands; and a small loading-screen
 * animation when you log in. Make it beautiful.")
 *
 * Two modes on one full-screen ivory overlay:
 *   reveal — plays once per full page load (SSR-rendered, so it also masks
 *            the first paint): the wordmark opens from a closed center
 *            curtain, a champagne light sweeps across, CLINIC OS fades up.
 *   sweep  — fired by triggerBrandSplash() right after a successful login;
 *            it lives in the ROOT layout so it survives the route change
 *            into the dashboard, then dissolves.
 *
 * prefers-reduced-motion collapses both to a quick static fade.
 */

import { useEffect, useRef, useState } from "react";

const SPLASH_EVENT = "capture:brand-splash";
// visible time before the overlay starts dissolving
const HOLD_MS = { reveal: 1450, sweep: 1250 } as const;
const FADE_MS = 480;

/** Fire the post-login sweep (safe anywhere client-side). */
export function triggerBrandSplash() {
  window.dispatchEvent(new CustomEvent(SPLASH_EVENT));
}

export function BrandSplash() {
  // "reveal" is the initial state on purpose: it is in the server HTML, so
  // the brand is the first thing painted on a cold load.
  const [mode, setMode] = useState<"reveal" | "sweep" | null>("reveal");
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    const play = (m: "reveal" | "sweep") => {
      clear();
      setMode(m);
      setLeaving(false);
      const hold = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? 450
        : HOLD_MS[m];
      timers.current.push(
        setTimeout(() => setLeaving(true), hold),
        setTimeout(() => setMode(null), hold + FADE_MS)
      );
    };
    // the SSR-rendered reveal needs its dismiss timers armed on hydration
    play("reveal");
    const onSweep = () => play("sweep");
    window.addEventListener(SPLASH_EVENT, onSweep);
    return () => {
      clear();
      window.removeEventListener(SPLASH_EVENT, onSweep);
    };
  }, []);

  if (!mode) return null;
  return (
    <div
      className={`brand-splash ${mode === "sweep" ? "brand-splash-sweep" : "brand-splash-reveal"} ${
        leaving ? "brand-splash-leave" : ""
      }`}
      aria-hidden="true"
    >
      <div className="brand-splash-inner">
        <span className="brand-splash-mark">
          {/* Set as text, not an image: the clinic wordmark matches the Logo
              lockup exactly and stays sharp at any size. */}
          <span className="brand-splash-word">Dermiere</span>
          <span className="brand-splash-shine" />
        </span>
        <span className="brand-splash-tag">Clinic&nbsp;OS</span>
      </div>
    </div>
  );
}
