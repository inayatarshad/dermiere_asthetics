"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Lock,
  Stethoscope,
  ClipboardList,
  ShieldCheck,
  Megaphone,
  Palette,
  ArrowRight,
  Contact,
} from "lucide-react";
import { DERMIERE_DEMO_PASSWORD } from "@/lib/dermiere/clinic";
import { useStore } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { loginRequest, fetchBootstrap } from "@/lib/serverSync";
import { triggerBrandSplash } from "@/components/BrandSplash";
import { Logo, Spinner } from "@/components/ui";
import VyberoConcierge from "@/components/VyberoConcierge";

/**
 * Sign-in shortcuts for the development workspace.
 *
 * These fill in the EMAIL only - no password is stored in the repo. The
 * accounts are created by the provisioning script, which is where their
 * password is set.
 */
const ROLE_CARDS = [
  {
    role: "admin",
    email: "crm@dermiere.pk",
    label: "CRM Workspace",
    name: "Dermiere CRM",
    desc: "The CRM on its own: leads, follow-ups, inbox, feedback, analytics",
    icon: Contact,
  },
  {
    role: "admin",
    email: "anusha@dermiere.pk",
    label: "Founder & Director",
    name: "Dr. Anusha Liaqat",
    desc: "Full Clinic OS: patients, calendar, POS, reviews - and the CRM",
    icon: ShieldCheck,
  },
  {
    role: "doctor",
    email: "hina@dermiere.pk",
    label: "Dermatologist · Gulberg",
    name: "Dr. Hina Raza",
    desc: "Consultations, patient timelines, clinically relevant follow-ups",
    icon: Stethoscope,
  },
  {
    role: "doctor",
    email: "omar@dermiere.pk",
    label: "Dermatologist · F-11",
    name: "Dr. Omar Sheikh",
    desc: "Consultations, patient timelines, clinically relevant follow-ups",
    icon: Palette,
  },
  {
    role: "front_desk",
    email: "ayesha@dermiere.pk",
    label: "Front Desk · Gulberg",
    name: "Ayesha Tariq",
    desc: "Leads, follow-ups, shared inbox, appointments, point of sale",
    icon: ClipboardList,
  },
  {
    role: "front_desk",
    email: "bilal@dermiere.pk",
    label: "Front Desk · F-11",
    name: "Bilal Khan",
    desc: "Leads, follow-ups, shared inbox, appointments, point of sale",
    icon: Megaphone,
  },
];

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locked = searchParams.get("locked") === "1";
  const signedOut = searchParams.get("out") === "1";
  const requestedNext = searchParams.get("next");
  const mounted = useMounted();
  const hydrate = useStore((s) => s.hydrate);

  /**
   * Where this login lands. A CRM account goes to the CRM workspace, not to
   * a Clinic OS dashboard it cannot navigate; an explicit ?next= is honoured
   * only when it belongs to that account's workspace.
   */
  const landingFor = (workspace: string | undefined): string => {
    if (workspace === "crm") {
      return requestedNext?.startsWith("/crm") ? requestedNext : "/crm";
    }
    return requestedNext || "/dashboard";
  };

  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // After an explicit sign-out or idle lock, the sign-in screen must show
  // unconditionally - auto-bootstrap here is what looped the spinner when
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
        router.replace(landingFor(b.user?.workspace));
      } else {
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrate, router, requestedNext, locked, signedOut]);

  const doLogin = async (e: string, p: string) => {
    setBusy(true);
    setError(null);
    const r = await loginRequest(e, p);
    if (!r.ok || !r.bootstrap) {
      setError(r.error ?? "Those credentials did not match.");
      setBusy(false);
      return;
    }
    // branded loading moment: the Dermiere lockup sweeps across while the
    // workspace hydrates and the route changes underneath it
    triggerBrandSplash();
    hydrate(r.bootstrap);
    router.replace(landingFor(r.bootstrap.user?.workspace));
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    void doLogin(email, password);
  };

  /**
   * Fill in a seeded account and arm the form so a single Enter signs in.
   *
   * Both fields are filled - this is the demonstration clinic, whose shared
   * password is not a secret (see DERMIERE_DEMO_PASSWORD). Focus lands on
   * the submit button rather than an input, so Enter or Space completes the
   * sign-in without anything further to type.
   */
  const quick = (qEmail: string) => {
    setError(null);
    setEmail(qEmail);
    setPassword(DERMIERE_DEMO_PASSWORD);
    submitRef.current?.focus();
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
              Skin, considered
            </p>
            <h1 className="display text-4xl sm:text-5xl text-ink-900 max-w-md mt-3">
              Every enquiry, followed
              <span className="text-[color:var(--mint-500)] font-normal"> through</span>.
            </h1>
            <p className="mt-5 text-ink-700 max-w-md leading-relaxed">
              Leads arrive and land with a name. Follow-ups come due and get
              done. Conversations stay in one shared inbox. Feedback closes the
              loop. Gulberg and F-11, one screen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              "Leads pipeline",
              "Follow-ups",
              "Shared inbox",
              "Feedback & recovery",
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
          <p className="caption mt-1">Sign in to the Dermiere workspace.</p>

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
                placeholder="you@dermiere.pk"
                autoComplete="username"
              />
            </div>
            <div>
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                ref={passwordRef}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              ref={submitRef}
              disabled={busy}
              className="btn btn-primary w-full btn-lg"
            >
              {busy ? <Spinner className="w-4 h-4" /> : <>Enter workspace <ArrowRight size={17} /></>}
            </button>
          </form>

          <div className="mt-7">
            <div className="caption mb-2.5">
              The Dermiere team - pick one, then press Enter to sign in.
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

      {/* VYBERO web concierge - the public booking agent, live on the landing page */}
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
