"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  Stethoscope,
  ClipboardList,
  ShieldCheck,
  Megaphone,
  Palette,
  ArrowRight,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { loginRequest, fetchBootstrap } from "@/lib/serverSync";
import { triggerBrandSplash } from "@/components/BrandSplash";
import { Logo, Spinner } from "@/components/ui";
import { DEMO_PASSWORD } from "@/lib/seed";
import VyberoConcierge from "@/components/VyberoConcierge";

const ROLE_CARDS = [
  {
    role: "doctor",
    email: "dr.sadia@capture.cc",
    label: "Medical Director",
    name: "Dr. Sadia Khan",
    desc: "Consultations, MARK-VU reviews, visualization studio, treatment plans",
    icon: Stethoscope,
  },
  {
    role: "admin",
    email: "ryan@capture.cc",
    label: "Creative",
    name: "Ryan Hikmat",
    desc: "Project lead — full workspace: studio, patients, analytics, settings",
    icon: Palette,
  },
  {
    role: "front_desk",
    email: "frontdesk@capture.cc",
    label: "Front Desk",
    name: "Amal Fatima",
    desc: "Check-in, point of sale, invoices, review links, the day's queue",
    icon: ClipboardList,
  },
  {
    role: "admin",
    email: "shahrukh@capture.cc",
    label: "Operations",
    name: "Shah Rukh Ahmed",
    desc: "All locations: analytics, reviews monitoring, staff and settings",
    icon: ShieldCheck,
  },
  {
    role: "admin",
    email: "rameez@capture.cc",
    label: "Marketing",
    name: "Rameez Hasan",
    desc: "Review scores, VYBERO call insights, Capture Circle performance",
    icon: Megaphone,
  },
];

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locked = searchParams.get("locked") === "1";
  const signedOut = searchParams.get("out") === "1";
  const next = searchParams.get("next") || "/dashboard";
  const mounted = useMounted();
  const hydrate = useStore((s) => s.hydrate);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // After an explicit sign-out or idle lock, the sign-in screen must show
  // unconditionally — auto-bootstrap here is what looped the spinner when
  // the cookie was mid-clear.
  const [checking, setChecking] = useState(!locked && !signedOut);

  // If already signed in (valid cookie), hydrate and go straight in.
  useEffect(() => {
    if (locked || signedOut) return;
    let cancelled = false;
    (async () => {
      const b = await fetchBootstrap();
      if (cancelled) return;
      if (b) {
        hydrate(b);
        router.replace(next);
      } else {
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate, router, next, locked, signedOut]);

  const doLogin = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    const r = await loginRequest(e, p);
    if (!r.ok || !r.bootstrap) {
      setError(r.error ?? "Those credentials did not match.");
      setBusy(false);
      return;
    }
    // branded loading moment: the Capture lockup sweeps across while the
    // workspace hydrates and the route changes underneath it
    triggerBrandSplash();
    hydrate(r.bootstrap);
    router.replace(next);
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    void doLogin(email, password);
  };

  const quick = (qEmail: string) => {
    setError(null);
    setEmail(qEmail);
    setPassword(DEMO_PASSWORD);
    void doLogin(qEmail, DEMO_PASSWORD);
  };

  if (!mounted || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_1fr] gap-6 items-stretch">
        {/* Brand panel */}
        <div className="glass p-8 sm:p-12 flex flex-col justify-between fade-up min-h-[420px]">
          <Logo size="lg" />
          <div className="my-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-[color:var(--mint-500)]">
              The intimate science of beauty
            </p>
            <h1 className="display text-4xl sm:text-5xl text-ink-900 max-w-md mt-3">
              One journey, from hello to
              <span className="text-[color:var(--mint-500)] font-normal"> glow</span>.
            </h1>
            <p className="mt-5 text-ink-700 max-w-md leading-relaxed">
              VYBERO answers and books. MARK-VU reads the skin. The studio
              previews the outcome. The visit closes with a printed invoice, a
              review link and a Capture Circle reward. Every location, one
              screen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "VYBERO Booking Agent",
              "Before / After Studio",
              "Point of Sale",
              "Reviews & Capture Circle",
            ].map((f) => (
              <span key={f} className="chip chip-static">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Sign-in panel */}
        <div className="glass-strong p-8 sm:p-10 fade-up-1">
          <h2 className="h1 text-ink-900">Sign in</h2>
          <p className="caption mt-1">Sign in to the CAPTURE workspace.</p>

          {locked && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-mint-100 px-4 py-3 text-sm text-ink-700">
              <Lock size={15} className="text-[color:var(--mint-500)] shrink-0" />
              Screen locked after inactivity to protect client privacy. Sign
              in to continue.
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@capture.cc"
                autoComplete="username"
              />
            </div>
            <div>
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full btn-lg">
              {busy ? <Spinner className="w-4 h-4" /> : <>Enter workspace <ArrowRight size={17} /></>}
            </button>
          </form>

          <div className="mt-7">
            <div className="caption mb-2.5">
              The CAPTURE team. Password for all: <b>{DEMO_PASSWORD}</b>
            </div>
            <div className="space-y-2">
              {ROLE_CARDS.map(({ email: qEmail, label, name, desc, icon: Icon }) => (
                <button
                  key={qEmail}
                  disabled={busy}
                  onClick={() => quick(qEmail)}
                  className="glass-subtle card-hover w-full flex items-center gap-3.5 px-4 py-3 text-left"
                >
                  <span className="w-10 h-10 rounded-xl bg-mint-100 text-[color:var(--mint-500)] flex items-center justify-center shrink-0">
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-900">
                      {label}
                      <span className="text-ink-400 font-normal"> · {name}</span>
                    </span>
                    <span className="block text-xs text-ink-400 truncate">{desc}</span>
                  </span>
                  <ArrowRight size={15} className="ml-auto text-ink-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* VYBERO web concierge — the public booking agent, live on the landing page */}
      <VyberoConcierge />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
