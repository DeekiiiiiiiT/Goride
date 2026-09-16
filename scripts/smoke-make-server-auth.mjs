/**
 * Phase H3c — authenticated proof that make-server controllers still resolve
 * after pinning npm:hono@4.3.11 across _fleet-server.
 *
 * Auth (one of):
 *   FLEET_USER_JWT=eyJ...
 *   FLEET_SMOKE_EMAIL + FLEET_SMOKE_PASSWORD
 *
 * Usage:
 *   node scripts/smoke-make-server-auth.mjs
 */
import { getApiKeys, signIn, SUPABASE_URL } from "./smoke/_shared.mjs";

const base = `${SUPABASE_URL}/functions/v1/make-server-37f42386`;

function exitSoon(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 150);
}

async function resolveUserJwt(anonKey) {
  const fromEnv = (process.env.FLEET_USER_JWT || "").trim();
  if (fromEnv) return fromEnv;
  const email = (process.env.FLEET_SMOKE_EMAIL || "").trim();
  const password = (process.env.FLEET_SMOKE_PASSWORD || "").trim();
  if (email && password) return signIn(anonKey, email, password);
  throw new Error(
    "Missing auth: set FLEET_USER_JWT, or FLEET_SMOKE_EMAIL + FLEET_SMOKE_PASSWORD",
  );
}

async function hit(label, path, { token, anonKey } = {}) {
  const res = await fetch(`${base}${path}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token || anonKey}`,
    },
  });
  const text = await res.text();
  return { label, status: res.status, body: text.slice(0, 180) };
}

function pass(row, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${row.label} → ${row.status}${detail ? ` (${detail})` : ""}`);
  if (!ok) console.log(`      body: ${row.body}`);
  return ok;
}

const { anonKey } = getApiKeys();
let userJwt;
try {
  userJwt = await resolveUserJwt(anonKey);
} catch (e) {
  console.error(String(e.message || e));
  exitSoon(1);
  throw e;
}

const authH = { token: userJwt, anonKey };
let failed = false;

const health = await hit("health", "/health", { anonKey });
failed = !pass(health, health.status === 200, "expect 200") || failed;

const missing = await hit("control zzz-does-not-exist (user JWT)", "/zzz-does-not-exist", authH);
failed = !pass(missing, missing.status === 404, "expect 404") || failed;

const livePaths = [
  ["/toll-tags", "toll"],
  ["/batches", "batches"],
  ["/maintenance-fleet-summary", "maintenance"],
  ["/fuel-disputes", "disputes"],
];

for (const [path, name] of livePaths) {
  const row = await hit(`${name} ${path} (user JWT)`, path, authH);
  const ok = row.status !== 404 && row.status !== 502 && row.status !== 503 && row.status !== 401;
  failed = !pass(row, ok, "expect not 404 (200/403 OK)") || failed;
  if (row.status === 401) {
    console.log("      hint: JWT may be expired/anon — need a real user session");
  }
}

if (failed) {
  console.error("\nH3c monolith auth smoke FAILED — pin regression or auth miss");
  exitSoon(1);
} else {
  console.log("\nH3c monolith auth smoke PASSED — make-server controllers resolve after Hono pin");
  exitSoon(0);
}
