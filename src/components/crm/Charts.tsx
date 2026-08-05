"use client";

/**
 * Chart primitives for the CRM dashboard.
 *
 * Hand-rolled SVG rather than a charting dependency: these are four small
 * shapes, and a library would be a large amount of weight for them.
 *
 * The series palette follows the CRM reference: champagne gold, charcoal,
 * and pale gold. Marks and labels also distinguish each series, so colour
 * never has to carry meaning by itself.
 *
 * The app has no dark mode, so these are the light steps only.
 */

import { useId, useState } from "react";
import { Table2, LineChart as LineIcon } from "lucide-react";

/** Categorical slots, fixed order. Never cycled, never reassigned by rank. */
export const SERIES = {
  slot1: "#C4A15A",
  slot2: "#5B5750",
  slot3: "#E2C98D",
} as const;

/**
 * Reference funnel sequence. Adjacent stages use both value and position,
 * while the count and percentage remain printed beside every bar.
 */
const ORDINAL = ["#C4A15A", "#E3CD9C", "#1C1A16", "#E3CD9C", "#C4A15A"];

const GRID = "rgba(28,26,22,0.10)";
const SURFACE = "#FBF7EE";

const nf = new Intl.NumberFormat("en-US");

/** Clean axis ceiling: round up to something a person would read. */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / mag) * mag;
}

