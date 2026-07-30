/**
 * Reviews + Capture Circle - server store.
 *
 * The portal pattern, repointed at clients: front desk (or POS checkout)
 * mints a token link per visit; the client opens it (PENDING→OPENED),
 * submits a rating (→COMPLETED), and the submit issues a Capture Circle
 * reward that POS can redeem. Postgres in production, devDb locally -
 * both via the db layer's self-routing helpers.
 */

import type { ClinicReview, Reward, ReviewInvite } from "@/lib/types";
import {
  dbAvailable,
  pgGetReviewInviteByToken,
  pgListRecords,
  pgListReviewInvites,
  pgListReviews,
  pgUpsertRecord,
  pgUpsertReview,
  pgUpsertReviewInvite,
} from "./db";

const uid = () => crypto.randomUUID();

export class ReviewStoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function requireStore(): void {
  if (!dbAvailable()) {
    throw new ReviewStoreError(
      "not_configured",
      "No database configured for reviews."
    );
  }
}

/** Crypto-random 16-char URL-safe token (same recipe as the portal). */
export function newToken(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

function newRewardCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return `CIRCLE-${out}`;
}

// ---- per-IP submit rate limiting --------------------------------------
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((x) => now - x < windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > max;
}

// -----------------------------------------------------------------------

export async function createInvite(
  clinicId: string,
  data: {
    patient_id?: string;
    patient_name: string;
    location_id: string;
    treatments: string[];
    staff_name?: string;
    invoice_id?: string;
  }
): Promise<ReviewInvite> {
  requireStore();
  const invite: ReviewInvite = {
    id: uid(),
    token: newToken(),
    patient_id: data.patient_id,
    patient_name: data.patient_name,
    location_id: data.location_id,
    treatments: data.treatments,
    staff_name: data.staff_name,
    invoice_id: data.invoice_id,
    status: "PENDING",
    created_at: new Date().toISOString(),
  };
  await pgUpsertReviewInvite(clinicId, invite.id, invite.token, invite.created_at, invite);
  return invite;
}

export async function saveInvite(
  clinicId: string,
  invite: ReviewInvite
): Promise<void> {
  requireStore();
  await pgUpsertReviewInvite(clinicId, invite.id, invite.token, invite.created_at, invite);
}

export async function listInvites(clinicId: string): Promise<ReviewInvite[]> {
  requireStore();
  return pgListReviewInvites<ReviewInvite>(clinicId);
}

export async function getInviteByToken(
  token: string
): Promise<{ clinicId: string; invite: ReviewInvite } | null> {
  requireStore();
  const row = await pgGetReviewInviteByToken<ReviewInvite>(token);
  return row ? { clinicId: row.clinic_id, invite: row.payload } : null;
}

export async function listReviews(clinicId: string): Promise<ClinicReview[]> {
  requireStore();
  return pgListReviews<ClinicReview>(clinicId);
}

export async function saveReview(
  clinicId: string,
  review: ClinicReview
): Promise<void> {
  requireStore();
  await pgUpsertReview(clinicId, review.id, review.created_at, review);
}

/** Issues the Capture Circle reward for a submitted review. */
export async function issueReward(
  clinicId: string,
  review: ClinicReview,
  incentive: { value: number; validityDays: number }
): Promise<Reward> {
  requireStore();
  const now = new Date();
  const reward: Reward = {
    id: uid(),
    code: newRewardCode(),
    patient_id: review.patient_id,
    patient_name: review.patient_name,
    review_id: review.id,
    kind: "discount",
    value: incentive.value,
    status: "issued",
    issued_at: now.toISOString(),
    expires_at: new Date(
      now.getTime() + incentive.validityDays * 86_400_000
    ).toISOString(),
  };
  await pgUpsertRecord(clinicId, "rewards", reward.id, reward);
  return reward;
}

export async function listRewards(clinicId: string): Promise<Reward[]> {
  requireStore();
  return pgListRecords<Reward>(clinicId, "rewards");
}
