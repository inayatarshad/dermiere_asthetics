"use client";

/**
 * The before | after reveal — the money moment of the demo
 * (05_ai-before-after.md §9). Draggable frosted divider, mint accent line.
 */

import { useCallback, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel = "Before",
  afterLabel = "After",
  aspect = "4 / 4.4",
}: {
  beforeSrc: string;
  afterSrc: string | null;
  beforeLabel?: string;
  afterLabel?: string;
  aspect?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const updateFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.min(98, Math.max(2, pct)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) updateFromClientX(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      ref={containerRef}
      className="relative rounded-2xl overflow-hidden select-none border border-white/70 shadow-lg"
      style={{ aspectRatio: aspect, background: "var(--mint-100)", touchAction: "none" }}
      onPointerDown={afterSrc ? onPointerDown : undefined}
      onPointerMove={afterSrc ? onPointerMove : undefined}
      onPointerUp={onPointerUp}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuenow={Math.round(pos)}
    >
      {/* before (base layer) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeSrc}
        alt={beforeLabel}
        className="absolute inset-0 w-full h-full object-cover"
        draggable={false}
      />

      {afterSrc ? (
        <>
          {/* after (clipped to the right of the divider) */}
          <div
            className="absolute inset-0"
            style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={afterSrc}
              alt={afterLabel}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
          </div>

          {/* divider */}
          <div
            className="absolute top-0 bottom-0 w-[2px] bg-mint-400"
            style={{ left: `${pos}%`, boxShadow: "0 0 12px rgba(52,211,176,0.8)" }}
          />
          <button
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full flex items-center justify-center text-ink-900 cursor-ew-resize"
            style={{
              left: `${pos}%`,
              background: "rgba(255,255,255,0.85)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.9)",
              boxShadow: "0 4px 16px rgba(20,80,70,0.3)",
            }}
            aria-label="Drag to compare"
          >
            <ChevronsLeftRight size={18} />
          </button>

          <span className="absolute top-3 left-3 rounded-full bg-black/40 text-white text-xs px-3 py-1 backdrop-blur-md">
            {beforeLabel}
          </span>
          <span className="absolute top-3 right-3 rounded-full bg-mint-500/90 text-white text-xs px-3 py-1 backdrop-blur-md">
            {afterLabel}
          </span>
        </>
      ) : (
        <span className="absolute top-3 left-3 rounded-full bg-black/40 text-white text-xs px-3 py-1 backdrop-blur-md">
          {beforeLabel}
        </span>
      )}
    </div>
  );
}
