/**
 * Provision the Dermiere Aesthetics development clinic.
 *
 * Deliberately separate from the CAPTURE demo seed in clinicStore.ts: this
 * writes Dermiere's own clinic row, its own fictional staff and its own CRM
 * data. It never calls ensureSeedClinic() and never touches CAPTURE's cast.
 *
 * Idempotent and additive. Re-running it against an existing Dermiere clinic
 * refreshes the CRM rows in place (same deterministic ids) and leaves the
 * clinic, its staff and their passwords alone. It deletes nothing.
 */

import type { ClinicConfig } from "@/lib/types";
import { defaultConfig, saveClinicConfig } from "./clinicStore";
import { hashPassword } from "./auth";
import {
  pgDeleteAppointment,
  pgDeleteRecord,
  pgGetClinicBySlug,
  pgGetUserByEmail,
  pgListAppointments,
  pgListRecords,
  pgListUsers,
  pgUpsertAppointment,
  pgUpsertRecord,
  pgUpsertUser,
} from "./db";
import {
  addActivity,
  deleteCrmRow,
  listActivities,
  listContacts,
  listConversations,
  listFeedback,
  listFollowUps,
  listMessages,
  saveContact,
  saveConversation,
  saveFeedback,
  saveFollowUp,
  saveMessage,
  saveTemplate,
} from "./crmStore";
import {
  DERMIERE_BRAND,
  DERMIERE_BRANCHES,
  DERMIERE_SLUG,
  DERMIERE_STAFF,
  DERMIERE_TREATMENTS,
} from "@/lib/dermiere/clinic";
import { buildDermiereSeed } from "@/lib/dermiere/seed";
import { linkRegistryPatients } from "./crmRegistry";

const uid = () => crypto.randomUUID();

/**
 * Remove rows this generator produced in an earlier run that the current
 * seed no longer contains.
 *
 * Strictly scoped, and deliberately narrow:
 *  - only the caller's clinic,
 *  - only rows whose id carries a generator prefix (isSeedRow),
 *  - only ids absent from the seed that was just written.
 *
 * Anything a user created - any id without the prefix - is invisible to
 * this function and can never be deleted by it. It is opt-in (reconcile:
 * true) because deleting is not something a provisioning call should do by
 * default.
 */
