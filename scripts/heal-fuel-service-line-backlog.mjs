/**
 * S9 — heal fuel/expense rows stuck in Unattributed after the T3-only SQL backfill.
 *
 * Calls POST /admin/fuel-audit/re-resolve-service-lines with onlyBacklog=true so T0/T2/T4
 * can fire via the runtime ladder. Never overwrites source=explicit.
 *
 * Usage:
 *   node scripts/heal-fuel-service-line-backlog.mjs [--dry-run] [--org ORG_ID] [--base URL]
 *
 * Requires SUPABASE_URL (or VITE_*) and a bearer with data.backfill (FUEL_HEAL_TOKEN or
 * SUPABASE_SERVICE_ROLE_KEY for local/admin tooling).
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULT_PROJECT_REF = "csfllzzastacofsvcdsc";
const DEFAULT_SUPABASE_URL = `https://${DEFAULT_PROJECT_REF}.supabase.co`;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const orgIdx = args.indexOf("--org");
const orgId = orgIdx >= 0 ? args[orgIdx + 1] : "";
const baseIdx = args.indexOf("--base");

const supabaseUrl = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL
).replace(/\/$/, "");

const base =
  (baseIdx >= 0 && args[baseIdx + 1]) ||
  process.env.SMOKE_BASE_URL ||
  `${supabaseUrl}/functions/v1/make-server-37f42386`;

const token =
  process.env.FUEL_HEAL_TOKEN ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  "";

if (!token) {
  console.error("Set FUEL_HEAL_TOKEN (or SUPABASE_SERVICE_ROLE_KEY) before running.");
  process.exit(1);
}

const url = `${base.replace(/\/$/, "")}/admin/fuel-audit/re-resolve-service-lines`;
const body = {
  onlyBacklog: true,
  includeExpenseJournal: true,
  dryRun,
  limit: 20000,
  ...(orgId ? { organizationId: orgId } : {}),
};

console.log(`POST ${url}`);
console.log(JSON.stringify(body, null, 2));

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    apikey: token,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text };
}

if (!res.ok) {
  console.error(`FAIL ${res.status}`, json);
  process.exit(1);
}

console.log("ok", json);
console.log(`cwd note: repo root is ${ROOT}`);
