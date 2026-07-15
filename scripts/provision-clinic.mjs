#!/usr/bin/env node
/**
 * Provision a new clinic on a running Contour deployment (< 1 minute/clinic).
 *
 * Usage:
 *   node scripts/provision-clinic.mjs \
 *     --url https://aesthetics-mu.vercel.app \
 *     --key <PLATFORM_ADMIN_KEY> \
 *     --name "Radiance Skin Clinic" --slug radiance --city Karachi \
 *     --admin-name "Dr Sara" --admin-email admin@radiance.clinic \
 *     --admin-password "a-strong-password"
 *
 * The PLATFORM_ADMIN_KEY must match the env var set on the deployment.
 * On success it prints the new clinic id and the admin login.
 *
 * After provisioning, the only per-clinic setup left is done IN-APP by that
 * clinic's admin: branding, treatment menu + prices, hours, and (optional)
 * the VYBERO voice-agent id — all under Settings, all persisted server-side.
 */

const args = process.argv.slice(2);
function arg(name, fallbackEnv) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i + 1]) return args[i + 1];
  return fallbackEnv ? process.env[fallbackEnv] : undefined;
}

const url = (arg("url", "CONTOUR_URL") || "http://localhost:3000").replace(/\/$/, "");
const key = arg("key", "PLATFORM_ADMIN_KEY");
const body = {
  name: arg("name"),
  slug: arg("slug"),
  city: arg("city"),
  adminName: arg("admin-name"),
  adminEmail: arg("admin-email"),
  adminPassword: arg("admin-password"),
  demo: false,
};

const missing = ["name", "slug", "adminName", "adminEmail", "adminPassword"].filter(
  (k) => !body[k]
);
if (missing.length) {
  console.error(`Missing required args: ${missing.join(", ")}`);
  console.error("Run with --name --slug --admin-name --admin-email --admin-password (see file header).");
  process.exit(1);
}

const res = await fetch(`${url}/api/admin/provision`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(key ? { "x-platform-key": key } : {}),
  },
  body: JSON.stringify(body),
});
const data = await res.json().catch(() => ({}));
if (!res.ok || !data.ok) {
  console.error(`Provisioning failed (HTTP ${res.status}):`, data.message || data.error || "unknown");
  process.exit(1);
}
console.log("✓ Clinic provisioned");
console.log(`  id:    ${data.clinic.id}`);
console.log(`  slug:  ${data.clinic.slug}`);
console.log(`  name:  ${data.clinic.name}`);
console.log(`  login: ${data.login.email}  (password as provided)`);
console.log(`\nNext: sign in at ${url} and set branding, menu, prices and hours under Settings.`);