export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string; shape?: "bar" | "line" }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs text-ink-700">
          {it.shape === "line" ? (
            <span
              className="w-4 h-[2px] rounded-full shrink-0"
              style={{ background: it.color }}
            />
          ) : (
            <span
              className="w-2.5 h-2.5 rounded-[3px] shrink-0"
              style={{ background: it.color }}
            />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

export interface ComboPoint {
  label: string;
  booked: number;
  visited: number;
  messages: number;
}

/**
 * Fourteen days of bookings, visits and messages.
 *
 * All three are counts of events, so they share one axis. A second y-scale
 * would let any of them be drawn above any other and is never used here.
 *
 * Bars carry the appointments, a line carries the messages: different marks
 * because they are different kinds of thing, not to imply a second scale.
 */
export function ActivityChart({ data }: { data: ComboPoint[] }) {
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const clip = useId();

  const max = niceMax(
    Math.max(1, ...data.flatMap((d) => [d.booked, d.visited, d.messages]))
  );

  const W = 720;
  const H = 190;
  const PAD_L = 26;
  const PAD_B = 22;
  const PAD_T = 8;
  const plotW = W - PAD_L;
  const plotH = H - PAD_B - PAD_T;
  const band = plotW / data.length;
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;

  // Two bars per day, capped so the band keeps its air.
  const barW = Math.min(9, (band - 8) / 2);
  const gap = 2; // the surface gap between touching bars

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${PAD_L + band * (i + 0.5)},${y(d.messages)}`)
    .join(" ");

  if (asTable) {
    return (
      <div className="space-y-3">
        <ChartToolbar asTable={asTable} onToggle={() => setAsTable(false)} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400">
                <th className="font-medium py-1.5 pr-3">Day</th>
                <th className="font-medium py-1.5 pr-3 text-right">Booked</th>
                <th className="font-medium py-1.5 pr-3 text-right">Visited</th>
                <th className="font-medium py-1.5 text-right">Messages</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label} className="border-t border-[rgba(28,26,22,0.07)]">
                  <td className="py-1.5 pr-3 text-ink-700">{d.label}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-ink-900">{d.booked}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-ink-900">{d.visited}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink-900">{d.messages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const active = hover !== null ? data[hover] : null;

  return (
    <div className="space-y-3">
      <ChartToolbar asTable={asTable} onToggle={() => setAsTable(true)} />
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-[190px]"
          role="img"
          aria-label="Bookings, visits and messages over the last fourteen days"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={clip}>
              <rect x={PAD_L} y={0} width={plotW} height={PAD_T + plotH} />
            </clipPath>
          </defs>

          {/* gridlines: hairline, solid, recessive */}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={PAD_L}
                x2={W}
                y1={y(max * f)}
                y2={y(max * f)}
                stroke={GRID}
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={y(max * f) + 3.5}
                textAnchor="end"
                className="fill-ink-400"
                style={{ fontSize: 9 }}
              >
                {nf.format(Math.round(max * f))}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = PAD_L + band * (i + 0.5);
            const left = cx - barW - gap / 2;
            return (
              <g key={d.label}>
                {/* generous hit target, wider than the marks */}
                <rect
                  x={PAD_L + band * i}
                  y={0}
                  width={band}
                  height={H - PAD_B}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                {hover === i && (
                  <rect
                    x={PAD_L + band * i}
                    y={0}
                    width={band}
                    height={H - PAD_B}
                    fill="rgba(28,26,22,0.035)"
                  />
                )}
                <Bar x={left} w={barW} yTop={y(d.booked)} yBase={y(0)} fill={SERIES.slot1} />
                <Bar
                  x={left + barW + gap}
                  w={barW}
                  yTop={y(d.visited)}
                  yBase={y(0)}
                  fill={SERIES.slot2}
                />
              </g>
            );
          })}

          {/* messages: 2px line, round caps */}
          <path
            d={linePath}
            fill="none"
            stroke={SERIES.slot3}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            clipPath={`url(#${clip})`}
          />
          {hover !== null && (
            <circle
              cx={PAD_L + band * (hover + 0.5)}
              cy={y(data[hover].messages)}
              r={4}
              fill={SERIES.slot3}
              stroke={SURFACE}
              strokeWidth={2}
            />
          )}

          {/* every third day, so the axis never collides with itself */}
          {data.map((d, i) =>
            i % 3 === 0 ? (
              <text
                key={d.label}
                x={PAD_L + band * (i + 0.5)}
                y={H - 6}
                textAnchor="middle"
                className="fill-ink-400"
                style={{ fontSize: 9 }}
              >
                {d.label}
              </text>
            ) : null
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute top-0 glass-strong px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${((hover! + 0.5) / data.length) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-medium text-ink-900 mb-1">{active.label}</div>
            <Row color={SERIES.slot1} label="Booked" value={active.booked} />
            <Row color={SERIES.slot2} label="Visited" value={active.visited} />
            <Row color={SERIES.slot3} label="Messages" value={active.messages} />
          </div>
        )}
      </div>

      <Legend
        items={[
          { label: "Booked", color: SERIES.slot1 },
          { label: "Visited", color: SERIES.slot2 },
          { label: "Messages sent", color: SERIES.slot3, shape: "line" },
        ]}
      />
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: color }} />
      <span className="text-ink-700">{label}</span>
      <span className="ml-auto tabular-nums font-medium text-ink-900">{value}</span>
    </div>
  );
}

function ChartToolbar({ asTable, onToggle }: { asTable: boolean; onToggle: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 text-[11px] text-ink-400 hover:text-ink-700"
      >
        {asTable ? <LineIcon size={12} /> : <Table2 size={12} />}
        {asTable ? "Chart" : "Table"}
      </button>
    </div>
  );
}

/** A bar with a rounded data-end and a square foot on the baseline. */
function Bar({
  x,
  w,
  yTop,
  yBase,
  fill,
}: {
  x: number;
  w: number;
  yTop: number;
  yBase: number;
  fill: string;
}) {
  const h = Math.max(0, yBase - yTop);
  if (h <= 0) return null;
  const r = Math.min(4, w / 2, h);
  return (
    <path
      d={`M${x},${yBase} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + w - r},${yTop} Q${x + w},${yTop} ${x + w},${yTop + r} L${x + w},${yBase} Z`}
      fill={fill}
    />
  );
}

/**
 * The pipeline as it narrows.
 *
 * An ordinal ramp of one hue, dark to light, because the stages are ordered
 * rather than unrelated categories. Each row shows what share of the stage
 * above it survived, so the drop-off is readable where it happens.
 */
export function Funnel({
  steps,
}: {
  steps: Array<{ id: string; label: string; count: number; ofPrevious: number | null }>;
}) {
  const top = Math.max(1, steps[0]?.count ?? 1);
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={s.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-900">{s.label}</span>
            <span className="tabular-nums text-ink-700">
              {s.count}
              {s.ofPrevious !== null && (
                <span className="text-ink-400"> · {Math.round(s.ofPrevious)}% of above</span>
              )}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[rgba(28,26,22,0.06)] mt-1.5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(1.5, (s.count / top) * 100)}%`,
                background: ORDINAL[Math.min(i, ORDINAL.length - 1)],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * One rate as a ring. A single series, so no legend: the caption says what
 * it is and the number is written in the middle.
 */
export function Ring({
  value,
  caption,
  sub,
}: {
  value: number | null;
  caption: string;
  sub?: string;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const filled = value === null ? 0 : (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="flex items-center gap-4">
      <svg width={84} height={84} viewBox="0 0 84 84" className="shrink-0" aria-hidden>
        <circle cx={42} cy={42} r={r} fill="none" stroke="rgba(28,26,22,0.08)" strokeWidth={7} />
        {value !== null && (
          <circle
            cx={42}
            cy={42}
            r={r}
            fill="none"
            stroke={SERIES.slot1}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c - filled}`}
            transform="rotate(-90 42 42)"
          />
        )}
      </svg>
      <div className="min-w-0">
        <div className="text-2xl font-medium text-ink-900 tabular-nums">
          {value === null ? "-" : `${Math.round(value)}%`}
        </div>
        <div className="text-xs text-ink-700 mt-0.5">{caption}</div>
        {sub && <div className="text-[11px] text-ink-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

/**
 * A ranked breakdown. One series, one hue, so the bars carry magnitude and
 * nothing needs a legend.
 */
export function Breakdown({
  rows,
  empty,
}: {
  rows: Array<{ label: string; value: number }>;
  empty: string;
}) {
  if (rows.length === 0) return <p className="caption">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-ink-700" title={r.label}>
            {r.label}
          </span>
          <span className="flex-1 h-2 rounded-full bg-[rgba(28,26,22,0.06)] overflow-hidden">
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: SERIES.slot1 }}
            />
          </span>
          <span className="w-8 text-right tabular-nums text-ink-900">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
