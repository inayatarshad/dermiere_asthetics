"use client";

/**
 * VYBERO Voice Agent console - the in-app home of the ElevenLabs phone
 * agent (Mehek). Hosts the call widget so the Dermiére team can talk to
 * the agent right here, plus the admin webhook configuration and the
 * on-demand call-history sync. Bookings live on the Calendar; call
 * history and recordings live on Analytics - no duplicate feeds here.
 *
 * Replaces the Discovery slot in the nav for the Dermiére deployment -
 * open to every staff role so the whole team can test the agent.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AudioLines,
  Phone,
  Settings2,
  Copy,
  Check,
  RadioTower,
  RefreshCw,
} from "lucide-react";
import { useStore, useSessionUser, can } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { GlassCard, SectionTitle, EmptyState, Spinner } from "@/components/ui";

const WIDGET_SRC = "https://unpkg.com/@elevenlabs/convai-widget-embed";
const MEHEK_AGENT_ID = "agent_2401kz9jefqde28vzj70wq5vxq39";

/** ElevenLabs agent ids are url-safe tokens; refuse anything else. */
const cleanAgentId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 120);

// hydration-safe origin: server snapshot is the placeholder, client
// snapshot is the real origin - no setState-in-effect needed
const noopSubscribe = () => () => {};
function useOrigin(): string {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "https://YOUR-DEPLOYMENT"
  );
}

