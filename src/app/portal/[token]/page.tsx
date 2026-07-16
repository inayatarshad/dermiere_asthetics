"use client";

/**
 * Brand Discovery Portal — the doctor's form
 * (spec: Brand-Discovery-Portal-BUILD-SPEC.md).
 *
 * Public, zero-login, token-gated. Opens instantly from a WhatsApp tap,
 * mobile-first: big tap chips, minimal typing, a sticky progress + submit
 * bar, autosave to localStorage keyed by token so a doctor can resume.
 * Deliberately does NOT import the clinic store: this route stays light
 * and never touches clinic auth or seeding.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";

type InviteMeta = {
  clinicName: string;
  doctorName: string;
  city: string;
  brandTheme: { primary?: string; brandName?: string } | null;
  completed: boolean;
};

interface FormState {
  clinicName: string;
  doctorName: string;
  cityArea: string;
  whatsapp: string;
  instagram: string;
  website: string;
  patientsPerDay: string;
  monthlyBudget: string;
  bookingMethods: string[];
  painPoints: string[];
  interests: string[];
  servicesInDemand: string;
  helpNotes: string;
  consent: boolean;
}

const EMPTY: FormState = {
  clinicName: "",
  doctorName: "",
  cityArea: "",
  whatsapp: "",
  instagram: "",
  website: "",
  patientsPerDay: "",
  monthlyBudget: "",
  bookingMethods: [],
  painPoints: [],
  interests: [],
  servicesInDemand: "",
  helpNotes: "",
  consent: false,
};

const PATIENTS = [
  { v: "1-5", label: "1–5" },
  { v: "6-10", label: "6–10" },
  { v: "11-20", label: "11–20" },
  { v: "20+", label: "20+" },
];
const BUDGETS = [
  { v: "none", label: "none yet" },
  { v: "under_50k", label: "under 50k" },
  { v: "50_150k", label: "50 to 150k" },
  { v: "over_150k", label: "150k+" },
];
const BOOKING = [
  { v: "phone_calls", label: "phone calls" },
  { v: "instagram_dms", label: "instagram DMs" },
  { v: "walk_ins", label: "walk-ins" },
  { v: "front_desk", label: "front desk" },
];
const PAINS = [
  { v: "missed_calls", label: "missed calls" },
  { v: "no_shows", label: "no-shows" },
  { v: "front_desk_load", label: "front-desk load" },
  { v: "new_patients", label: "getting new patients" },
];
const INTERESTS = [
  { v: "vybero", label: "AI call answering & booking (VYBERO)" },
  { v: "contour_3d", label: "clinic OS: patients, POS & 3D consult" },
  { v: "ai_report", label: "free AI skin assessment reports" },
  { v: "website_branding", label: "EXOMERE treatments at my clinic" },
  { v: "chorus_ugc", label: "co-branded marketing with CAPTURE" },
];

function TapChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`portal-chip ${active ? "portal-chip-on" : ""}`}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="portal-section">
      <h2>
        <span>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<
    "loading" | "notfound" | "form" | "sending" | "thanks" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [meta, setMeta] = useState<InviteMeta | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [intro, setIntro] = useState<"pending" | "playing" | "done">("pending");
  const hpRef = useRef<HTMLInputElement>(null);
  const storageKey = `portal_${token}`;
  const introKey = `portal_intro_${token}`;

  const endIntro = useCallback(() => {
    setIntro("done");
    try {
      localStorage.setItem(introKey, "1");
    } catch {
      // best-effort
    }
  }, [introKey]);

  // load invite + restore autosave
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/portal/${token}`, { cache: "no-store" });
        if (res.status === 404) {
          if (!cancelled) setPhase("notfound");
          return;
        }
        if (!res.ok) throw new Error("load failed");
        const m = (await res.json()) as InviteMeta;
        if (cancelled) return;
        setMeta(m);
        if (m.completed) {
          setPhase("thanks");
          return;
        }
        let restored: Partial<FormState> = {};
        try {
          restored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
        } catch {
          // ignore broken autosave
        }
        setForm({
          ...EMPTY,
          clinicName: m.clinicName,
          doctorName: m.doctorName,
          cityArea: m.city,
          ...restored,
          consent: false, // consent is never restored: an explicit tap each time
        });
        // the personalized welcome plays once per link, first open only
        let seen = false;
        try {
          seen = localStorage.getItem(introKey) === "1";
        } catch {
          seen = false;
        }
        setIntro(seen ? "done" : "playing");
        setPhase("form");
      } catch {
        if (!cancelled) {
          setErrorMsg("could not load the form. check your connection and try again.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // failsafe: some in-app browsers throttle CSS animations; the welcome
  // must never trap the doctor, so it hard-ends after the choreography
  // window regardless of animation events (tap-to-skip also works).
  useEffect(() => {
    if (intro !== "playing") return;
    const t = setTimeout(endIntro, 9600);
    return () => clearTimeout(t);
  }, [intro, endIntro]);

  // autosave (debounced)
  useEffect(() => {
    if (phase !== "form") return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(form));
      } catch {
        // storage full/blocked: autosave is best-effort
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form, phase, storageKey]);

  const set = useCallback(<K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  }, []);
  const toggle = useCallback(
    (k: "bookingMethods" | "painPoints" | "interests", v: string) => {
      setForm((f) => ({
        ...f,
        [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v],
      }));
    },
    []
  );

  // progress: how many of the meaningful answers are in
  const progress = useMemo(() => {
    const checks = [
      form.clinicName.trim() !== "",
      form.doctorName.trim() !== "",
      form.cityArea.trim() !== "",
      form.whatsapp.trim() !== "",
      form.instagram.trim() !== "" || form.website.trim() !== "",
      form.patientsPerDay !== "",
      form.monthlyBudget !== "",
      form.bookingMethods.length > 0,
      form.painPoints.length > 0,
      form.interests.length > 0,
      form.servicesInDemand.trim() !== "" || form.helpNotes.trim() !== "",
      form.consent,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [form]);

  const canSubmit =
    form.clinicName.trim() !== "" &&
    form.doctorName.trim() !== "" &&
    form.consent &&
    phase === "form";

  const submit = async () => {
    if (!canSubmit) return;
    setPhase("sending");
    try {
      const res = await fetch(`/api/portal/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          website_hp: hpRef.current?.value ?? "",
        }),
      });
      if (res.ok || res.status === 409) {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // best-effort cleanup
        }
        setPhase("thanks");
      } else {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setErrorMsg(data.message ?? "something went wrong. please try again.");
        setPhase("form");
      }
    } catch {
      setErrorMsg("could not reach us. check your connection and try again.");
      setPhase("form");
    }
  };

  const accent = meta?.brandTheme?.primary || undefined;
  const brandName = meta?.brandTheme?.brandName;

  const wordmark = brandName ? (
    <span className="portal-wordmark">{brandName}</span>
  ) : (
    <span className="portal-wordmark">
      CAPTURE <i>partners</i>
    </span>
  );

  if (phase === "loading") {
    return (
      <div className="portal-stage portal-center">
        <div className="portal-spinner" />
      </div>
    );
  }

  if (phase === "notfound") {
    return (
      <div className="portal-stage portal-center">
        <div className="portal-card portal-msg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/capture-logo-black.png" alt="" width={132} height={34} style={{ objectFit: "contain", margin: "0 auto" }} />
          <h1>this link is not active</h1>
          <p>
            it may have expired or been replaced. message us on WhatsApp and
            we will send you a fresh one.
          </p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="portal-stage portal-center">
        <div className="portal-card portal-msg">
          <h1>hmm, that did not load</h1>
          <p>{errorMsg}</p>
          <button className="portal-submit" onClick={() => location.reload()}>
            try again
          </button>
        </div>
      </div>
    );
  }

  if (phase === "thanks") {
    return (
      <div className="portal-stage portal-center" style={accent ? ({ "--portal-accent": accent } as React.CSSProperties) : undefined}>
        <div className="portal-card portal-msg">
          <div className="portal-check">
            <svg viewBox="0 0 52 52" width="52" height="52">
              <circle cx="26" cy="26" r="24" fill="none" strokeWidth="3" className="portal-check-ring" />
              <path d="M15 27l8 8 14-16" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="portal-check-tick" />
            </svg>
          </div>
          <h1>thank you, we&rsquo;re on it.</h1>
          <p>
            we&rsquo;ll review your answers and come back on WhatsApp with a
            proposal tailored to your clinic.
          </p>

          {/* the partnership they can join */}
          <div className="portal-product">
            <div className="portal-product-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/capture-logo-black.png" alt="" style={{ width: 110, height: 28, objectFit: "contain" }} />
            </div>
            <p>
              the CAPTURE partner network: EXOMERE &amp; MitoRedLight
              treatments, the Clinic OS with bookings, point of sale and
              review monitoring, and an AI receptionist that answers your
              calls. tailored for your clinic, included in your proposal.
            </p>
          </div>

          {/* the brand behind it */}
          <div className="portal-madeby">
            <span>the intimate science of beauty</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/capture-logo-black.png" alt="CAPTURE" />
          </div>
        </div>
      </div>
    );
  }

  // greet with the name exactly as the invite stored it — names carry
  // their own titles (Dr, Col, Sir), and inventing one misaddresses
  // anyone who is not a doctor
  const greeting = meta?.doctorName ? `hi ${meta.doctorName.trim()},` : "hello,";

  return (
    <div
      className="portal-stage"
      style={accent ? ({ "--portal-accent": accent } as React.CSSProperties) : undefined}
    >
      {/* personalized welcome — plays once, tap anywhere to skip */}
      {intro === "playing" && (
        <div
          className="portal-intro"
          onClick={endIntro}
          onAnimationEnd={(e) => {
            if (e.animationName === "pi-out") endIntro();
          }}
          role="button"
          aria-label="Skip introduction"
        >
          <p className="pi-line pi-line-1">{greeting}</p>
          <p className="pi-line pi-line-2">
            please take a moment to fill out this form.
          </p>
          <p className="pi-line pi-line-3">
            all of your data is protected and secured by CAPTURE.
          </p>
          <div className="pi-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/capture-logo-black.png" alt="CAPTURE" />
          </div>
          <span className="pi-skip">tap to skip</span>
        </div>
      )}

      <main className="portal-shell">
        <header className="portal-head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/capture-logo-black.png" alt="" width={118} height={30} style={{ objectFit: "contain" }} />
          {wordmark}
        </header>

        <h1 className="portal-title">
          let&rsquo;s build something made for your clinic.
        </h1>
        <p className="portal-sub">
          thank you for your interest in partnering with CAPTURE. this quick
          form helps us tailor pricing and a proposal exactly to you. it takes
          about two minutes.
        </p>

        <Section n={1} title="your clinic">
          <div className="portal-grid">
            <label>
              clinic / brand name <b>*</b>
              <input
                value={form.clinicName}
                onChange={(e) => set("clinicName", e.target.value)}
                placeholder="e.g. Meridian Aesthetics"
              />
            </label>
            <label>
              doctor name <b>*</b>
              <input
                value={form.doctorName}
                onChange={(e) => set("doctorName", e.target.value)}
                placeholder="e.g. Dr Ayesha Rahman"
              />
            </label>
            <label>
              city &amp; area
              <input
                value={form.cityArea}
                onChange={(e) => set("cityArea", e.target.value)}
                placeholder="e.g. Lahore, Gulberg III"
              />
            </label>
            <label>
              WhatsApp / phone
              <input
                type="tel"
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", e.target.value)}
                placeholder="+92 3xx xxxxxxx"
              />
            </label>
            <label>
              instagram handle
              <input
                value={form.instagram}
                onChange={(e) => set("instagram", e.target.value)}
                placeholder="@yourclinic"
              />
            </label>
            <label>
              website
              <input
                type="url"
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                placeholder="https://"
              />
            </label>
          </div>
        </Section>

        <Section n={2} title="your day">
          <p className="portal-q">patients on an average day</p>
          <div className="portal-chips">
            {PATIENTS.map((o) => (
              <TapChip
                key={o.v}
                active={form.patientsPerDay === o.v}
                onClick={() =>
                  set("patientsPerDay", form.patientsPerDay === o.v ? "" : o.v)
                }
              >
                {o.label}
              </TapChip>
            ))}
          </div>
          <p className="portal-q">monthly marketing budget (PKR)</p>
          <div className="portal-chips">
            {BUDGETS.map((o) => (
              <TapChip
                key={o.v}
                active={form.monthlyBudget === o.v}
                onClick={() =>
                  set("monthlyBudget", form.monthlyBudget === o.v ? "" : o.v)
                }
              >
                {o.label}
              </TapChip>
            ))}
          </div>
          <p className="portal-q">how do patients book today? pick all that apply</p>
          <div className="portal-chips">
            {BOOKING.map((o) => (
              <TapChip
                key={o.v}
                active={form.bookingMethods.includes(o.v)}
                onClick={() => toggle("bookingMethods", o.v)}
              >
                {o.label}
              </TapChip>
            ))}
          </div>
          <p className="portal-q">biggest day-to-day headache?</p>
          <div className="portal-chips">
            {PAINS.map((o) => (
              <TapChip
                key={o.v}
                active={form.painPoints.includes(o.v)}
                onClick={() => toggle("painPoints", o.v)}
              >
                {o.label}
              </TapChip>
            ))}
          </div>
        </Section>

        <Section n={3} title="your proposal">
          <p className="portal-q">what should we include? pick anything interesting</p>
          <div className="portal-chips portal-chips-col">
            {INTERESTS.map((o) => (
              <TapChip
                key={o.v}
                active={form.interests.includes(o.v)}
                onClick={() => toggle("interests", o.v)}
              >
                {o.label}
              </TapChip>
            ))}
          </div>
          <label className="portal-area">
            which services are most in demand at your clinic?
            <textarea
              rows={3}
              value={form.servicesInDemand}
              onChange={(e) => set("servicesInDemand", e.target.value)}
              placeholder="e.g. fillers, laser, hair transplant consults..."
            />
          </label>
          <label className="portal-area">
            anything specific we can help with?
            <textarea
              rows={3}
              value={form.helpNotes}
              onChange={(e) => set("helpNotes", e.target.value)}
              placeholder="tell us anything"
            />
          </label>
        </Section>

        {/* honeypot: hidden from humans, tempting for bots */}
        <input
          ref={hpRef}
          type="text"
          name="website_hp"
          tabIndex={-1}
          autoComplete="off"
          className="portal-hp"
          aria-hidden="true"
        />

        <label className="portal-consent">
          <input
            type="checkbox"
            checked={form.consent}
            onChange={(e) => set("consent", e.target.checked)}
          />
          <span>yes, CAPTURE can contact me about my proposal.</span>
        </label>

        {errorMsg && <p className="portal-error">{errorMsg}</p>}
        <div className="portal-spacer" />
      </main>

      {/* sticky progress + submit */}
      <div className="portal-bar">
        <div className="portal-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
        <button
          className="portal-submit"
          disabled={!canSubmit || phase !== "form"}
          onClick={() => void submit()}
        >
          {phase === "sending" ? "sending..." : "send my answers"}
        </button>
      </div>
    </div>
  );
}