async function reconcileSeedRows(
  clinicId: string,
  seed: {
    patients: { id: string }[];
    appointments: { id: string }[];
    invoices: { id: string }[];
    contacts: { id: string }[];
    followUps: { id: string }[];
    conversations: { id: string }[];
    messages: { id: string }[];
    feedback: { id: string }[];
  }
): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};

  const prune = async <T extends { id: string }>(
    label: string,
    current: T[],
    existing: { id: string }[],
    del: (id: string) => Promise<void>
  ) => {
    const keep = new Set(current.map((r) => r.id));
    const stale = existing
      .map((r) => r.id)
      .filter((id) => isSeedRow(id) && !keep.has(id));
    for (const id of stale) await del(id);
    if (stale.length) removed[label] = stale.length;
  };

  const [patients, appointments, invoices] = await Promise.all([
    pgListRecords<{ id: string }>(clinicId, "patients"),
    pgListAppointments<{ id: string }>(clinicId),
    pgListRecords<{ id: string }>(clinicId, "invoices"),
  ]);

  await prune("patients", seed.patients, patients, (id) =>
    pgDeleteRecord(clinicId, "patients", id)
  );
  await prune("invoices", seed.invoices, invoices, (id) =>
    pgDeleteRecord(clinicId, "invoices", id)
  );
  await prune("appointments", seed.appointments, appointments, (id) =>
    pgDeleteAppointment(clinicId, id)
  );

  const [followUps, conversations, feedback, contacts] = await Promise.all([
    listFollowUps(clinicId),
    listConversations(clinicId),
    listFeedback(clinicId),
    listContacts(clinicId),
  ]);

  await prune("contacts", seed.contacts, contacts, (id) =>
    deleteCrmRow(clinicId, "crm_contacts", id)
  );
  await prune("followUps", seed.followUps, followUps, (id) =>
    deleteCrmRow(clinicId, "crm_followups", id)
  );
  await prune("feedback", seed.feedback, feedback, (id) =>
    deleteCrmRow(clinicId, "crm_feedback", id)
  );

  // Messages before conversations, so no message is left pointing at a
  // conversation that no longer exists.
  const keepConv = new Set(seed.conversations.map((c) => c.id));
  const keepMsg = new Set(seed.messages.map((m) => m.id));
  const staleConv = conversations
    .map((c) => c.id)
    .filter((id) => isSeedRow(id) && !keepConv.has(id));

  let msgCount = 0;
  for (const convId of staleConv) {
    for (const m of await listMessages(clinicId, convId)) {
      await deleteCrmRow(clinicId, "crm_messages", m.id);
      msgCount++;
    }
    await deleteCrmRow(clinicId, "crm_conversations", convId);
  }
  // A surviving conversation can still hold a generated message the current
  // seed no longer produces (a thread that got shorter), so sweep those too.
  for (const convId of keepConv) {
    for (const m of await listMessages(clinicId, convId)) {
      if (!isSeedRow(m.id) || keepMsg.has(m.id)) continue;
      await deleteCrmRow(clinicId, "crm_messages", m.id);
      msgCount++;
    }
  }
  if (staleConv.length) removed.conversations = staleConv.length;
  if (msgCount) removed.messages = msgCount;

  // Activities reference the rows above; drop the generated ones whose
  // target is gone.
  const activities = await listActivities(clinicId);
  const liveRefs = new Set<string>([
    ...seed.contacts.map((c) => c.id),
    ...seed.followUps.map((f) => f.id),
    ...seed.feedback.map((f) => f.id),
    ...seed.messages.map((m) => m.id),
    ...seed.patients.map((p) => p.id),
  ]);
  let actCount = 0;
  for (const a of activities) {
    if (!isSeedRow(a.id)) continue;
    if (a.ref_id && liveRefs.has(a.ref_id)) continue;
    if (a.contact_id && liveRefs.has(a.contact_id)) continue;
    await deleteCrmRow(clinicId, "crm_activities", a.id);
    actCount++;
  }
  if (actCount) removed.activities = actCount;

  return removed;
}

export interface DermiereProvisionResult {
  clinic: { id: string; slug: string; name: string };
  created: boolean;
  logins: Array<{
    name: string;
    email: string;
    role: string;
    title?: string;
    workspace: "clinic" | "crm";
  }>;
  counts: Record<string, number>;
  removed?: Record<string, number>;
}

/**
 * Every id this generator produces is prefixed, so its own output can be
 * told apart from anything a user created. Reconciliation (below) only ever
 * considers rows matching these prefixes.
 */
const SEED_ID_PREFIXES = ["derm_", "act_"];