export default function VyberoAgentPage() {
  const mounted = useMounted();
  const user = useSessionUser();
  const vyberoAgentId = useStore((s) => s.vyberoAgentId);
  const setVyberoAgentId = useStore((s) => s.setVyberoAgentId);

  const isAdmin = can.manageUsers(user?.role);
  const origin = useOrigin();

  const [idDraft, setIdDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const widgetHost = useRef<HTMLDivElement>(null);
  const mergeVyberoCalls = useStore((s) => s.mergeVyberoCalls);

  const savedAgentId = cleanAgentId(vyberoAgentId ?? "");
  const agentId = savedAgentId.startsWith("agent_")
    ? savedAgentId
    : MEHEK_AGENT_ID;

  /** Pull Mehek's call history from ElevenLabs into the analytics log. */
  const syncCalls = async () => {
    if (syncBusy) return;
    setSyncBusy(true);
    setSyncNote(null);
    try {
      const res = await fetch("/api/vybero/sync-elevenlabs", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        new_calls?: number;
        error?: string;
        message?: string;
      };
      if (data.ok) {
        setSyncNote(
          data.new_calls ? `${data.new_calls} new call${data.new_calls === 1 ? "" : "s"}` : "Up to date"
        );
        // refresh the on-screen call feed from the server copy
        const log = await fetch("/api/vybero/call-log", { cache: "no-store" });
        if (log.ok) {
          const body = (await log.json()) as { calls?: [] };
          if (body.calls) mergeVyberoCalls(body.calls);
        }
      } else {
        setSyncNote(data.error === "not_configured" ? "Needs ELEVENLABS_API_KEY" : "Sync failed");
      }
    } catch {
      setSyncNote("Sync failed");
    } finally {
      setSyncBusy(false);
      setTimeout(() => setSyncNote(null), 6000);
    }
  };

  // Load the ElevenLabs widget script once, then mount the element.
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    const existing = document.querySelector(`script[src="${WIDGET_SRC}"]`);

    /**
     * The widget anchors its panel bottom-RIGHT of its containing block
     * (.overlay is align-items:flex-end; .sheet gets a left inset with
     * right:0). On our stage we want it dead centre, so we inject two
     * rules into its shadow root: centre the overlay's cross axis and
     * release the sheet's horizontal insets, letting it settle on its
     * centred static position at its own natural width - no hardcoded
     * sizes, so their responsive rules keep working.
     */
    const centreWidget = (): boolean => {
      const host = widgetHost.current?.querySelector("elevenlabs-convai");
      const sr = (host as HTMLElement & { shadowRoot?: ShadowRoot | null })?.shadowRoot;
      if (!sr) return false;
      if (sr.querySelector("style[data-capture-centre]")) return true;
      const style = document.createElement("style");
      style.setAttribute("data-capture-centre", "1");
      style.textContent =
        ".overlay{align-items:center!important}" +
        ".sheet{left:auto!important;right:auto!important}";
      sr.appendChild(style);
      return true;
    };

    const mountEl = async () => {
      if (cancelled || !widgetHost.current) return;
      await customElements.whenDefined("elevenlabs-convai");
      if (cancelled || !widgetHost.current) return;
      const widget = document.createElement("elevenlabs-convai");
      widget.setAttribute("agent-id", agentId);
      widget.setAttribute("variant", "expanded");
      widget.setAttribute(
        "avatar-image-url",
        `${window.location.origin}/mehek-avatar-square.png?v=1`
      );
      widgetHost.current.replaceChildren(widget);
      setWidgetReady(true);
      // the custom element upgrades (and attaches its shadow root)
      // asynchronously - retry briefly until the injection lands
      let tries = 0;
      const timer = setInterval(() => {
        if (cancelled || centreWidget() || ++tries > 40) clearInterval(timer);
      }, 100);
    };
    if (existing) {
      void mountEl();
      return () => {
        cancelled = true;
      };
    }
    const script = document.createElement("script");
    script.src = WIDGET_SRC;
    script.async = true;
    script.onload = () => void mountEl();
    script.onerror = () => setWidgetReady(false);
    document.body.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (!mounted) return null;

  return (
    <div className="space-y-5">
      <div className="fade-up flex flex-wrap items-center gap-3">
        <div>
          <h1 className="h1 text-ink-900 flex items-center gap-2.5">
            <AudioLines size={22} className="text-[color:var(--mint-500)]" />
            Mehek Voice Agent
          </h1>
          <p className="caption mt-0.5">
            Talk to Mehek right here - bookings land on the calendar below,
            live. The same agent answers the clinic&rsquo;s phone line.
          </p>
        </div>
        {isAdmin && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void syncCalls()}
              disabled={syncBusy}
              className="btn btn-secondary btn-sm"
              title="Pull Mehek's latest call history from ElevenLabs into Analytics (also runs automatically every day)"
            >
              {syncBusy ? <Spinner className="w-3.5 h-3.5" /> : <RefreshCw size={14} />}
              {syncNote ?? "Sync calls"}
            </button>
            <button
              onClick={() => setSetupOpen(!setupOpen)}
              className={`btn btn-sm ${setupOpen ? "btn-primary" : "btn-secondary"}`}
            >
              <Settings2 size={14} /> Webhook setup
            </button>
          </div>
        )}
      </div>

      {/* Admin: ElevenLabs webhook cheat-sheet (the source of truth) */}
      {isAdmin && setupOpen && (
        <GlassCard strong className="p-6 fade-up space-y-4">
          <SectionTitle
            title="ElevenLabs webhook tools"
            sub="Agent → Tools → Add tool → Webhook. Auth: attach the secret as either header - both are accepted."
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
            this deployment - store it in ElevenLabs Secrets and attach it to
            both authenticated tools. Full copy-paste guide:{" "}
            <b>VYBERO_VOICE_SETUP.md</b> in the project root.
          </p>

          <div className="pt-4 border-t border-[rgba(28,26,22,0.08)]">
            <SectionTitle
              title="Post-call webhook → Analytics"
              sub="ElevenLabs → Agents → Settings → Post-call webhook. Sends every finished call here; it lands on the Analytics dashboard."
            />
            <div className="mt-3">
              <ToolRow
                name="post_call_transcription"
                method="POST"
                url={`${origin}/api/vybero/elevenlabs-webhook?key=VYBERO_API_KEY`}
                note="Replace VYBERO_API_KEY with the real key value. Transcript, summary, duration and outcome are mapped into the call log automatically - booked calls are detected from the actual book_appointment tool call, not from what the agent says."
              />
            </div>
          </div>
        </GlassCard>
      )}

      {/* The widget stage - front and center. The wrapper's transform makes
          it the containing block for the widget's fixed-position UI, so the
          ElevenLabs orb/panel renders INSIDE this stage instead of the
          browser corner; the TechGIS bar owns the attribution strip. */}
      <GlassCard strong className="p-4 sm:p-5 fade-up-1">
        <div className="flex items-center gap-3 mb-3 px-1">
          <SectionTitle
            title="Call Mehek"
            sub="Live voice session with the Dermiére agent - bookings land on the calendar below"
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
            className="relative overflow-hidden rounded-2xl mx-auto w-full max-w-2xl border border-[rgba(28,26,22,0.08)]"
            style={{
              transform: "translateZ(0)", // containment: widget anchors here
              height: 552,
              background:
                "radial-gradient(560px 300px at 50% 0%, rgba(196,161,90,0.14) 0%, rgba(255,255,255,0) 62%), linear-gradient(180deg, #FFFFFF 0%, #FAF6EC 100%)",
            }}
          >
            <div ref={widgetHost} className="absolute inset-0" />
            {!widgetReady && (
              <div className="absolute inset-0 flex items-center justify-center gap-2 text-ink-400">
                <Spinner className="w-4 h-4" /> Loading the voice widget…
              </div>
            )}
            {/* stage caption */}
            <div className="absolute top-4 left-0 right-0 text-center pointer-events-none">
              <div className="text-[11px] font-medium uppercase tracking-[0.3em] text-[color:var(--mint-500)]">
                VYBERO · Mehek
              </div>
              <div className="text-[12.5px] text-ink-400 mt-1">
                Tap the orb to start the call
              </div>
            </div>
            {/* attribution cover: the stage footer owns the bottom strip */}
            <div
              className="absolute left-0 right-0 bottom-0 h-[34px] flex items-center justify-center gap-2 border-t border-[rgba(196,161,90,0.4)]"
              style={{ zIndex: 2147483647, background: "#F6F0DF" }}
              title="Powered by TechGIS"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/techgis-mark-256.png"
                alt=""
                className="h-[15px] w-auto"
                draggable={false}
              />
              <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-ink-900">
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
                : "An admin needs to link the ElevenLabs agent id - then the whole team can test calls from this page."
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

      {/* Voice-booking + call feeds removed (owner 2026-07-23): redundant
          with the Calendar and the Analytics call log, and mixing seeded
          rows with live ones read as inaccurate. Analytics is the truth. */}
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
