"use client";

/**
 * The account picker on the sign-in screen.
 *
 * Two things shape this. First, the clinic has two branches with the same
 * two roles in each, so a flat list read as the same four rows twice: the
 * branches are groups you open, and only then do you choose a person.
 * Nothing is filled into the form until you pick an actual person, because
 * opening "Gulberg" is not yet a choice of who you are.
 *
 * Second, the CRM is a separate workspace with its own accounts, so it sits
 * behind its own door rather than as two more rows in the clinical list.
 */

import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  Headset,
  KanbanSquare,
  Megaphone,
  ShieldCheck,
  Stethoscope,
  ClipboardList,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface AccountCard {
  email: string;
  label: string;
  name: string;
  desc: string;
  icon: LucideIcon;
}

interface BranchGroup {
  id: string;
  label: string;
  sub: string;
  accounts: AccountCard[];
}

/**
 * The founder sits above everything: hers is the account most people
 * opening this want, so it is the first thing on the screen.
 */
const FOUNDER: AccountCard = {
  email: "anusha@dermiere.pk",
  label: "Founder & Director",
  name: "Dr. Anusha Liaqat",
  desc: "Full Clinic OS: patients, calendar, reviews and analytics",
  icon: ShieldCheck,
};

/**
 * Head-office accounts, listed after the branches.
 *
 * They support the clinics rather than run them, so they read better below
 * the two places where the work actually happens.
 */
const HEAD_OFFICE: AccountCard[] = [
  {
    email: "shahrukh@dermiere.pk",
    label: "Operations",
    name: "Shah Rukh Ahmed",
    desc: "Both branches: analytics, reviews monitoring, staff and settings",
    icon: Users,
  },
  {
    email: "rameez@dermiere.pk",
    label: "Marketing",
    name: "Saad Kamal",
    desc: "Review scores, VYBERO call insights, campaign performance",
    icon: Megaphone,
  },
];

/** Main clinic first, matching DERMIERE_BRANCHES. */
const BRANCHES: BranchGroup[] = [
  {
    id: "f10",
    label: "F-10 Clinic",
    sub: "Main clinic, Sector F-10/1, Islamabad",
    accounts: [
      {
        email: "omar@dermiere.pk",
        label: "Dermatologist",
        name: "Dr. Omar Sheikh",
        desc: "Consultations, patient timelines, treatment plans",
        icon: Stethoscope,
      },
      {
        email: "bilal@dermiere.pk",
        label: "Front Desk",
        name: "Faraz Siddiqui",
        desc: "Check-in, appointments, point of sale, review links",
        icon: ClipboardList,
      },
    ],
  },
  {
    id: "gulberg",
    label: "Gulberg Clinic",
    sub: "Lahore branch, Gulberg II",
    accounts: [
      {
        email: "hina@dermiere.pk",
        label: "Dermatologist",
        name: "Dr. Sana Bukhari",
        desc: "Consultations, patient timelines, treatment plans",
        icon: Stethoscope,
      },
      {
        email: "ayesha@dermiere.pk",
        label: "Front Desk",
        name: "Nimra Sajid",
        desc: "Check-in, appointments, point of sale, review links",
        icon: ClipboardList,
      },
    ],
  },
];

export const CRM_ACCOUNTS: AccountCard[] = [
  {
    email: "crm@dermiere.pk",
    label: "CRM Manager",
    name: "Mehreen Alvi",
    desc: "Owns the pipeline: every consultation booked, confirmed, visited, rebooked",
    icon: KanbanSquare,
  },
  {
    email: "crm.agent@dermiere.pk",
    label: "CRM Agent",
    name: "Taimoor Abbas",
    desc: "Works the WhatsApp inbox, chases confirmations and next sessions",
    icon: Headset,
  },
];

function AccountRow({
  account,
  disabled,
  onPick,
}: {
  account: AccountCard;
  disabled: boolean;
  onPick: (email: string) => void;
}) {
  const Icon = account.icon;
  return (
    <button
      disabled={disabled}
      onClick={() => onPick(account.email)}
      className="glass-subtle card-hover w-full flex items-center gap-3.5 px-4 py-3 text-left"
    >
      <span className="w-10 h-10 rounded-xl bg-mint-100 text-[color:var(--mint-500)] flex items-center justify-center shrink-0">
        <Icon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-900">
          {account.label}
          <span className="text-ink-400 font-normal"> · {account.name}</span>
        </span>
        <span className="block text-xs text-ink-400 truncate">{account.desc}</span>
      </span>
      <ArrowRight size={15} className="ml-auto text-ink-400 shrink-0" />
    </button>
  );
}

/** The clinical workspace accounts, with each branch as a group. */
export function ClinicAccounts({
  busy,
  onPick,
  onCrm,
}: {
  busy: boolean;
  onPick: (email: string) => void;
  onCrm: () => void;
}) {
  const [openBranch, setOpenBranch] = useState<string | null>(null);

  return (
    <div className="mt-7">
      <div className="caption mb-2.5">
        The Dermiére team. Pick a person to sign in.
      </div>

      <div className="space-y-2">
        <AccountRow account={FOUNDER} disabled={busy} onPick={onPick} />

        {BRANCHES.map((b) => {
          const open = openBranch === b.id;
          return (
            <div key={b.id} className="space-y-2">
              <button
                onClick={() => setOpenBranch(open ? null : b.id)}
                aria-expanded={open}
                className="glass-subtle card-hover w-full flex items-center gap-3.5 px-4 py-3 text-left"
              >
                <span className="w-10 h-10 rounded-xl bg-mint-100 text-[color:var(--mint-500)] flex items-center justify-center shrink-0">
                  <Users size={19} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900">
                    {b.label}
                  </span>
                  <span className="block text-xs text-ink-400 truncate">
                    {b.sub}
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  className={`ml-auto text-ink-400 shrink-0 transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                />
              </button>

              {open && (
                <div className="pl-4 space-y-2">
                  {b.accounts.map((a) => (
                    <AccountRow
                      key={a.email}
                      account={a}
                      disabled={busy}
                      onPick={onPick}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {HEAD_OFFICE.map((a) => (
          <AccountRow key={a.email} account={a} disabled={busy} onPick={onPick} />
        ))}
      </div>

      <button
        onClick={onCrm}
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-700"
      >
        <KanbanSquare size={13} /> CRM Workspace sign-in
      </button>
    </div>
  );
}

/** The CRM workspace accounts, behind their own door. */
export function CrmAccounts({
  busy,
  onPick,
  onClinic,
}: {
  busy: boolean;
  onPick: (email: string) => void;
  onClinic: () => void;
}) {
  return (
    <div className="mt-7">
      <div className="caption mb-2.5">
        CRM accounts. Pick a person, then press Enter to sign in.
      </div>
      <div className="space-y-2">
        {CRM_ACCOUNTS.map((a) => (
          <AccountRow key={a.email} account={a} disabled={busy} onPick={onPick} />
        ))}
      </div>

      <button
        onClick={onClinic}
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-700"
      >
        <Stethoscope size={13} /> Clinical workspace sign-in
      </button>
    </div>
  );
}
