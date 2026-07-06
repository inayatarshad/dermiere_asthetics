"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, useSessionUser } from "./store";
import {
  resolveImageUrl,
  loadLandmarks,
  saveLandmarks,
  loadJson,
  saveJson,
} from "./db";
import { loadImage } from "./img";
import { detectLandmarks } from "./face/landmarker";
import {
  refineDepthMultiView,
  type SideView,
  type ViewReport,
} from "./face/multiview";
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
  /** "multi" = depth refined from the turned photos; "single" = front only */
  depth: "multi" | "single" | null;
  depthViews?: ViewReport[];
  error?: string;
}

async function landmarksForPhoto(
  asset: Asset
): Promise<{ image: HTMLImageElement; landmarks: number[][] | null } | null> {
  const url = await resolveImageUrl(asset.storage_url);
  if (!url) return null;
  const image = await loadImage(url);
  const cached = await loadLandmarks(asset.id);
  if (cached) return { image, landmarks: cached };
  const landmarks = await detectLandmarks(image);
  if (landmarks) await saveLandmarks(asset.id, landmarks);
  return { image, landmarks };
}

/**
 * Load a photo asset, detect (or restore cached) landmarks. When the
 * turned-left/right captures are supplied, their parallax refines
 * per-landmark depth (face/multiview.ts) — the reason the capture protocol
 * takes three photos. Falls back to the single-view mesh whenever the fit
 * fails its quality gates, so the canvas can never break. Everything is
 * cached in IndexedDB, so revisits open instantly
 * (04_consultation-canvas-3d.md §3 "already loaded and fitted").
 */
export function useFaceData(
  asset: Asset | undefined | null,
  sideAssets?: { left?: Asset; right?: Asset }
): FaceData {
  const [data, setData] = useState<FaceData>({
    status: "idle",
    image: null,
    landmarks: null,
    depth: null,
  });
  const leftAsset = sideAssets?.left;
  const rightAsset = sideAssets?.right;
  const leftId = leftAsset?.id ?? null;
  const rightId = rightAsset?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!asset) {
      setData({ status: "idle", image: null, landmarks: null, depth: null });
      return;
    }
    setData({ status: "loading", image: null, landmarks: null, depth: null });
    (async () => {
      try {
        const front = await landmarksForPhoto(asset);
        if (!front) throw new Error("Photo not found on this device.");
        if (cancelled) return;
        if (!front.landmarks) {
          setData({
            status: "no_face",
            image: front.image,
            landmarks: null,
            depth: null,
          });
          return;
        }

        const sides = [
          leftAsset ? { asset: leftAsset, side: "left" as const } : null,
          rightAsset ? { asset: rightAsset, side: "right" as const } : null,
        ].filter(Boolean) as { asset: Asset; side: "left" | "right" }[];

        if (sides.length === 0) {
          setData({
            status: "ready",
            image: front.image,
            landmarks: front.landmarks,
            depth: "single",
          });
          return;
        }

        // composite cache: refined landmarks + view reports (or a recorded
        // miss). The version prefix busts caches when the solver changes —
        // v2: oriented sign resolution (pre-v2 fits could be inside-out).
        const mvKey = `mv2_${asset.id}_${leftId ?? "x"}_${rightId ?? "x"}`;
        const cachedMv = await loadLandmarks(mvKey);
        if (cachedMv) {
          const meta = await loadJson<ViewReport[] | { none: true }>(
            `${mvKey}_meta`
          );
          if (cancelled) return;
          const isMiss = !!meta && !Array.isArray(meta);
          setData({
            status: "ready",
            image: front.image,
            landmarks: cachedMv,
            depth: isMiss ? "single" : "multi",
            depthViews: !isMiss && meta ? (meta as ViewReport[]) : undefined,
          });
          return;
        }

        // detect the side photos (each cached per-photo)
        const sideViews: SideView[] = [];
        for (const s of sides) {
          try {
            const d = await landmarksForPhoto(s.asset);
            if (d?.landmarks) {
              sideViews.push({
                landmarks: d.landmarks,
                width: d.image.naturalWidth,
                height: d.image.naturalHeight,
                side: s.side,
              });
            }
          } catch {
            // a broken side photo must never block the canvas
          }
        }
        if (cancelled) return;

        const refined = refineDepthMultiView(
          front.landmarks,
          front.image.naturalWidth,
          front.image.naturalHeight,
          sideViews
        );

        if (refined) {
          const w = front.image.naturalWidth;
          const merged = front.landmarks.map((l, i) => [
            l[0],
            l[1],
            refined.zPx[i] / w,
          ]);
          await saveLandmarks(mvKey, merged);
          await saveJson(`${mvKey}_meta`, refined.views);
          if (!cancelled)
            setData({
              status: "ready",
              image: front.image,
              landmarks: merged,
              depth: "multi",
              depthViews: refined.views,
            });
        } else {
          // remember the miss so we do not re-fit on every open
          await saveLandmarks(mvKey, front.landmarks);
          await saveJson(`${mvKey}_meta`, { none: true });
          if (!cancelled)
            setData({
              status: "ready",
              image: front.image,
              landmarks: front.landmarks,
              depth: "single",
            });
        }
      } catch (err) {
        if (!cancelled)
          setData({
            status: "error",
            image: null,
            landmarks: null,
            depth: null,
            error: err instanceof Error ? err.message : "Failed to load face",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, leftId, rightId]);

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
