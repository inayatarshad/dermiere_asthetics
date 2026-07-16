/**
 * Inspect / tidy the CAPTURE database. Reads DATABASE_URL from .env.local.
 *
 *   node scripts/db-inspect.cjs            → row counts per table
 *   node scripts/db-inspect.cjs --clean    → also removes verification rows
 *
 * Safe by default: prints only. --clean deletes ONLY appointments whose
 * patient_name is an explicit test marker, never client data.
 */
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const TEST_MARKERS = ["Neon Test Client"];

function databaseUrl() {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL not found in env or .env.local");
  return m[1].trim();
}

(async () => {
  const sql = neon(databaseUrl());

  if (process.argv.includes("--clean")) {
    const del = await sql`
      DELETE FROM appointments
      WHERE payload->>'patient_name' = ANY(${TEST_MARKERS})
      RETURNING id`;
    console.log(`removed ${del.length} verification booking(s)`);
  }

  const clinics = await sql`SELECT id, name, slug FROM clinics`;
  console.log("clinics:", clinics.map((c) => `${c.name} (${c.slug})`).join(", ") || "none");

  for (const t of [
    "users",
    "patients",
    "appointments",
    "vybero_calls",
    "invoices",
    "rewards",
    "reviews",
    "review_invites",
    "skin_analyses",
    "consents",
    "assets",
    "consultations",
  ]) {
    const rows = await sql.query(`SELECT count(*)::int AS n FROM ${t}`);
    console.log(`  ${t.padEnd(16)} ${rows[0].n}`);
  }
})();
