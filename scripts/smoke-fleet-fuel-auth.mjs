/**
 * Phase H1 — authenticated proof that fleet-fuel mounts fuelApp routes.
 * Anon 401 under requireAuth("*") does NOT prove a route exists.
 *
 * Auth (one of):
 *   FLEET_USER_JWT=eyJ...
 *   FLEET_SMOKE_EMAIL + FLEET_SMOKE_PASSWORD
 *
 * Usage:
 *   node scripts/smoke-fleet-fuel-auth.mjs
 */
import { getApiKeys, signIn, SUPABASE_URL } from "./smoke/_shared.mjs";

const base = `${SUPABASE_URL}/functions/v1`;

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

async function hit(label, url, { token, anonKey, method = "GET", body } = {}) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
  };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body });
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

const health = await hit("health (anon)", `${base}/fleet-fuel/health`, { anonKey });
failed =
  !pass(health, health.status === 200, "expect 200") || failed;

const missing = await hit(
  "control zzz-does-not-exist (user JWT)",
  `${base}/fleet-fuel/zzz-does-not-exist`,
  authH,
);
failed = !pass(missing, missing.status === 404, "expect 404") || failed;

for (const path of ["/fuel-entries", "/stations"]) {
  const row = await hit(`${path} (user JWT)`, `${base}/fleet-fuel${path}`, authH);
  // Mount proof: must not 404. 200 is ideal; 403/app errors still prove the route exists.
  const ok = row.status !== 404 && row.status !== 502 && row.status !== 503;
  failed = !pass(row, ok && row.status !== 401, "expect not 404 (and not gateway/auth miss)") || failed;
  if (row.status === 401) {
    console.log("      hint: JWT may be expired/anon — need a real user session");
  }
}

const disputes = await hit(
  "fuel-disputes on make-server (user JWT)",
  `${base}/make-server-37f42386/fuel-disputes`,
  authH,
);
failed =
  !pass(
    disputes,
    disputes.status !== 404 && disputes.status !== 502,
    "monolith route should resolve",
  ) || failed;

const seal = await hit(
  "seal without service key",
  `${base}/fleet-fuel/internal/seal-fuel-week`,
  {
    anonKey,
    token: userJwt,
    method: "POST",
    body: "{}",
  },
);
failed = !pass(seal, seal.status === 401, "expect 401 unauthorized") || failed;

if (failed) {
  console.error("\nH1 auth smoke FAILED — fuel mount or auth not proven");
  exitSoon(1);
} else {
  console.log("\nH1 auth smoke PASSED — fuelApp mount proven");
  exitSoon(0);
}
