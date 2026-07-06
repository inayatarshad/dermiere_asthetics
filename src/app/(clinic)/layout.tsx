"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore, useSessionUser } from "@/lib/store";
import { useIdleLock, useMounted } from "@/lib/hooks";
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
  const seeded = useStore((s) => s.seeded);
  const seedIfNeeded = useStore((s) => s.seedIfNeeded);
  const router = useRouter();

  useIdleLock();

  useEffect(() => {
    seedIfNeeded();
  }, [seedIfNeeded]);

  useEffect(() => {
    if (mounted && seeded && !user) router.replace("/");
  }, [mounted, seeded, user, router]);

  if (!mounted || !seeded || !user) {
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
