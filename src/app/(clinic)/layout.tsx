"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, useSessionUser } from "@/lib/store";
import { useIdleLock, useMounted } from "@/lib/hooks";
import { fetchBootstrap, installRecordSync } from "@/lib/serverSync";
import { TopNav } from "@/components/TopNav";
import { BoothAgent } from "@/components/BoothAgent";
import { VyberoAgent } from "@/components/VyberoAgent";
import { Spinner } from "@/components/ui";

export default function ClinicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const user = useSessionUser();
  const hydrate = useStore((s) => s.hydrate);
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useIdleLock();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await fetchBootstrap();
      if (cancelled) return;
      if (!b) {
        router.replace("/");
        return;
      }
      hydrate(b);
      // Start write-through sync (server is the source of truth).
      installRecordSync(
        useStore as unknown as {
          getState: () => Record<string, unknown>;
          subscribe: (fn: (state: Record<string, unknown>) => void) => () => void;
        }
      );
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate, router]);

  if (!mounted || !ready || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16">
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 pt-6">{children}</main>
      <BoothAgent />
      <VyberoAgent />
    </div>
  );
}
