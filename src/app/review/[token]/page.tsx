"use client";

/**
 * Public review page (§5.4) — the client's side of the loop. Zero-login,
 * mobile-first, CAPTURE noir/gold. Rate → highlights → note → submit;
 * the thank-you screen reveals the Capture Circle reward immediately
 * (§5.5 made visible). Deliberately avoids the clinic store: light
 * bundle, no seeding, token is the only capability.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Star, Sparkles } from "lucide-react";

type Phase = "loading" | "form" | "thanks" | "done-before" | "notfound" | "error";

interface Meta {
  firstName: string;
  treatments: string[];
  locationName: string;
  clinicName: string;
  completed: boolean;
  incentive: { kind: string; value: number; validityDays: number };
}

interface RewardOut {
  code: string;
  value: number;
  expires_at: string;
}

const HIGHLIGHTS = [
  "visible results",
  "no pain at all",
  "staff care",
  "clean & luxurious",
  "worth the price",
  "booking was easy",
];

const ACCENT = "#C4A15A";

export default function ReviewPage() {
  const params = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [highlights, setHighlights] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<RewardOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/review/${params.token}`);
        if (cancelled) return;
        if (res.status === 404) {
          setPhase("notfound");
          return;
        }
        const data = (await res.json()) as Meta & { ok?: boolean };
        if (!data.ok) {
          setPhase("error");
          return;
        }
        setMeta(data);
        setPhase(data.completed ? "done-before" : "form");
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  const toggle = (h: string) =>
    setHighlights((cur) =>
      cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]
    );

  const submit = async () => {
    if (rating === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/review/${params.token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment, highlights }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        reward?: RewardOut;
        error?: string;
      };
      if (data.ok) {
        setReward(data.reward ?? null);
        setPhase("thanks");
      } else if (data.error === "already_submitted") {
        setPhase("done-before");
      } else {
        setError("That did not go through. Please try again.");
      }
    } catch {
      setError("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const stage = (children: React.ReactNode) => (
    <div
      className="portal-stage portal-center"
      style={{ "--portal-accent": ACCENT } as React.CSSProperties}
    >
      {children}
    </div>
  );

  if (phase === "loading") {
    return stage(<div className="portal-spinner" />);
  }

  if (phase === "notfound") {
    return stage(
      <div className="portal-card portal-msg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/capture-logo-black.png" alt="" width={132} height={34} style={{ objectFit: "contain", margin: "0 auto" }} />
        <h1>this link is not active</h1>
        <p>it may have expired or been replaced. message us on WhatsApp and we will send a fresh one.</p>
      </div>
    );
  }

  if (phase === "error") {
    return stage(
      <div className="portal-card portal-msg">
        <h1>hmm, that did not load</h1>
        <p>please try again in a moment.</p>
        <button className="portal-submit" onClick={() => location.reload()}>
          try again
        </button>
      </div>
    );
  }

  if (phase === "done-before") {
    return stage(
      <div className="portal-card portal-msg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/capture-logo-black.png" alt="" width={132} height={34} style={{ objectFit: "contain", margin: "0 auto" }} />
        <h1>you have already shared your review</h1>
        <p>thank you — it means the world to the team. your Capture Circle reward is waiting at the front desk.</p>
      </div>
    );
  }

  if (phase === "thanks") {
    return stage(
      <div className="portal-card portal-msg">
        <div className="portal-check">
          <svg viewBox="0 0 52 52" width="52" height="52">
            <circle cx="26" cy="26" r="24" fill="none" strokeWidth="3" className="portal-check-ring" />
            <path d="M15 27l8 8 14-16" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="portal-check-tick" />
          </svg>
        </div>
        <h1>thank you for sharing.</h1>
        <p>your words help us keep every visit worthy of you.</p>

        {reward && (
          <div
            style={{
              marginTop: 22,
              borderRadius: 16,
              border: `1.5px solid ${ACCENT}`,
              background: "rgba(196,161,90,0.08)",
              padding: "18px 16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#8A6F35",
              }}
            >
              <Sparkles size={14} /> Capture Circle reward
            </div>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: "0.06em",
                margin: "10px 0 4px",
                color: "#1C1A16",
              }}
            >
              {reward.code}
            </div>
            <p style={{ fontSize: 13.5, color: "#4A443A", lineHeight: 1.5 }}>
              {reward.value}% off your next visit — show this code at the
              desk. Valid until{" "}
              {new Date(reward.expires_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              .
            </p>
          </div>
        )}

        <div className="portal-madeby">
          <span>the intimate science of beauty</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/capture-logo-black.png" alt="CAPTURE" />
        </div>
      </div>
    );
  }

  // ---- the form ----
  return (
    <div
      className="portal-stage"
      style={{ "--portal-accent": ACCENT } as React.CSSProperties}
    >
      <main className="portal-shell">
        <header className="portal-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/capture-logo-black.png" alt="CAPTURE" width={118} height={30} style={{ objectFit: "contain" }} />
        </header>

        <h1 className="portal-title">
          {meta?.firstName ? `${meta.firstName}, how was your visit?` : "how was your visit?"}
        </h1>
        <p className="portal-sub">
          {meta?.treatments?.length
            ? `${meta.treatments.join(" · ")} at ${meta.locationName}.`
            : `your visit at ${meta?.locationName ?? "CAPTURE"}.`}{" "}
          two taps and a thought — and your Capture Circle reward is yours.
        </p>

        {/* stars */}
        <div className="portal-section">
          <h2>
            <span>1</span> your rating
          </h2>
          <div style={{ display: "flex", gap: 10, padding: "4px 0" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                style={{ padding: 4 }}
              >
                <Star
                  size={38}
                  strokeWidth={1.4}
                  fill={(hover || rating) >= n ? ACCENT : "transparent"}
                  color={(hover || rating) >= n ? ACCENT : "#B7AE9C"}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p style={{ fontSize: 13.5, color: "#4A443A" }}>
              {rating === 5
                ? "wonderful — thank you."
                : rating === 4
                  ? "lovely — and we want to earn the fifth."
                  : "thank you for the honesty — the team will read every word."}
            </p>
          )}
        </div>

        {/* highlights */}
        <div className="portal-section">
          <h2>
            <span>2</span> what stood out?
          </h2>
          <div className="portal-chips">
            {HIGHLIGHTS.map((h) => (
              <button
                key={h}
                className={`portal-chip ${highlights.includes(h) ? "portal-chip-on" : ""}`}
                onClick={() => toggle(h)}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* comment */}
        <div className="portal-section">
          <h2>
            <span>3</span> in your words <em style={{ fontStyle: "normal", color: "#9A927F", fontWeight: 400, fontSize: 13 }}>(optional)</em>
          </h2>
          <label className="portal-area">
            <textarea
              placeholder="what should we keep doing — or do better?"
              value={comment}
              maxLength={900}
              onChange={(e) => setComment(e.target.value)}
            />
          </label>
        </div>

        {/* incentive note */}
        <p
          style={{
            marginTop: 22,
            fontSize: 13,
            color: "#8A6F35",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Sparkles size={15} />
          submitting earns you {meta?.incentive?.value ?? 10}% off your next
          visit with the Capture Circle.
        </p>

        {error && <p className="portal-error">{error}</p>}
        <div className="portal-spacer" />
      </main>

      {/* sticky submit */}
      <div className="portal-bar">
        <div className="portal-progress">
          <span style={{ width: `${rating > 0 ? (comment || highlights.length ? 100 : 66) : 20}%` }} />
        </div>
        <button
          className="portal-submit"
          disabled={rating === 0 || busy}
          onClick={() => void submit()}
        >
          {busy ? "sending…" : "send my review"}
        </button>
      </div>
    </div>
  );
}
