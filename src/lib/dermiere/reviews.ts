/**
 * Seeded reviews, their invites and the loyalty rewards they earn.
 *
 * The Reviews screen reads these from the database like any other record,
 * so an empty table means an empty screen. Capture seeds its own; Dermiere
 * never did, which is why the whole review and rewards loop looked broken.
 *
 * Every review here belongs to a real seeded patient, at a real branch, for
 * a treatment that is actually on the Dermiere menu, and is written in the
 * voice a patient in Lahore or Islamabad would use. A five-star review
 * issues a discount code, exactly as the live flow does.
 */

import type { ClinicReview, Reward, ReviewInvite, Patient } from "@/lib/types";

const TOKEN_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * What each review says.
 *
 * Ratings are deliberately not all fives: a wall of perfect scores reads as
 * fabricated, and the low ones are what make the "needs follow-up" workflow
 * worth showing at all.
 */
const SCRIPTS: Array<{
  daysAgo: number;
  treatments: string[];
  rating: number;
  comment: string;
  highlights: string[];
  followedUp?: boolean;
}> = [
  {
    daysAgo: 2,
    treatments: ["hydrafacial"],
    rating: 5,
    comment:
      "Skin felt clean and calm straight after, and the glow was still there the next morning. Dr. Hina took time to explain what she was doing at each step.",
    highlights: ["visible results", "unhurried"],
  },
  {
    daysAgo: 4,
    treatments: ["pigmentation"],
    rating: 5,
    comment:
      "My melasma has faded noticeably after three sessions. They were honest that it would take time instead of overpromising, which I appreciated.",
    highlights: ["honest advice", "visible results"],
  },
  {
    daysAgo: 6,
    treatments: ["botox"],
    rating: 4,
    comment:
      "Very natural result, nobody could tell. Only note is that I waited about twenty minutes past my appointment time.",
    highlights: ["natural result"],
  },
  {
    daysAgo: 9,
    treatments: ["laser_hair"],
    rating: 5,
    comment:
      "Sixth session and the difference is huge. Staff are lovely and the rooms are spotless.",
    highlights: ["clean clinic", "friendly staff"],
  },
  {
    daysAgo: 11,
    treatments: ["filler"],
    rating: 5,
    comment:
      "I was nervous about looking overdone and they talked me down to a smaller amount. That honesty is why I will come back.",
    highlights: ["honest advice", "no pain at all"],
  },
  {
    daysAgo: 13,
    treatments: ["microneedling"],
    rating: 3,
    comment:
      "The treatment was fine but my acne scars have not changed much yet. Was expecting more by session three.",
    highlights: [],
    // Deliberately left open: the recovery workflow only means something
    // when there is actually somebody waiting to be called back.
  },
  {
    daysAgo: 16,
    treatments: ["chemical_peel"],
    rating: 5,
    comment:
      "Peeling settled in three days exactly as they said it would. Aftercare instructions on WhatsApp were genuinely useful.",
    highlights: ["clear aftercare"],
  },
  {
    daysAgo: 19,
    treatments: ["skin_boosters"],
    rating: 4,
    comment:
      "Skin feels much more hydrated. Parking at Gulberg is a bit of a hassle but the treatment was worth it.",
    highlights: ["visible results"],
  },
  {
    daysAgo: 22,
    treatments: ["acne_program"],
    rating: 5,
    comment:
      "Six weeks in and my breakouts have almost stopped. They adjusted the plan when my skin got dry instead of pushing through.",
    highlights: ["adjusted my plan", "visible results"],
  },
  {
    daysAgo: 26,
    treatments: ["hydrafacial", "pigmentation"],
    rating: 2,
    comment:
      "Felt rushed on my last visit and the room was not ready on time. The treatment itself was fine but the experience was not what I expected.",
    highlights: [],
    followedUp: true,
  },
  {
    daysAgo: 30,
    treatments: ["consult"],
    rating: 5,
    comment:
      "Came in just for a consultation. No pressure to book anything, which honestly made me trust them more.",
    highlights: ["no pressure", "honest advice"],
  },
  {
    daysAgo: 34,
    treatments: ["botox", "filler"],
    rating: 5,
    comment:
      "Dr. Omar has a very light hand. Second time here and I would not go anywhere else in Islamabad now.",
    highlights: ["natural result", "would return"],
  },
];

