"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Stethoscope, ClipboardList, ShieldCheck, ArrowRight } from "lucide-react";
import { useStore, useSessionUser } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { DEMO_PASSWORD } from "@/lib/seed";
import { Logo, Spinner } from "@/components/ui";

const ROLE_CARDS = [
  {
    role: "doctor",
    email: "doctor@meridian.clinic",
    label: "Doctor",
    name: "Dr. Ayesha Rahman",
    desc: "Run consultations: 3D canvas, AI visualization, plans and reports",
    icon: Stethoscope,
  },
  {
    role: "front_desk",
    email: "frontdesk@meridian.clinic",
    label: "Front Desk",
    name: "Sana Malik",
    desc: "Register patients, capture consent and photos, manage the queue",
    icon: ClipboardList,
  },
  {
    role: "admin",
    email: "admin@meridian.clinic",
    label: "Clinic Admin",
    name: "Omar Farooq",
    desc: "Manage staff, treatment templates and clinic settings",
    icon: ShieldCheck,
  },
];

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locked = searchParams.get("locked") === "1";
  const mounted = useMounted();
  const user = useSessionUser();
  const seeded = useStore((s) => s.seeded);
  const seedIfNeeded = useStore((s) => s.seedIfNeeded);
  const login = useStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seedIfNeeded();
  }, [seedIfNeeded]);

  useEffect(() => {
    if (mounted && user) router.replace("/dashboard");
  }, [mounted, user, router]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const u = login(email, password);
    if (!u) {
      setError("Those credentials did not match. Try a demo role below.");
      return;
    }
    router.replace("/dashboard");
  };

  const quick = (qEmail: string) => {
    setError(null);
    setEmail(qEmail);
    setPassword(DEMO_PASSWORD);
    const u = login(qEmail, DEMO_PASSWORD);
    if (u) router.replace("/dashboard");
  };

  if (!mounted || !seeded) {
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
            <h1 className="display text-4xl sm:text-5xl text-ink-900 max-w-md">
              The consultation, made
              <span className="text-mint-500 font-normal"> visible</span>.
            </h1>
            <p className="mt-5 text-ink-700 max-w-md leading-relaxed">
              A 3D face canvas, identity-preserving AI before and after
              previews, and a report your patients will keep. Built for modern
              aesthetic clinics.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["3D Consultation Canvas", "AI Before / After", "Treatment Plans", "Beautiful Reports"].map(
              (f) => (
                <span key={f} className="chip chip-static">
                  {f}
                </span>
              )
            )}
          </div>
        </div>

        {/* Sign-in panel */}
        <div className="glass-strong p-8 sm:p-10 fade-up-1">
          <h2 className="h1 text-ink-900">Sign in</h2>
          <p className="caption mt-1">
            Meridian Aesthetics, Lahore. Demo environment.
          </p>

          {locked && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-mint-100 px-4 py-3 text-sm text-ink-700">
              <Lock size={15} className="text-mint-500 shrink-0" />
              Screen locked after inactivity to protect patient privacy. Sign
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
                placeholder="doctor@meridian.clinic"
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
            <button type="submit" className="btn btn-primary w-full btn-lg">
              Enter clinic
              <ArrowRight size={17} />
            </button>
          </form>

          <div className="mt-7">
            <div className="caption mb-2.5">
              Demo roles. Password for all: <b>{DEMO_PASSWORD}</b>
            </div>
            <div className="space-y-2">
              {ROLE_CARDS.map(({ role, email: qEmail, label, name, desc, icon: Icon }) => (
                <button
                  key={role}
                  onClick={() => quick(qEmail)}
                  className="glass-subtle card-hover w-full flex items-center gap-3.5 px-4 py-3 text-left"
                >
                  <span className="w-10 h-10 rounded-xl bg-mint-100 text-mint-500 flex items-center justify-center shrink-0">
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-900">
                      {label}
                      <span className="text-ink-400 font-normal"> · {name}</span>
                    </span>
                    <span className="block text-xs text-ink-400 truncate">
                      {desc}
                    </span>
                  </span>
                  <ArrowRight size={15} className="ml-auto text-ink-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
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
