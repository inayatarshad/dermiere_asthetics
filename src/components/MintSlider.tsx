"use client";

/**
 * The star control (08_design-system.md §6): mint track fill, glass thumb,
 * live value label, end labels. Bidirectional sliders fill from center.
 */

export function MintSlider({
  label,
  hint,
  min,
  max,
  value,
  negLabel,
  posLabel,
  onChange,
  onCommit,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  value: number;
  negLabel?: string;
  posLabel?: string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
}) {
  const bidirectional = min < 0;
  const pct = ((value - min) / (max - min)) * 100;

  // center-out fill for bidirectional sliders
  const fillStyle = bidirectional
    ? {
        background:
          value >= 0
            ? `linear-gradient(to right, rgba(14,42,38,0.1) 0%, rgba(14,42,38,0.1) 50%, var(--mint-500) 50%, var(--mint-500) ${pct}%, rgba(14,42,38,0.1) ${pct}%, rgba(14,42,38,0.1) 100%)`
            : `linear-gradient(to right, rgba(14,42,38,0.1) 0%, rgba(14,42,38,0.1) ${pct}%, var(--mint-500) ${pct}%, var(--mint-500) 50%, rgba(14,42,38,0.1) 50%, rgba(14,42,38,0.1) 100%)`,
      }
    : ({ "--fill": `${pct}%` } as React.CSSProperties);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-ink-900">{label}</span>
        <span
          className={`text-xs tabular-nums font-semibold ${
            Math.abs(value) < 15 ? "text-ink-400" : "text-mint-500"
          }`}
        >
          {value > 0 ? `+${Math.round(value)}` : Math.round(value)}
        </span>
      </div>
      {hint && <div className="caption mb-1.5 -mt-0.5">{hint}</div>}
      <input
        type="range"
        className="mint-slider"
        min={min}
        max={max}
        step={1}
        value={value}
        style={fillStyle}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        onPointerUp={() => onCommit?.(value)}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") onCommit?.(value);
        }}
        aria-label={label}
      />
      {(negLabel || posLabel) && (
        <div className="flex justify-between mt-0.5">
          <span className="caption text-[11px]">{negLabel}</span>
          <span className="caption text-[11px]">{posLabel}</span>
        </div>
      )}
    </div>
  );
}
