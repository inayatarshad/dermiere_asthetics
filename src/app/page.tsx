"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowRight } from "lucide-react";
import { DERMIERE_DEMO_PASSWORD } from "@/lib/dermiere/clinic";
import { useStore } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { loginRequest, fetchBootstrap } from "@/lib/serverSync";
import { triggerBrandSplash } from "@/components/BrandSplash";
import { Logo, Spinner } from "@/components/ui";
import VyberoConcierge from "@/components/VyberoConcierge";
import { ClinicAccounts, CrmAccounts } from "@/components/SignInAccounts";


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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Which set of accounts is on screen. The CRM is its own workspace. */
  const [mode, setMode] = useState<"clinic" | "crm">("clinic");
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
   * Pick a seeded account and go straight in.
   *
   * Choosing a person IS the decision, so there is nothing to confirm: the
   * click signs in rather than arming the form and waiting for Enter. The
   * fields are still filled so the form shows who is being signed in while
   * the request is in flight.
   *
   * This is the demonstration clinic, whose shared password is not a secret
   * (see DERMIERE_DEMO_PASSWORD); a live deployment has no such list.
   */
  const quick = (qEmail: string) => {
    if (busy) return;
    setError(null);
    setEmail(qEmail);
    setPassword(DERMIERE_DEMO_PASSWORD);
    void doLogin(qEmail, DERMIERE_DEMO_PASSWORD);
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
          <Logo size="lg" workspace={mode === "crm" ? "crm" : "clinic"} />
          <div className="my-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-[color:var(--mint-500)]">
              {mode === "crm"
                ? "After the booking, not before it"
                : "The intimate science of beauty"}
            </p>
            <h1 className="display text-4xl sm:text-5xl text-ink-900 max-w-md mt-3">
              {mode === "crm" ? (
                <>
                  Every booked client, all the way
                  <span className="text-[color:var(--mint-500)] font-normal"> round</span>.
                </>
              ) : (
                <>
                  One journey, from hello to
                  <span className="text-[color:var(--mint-500)] font-normal"> glow</span>.
                </>
              )}
            </h1>
            <p className="mt-5 text-ink-700 max-w-md leading-relaxed">
              {mode === "crm"
                ? "A consultation is booked here or at the front desk, and the pipeline takes over. WhatsApp confirms it. The visit is logged. The review link and the next session go out on their own. Then the same client comes back round as a fresh booking."
                : "VYBERO answers and books. The studio previews the outcome. The visit closes with a printed invoice, a review link and a Dermiére Circle reward. Every location, one screen."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(mode === "crm"
              ? [
                  "Lead pipeline",
                  "WhatsApp Business",
                  "Shared patient database",
                  "Message templates",
                ]
              : [
                  "VYBERO Booking Agent",
                  "Before / After Studio",
                  "Point of Sale",
                  "Reviews & Dermiére Circle",
                ]
            ).map((f) => (
              <span key={f} className="chip chip-static">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Sign-in panel */}
        <div className="glass-strong p-8 sm:p-10 fade-up-1">
          <h2 className="h1 text-ink-900">Sign in</h2>
          <p className="caption mt-1">Sign in to the Dermiére workspace.</p>

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
              disabled={busy}
              className="btn btn-primary w-full btn-lg"
            >
              {busy ? <Spinner className="w-4 h-4" /> : <>Enter workspace <ArrowRight size={17} /></>}
            </button>
          </form>

          {mode === "clinic" ? (
            <ClinicAccounts
              busy={busy}
              onPick={quick}
              onCrm={() => setMode("crm")}
            />
          ) : (
            <CrmAccounts
              busy={busy}
              onPick={quick}
              onClinic={() => setMode("clinic")}
            />
          )}
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
