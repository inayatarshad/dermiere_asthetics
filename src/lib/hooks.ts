"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, useSessionUser } from "./store";
import { resolveImageUrl, loadLandmarks, saveLandmarks } from "./db";
import { loadImage } from "./img";
import { detectLandmarks } from "./face/landmarker";
import type { Asset } from "./types";

/** Avoid hydration mismatch: render store-driven UI only after mount. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Resolve an Asset's storage_url ("idb:<key>" or public path) to a src. */
export function useAssetUrl(asset: Asset | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const storageUrl = asset?.storage_url;
  useEffect(() => {
    let cancelled = false;
    if (!storageUrl) {
      setUrl(null);
      return;
    }
    resolveImageUrl(storageUrl).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [storageUrl]);
  return url;
}

export interface FaceData {
  status: "idle" | "loading" | "ready" | "no_face" | "error";
  image: HTMLImageElement | null;
  landmarks: number[][] | null; // normalized
  error?: string;
}

/**
 * Load a photo asset, detect (or restore cached) landmarks. The heavy
 * detection runs once per asset; results are cached in IndexedDB so the
 * canvas opens instantly on revisit (04_consultation-canvas-3d.md §3
 * "already loaded and fitted").
 */
export function useFaceData(asset: Asset | undefined | null): FaceData {
  const [data, setData] = useState<FaceData>({
    status: "idle",
    image: null,
    landmarks: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!asset) {
      setData({ status: "idle", image: null, landmarks: null });
      return;
    }
    setData({ status: "loading", image: null, landmarks: null });
    (async () => {
      try {
        const url = await resolveImageUrl(asset.storage_url);
        if (!url) throw new Error("Photo not found on this device.");
        const image = await loadImage(url);
        if (cancelled) return;

        const cached = await loadLandmarks(asset.id);
        if (cached) {
          if (!cancelled)
            setData({ status: "ready", image, landmarks: cached });
          return;
        }
        const landmarks = await detectLandmarks(image);
        if (cancelled) return;
        if (!landmarks) {
          setData({ status: "no_face", image, landmarks: null });
          return;
        }
        await saveLandmarks(asset.id, landmarks);
        if (!cancelled) setData({ status: "ready", image, landmarks });
      } catch (err) {
        if (!cancelled)
          setData({
            status: "error",
            image: null,
            landmarks: null,
            error: err instanceof Error ? err.message : "Failed to load face",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset]);

  return data;
}

/**
 * Auto-lock after inactivity — clinical devices are shared, so an unattended
 * screen must not expose patient data (01_registration-and-access.md §2).
 */
const IDLE_LOCK_MS = 10 * 60 * 1000;

export function useIdleLock() {
  const logout = useStore((s) => s.logout);
  const user = useSessionUser();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      logout();
      router.replace("/?locked=1");
    }, IDLE_LOCK_MS);
  }, [logout, router]);

  useEffect(() => {
    if (!user) return;
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, reset));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [user, reset]);
}
