"use client";

/**
 * VYBERO web concierge widget - CAPTURE's public support + booking chat.
 * Floats on the landing page; talks to /api/vybero/chat (deterministic
 * KB engine, real availability, real bookings). Conversation survives
 * reloads via sessionStorage.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Sparkles, CalendarCheck2 } from "lucide-react";

interface Msg {
  who: "user" | "agent";
  text: string;
  booked?: BookedInfo;
}

interface BookedInfo {
  reference: string;
  treatment: string;
  location: string;
  date: string;
  time: string;
  name: string;
}

interface ChatResponse {
  reply: string;
  chips?: string[];
  state?: Record<string, unknown>;
  booked?: BookedInfo;
}

const GREETING: Msg = {
  who: "agent",
  text: "Welcome to CAPTURE - the intimate science of beauty. I am VYBERO, your concierge. Ask me about our EXOMERE and MitoRedLight treatments, prices, aftercare or locations - or let me book your visit.",
};
const FIRST_CHIPS = ["Book a session", "Treatments", "Prices", "Where are you?"];

const STORE_KEY = "vybero-concierge";

const label = (s: string) =>
  s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function VyberoConcierge() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [chips, setChips] = useState<string[]>(FIRST_CHIPS);
  const [state, setState] = useState<Record<string, unknown>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // restore conversation
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          messages: Msg[];
          chips: string[];
          state: Record<string, unknown>;
        };
        if (saved.messages?.length) {
          setMessages(saved.messages);
          setChips(saved.chips ?? []);
          setState(saved.state ?? {});
        }
      }
    } catch {
      // fresh conversation
    }
  }, []);

  // persist conversation
  useEffect(() => {
    try {
      sessionStorage.setItem(
        STORE_KEY,
        JSON.stringify({ messages: messages.slice(-60), chips, state })
      );
    } catch {
      // storage full - fine
    }
  }, [messages, chips, state]);

  useEffect(() => {
    if (open) {
      scrollRef.current?.scrollTo({ top: 999999, behavior: "smooth" });
    }
  }, [messages, busy, open]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setDraft("");
      setChips([]);
      setMessages((m) => [...m, { who: "user", text: trimmed }]);
      setBusy(true);
      try {
        const res = await fetch("/api/vybero/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, state }),
        });
        const data = (await res.json()) as ChatResponse;
        setMessages((m) => [
          ...m,
          { who: "agent", text: data.reply ?? "…", booked: data.booked },
        ]);
        setChips(data.chips ?? []);
        if (data.state) setState(data.state);
      } catch {
        setMessages((m) => [
          ...m,
          {
            who: "agent",
            text: "I lost the connection for a moment. Please try again, or reach us on WhatsApp at +92-309-4442031.",
          },
        ]);
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, state]
  );

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-full bg-ink-900 pl-4 pr-5 py-3 text-[#F6EBD3] shadow-[0_10px_36px_rgba(28,26,22,0.4)] hover:translate-y-[-1px] transition-transform"
          aria-label="Chat with VYBERO"
        >
          <span className="relative flex">
            <MessageCircle size={19} />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#C4A15A] pulse-mint" />
          </span>
          <span className="text-sm font-medium tracking-wide">
            VYBERO <span className="opacity-60 font-light">· concierge</span>
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 flex flex-col w-full sm:w-[390px] h-full sm:h-[620px] sm:max-h-[calc(100vh-40px)] sm:rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(28,26,22,0.4)] bg-[#FDFBF6]">
          {/* Header */}
          <div className="flex items-center gap-3 bg-ink-900 px-4 py-3.5 text-[#F6EBD3]">
            <span className="w-9 h-9 rounded-full bg-[rgba(196,161,90,0.2)] border border-[rgba(196,161,90,0.45)] flex items-center justify-center">
              <Sparkles size={17} className="text-[#E3CD9C]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold tracking-wide">VYBERO</div>
              <div className="text-[11px] text-[#B9AF9B] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8FBF92] inline-block" />
                CAPTURE concierge · online
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/10"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-4 space-y-3">
            {messages.map((m, i) =>
              m.who === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[82%] rounded-2xl rounded-br-md bg-ink-900 px-3.5 py-2.5 text-sm text-[#F6EBD3] whitespace-pre-line">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[86%] space-y-2">
                    <div className="rounded-2xl rounded-bl-md bg-white border border-[rgba(28,26,22,0.07)] px-3.5 py-2.5 text-sm text-ink-900 whitespace-pre-line shadow-[0_2px_10px_rgba(70,60,40,0.06)]">
                      {m.text}
                    </div>
                    {m.booked && (
                      <div className="rounded-xl border border-[rgba(196,161,90,0.55)] bg-[rgba(196,161,90,0.08)] px-3.5 py-3">
                        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8A6F35]">
                          <CalendarCheck2 size={14} /> Booking confirmed
                        </div>
                        <div className="mt-1.5 text-sm text-ink-900 font-medium">
                          {label(m.booked.treatment)}
                        </div>
                        <div className="text-[12.5px] text-ink-700 leading-relaxed">
                          {label(m.booked.location)}
                          <br />
                          {new Date(`${m.booked.date}T${m.booked.time}:00`).toLocaleString("en-GB", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                          <br />
                          {m.booked.name} · Ref {m.booked.reference.slice(0, 8).toUpperCase()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-white border border-[rgba(28,26,22,0.07)] px-4 py-3 shadow-[0_2px_10px_rgba(70,60,40,0.06)]">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="w-1.5 h-1.5 rounded-full bg-[#C4A15A] animate-bounce"
                        style={{ animationDelay: `${d * 0.16}s` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Quick replies */}
          {chips.length > 0 && !busy && (
            <div className="px-3.5 pb-2 flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c}
                  onClick={() => void send(c)}
                  className="rounded-full border border-[rgba(196,161,90,0.5)] bg-white px-3 py-1.5 text-[12.5px] text-ink-900 hover:bg-[rgba(196,161,90,0.1)] transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className="flex items-center gap-2 border-t border-[rgba(28,26,22,0.08)] bg-white px-3 py-2.5"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about treatments, prices, bookings…"
              className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 outline-none px-1.5 py-1.5"
              maxLength={500}
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="w-9 h-9 rounded-xl bg-ink-900 text-[#F6EBD3] flex items-center justify-center disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
