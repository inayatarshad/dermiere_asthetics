/**
 * Inspect the CRM tables. Reads DATABASE_URL from the environment or
 * .env.local, exactly like db-inspect.cjs.
 *
 *   node scripts/crm-inspect.cjs
 *
 * Read-only: it prints counts and distributions and never writes, deletes or
 * migrates anything. The connection string is never echoed.
 */
const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

function databaseUrl() {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  const env = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL not found in env or .env.local");
  return m[1].trim();
}

const TABLES = [
  "crm_contacts",
  "crm_followups",
  "crm_conversations",
  "crm_messages",
  "crm_templates",
  "crm_feedback",
  "crm_activities",
];

(async () => {
  const sql = neon(databaseUrl());

  const clinics = await sql`SELECT id, name, slug FROM clinics ORDER BY created_at`;
  for (const c of clinics) console.log(`clinic: ${c.name} (${c.slug})`);
  console.log("");

  for (const t of TABLES) {
    try {
      const r = await sql.query(`SELECT count(*)::int AS n FROM ${t}`);
      console.log(`  ${t.padEnd(20)} ${r[0].n}`);
    } catch {
      console.log(`  ${t.padEnd(20)} (missing)`);
    }
  }

  const stages = await sql`
    SELECT stage, count(*)::int AS n FROM crm_contacts GROUP BY stage ORDER BY n DESC`;
  console.log("\n  stages:  " + stages.map((s) => `${s.stage}=${s.n}`).join("  "));

  const branches = await sql`
    SELECT branch_id, count(*)::int AS n FROM crm_contacts GROUP BY branch_id ORDER BY branch_id`;
  console.log("  branches:" + branches.map((b) => ` ${b.branch_id}=${b.n}`).join(""));

  const fu = await sql`
    SELECT status, count(*)::int AS n FROM crm_followups GROUP BY status ORDER BY n DESC`;
  console.log("  followups:" + fu.map((f) => ` ${f.status}=${f.n}`).join(""));

  const overdue = await sql`
    SELECT count(*)::int AS n FROM crm_followups WHERE status = 'pending' AND due_at < now()`;
  console.log(`  overdue:  ${overdue[0].n}`);
})();
