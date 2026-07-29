"use client";

/**
 * CRM settings — message templates and the messaging provider boundary.
 *
 * Templates mirror the Meta approval lifecycle (draft / pending / approved /
 * rejected) so that when a real WhatsApp Business account is connected, the
 * clinic's templates map onto Meta's without a data migration.
 *
 * Branches are NOT edited here: they are clinic locations, managed under
 * Settings, and the CRM reads whatever is configured there.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, MapPin, RefreshCw } from "lucide-react";
import { fetchConversations, dateOnly, type ConversationsResponse } from "@/lib/crm/client";
import { EmptyState, GlassCard, SectionTitle, Spinner } from "@/components/ui";
import { Pill, SubHeading } from "@/components/crm/CrmUi";

export default function CrmSettingsPage() {
  const [data, setData] = useState<ConversationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((res: ConversationsResponse | null) => {
    setData(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchConversations();
      if (!cancelled) apply(res);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const refresh = () => {
    setLoading(true);
    void (async () => apply(await fetchConversations()))();
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const templates = data?.templates ?? [];
  const branches = data?.branches ?? [];
  const provider = data?.provider;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="CRM settings"
        sub="Message templates, branches and the messaging channel"
        action={
          <button className="btn btn-ghost btn-sm" onClick={refresh} aria-label="Refresh">
            <RefreshCw size={15} />
          </button>
        }
      />

      {/* --- provider --- */}
      <GlassCard className="p-5">
        <SubHeading>Messaging channel</SubHeading>
        <div className="flex items-start gap-2.5">
          <CircleAlert size={16} className="text-ink-400 shrink-0 mt-0.5" />
          <div className="text-sm text-ink-700 leading-relaxed space-y-2">
            <p>
              <span className="font-medium">
                Active provider: {provider?.label ?? "unknown"}.
              </span>{" "}
              {provider?.live
                ? "Messages are delivered through the connected provider."
                : "No WhatsApp Business account is connected. Nothing leaves this machine."}
            </p>
            <p className="text-ink-400 text-[13px]">
              The CRM sends through a provider interface, never directly to
              Meta. Connecting the WhatsApp Cloud API later means adding one
              provider implementation and its credentials — the screens, the
              routes and the stored messages do not change. The webhook
              endpoint, delivery-receipt handling and idempotent ingestion are
              already in place and exercised by the local provider.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* --- templates --- */}
      <GlassCard className="p-5">
        <SubHeading>Message templates</SubHeading>
        {templates.length === 0 ? (
          <EmptyState
            title="No templates yet"
            body="Templates are pre-approved message formats used for reminders and follow-ups."
          />
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="glass-subtle p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm text-ink-900">{t.name}</span>
                  <div className="flex items-center gap-1.5">
                    <Pill tone="slate">{t.category}</Pill>
                    <Pill tone="slate">{t.language}</Pill>
                    <Pill
                      tone={
                        t.status === "approved"
                          ? "green"
                          : t.status === "pending"
                          ? "amber"
                          : t.status === "rejected"
                          ? "rose"
                          : "slate"
                      }
                    >
                      {t.status}
                    </Pill>
                  </div>
                </div>
                <p className="text-sm text-ink-700 mt-1.5">{t.body}</p>
                {t.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.variables.map((v, i) => (
                      <Pill key={v} tone="teal">
                        {`{{${i + 1}}} ${v}`}
                      </Pill>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-ink-400 mt-1.5">
                  Added {dateOnly(t.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="caption mt-3">
          Template approval is granted by the messaging provider. With no
          provider connected, statuses here are local records only.
        </p>
      </GlassCard>

      {/* --- branches --- */}
      <GlassCard className="p-5">
        <SubHeading
          action={
            <Link href="/settings" className="text-xs text-mint-600 font-medium">
              Manage in Settings →
            </Link>
          }
        >
          Branches
        </SubHeading>
        {branches.length === 0 ? (
          <EmptyState
            title="No branches configured"
            body="Add clinic locations under Settings; the CRM picks them up automatically."
          />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {branches.map((b) => (
              <div key={b.id} className="glass-subtle p-3">
                <div className="flex items-center gap-1.5">
                  <MapPin size={13} className="text-ink-400" />
                  <span className="font-medium text-sm text-ink-900">{b.name}</span>
                </div>
                <p className="text-xs text-ink-700 mt-1">
                  {b.address}, {b.city}
                </p>
                {b.doctor && <p className="text-[11px] text-ink-400 mt-0.5">{b.doctor}</p>}
              </div>
            ))}
          </div>
        )}
        <p className="caption mt-3">
          Branches come from the clinic&apos;s locations, so adding one needs no
          code change — every CRM screen and metric picks it up.
        </p>
      </GlassCard>
    </div>
  );
}