function isSeedRow(id: string): boolean {
  return SEED_ID_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * @param password  the shared development password for every seeded login.
 *                  Supplied by the caller; never hardcoded in the repo.
 */
export async function provisionDermiere(
  password: string,
  opts: { withSeed?: boolean; reconcile?: boolean } = {}
): Promise<DermiereProvisionResult> {
  const withSeed = opts.withSeed ?? true;
  const reconcile = opts.reconcile ?? false;

  // --- clinic row -------------------------------------------------------
  const existing = await pgGetClinicBySlug<ClinicConfig>(DERMIERE_SLUG);
  const clinicId = existing?.id ?? `clinic_${DERMIERE_SLUG}`;
  const created = !existing;

  const config: ClinicConfig = {
    ...defaultConfig({
      id: clinicId,
      name: DERMIERE_BRAND.name,
      slug: DERMIERE_SLUG,
      city: DERMIERE_BRAND.city,
      demo: false,
    }),
    // Preserve anything the clinic already edited in Settings.
    ...(existing?.payload ?? {}),
    id: clinicId,
    name: DERMIERE_BRAND.name,
    slug: DERMIERE_SLUG,
    branding: {
      tagline: DERMIERE_BRAND.tagline,
      phone: DERMIERE_BRAND.phone,
      email: DERMIERE_BRAND.email,
      brandColor: DERMIERE_BRAND.brandColor,
      address: `${DERMIERE_BRANCHES[0].address}, ${DERMIERE_BRANCHES[0].city}`,
      ...(existing?.payload?.branding ?? {}),
    },
    hours: existing?.payload?.hours ?? DERMIERE_BRAND.hours,
    menu: DERMIERE_TREATMENTS.map((t) => t.id),
    prices: Object.fromEntries(DERMIERE_TREATMENTS.map((t) => [t.id, t.price])),
    // Branches live here - configurable in Settings, not in CRM code.
    locations: existing?.payload?.locations?.length
      ? existing.payload.locations
      : DERMIERE_BRANCHES,
    taxRate: existing?.payload?.taxRate ?? 16,
  };
  await saveClinicConfig(config);

  // --- staff ------------------------------------------------------------
  // Existing accounts keep their id AND their password; only missing ones
  // are created. Nobody gets locked out by a re-run.
  const existingUsers = await pgListUsers<{
    name?: string;
    title?: string;
    workspace?: "clinic" | "crm";
  }>(clinicId);
  const byEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
  const idsByKey: Record<string, string> = {};

  for (const s of DERMIERE_STAFF) {
    const found = byEmail.get(s.email.toLowerCase());
    if (found) {
      idsByKey[s.key] = found.id;
      // Keep the account's password and id, but let name/title/workspace
      // catch up - a rename or a workspace change must reach an account
      // that already exists.
      await pgUpsertUser(
        found.id,
        clinicId,
        found.email,
        s.role,
        found.password_hash,
        found.active,
        { name: s.name, title: s.title, workspace: s.workspace }
      );
      continue;
    }
    // Guard against the email existing under another clinic.
    const taken = await pgGetUserByEmail(s.email);
    if (taken) {
      idsByKey[s.key] = taken.id;
      continue;
    }
    const id = uid();
    idsByKey[s.key] = id;
    await pgUpsertUser(id, clinicId, s.email, s.role, hashPassword(password), true, {
      name: s.name,
      title: s.title,
      workspace: s.workspace,
    });
  }

  const branches = config.locations ?? DERMIERE_BRANCHES;
  const counts: Record<string, number> = {};
  let removed: Record<string, number> | undefined;

  if (withSeed) {
    const gulberg = branches[0]?.id ?? "branch_gulberg";
    const f11 = branches[1]?.id ?? gulberg;

    const seed = buildDermiereSeed(clinicId, branches, {
      ownerId: idsByKey.owner,
      doctorByBranch: {
        [gulberg]: idsByKey.doctor_gulberg,
        [f11]: idsByKey.doctor_f11,
      },
      frontDeskByBranch: {
        [gulberg]: idsByKey.frontdesk_gulberg,
        [f11]: idsByKey.frontdesk_f11,
      },
      allFrontDesk: [idsByKey.frontdesk_gulberg, idsByKey.frontdesk_f11],
    });

    for (const p of seed.patients) {
      await pgUpsertRecord(clinicId, "patients", p.id, p);
    }
    // The clinical layer: a face, a worked-up consult, a plan and a report.
    // Without these the patient screens render but have nothing to show.
    for (const a of seed.assets) {
      await pgUpsertRecord(clinicId, "assets", a.id, a);
    }
    for (const c of seed.consultations) {
      await pgUpsertRecord(clinicId, "consultations", c.id, c);
    }
    for (const pl of seed.plans) {
      await pgUpsertRecord(clinicId, "plans", pl.id, pl);
    }
    for (const pi of seed.planItems) {
      await pgUpsertRecord(clinicId, "plan_items", pi.id, pi);
    }
    for (const rep of seed.reports) {
      await pgUpsertRecord(clinicId, "reports", rep.id, rep);
    }
    for (const inv of seed.invoices) {
      await pgUpsertRecord(clinicId, "invoices", inv.id, inv);
    }
    for (const a of seed.appointments) {
      await pgUpsertAppointment(clinicId, a.id, a.start, a.status, a);
    }
    for (const c of seed.contacts) {
      await saveContact(c);
      await addActivity({
        id: `act_created_${c.id}`,
        clinic_id: clinicId,
        contact_id: c.id,
        patient_id: c.patient_id,
        kind: "lead_created",
        summary: `Lead captured from ${c.source.replace(/_/g, " ")}`,
        actor_id: c.assigned_to,
        branch_id: c.branch_id,
        ref_id: c.id,
        created_at: c.created_at,
      });
      if (c.stage === "won") {
        await addActivity({
          id: `act_won_${c.id}`,
          clinic_id: clinicId,
          contact_id: c.id,
          patient_id: c.patient_id,
          kind: "converted",
          summary: "Converted to patient",
          actor_id: c.assigned_to,
          branch_id: c.branch_id,
          ref_id: c.id,
          created_at: c.updated_at,
        });
      }
    }
    for (const f of seed.followUps) {
      await saveFollowUp(f);
      await addActivity({
        id: `act_fu_${f.id}`,
        clinic_id: clinicId,
        contact_id: f.contact_id,
        patient_id: f.patient_id,
        kind: f.status === "completed" ? "followup_completed" : "followup_created",
        summary:
          f.status === "completed"
            ? `Follow-up completed: ${f.title}`
            : `Follow-up scheduled: ${f.title}`,
        actor_id: f.assigned_to,
        branch_id: f.branch_id,
        ref_id: f.id,
        created_at: f.completed_at ?? f.created_at,
      });
    }
    for (const c of seed.conversations) await saveConversation(c);
    for (const m of seed.messages) {
      await saveMessage(m);
      if (!m.internal) {
        const conv = seed.conversations.find((c) => c.id === m.conversation_id);
        await addActivity({
          id: `act_msg_${m.id}`,
          clinic_id: clinicId,
          contact_id: conv?.contact_id,
          kind: m.direction === "inbound" ? "message_in" : "message_out",
          summary:
            m.direction === "inbound"
              ? "Message received on WhatsApp"
              : "Reply sent on WhatsApp",
          detail: m.body.slice(0, 140),
          actor_id: m.author_id,
          branch_id: conv?.branch_id,
          ref_id: m.id,
          created_at: m.created_at,
        });
      }
    }
    for (const f of seed.feedback) {
      await saveFeedback(f);
      await addActivity({
        id: `act_fb_${f.id}`,
        clinic_id: clinicId,
        contact_id: f.contact_id,
        patient_id: f.patient_id,
        kind: "feedback",
        summary: `Feedback received - ${f.overall_rating}/5`,
        detail: f.comment,
        branch_id: f.branch_id,
        ref_id: f.id,
        created_at: f.created_at,
      });
    }
    for (const t of seed.templates) await saveTemplate(t);

    counts.patients = seed.patients.length;
    counts.consultations = seed.consultations.length;
    counts.assets = seed.assets.length;
    counts.plans = seed.plans.length;
    counts.reports = seed.reports.length;
    counts.appointments = seed.appointments.length;
    counts.invoices = seed.invoices.length;
    counts.contacts = seed.contacts.length;
    counts.followUps = seed.followUps.length;
    counts.conversations = seed.conversations.length;
    counts.messages = seed.messages.length;
    counts.feedback = seed.feedback.length;
    counts.templates = seed.templates.length;

    if (reconcile) {
      removed = await reconcileSeedRows(clinicId, seed);
    }
  }

  // One list of people: any registry patient without a CRM contact gets one.
  // Additive and idempotent, so it is safe on every run.
  const link = await linkRegistryPatients(clinicId);
  if (link.created || link.linked) {
    counts.registryLinked = link.created + link.linked;
  }

  return {
    clinic: { id: clinicId, slug: DERMIERE_SLUG, name: DERMIERE_BRAND.name },
    created,
    removed,
    logins: DERMIERE_STAFF.map((s) => ({
      name: s.name,
      email: s.email,
      role: s.role,
      title: s.title,
      workspace: s.workspace,
    })),
    counts,
  };
}