export interface SeededReviews {
  reviews: ClinicReview[];
  invites: ReviewInvite[];
  rewards: Reward[];
}

/**
 * Build the review history.
 *
 * Patients are assigned round-robin so every review belongs to a real
 * person on file, and the branch follows the patient's own city so a Lahore
 * patient never reviews the Islamabad clinic.
 */
export function buildDermiereReviews(
  patients: Patient[],
  branchIds: { gulberg: string; f11: string },
  doctorNames: { gulberg: string; f11: string },
  r: () => number,
  now: number
): SeededReviews {
  const reviews: ClinicReview[] = [];
  const invites: ReviewInvite[] = [];
  const rewards: Reward[] = [];
  if (patients.length === 0) return { reviews, invites, rewards };

  const token = () => {
    let s = "";
    for (let i = 0; i < 16; i++) s += TOKEN_CHARS[Math.floor(r() * TOKEN_CHARS.length)];
    return s;
  };
  const code = () => {
    let s = "";
    for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(r() * CODE_CHARS.length)];
    return `DERM-${s}`;
  };

  SCRIPTS.forEach((script, i) => {
    const patient = patients[i % patients.length];
    const inIslamabad = (patient.city ?? "").toLowerCase().includes("islamabad");
    const locationId = inIslamabad ? branchIds.f11 : branchIds.gulberg;
    const staffName = inIslamabad ? doctorNames.f11 : doctorNames.gulberg;

    const when = new Date(now - script.daysAgo * 86400000);
    when.setHours(18 + Math.floor(r() * 3), Math.floor(r() * 60), 0, 0);
    const createdAt = when.toISOString();

    const inviteId = `derm_invite_${i}`;
    const reviewId = `derm_review_${i}`;

    reviews.push({
      id: reviewId,
      invite_id: inviteId,
      patient_id: patient.id,
      patient_name: patient.name,
      location_id: locationId,
      treatments: script.treatments,
      staff_name: staffName,
      rating: script.rating,
      comment: script.comment,
      highlights: script.highlights,
      followed_up: script.followedUp,
      created_at: createdAt,
    });

    invites.push({
      id: inviteId,
      token: token(),
      patient_id: patient.id,
      patient_name: patient.name,
      location_id: locationId,
      treatments: script.treatments,
      staff_name: staffName,
      status: "COMPLETED",
      created_at: new Date(when.getTime() - 3600_000).toISOString(),
      opened_at: new Date(when.getTime() - 1800_000).toISOString(),
      completed_at: createdAt,
      review_id: reviewId,
    });

    // The loyalty loop: a five-star review earns a discount on the next
    // visit. Some have been redeemed already, which is what makes the
    // rewards figure on the dashboard mean anything.
    if (script.rating === 5) {
      const redeemed = i % 3 === 0;
      rewards.push({
        id: `derm_reward_${i}`,
        code: code(),
        patient_id: patient.id,
        patient_name: patient.name,
        review_id: reviewId,
        kind: "discount",
        value: 10,
        status: redeemed ? "redeemed" : "issued",
        issued_at: createdAt,
        expires_at: new Date(when.getTime() + 90 * 86400000).toISOString(),
        redeemed_at: redeemed
          ? new Date(when.getTime() + 12 * 86400000).toISOString()
          : undefined,
      });
    }
  });

  // A few invites that were sent but never completed, so the invite funnel
  // on the dashboard shows a real drop-off rather than a perfect 100%.
  for (let i = 0; i < 4; i++) {
    const patient = patients[(SCRIPTS.length + i) % patients.length];
    const inIslamabad = (patient.city ?? "").toLowerCase().includes("islamabad");
    const sent = new Date(now - (1 + i * 2) * 86400000);
    invites.push({
      id: `derm_invite_open_${i}`,
      token: token(),
      patient_id: patient.id,
      patient_name: patient.name,
      location_id: inIslamabad ? branchIds.f11 : branchIds.gulberg,
      treatments: ["consult"],
      status: i < 2 ? "OPENED" : "PENDING",
      created_at: sent.toISOString(),
      opened_at: i < 2 ? new Date(sent.getTime() + 7200_000).toISOString() : undefined,
    });
  }

  return { reviews, invites, rewards };
}
