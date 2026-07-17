/**
 * Show the most recently CREATED appointments + calls in the CAPTURE
 * database — the fastest way to answer "did that booking actually land?".
 *
 *   node scripts/db-recent.cjs
 */
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  return env.match(/^DATABASE_URL=(.+)$/m)[1].trim();
}

(async () => {
  const sql = neon(databaseUrl());

  const recent = await sql`
    SELECT payload->>'patient_name' AS name,
           payload->>'start'        AS start_at,
           payload->>'source'       AS source,
           payload->>'created_at'   AS created_at,
           payload->>'procedure_interest' AS treatment
    FROM appointments
    ORDER BY payload->>'created_at' DESC
    LIMIT 8`;
  console.log("--- most recently created appointments ---");
  for (const r of recent) {
    console.log(
      `${(r.created_at || "").slice(0, 19)}  created  |  ${r.start_at?.slice(0, 16)}  ${(r.name || "").padEnd(18)} ${r.source}  ${r.treatment ?? ""}`
    );
  }

  const sat = await sql`
    SELECT payload->>'patient_name' AS name, payload->>'start' AS start_at, payload->>'source' AS source
    FROM appointments
    WHERE payload->>'start' LIKE '2026-07-18%'`;
  console.log(`\n--- anything on Saturday 18 July? ${sat.length} row(s) ---`);
  for (const r of sat) console.log(`  ${r.start_at} ${r.name} (${r.source})`);

  const vyb = await sql`
    SELECT count(*)::int AS n FROM appointments WHERE payload->>'source' = 'vybero'`;
  console.log(`\nvybero-sourced appointments total: ${vyb[0].n} (all seeded unless a real call landed)`);
})();
