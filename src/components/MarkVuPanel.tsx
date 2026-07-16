"use client";

/**
 * MARK-VU skin analysis panel (§5.6) — the intake scanner's numbers on
 * the client record. Manual entry mirrors the device's report sheet (the
 * unit has no export API on-site), an optional photo of the printed
 * sheet attaches as evidence, and deltas across scans turn the data into
 * a progress story the specialist can sell against.
 */

import { useMemo, useState } from "react";
import { ScanLine, Plus, TrendingDown, TrendingUp, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { saveImage } from "@/lib/db";
import {
  SKIN_METRIC_LABELS,
  type SkinAnalysis,
  type SkinMetrics,
} from "@/lib/types";
import { GlassCard, Modal, Spinner } from "@/components/ui";
import { MintSlider } from "@/components/MintSlider";
import { formatDate } from "@/lib/format";

const DEFAULT_METRICS: SkinMetrics = {
  pigmentation: 50,
  pores: 50,
  wrinkles: 30,
  sebum: 50,
  uv_damage: 40,
  moisture: 50,
};

export function MarkVuPanel({ patientId }: { patientId: string }) {
  // Select the raw array (stable reference) and derive with useMemo —
  // a filter().sort() inside the selector returns a fresh array every
  // snapshot and loops the render (zustand v5 strict equality).
  const allAnalyses = useStore((s) => s.skinAnalyses);
  const analyses = useMemo(
    () =>
      allAnalyses
        .filter((a) => a.patient_id === patientId)
        .sort((a, b) => b.taken_at.localeCompare(a.taken_at)),
    [allAnalyses, patientId]
  );
  const addSkinAnalysis = useStore((s) => s.addSkinAnalysis);
  const removeSkinAnalysis = useStore((s) => s.removeSkinAnalysis);
  const addAsset = useStore((s) => s.addAsset);

  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<SkinMetrics>(DEFAULT_METRICS);
  const [notes, setNotes] = useState("");
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const latest = analyses[0];
  const previous = analyses[1];

  const deltas = useMemo(() => {
    if (!latest || !previous) return null;
    const out: Partial<Record<keyof SkinMetrics, number>> = {};
    for (const { key } of SKIN_METRIC_LABELS) {
      out[key] = latest.metrics[key] - previous.metrics[key];
    }
    return out;
  }, [latest, previous]);

  const save = async () => {
    setBusy(true);
    try {
      let scanAssetId: string | undefined;
      if (scanFile) {
        const key = `markvu_${patientId}_${Date.now()}`;
        const url = await saveImage(key, scanFile);
        const asset = addAsset({
          patient_id: patientId,
          kind: "markvu_scan",
          storage_url: url,
          meta: { label: "MARK-VU scan sheet" },
        });
        scanAssetId = asset.id;
      }
      addSkinAnalysis({
        patient_id: patientId,
        taken_at: new Date().toISOString(),
        metrics,
        notes: notes.trim() || undefined,
        scan_asset_id: scanAssetId,
      });
      setOpen(false);
      setMetrics(DEFAULT_METRICS);
      setNotes("");
      setScanFile(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard className="p-6 lg:col-span-2">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="h2 text-ink-900 flex items-center gap-2">
          <ScanLine size={19} className="text-[color:var(--mint-500)]" />
          MARK-VU skin analysis
        </h3>
        {latest && (
          <span className="caption">
            last scan {formatDate(latest.taken_at)}
            {previous ? ` · compared with ${formatDate(previous.taken_at)}` : ""}
          </span>
        )}
        <button onClick={() => setOpen(true)} className="btn btn-secondary btn-sm ml-auto">
          <Plus size={14} /> New scan
        </button>
      </div>

      {!latest ? (
        <p className="caption">
          No MARK-VU scan on record yet. Every CAPTURE journey opens with one —
          enter the intake scan to unlock progress tracking.
        </p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
            {SKIN_METRIC_LABELS.map(({ key, label, positive }) => {
              const v = latest.metrics[key];
              const d = deltas?.[key];
              // for concern scales lower is better; moisture higher is better
              const improved =
                d !== undefined && d !== 0 && (positive ? d > 0 : d < 0);
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink-900">{label}</span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <span className="font-semibold text-ink-900">{v}</span>
                      {d !== undefined && d !== 0 && (
                        <span
                          className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
                            improved ? "text-[#5B8A5E]" : "text-danger"
                          }`}
                        >
                          {d > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {d > 0 ? `+${d}` : d}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[rgba(28,26,22,0.07)] mt-1.5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${v}%`,
                        background: positive
                          ? "linear-gradient(90deg,#8FBF92,#6E9F70)"
                          : v > 60
                            ? "linear-gradient(90deg,#D48A6A,#C86060)"
                            : "linear-gradient(90deg,#D4B878,#C4A15A)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {latest.notes && (
            <p className="caption mt-4">{latest.notes}</p>
          )}

          {analyses.length > 1 && (
            <div className="mt-4 pt-3 border-t border-[rgba(28,26,22,0.07)] flex flex-wrap gap-2">
              {analyses.map((a) => (
                <ScanChip key={a.id} analysis={a} onRemove={() => removeSkinAnalysis(a.id)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* entry modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="MARK-VU scan entry" wide>
        <div className="space-y-4">
          <p className="caption">
            Copy the values from the MARK-VU report (0–100). Concern scales:
            higher = more concern. Moisture: higher = better hydrated.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
            {SKIN_METRIC_LABELS.map(({ key, label }) => (
              <MintSlider
                key={key}
                label={label}
                min={0}
                max={100}
                value={metrics[key]}
                onChange={(v) => setMetrics((m) => ({ ...m, [key]: v }))}
              />
            ))}
          </div>
          <div>
            <span className="field-label">Specialist note (optional)</span>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Pigmentation −14 after session 2"
            />
          </div>
          <div>
            <span className="field-label">Scan sheet photo (optional)</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="block w-full text-sm text-ink-700 file:mr-3 file:btn file:btn-secondary file:btn-sm"
              onChange={(e) => setScanFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button onClick={() => void save()} disabled={busy} className="btn btn-primary w-full">
            {busy ? <Spinner className="w-4 h-4" /> : <ScanLine size={15} />}
            Save scan to record
          </button>
        </div>
      </Modal>
    </GlassCard>
  );
}

function ScanChip({
  analysis,
  onRemove,
}: {
  analysis: SkinAnalysis;
  onRemove: () => void;
}) {
  return (
    <span className="chip chip-static text-xs group">
      {formatDate(analysis.taken_at)}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-400 hover:text-danger"
        title="Remove scan"
      >
        <Trash2 size={11} />
      </button>
    </span>
  );
}
