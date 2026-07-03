"use client";

/**
 * Tappable face diagram for the consultation brief
 * (03_consultation-brief.md §B "areas of concern").
 */

const REGION_SHAPES: {
  id: string;
  label: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}[] = [
  { id: "forehead", label: "Brow / Forehead", cx: 60, cy: 30, rx: 26, ry: 13 },
  { id: "under_eye", label: "Under-eye", cx: 41, cy: 52, rx: 9, ry: 5 },
  { id: "under_eye2", label: "Under-eye", cx: 79, cy: 52, rx: 9, ry: 5 },
  { id: "nose", label: "Nose", cx: 60, cy: 60, rx: 9, ry: 15 },
  { id: "cheeks", label: "Cheeks", cx: 36, cy: 66, rx: 10, ry: 10 },
  { id: "cheeks2", label: "Cheeks", cx: 84, cy: 66, rx: 10, ry: 10 },
  { id: "lips", label: "Lips", cx: 60, cy: 84, rx: 12, ry: 6 },
  { id: "chin", label: "Chin", cx: 60, cy: 98, rx: 10, ry: 7 },
  { id: "jaw", label: "Jawline", cx: 34, cy: 88, rx: 8, ry: 11 },
  { id: "jaw2", label: "Jawline", cx: 86, cy: 88, rx: 8, ry: 11 },
  { id: "skin", label: "Skin", cx: 60, cy: 118, rx: 16, ry: 6 },
];

export function FaceDiagram({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (regionId: string) => void;
}) {
  const isActive = (id: string) => selected.includes(id.replace(/2$/, ""));
  return (
    <svg
      viewBox="0 0 120 132"
      className="w-full max-w-[240px] mx-auto select-none"
      role="group"
      aria-label="Areas of concern"
    >
      {/* head outline */}
      <ellipse
        cx="60"
        cy="60"
        rx="34"
        ry="44"
        fill="rgba(255,255,255,0.55)"
        stroke="var(--mint-300)"
        strokeWidth="1.2"
      />
      {/* neck + shoulders hint */}
      <path
        d="M48 100 L48 112 Q60 118 72 112 L72 100"
        fill="none"
        stroke="var(--mint-200)"
        strokeWidth="1.2"
      />
      {/* simple features */}
      <g stroke="var(--ink-400)" strokeWidth="0.9" opacity="0.5" fill="none">
        <path d="M32 46 Q41 42 50 46" />
        <path d="M70 46 Q79 42 88 46" />
        <ellipse cx="41" cy="49" rx="5.5" ry="2.6" />
        <ellipse cx="79" cy="49" rx="5.5" ry="2.6" />
        <path d="M56 66 Q60 69 64 66" />
        <path d="M52 82 Q60 86 68 82" />
      </g>
      {REGION_SHAPES.map((r) => {
        const baseId = r.id.replace(/2$/, "");
        const active = isActive(r.id);
        return (
          <ellipse
            key={r.id}
            cx={r.cx}
            cy={r.cy}
            rx={r.rx}
            ry={r.ry}
            fill={active ? "rgba(52, 211, 176, 0.4)" : "rgba(52, 211, 176, 0.06)"}
            stroke={active ? "var(--mint-500)" : "var(--mint-200)"}
            strokeWidth={active ? 1.4 : 0.8}
            strokeDasharray={active ? undefined : "2 2"}
            className="cursor-pointer transition-all hover:fill-[rgba(52,211,176,0.25)]"
            onClick={() => onToggle(baseId)}
            role="button"
            aria-pressed={active}
            aria-label={r.label}
          >
            <title>{r.label}</title>
          </ellipse>
        );
      })}
    </svg>
  );
}
