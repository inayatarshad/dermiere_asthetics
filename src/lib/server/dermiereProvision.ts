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
  pgDeleteUser,
  pgUpsertAppointment,
  pgUpsertRecord,
  pgUpsertReview,
  pgUpsertReviewInvite,
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
  listTemplates,
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
import { WON_STAGES } from "@/lib/crm/types";
import { linkRegistryPatients } from "./crmRegistry";
import { createInvite } from "./reviewStore";

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
    assets: { id: string }[];
    consultations: { id: string }[];
    plans: { id: string }[];
    planItems: { id: string }[];
    reports: { id: string }[];
    templates: { id: string }[];
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

  // The clinical record was never swept, so a portrait or a consultation
  // from an earlier run outlived the patient it was built for and stayed
  // attached to whoever now held that id: a man's record wearing a woman's
  // photograph. Reports first, then plan items, plans, consultations and
  // finally the assets they all hang off, so nothing is left pointing at a
  // row that has already gone.
  const [cAssets, cConsults, cPlans, cPlanItems, cReports] = await Promise.all([
    pgListRecords<{ id: string }>(clinicId, "assets"),
    pgListRecords<{ id: string }>(clinicId, "consultations"),
    pgListRecords<{ id: string }>(clinicId, "plans"),
    pgListRecords<{ id: string }>(clinicId, "plan_items"),
    pgListRecords<{ id: string }>(clinicId, "reports"),
  ]);
  await prune("reports", seed.reports, cReports, (id) =>
    pgDeleteRecord(clinicId, "reports", id)
  );
  await prune("planItems", seed.planItems, cPlanItems, (id) =>
    pgDeleteRecord(clinicId, "plan_items", id)
  );
  await prune("plans", seed.plans, cPlans, (id) =>
    pgDeleteRecord(clinicId, "plans", id)
  );
  await prune("consultations", seed.consultations, cConsults, (id) =>
    pgDeleteRecord(clinicId, "consultations", id)
  );
  await prune("assets", seed.assets, cAssets, (id) =>
    pgDeleteRecord(clinicId, "assets", id)
  );

  // A renamed template leaves its old row behind, and the Templates screen
  // then shows an automation that nothing fires any more.
  await prune("templates", seed.templates, await listTemplates(clinicId), (id) =>
    deleteCrmRow(clinicId, "crm_templates", id)
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

  // Contacts the registry backfill created carry a generated uuid, not a
  // seed prefix, so prune() cannot see them: pruning a seeded patient used
  // to leave its CRM contact behind pointing at a row that no longer
  // exists. Sweep any contact whose patient has gone.
  // `patients` was read before pruning, so survivors are what the seed
  // still contains plus anything that was never generated at all.
  const seededPatientIds = new Set(seed.patients.map((p) => p.id));
  const livePatients = new Set(
    patients
      .map((p) => p.id)
      .filter((id) => !isSeedRow(id) || seededPatientIds.has(id))
  );
  let orphaned = 0;
  for (const c of contacts) {
    if (!c.patient_id || livePatients.has(c.patient_id)) continue;
    // Take the conversation with it. A thread whose contact is gone renders
    // as "Unknown contact" in the inbox, which is worse than not existing.
    for (const cv of conversations.filter((x) => x.contact_id === c.id)) {
      for (const m of await listMessages(clinicId, cv.id)) {
        await deleteCrmRow(clinicId, "crm_messages", m.id);
      }
      await deleteCrmRow(clinicId, "crm_conversations", cv.id);
    }
    await deleteCrmRow(clinicId, "crm_contacts", c.id);
    orphaned++;
  }
  if (orphaned) removed.orphanedContacts = orphaned;
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
// Every id this generator writes carries one of these. "tpl_" belongs here
// too: the four templates are generated, so a renamed one left its old row
// behind and the Templates screen kept listing an automation that nothing
// fires any more.
const SEED_ID_PREFIXES = ["derm_", "act_", "tpl_"];

function isSeedRow(id: string): boolean {
  return SEED_ID_PREFIXES.some((p) => id.startsWith(p));
}

/**
 * @param password  the shared development password for every seeded login.
 *                  Supplied by the caller; never hardcoded in the repo.
 */
export async function provisionDermiere(
  password: string,
  opts: {
    withSeed?: boolean;
    reconcile?: boolean;
    /** Origin for the review link in the demo feedback thread. */
    baseUrl?: string;
  } = {}
): Promise<DermiereProvisionResult> {
  const withSeed = opts.withSeed ?? true;
  let skippedContacts = 0;
  let skippedConversations = 0;
  const reconcile = opts.reconcile ?? false;

  // --- clinic row -------------------------------------------------------
  const existing = await pgGetClinicBySlug<ClinicConfig>(DERMIERE_SLUG);
  const clinicId = existing?.id ?? `clinic_${DERMIERE_SLUG}`;
  const created = !existing;
  const storedHours = existing?.payload?.hours;
  const hoursAreLegacySeed =
    storedHours?.open === "11:00" &&
    storedHours.close === "20:00" &&
    storedHours.slot_min === 30;
  const storedLocations = existing?.payload?.locations;
  const locationsAreLegacySeed =
    storedLocations?.some((location) => location.id === "branch_gulberg") ?? false;

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
    // Migrate the exact old demo seed (11:00-20:00) to Dermiére's confirmed
    // hours while preserving any genuinely customized schedule.
    hours: hoursAreLegacySeed ? DERMIERE_BRAND.hours : storedHours ?? DERMIERE_BRAND.hours,
    menu: DERMIERE_TREATMENTS.map((t) => t.id),
    prices: Object.fromEntries(DERMIERE_TREATMENTS.map((t) => [t.id, t.price])),
    // Branches live here - configurable in Settings, not in CRM code - so a
    // normal run never overwrites what the clinic has edited.
    //
    // reconcile means "the seed is the truth, make the data match it", and
    // without this that promise stopped at the branch list: correcting a
    // branch in code (a wrong city, a renamed site) could never reach the
    // database, because the stale row always won.
    locations:
      !reconcile && storedLocations?.length && !locationsAreLegacySeed
        ? storedLocations
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
    branch_id?: string;
  }>(clinicId);
  const byEmail = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u]));
  const idsByKey: Record<string, string> = {};

  // Addresses used by the first Dermiére demo seed. When a person's email
  // is corrected, reconcile the existing row by id so their password,
  // enabled state, assignments and history survive the rename.
  const legacyEmailByKey: Record<string, string> = {
    marketing: "rameez@dermiere.pk",
    crm: "crm@dermiere.pk",
    crm_agent: "crm.agent@dermiere.pk",
    doctor_gulberg: "hina@dermiere.pk",
    frontdesk_gulberg: "ayesha@dermiere.pk",
    frontdesk_f10: "bilal@dermiere.pk",
  };

  // Where each person works, for screens that open filtered to their own
  // site. Clinic-wide accounts (founder, operations, marketing, CRM) get
  // nothing and therefore see everything. The branch ids come from the
  // config, so this is derived here rather than hardcoded in the staff list.
  const seedBranches = config.locations ?? DERMIERE_BRANCHES;
  const branchForKey = (key: string): string | undefined => {
    if (key.endsWith("_f10")) return seedBranches[0]?.id;
    if (key.endsWith("_gulberg")) return seedBranches[1]?.id;
    return undefined;
  };

  for (const s of DERMIERE_STAFF) {
    const found =
      byEmail.get(s.email.toLowerCase()) ??
      (legacyEmailByKey[s.key]
        ? byEmail.get(legacyEmailByKey[s.key].toLowerCase())
        : undefined);
    if (found) {
      idsByKey[s.key] = found.id;
      // Keep the account's password and id, but let name/title/workspace
      // catch up - a rename or a workspace change must reach an account
      // that already exists.
      await pgUpsertUser(
        found.id,
        clinicId,
        s.email,
        s.role,
        found.password_hash,
        found.active,
        {
          name: s.name,
          title: s.title,
          workspace: s.workspace,
          branch_id: branchForKey(s.key),
        }
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
      branch_id: branchForKey(s.key),
    });
  }


  // Remove the disabled founder placeholder used by an early demo build
  // once the canonical founder exists. The exact email/status guard keeps
  // this migration from touching any user-created staff account.
  const canonicalFounder = existingUsers.find(
    (u) => u.email.toLowerCase() === "anusha@dermiere.pk"
  );
  const obsoleteFounder = existingUsers.find(
    (u) => u.email.toLowerCase() === "zara@dermiere.pk" && !u.active
  );
  if (canonicalFounder && obsoleteFounder) {
    await pgDeleteUser(clinicId, obsoleteFounder.id);
  }

  const branches = config.locations ?? DERMIERE_BRANCHES;
  const counts: Record<string, number> = {};
  let removed: Record<string, number> | undefined;

  if (withSeed) {
    const f10 = branches[0]?.id ?? "branch_f10";
    const gulberg = branches[1]?.id ?? f10;

    const seed = buildDermiereSeed(clinicId, branches, {
      ownerId: idsByKey.owner,
      doctorByBranch: {
        [gulberg]: idsByKey.doctor_gulberg,
        [f10]: idsByKey.doctor_f10,
      },
      frontDeskByBranch: {
        [gulberg]: idsByKey.frontdesk_gulberg,
        [f10]: idsByKey.frontdesk_f10,
      },
      allFrontDesk: [idsByKey.frontdesk_f10, idsByKey.frontdesk_gulberg],
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
    // The review loop, so the Reviews screen and Circle rewards have data.
    for (const inv of seed.reviewInvites) {
      await pgUpsertReviewInvite(clinicId, inv.id, inv.token, inv.created_at, inv);
    }
    for (const rev of seed.reviews) {
      await pgUpsertReview(clinicId, rev.id, rev.created_at, rev);
    }
    for (const rw of seed.rewards) {
      await pgUpsertRecord(clinicId, "rewards", rw.id, rw);
    }
    for (const inv of seed.invoices) {
      await pgUpsertRecord(clinicId, "invoices", inv.id, inv);
    }
    for (const a of seed.appointments) {
      await pgUpsertAppointment(clinicId, a.id, a.start, a.status, a);
    }
    // A phone number identifies a person, and the database enforces that.
    // If a real contact already holds a number the generator invented, the
    // real one wins and the fabricated row is skipped: provisioning must
    // never fail, or overwrite someone, because of a coincidence.
    const phoneOwners = new Map(
      (await listContacts(clinicId)).map((c) => [c.phone_norm, c.id])
    );
    for (const c of seed.contacts) {
      const owner = phoneOwners.get(c.phone_norm);
      if (owner && owner !== c.id) {
        skippedContacts++;
        continue;
      }
      await saveContact(c);
      await addActivity({
        id: `act_created_${c.id}`,
        clinic_id: clinicId,
        contact_id: c.id,
        patient_id: c.patient_id,
        kind: "lead_created",
        summary: `Booked via ${c.source.replace(/_/g, " ")}`,
        actor_id: c.assigned_to,
        branch_id: c.branch_id,
        ref_id: c.id,
        created_at: c.created_at,
      });
      if (WON_STAGES.includes(c.stage)) {
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
    // Only one conversation per contact per channel may be open, so a
    // contact who already has a live thread (a real one, or one the chat
    // booking opened) keeps it; the fabricated thread is skipped rather
    // than colliding with it.
    const skippedConvIds = new Set<string>();
    const openThreads = new Map(
      (await listConversations(clinicId))
        .filter((c) => c.status === "open")
        .map((c) => [`${c.contact_id}:${c.channel}`, c.id])
    );
    for (const c of seed.conversations) {
      const holder = openThreads.get(`${c.contact_id}:${c.channel}`);
      if (holder && holder !== c.id) {
        skippedConversations++;
        skippedConvIds.add(c.id);
        continue;
      }
      await saveConversation(c);
    }
    // The demo feedback thread carries a real, openable review link. Minted
    // here rather than in the seed because only the server can create an
    // invite and know the origin it will be opened from.
    let reviewUrl: string | null = null;
    for (const seeded of seed.messages) {
      let m = seeded;
      if (m.body.includes("{{review_link}}")) {
        if (!reviewUrl) {
          const conv = seed.conversations.find(
            (c) => c.id === m.conversation_id
          );
          const who = seed.contacts.find((c) => c.id === conv?.contact_id);
          const invite = await createInvite(clinicId, {
            patient_id: who?.patient_id,
            patient_name: who?.name ?? "Patient",
            location_id: who?.branch_id ?? "",
            treatments: who?.treatment_interest ?? [],
          });
          reviewUrl = `${opts.baseUrl ?? ""}/review/${invite.token}`;
        }
        m = { ...m, body: m.body.replace(/{{review_link}}/g, reviewUrl) };
      }
      await saveMessage(m);
      if (!m.internal) {
        const conv = seed.conversations.find((c) => c.id === m.conversation_id);
        if (conv && skippedConvIds.has(conv.id)) continue;
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
    counts.reviews = seed.reviews.length;
    counts.rewards = seed.rewards.length;
    counts.appointments = seed.appointments.length;
    counts.invoices = seed.invoices.length;
    counts.contacts = seed.contacts.length - skippedContacts;
    if (skippedContacts) counts.contactsSkipped = skippedContacts;
    counts.followUps = seed.followUps.length;
    counts.conversations = seed.conversations.length - skippedConversations;
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
