"use client";

/**
 * Shared inbox - customer conversations, not staff chat.
 *
 * Every send goes UI -> /api/crm/conversations/[id] -> messaging service ->
 * provider. This screen has no idea which provider is behind that, and it
 * never imports one; the banner reports what the server says is active.
 *
 * The "Simulate inbound" control is the demo path for a customer message.
 * It posts to the simulate endpoint, which runs the SAME ingest code a real
 * Meta webhook would, so what you see is the production path with a local
 * provider attached.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  Inbox as InboxIcon,
  MessageSquarePlus,
  RefreshCw,
  Send,
} from "lucide-react";
import type { CrmMessage, MessageState } from "@/lib/crm/types";
import {
  dateTime,
  fetchConversations,
  fetchThread,
  postMessage,
  relativeTime,
  simulateInbound,
  type ConversationListItem,
  type ConversationsResponse,
  type ThreadResponse,
} from "@/lib/crm/client";
import { formatPhone } from "@/lib/crm/phone";
import { useSessionUser } from "@/lib/store";
import { crmCan } from "@/lib/crm/permissions";
import { EmptyState, Field, Modal, SectionTitle, Spinner } from "@/components/ui";
import { Pill, StageBadge } from "@/components/crm/CrmUi";

type Filter = "all" | "unassigned" | "mine" | "unread";

export default function InboxPage() {
  const user = useSessionUser();
  const canSend = crmCan(user?.role, "send_messages");
  const searchParams = useSearchParams();
  const preselect = searchParams.get("c");

  const [list, setList] = useState<ConversationListItem[]>([]);
  const [provider, setProvider] = useState<ConversationsResponse["provider"] | null>(null);
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const [activeId, setActiveId] = useState<string | null>(preselect);
  const [thread, setThread] = useState<ThreadResponse | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [simulateOpen, setSimulateOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const applyList = useCallback(
    (res: Awaited<ReturnType<typeof fetchConversations>>) => {
      if (res) {
        setList(res.conversations);
        setProvider(res.provider);
        setMe(res.me);
        setActiveId((cur) => cur ?? res.conversations[0]?.id ?? null);
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchConversations();
      if (!cancelled) applyList(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyList]);

  const reloadList = useCallback(async () => {
    applyList(await fetchConversations());
  }, [applyList]);

  // Load the thread whenever the selection changes. The spinner is driven
  // by "thread does not match the selection yet" rather than a flag set
  // synchronously in the effect.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    (async () => {
      const res = await fetchThread(activeId);
      if (cancelled) return;
      setThread(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  const threadStale = !thread || thread.conversation.id !== activeId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "unassigned":
        return list.filter((c) => !c.assigned_to);
      case "mine":
        return list.filter((c) => c.assigned_to === me);
      case "unread":
        return list.filter((c) => c.unread_count > 0);
      default:
        return list;
    }
  }, [list, filter, me]);

  const totalUnread = list.reduce((s, c) => s + c.unread_count, 0);

  const send = async () => {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    const res = await postMessage(activeId, {
      body: draft.trim(),
      // Stable per attempt, so a double-click cannot double-send.
      idempotency_key: `${activeId}_${Date.now()}`,
    });
    setSending(false);
    if (!res.ok) {
      setSendError(res.error ?? "Could not send.");
      return;
    }
    setDraft("");
    setThread(await fetchThread(activeId));
    await reloadList();
  };

  if (loading && list.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Shared inbox"
        // One line of truth about the channel, and no more: the plumbing
        // does not need explaining to the clinic every time they open it.
        sub={
          provider?.live
            ? `${list.length} conversations${totalUnread ? ` · ${totalUnread} unread` : ""}`
            : "WhatsApp Business API not connected"
        }
        action={
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setLoading(true);
                void reloadList();
              }}
              aria-label="Refresh"
            >
              <RefreshCw size={15} />
            </button>
            {provider && !provider.live && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSimulateOpen(true)}
              >
                <MessageSquarePlus size={15} /> Simulate inbound
              </button>
            )}
          </div>
        }
      />

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        {/* --- conversation list --- */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["all", "unread", "mine", "unassigned"] as Filter[]).map((f) => (
              <button
                key={f}
                className={`chip ${filter === f ? "chip-active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all"
                  ? "All"
                  : f === "unread"
                  ? "Unread"
                  : f === "mine"
                  ? "Mine"
                  : "Unassigned"}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<InboxIcon size={22} />}
              title="No conversations"
              body="Inbound messages open a conversation automatically."
            />
          ) : (
            <div className="space-y-1.5 lg:max-h-[70vh] lg:overflow-y-auto pr-0.5">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left glass p-3 transition-colors ${
                    activeId === c.id ? "ring-1 ring-mint-300" : "hover:bg-mint-50/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm text-ink-900 truncate">
                      {c.contact?.name ?? "Unknown contact"}
                    </span>
                    <span className="text-[10px] text-ink-400 shrink-0">
                      {relativeTime(c.last_message_at)}
                    </span>
                  </div>
                  {c.last_message_preview && (
                    <p className="text-xs text-ink-700 mt-1 line-clamp-2">
                      {c.last_message_preview}
                    </p>
                  )}
                  {c.unread_count > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] mt-1.5 px-1 rounded-full bg-mint-500 text-white text-[10px] font-semibold">
                      {c.unread_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* --- thread --- */}
        <div className="glass p-0 overflow-hidden flex flex-col min-h-[420px]">
          {activeId && threadStale ? (
            <div className="flex-1 flex items-center justify-center">
              <Spinner className="w-6 h-6" />
            </div>
          ) : !thread ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-ink-400">Select a conversation.</p>
            </div>
          ) : (
            <>
              {/* header */}
              <div className="px-4 py-3 border-b border-white/60 flex flex-wrap items-center gap-2 justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {thread.contact ? (
                      <Link
                        href={`/crm/patients/${thread.contact.id}`}
                        className="font-medium text-ink-900 hover:text-mint-600"
                      >
                        {thread.contact.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-900">Unknown contact</span>
                    )}
                    {thread.contact && <StageBadge stage={thread.contact.stage} />}
                    {thread.contact?.opted_out_at && <Pill tone="rose">Opted out</Pill>}
                  </div>
                  {thread.contact && (
                    <div className="text-[11px] text-ink-400">
                      {formatPhone(thread.contact.phone)} · {thread.conversation.channel}
                    </div>
                  )}
                </div>

              </div>

              {/* messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-h-[52vh]">
                {thread.messages.filter((m) => !m.internal).length === 0 ? (
                  <p className="text-sm text-ink-400 text-center py-8">
                    No messages yet.
                  </p>
                ) : (
                  thread.messages
                    .filter((m) => !m.internal)
                    .map((m) => (
                      <Bubble key={m.id} message={m} />
                    ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* composer */}
              <div className="border-t border-white/60 p-3 space-y-2">
                <div className="flex items-end gap-2">
                  <textarea
                    className="input min-h-[44px] max-h-32 text-sm"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      canSend ? "Type a reply…" : "Your role cannot message patients"
                    }
                    disabled={!canSend}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <button
                    className="btn btn-primary shrink-0"
                    onClick={() => void send()}
                    disabled={sending || !draft.trim() || !canSend}
                  >
                    {sending ? <Spinner className="w-4 h-4" /> : <Send size={15} />}
                  </button>
                </div>
                {sendError && <p className="text-xs text-rose-700">{sendError}</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {simulateOpen && (
        <SimulateModal
          onClose={() => setSimulateOpen(false)}
          onDone={async (conversationId) => {
            setSimulateOpen(false);
            await reloadList();
            setActiveId(conversationId);
            setThread(await fetchThread(conversationId));
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------

const STATE_ICON: Partial<Record<MessageState, typeof Check>> = {
  queued: Clock,
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: CircleAlert,
};

function Bubble({ message }: { message: CrmMessage }) {
  const inbound = message.direction === "inbound";
  const StateIcon = STATE_ICON[message.state];

  return (
    <div className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
          inbound
            ? "bg-white/75 border border-white"
            : "bg-mint-500 text-white"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.body}</p>
        <div
          className={`flex items-center gap-1 mt-1 text-[10px] ${
            inbound ? "text-ink-400" : "text-white/75"
          }`}
        >
          <span title={dateTime(message.created_at)}>
            {relativeTime(message.created_at)}
          </span>
          {!inbound && (
            <>
              <span>·</span>
              <span className="capitalize">{message.state}</span>
              {StateIcon && (
                <StateIcon
                  size={12}
                  className={message.state === "read" ? "text-sky-200" : ""}
                />
              )}
            </>
          )}
        </div>
        {message.error && (
          <p className="text-[10px] mt-1 text-rose-100">{message.error}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

const SAMPLE_MESSAGES = [
  "Assalam o alaikum, I wanted to ask about hydrafacial pricing please",
  "Hi! Do you have any appointment available this Saturday?",
  "Hello, how much for laser hair reduction full legs?",
  "Salam, is Dr. Hina available next week for a consultation?",
];

function SimulateModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (conversationId: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("Sana Iqbal");
  const [phone, setPhone] = useState("0301 4455667");
  const [body, setBody] = useState(SAMPLE_MESSAGES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const res = await simulateInbound({ name, from: phone, body });
    setSaving(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Could not simulate the message.");
      return;
    }
    setResult(
      res.data.duplicate
        ? "That exact message was already ingested - the conversation is unchanged."
        : null
    );
    await onDone(res.data.conversation_id);
  };

  return (
    <Modal open onClose={onClose} title="Simulate an inbound message">
      <div className="space-y-3">
        <p className="text-sm text-ink-700 leading-relaxed">
          This runs the same ingestion a real provider webhook would: the
          contact is matched by phone number (or created as a new lead), a
          conversation is opened or reused, and the message is stored. Nothing
          is sent to any external service.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="From (name)">
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="From (number)" hint="An existing lead's number matches them.">
            <input
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Message">
          <textarea
            className="input min-h-[80px]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLE_MESSAGES.map((m) => (
            <button key={m} className="chip text-[11px]" onClick={() => setBody(m)}>
              {m.slice(0, 28)}…
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-rose-700">{error}</p>}
        {result && <p className="text-sm text-ink-700">{result}</p>}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={saving || !body.trim() || !phone.trim()}
          >
            {saving ? <Spinner className="w-4 h-4" /> : <MessageSquarePlus size={15} />}
            Receive message
          </button>
        </div>
      </div>
    </Modal>
  );
}
