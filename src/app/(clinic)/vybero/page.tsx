"use client";

/**
 * VYBERO Voice Agent console — the in-app home of the ElevenLabs phone
 * agent (Noor). Hosts the call widget so the CAPTURE team can talk to
 * the agent right here, shows voice bookings landing on the calendar
 * live (the background VyberoAgent poller refreshes every 45s), and
 * gives admins the exact webhook configuration to paste into ElevenLabs.
 *
 * Replaces the Discovery slot in the nav for the CAPTURE deployment —
 * open to every staff role so the whole team can test the agent.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Phone,
  CalendarCheck2,
  Settings2,
  Copy,
  Check,
  RadioTower,
} from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { findTreatment, CAPTURE_LOCATIONS } from "@/lib/capture/kb";
import { GlassCard, SectionTitle, EmptyState, Spinner } from "@/components/ui";

const WIDGET_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";

/** ElevenLabs agent ids are url-safe tokens; refuse anything else. */
const cleanAgentId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);

function useOrigin(): string {
  const [origin, setOrigin] = useState("https://YOUR-DEPLOYMENT");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  return origin;
}

export default function VyberoAgentPage() {
  const mounted = useMounted();
  const user = useSessionUser();
  const vyberoAgentId = useStore((s) => s.vyberoAgentId);
  const setVyberoAgentId = useStore((s) => s.setVyberoAgentId);
  const appointments = useStore((s) => s.appointments);
  const vyberoCalls = useStore((s) => s.vyberoCalls);

  const isAdmin = can.manageUsers(user?.role);
  const origin = useOrigin();

  const [idDraft, setIdDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const widgetHost = useRef<HTMLDivElement>(null);

  const agentId = cleanAgentId(vyberoAgentId ?? "");

  // Load the ElevenLabs widget script once, then mount the element.
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const existing = document.querySelector(`script[src="${WIDGET_SRC}"]`);
    const mountEl = () => {
      if (cancelled || !widgetHost.current) return;
      widgetHost.current.innerHTML = `<elevenlabs-convai agent-id="${agentId}" variant="expanded"></elevenlabs-convai>`;
      setWidgetReady(true);
    };
    if (existing) {
      mountEl();
      return () => {
        cancelled = true;
      };
    }
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = mountEl;
    script.onerror = () => setWidgetReady(false);
    document.body.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const voiceBookings = useMemo(
    () =>
      appointments
        .filter((a) => a.source === "vybero")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8),
    [appointments]
  );

  const recentCalls = useMemo(
    () =>
      [...vyberoCalls]
        .sort((a, b) => b.started_at.localeCompare(a.started_at))
        .slice(0, 5),
    [vyberoCalls]
  );

  if (!mounted) return null;

  return (
    <div className="space-y-5">
      <div className="fade-up flex flex-wrap items-center gap-3">
        <div>
          <h1 className="h1 text-ink-900 flex items-center gap-2.5">
            <AudioLines size={22} className="text-[color:var(--mint-500)]" />
            VYBERO Voice Agent
          </h1>
          <p className="caption mt-0.5">
            Talk to Noor right here — bookings land on the calendar below,
            live. The same agent answers the clinic&rsquo;s phone line.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setSetupOpen(!setupOpen)}
            className={`btn btn-sm ml-auto ${setupOpen ? "btn-primary" : "btn-secondary"}`}
          >
            <Settings2 size={14} /> Webhook setup
          </button>
        )}
      </div>

      {/* Admin: ElevenLabs webhook cheat-sheet (the source of truth) */}
      {isAdmin && setupOpen && (
        <GlassCard strong className="p-6 fade-up space-y-4">
          <SectionTitle
            title="ElevenLabs webhook tools"
            sub="Agent → Tools → Add tool → Webhook. Auth: attach the secret as either header — both are accepted."
          />
          <div className="grid gap-3">
            <ToolRow
              name="get_current_time"
              method="GET"
              url={`${origin}/api/vybero/time`}
              note="No auth needed. Returns date, day and time in Asia/Karachi so the agent can resolve 'tomorrow' and 'Saturday'."
            />
            <ToolRow
              name="check_availability"
              method="GET"
              url={`${origin}/api/vybero/availability?date={date}`}
              note='Query param date = YYYY-MM-DD. Header: "Authorization: Bearer <VYBERO_API_KEY>" (or "x-vybero-key: <key>"). Reads open_slots like ["11:30","16:00"] in Pakistan time.'
            />
            <ToolRow
              name="book_appointment"
              method="POST"
              url={`${origin}/api/vybero/book`}
              note='Same auth header. Body: customer_name, phone, treatment (name is fine), date YYYY-MM-DD, time HH:MM (Pakistan time), notes?, email?, location?. Replies {"status":"confirmed","booking_id",...} or {"status":"unavailable","alternatives":[...]}.'
            />
          </div>
          <p className="caption">
            The secret is the <b>VYBERO_API_KEY</b> environment variable on
            this deployment — store it in ElevenLabs Secrets and attach it to
            both authenticated tools. Full copy-paste guide:{" "}
            <b>VYBERO_VOICE_SETUP.md</b> in the project root.
          </p>
        </GlassCard>
      )}

      {/* The widget stage — front and center. The wrapper's transform makes
          it the containing block for the widget's fixed-position UI, so the
          ElevenLabs orb/panel renders INSIDE this stage instead of the
          browser corner; the TechGIS bar owns the attribution strip. */}
      <GlassCard strong className="p-4 sm:p-5 fade-up-1">
        <div className="flex items-center gap-3 mb-3 px-1">
          <SectionTitle
            title="Call Noor"
            sub="Live voice session with the CAPTURE agent — bookings land on the calendar below"
          />
          {agentId && isAdmin && (
            <button
              className="btn btn-ghost btn-sm ml-auto"
              onClick={() => {
                setIdDraft(agentId);
                setEditing(true);
              }}
            >
              <RadioTower size={13} /> {agentId.slice(0, 14)}…
            </button>
          )}
        </div>

        {agentId ? (
          <div
            className="relative overflow-hidden rounded-2xl mx-auto w-full max-w-3xl"
            style={{
              transform: "translateZ(0)", // containment: widget anchors here
              height: 560,
              background:
                "radial-gradient(620px 340px at 50% 0%, rgba(196,161,90,0.16) 0%, rgba(28,26,22,0) 60%), linear-gradient(180deg, #24211B 0%, #1C1A16 100%)",
            }}
          >
            <div ref={widgetHost} className="absolute inset-0" />
            {!widgetReady && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-[#B9AF9B]">
                <Spinner className="w-4 h-4" /> Loading the voice widget…
              </div>
            )}
            {/* stage caption */}
            <div className="absolute top-4 left-0 right-0 text-center pointer-events-none">
              <div className="text-[11px] font-medium uppercase tracking-[0.3em] text-[#C9BFA8]">
                VYBERO · Noor
              </div>
              <div className="text-[12.5px] text-[#8F877A] mt-1">
                Tap the orb to start the call
              </div>
            </div>
            {/* attribution cover: the stage footer owns the bottom strip */}
            <div
              className="absolute left-0 right-0 bottom-0 h-[34px] flex items-center justify-center gap-2 bg-[#16140F]/95 border-t border-[rgba(196,161,90,0.25)]"
              style={{ zIndex: 2147483647 }}
              title="Powered by TechGIS"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/techgis-mark-256.png"
                alt=""
                className="h-[15px] w-auto opacity-90"
                draggable={false}
              />
              <span className="text-[11px] font-medium tracking-[0.14em] uppercase text-[#D8CDB4]">
                Powered by TechGIS
              </span>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<Phone size={26} />}
            title="Link the ElevenLabs agent"
            body={
              isAdmin
                ? "Paste the agent id from ElevenLabs (Agents → your agent → ID, looks like agent_...) and the call widget appears here for the whole team."
                : "An admin needs to link the ElevenLabs agent id — then the whole team can test calls from this page."
            }
            action={
              isAdmin ? (
                <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}>
                  Add agent id
                </button>
              ) : undefined
            }
          />
        )}

        {editing && isAdmin && (
          <div className="mt-4 flex gap-2 max-w-3xl mx-auto">
            <input
              className="input flex-1 font-mono text-sm"
              placeholder="agent_XXXXXXXXXXXXXXXX"
              value={idDraft}
              onChange={(e) => setIdDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setVyberoAgentId(cleanAgentId(idDraft));
                  setEditing(false);
                }
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setVyberoAgentId(cleanAgentId(idDraft));
                setEditing(false);
              }}
            >
              Save
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        )}
      </GlassCard>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        {/* Live proof: voice bookings + calls */}
        <div className="space-y-4 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          <GlassCard className="p-5 fade-up-2">
            <SectionTitle
              title="Voice bookings"
              sub="Appointments created by the agent — refreshes automatically"
            />
            {voiceBookings.length === 0 ? (
              <p className="caption py-4">
                None yet. Call Noor and say &ldquo;book me a face contour
                tomorrow at 4&rdquo; — it appears here and on the Calendar.
              </p>
            ) : (
              <div className="space-y-2 mt-2">
                {voiceBookings.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 rounded-xl bg-white/50 border border-[rgba(28,26,22,0.06)] px-3.5 py-2.5"
                  >
                    <span className="w-8 h-8 rounded-lg bg-mint-100 text-[color:var(--mint-500)] flex items-center justify-center shrink-0">
                      <CalendarCheck2 size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink-900 truncate">
                        {a.patient_name}
                        <span className="text-ink-400 font-normal">
                          {" "}
                          ·{" "}
                          {a.procedure_interest
                            ? findTreatment(a.procedure_interest)?.short ?? "Consultation"
                            : "Consultation"}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-ink-400">
                        {new Date(a.start).toLocaleString("en-GB", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {" · "}
                        {CAPTURE_LOCATIONS.find((l) => l.id === (a.location_id ?? "experience-centre"))?.short}
                      </div>
                    </div>
                    <span className="chip chip-static text-[10.5px]">{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-5 fade-up-3">
            <SectionTitle title="Recent calls" sub="From the agent's call log" />
            {recentCalls.length === 0 ? (
              <p className="caption py-3">No calls logged yet.</p>
            ) : (
              <div className="space-y-1.5 mt-2">
                {recentCalls.map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5 text-sm px-1 py-1">
                    <Phone size={13} className="text-ink-400 shrink-0" />
                    <span className="text-ink-900 truncate">
                      {c.caller_name ?? "Unknown caller"}
                    </span>
                    <span className="caption truncate hidden sm:inline">
                      {c.summary?.slice(0, 46)}
                    </span>
                    <span
                      className={`ml-auto chip chip-static text-[10.5px] ${
                        c.outcome === "booked" ? "!bg-mint-100" : ""
                      }`}
                    >
                      {c.outcome}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function ToolRow({
  name,
  method,
  url,
  note,
}: {
  name: string;
  method: string;
  url: string;
  note: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl bg-white/55 border border-[rgba(28,26,22,0.07)] px-4 py-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[12.5px] font-semibold text-ink-900">{name}</span>
        <span className="chip chip-static text-[10px]">{method}</span>
        <code className="text-[11.5px] text-ink-700 truncate flex-1 min-w-[200px]">{url}</code>
        <button
          className="btn btn-ghost btn-sm !px-2"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          title="Copy URL"
        >
          {copied ? <Check size={13} className="text-[color:var(--mint-500)]" /> : <Copy size={13} />}
        </button>
      </div>
      <p className="caption mt-1.5">{note}</p>
    </div>
  );
}
