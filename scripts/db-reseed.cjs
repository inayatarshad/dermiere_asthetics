/**
 * Reseed the CAPTURE demo database — run this THE MORNING OF a demo.
 *
 * The demo story (today's queue, this week's calendar, revenue today,
 * review trend) is generated relative to seed time, so it goes stale as
 * days pass. This script wipes every table and immediately triggers the
 * live deployment's seeder, which rebuilds the whole story anchored to
 * NOW — pristine data, today's appointments on today.
 *
 *   node scripts/db-reseed.cjs --yes [--url https://capture-contour.vercel.app]
 *
 * DESTRUCTIVE for everything in the database (it is all demo data by
 * design). Refuses to run without --yes. Do NOT use against a database
 * holding real client records.
 */
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const TABLES = [
  "users",
  "patients",
  "consents",
  "assets",
  "consultations",
  "visualizations",
  "plans",
  "plan_items",
  "reports",
  "invoices",
  "rewards",
  "skin_analyses",
  "appointments",
  "vybero_calls",
  "booth_items",
  "portal_invites",
  "portal_responses",
  "review_invites",
  "reviews",
  "usage_counters",
  "clinics", // last — an empty clinics table is what re-arms the seeder
];

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  return env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
}

(async () => {
  if (!process.argv.includes("--yes")) {
    console.log("Refusing to run without --yes (this wipes and reseeds the demo database).");
    process.exit(1);
  }
  const urlFlag = process.argv.indexOf("--url");
  const base =
    urlFlag >= 0 ? process.argv[urlFlag + 1] : "https://capture-contour.vercel.app";

  const sql = neon(databaseUrl());

  console.log("wiping tables…");
  for (const t of TABLES) {
    try {
      await sql.query(`DELETE FROM ${t}`);
    } catch {
      // table may not exist yet on a fresh database — fine
    }
  }

  console.log(`triggering the seeder via ${base} …`);
  let seeded = false;
  for (let attempt = 1; attempt <= 6 && !seeded; attempt++) {
    try {
      const res = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "shahrukh@capture.cc", password: "capture" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        seeded = true;
        break;
      }
      console.log(`  attempt ${attempt}: ${res.status} — retrying…`);
    } catch (err) {
      console.log(`  attempt ${attempt}: ${err.message} — retrying…`);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }

  const clinics = await sql`SELECT name, slug FROM clinics`;
  const counts = {};
  for (const t of ["users", "patients", "appointments", "vybero_calls", "invoices", "reviews"]) {
    const rows = await sql.query(`SELECT count(*)::int AS n FROM ${t}`);
    counts[t] = rows[0].n;
  }
  console.log("\nresult:");
  console.log("  clinic:", clinics.map((c) => `${c.name} (${c.slug})`).join(", ") || "NONE — seeding did not run");
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(14)} ${n}`);

  if (!seeded || clinics.length === 0) {
    console.log("\nSeeder did not fire — open the live site and sign in once, then rerun node scripts/db-inspect.cjs to confirm.");
    process.exit(2);
  }
  console.log("\nFresh demo story anchored to today. Sign in and enjoy.");
})();
