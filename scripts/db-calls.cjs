/**
 * Recent vybero_calls — shows whether the ElevenLabs post-call webhook is
 * delivering (ids prefixed el_) and what the newest call rows look like.
 *
 *   node scripts/db-calls.cjs
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
  const rows = await sql`
    SELECT id, started_at,
           payload->>'caller_name' AS name,
           payload->>'outcome'     AS outcome,
           payload->>'duration_secs' AS secs,
           left(payload->>'summary', 60) AS summary
    FROM vybero_calls
    ORDER BY started_at DESC
    LIMIT 10`;
  console.log("--- newest calls ---");
  for (const r of rows) {
    const src = r.id.startsWith("el_") ? "WEBHOOK" : "seed/app";
    console.log(
      `${r.started_at.toISOString().slice(0, 16)}  ${src.padEnd(8)} ${(r.name ?? "—").padEnd(16)} ${(r.outcome ?? "").padEnd(9)} ${String(r.secs ?? "").padStart(4)}s  ${r.summary ?? ""}`
    );
  }
  const el = await sql`SELECT count(*)::int AS n FROM vybero_calls WHERE id LIKE 'el_%'`;
  console.log(`\nwebhook-delivered calls total: ${el[0].n}`);
})();
