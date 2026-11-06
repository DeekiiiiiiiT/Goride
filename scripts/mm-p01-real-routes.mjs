/**
 * P-01 / P-02 real-route proof against local Supabase (run from R:\Goride after seed + functions serve).
 * Usage: node scripts/mm-p01-real-routes.mjs
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const VEHICLE = "fx_vehicle_mm";
const PART = "e2000003-0000-4000-8000-000000000099";
const RULE = "e2000010-0000-4000-8000-000000000005";
const CAR_CATALOG = "e2000005-0000-4000-8000-000000000010";
const PASSWORD = "MmP01Local2026!";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

const MFA_FACTOR_BY_EMAIL = {
  "mm-p01-analyst@local.test": "101000f2-0000-4000-8000-000000000002",
  "mm-p01-support@local.test": "101000f2-0000-4000-8000-000000000004",
  "mm-p01-owner@local.test": "101000f2-0000-4000-8000-000000000003",
};

function base32Decode(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = input.replace(/=+$/g, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of cleaned) {
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totpCode(secret, counter = Math.floor(Date.now() / 1000 / 30)) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

function jwtAal(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString()).aal ?? null;
  } catch {
    return null;
  }
}

function parseStatusJson(raw) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Could not parse supabase status JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

function localKeys() {
  const out = execSync("npx supabase status -o json", {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
  });
  const st = parseStatusJson(out);
  const base = st.API_URL || "http://127.0.0.1:54321";
  const anonKey = st.ANON_KEY;
  if (!anonKey) throw new Error("Missing ANON_KEY from supabase status");
  return { base, anonKey };
}

async function signIn(base, anonKey, email) {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Sign-in ${email} failed (${res.status}): ${JSON.stringify(body)}`);
  return body.access_token;
}

async function signInPlatformAal2(base, anonKey, email) {
  const factorId = MFA_FACTOR_BY_EMAIL[email];
  if (!factorId) return signIn(base, anonKey, email);
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const login = await res.json();
  if (!res.ok) throw new Error(`Sign-in ${email} failed (${res.status}): ${JSON.stringify(login)}`);
  if (jwtAal(login.access_token) === "aal2") return login.access_token;

  const chRes = await fetch(`${base}/auth/v1/factors/${factorId}/challenge`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${login.access_token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const challenge = await chRes.json();
  if (!chRes.ok) throw new Error(`MFA challenge ${email} failed (${chRes.status}): ${JSON.stringify(challenge)}`);

  const verifyRes = await fetch(`${base}/auth/v1/factors/${factorId}/verify`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${login.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ challenge_id: challenge.id, code: totpCode(TOTP_SECRET) }),
  });
  const verified = await verifyRes.json();
  if (!verifyRes.ok) throw new Error(`MFA verify ${email} failed (${verifyRes.status}): ${JSON.stringify(verified)}`);
  const token = verified.access_token ?? login.access_token;
  if (jwtAal(token) !== "aal2") throw new Error(`Expected aal2 for ${email}, got ${jwtAal(token)}`);
  return token;
}

async function req(label, url, { token, anonKey, method = "GET", body, logBody = false } = {}) {
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token || anonKey}`,
    "Content-Type": "application/json",
    "x-roam-product-line": "fleet",
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 240);
  }
  console.log(`${label}: HTTP ${res.status}`);
  if (logBody || res.status >= 400 || label.includes("body")) {
    console.log(`  ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`);
  }
  return { status: res.status, body: parsed };
}

function sqlQuery(query) {
  const q = query.replace(/"/g, '\\"');
  const out = execSync(
    `docker exec supabase_db_Goride psql -U postgres -d postgres -t -A -c "${q}"`,
    { encoding: "utf8" },
  );
  return out.trim();
}

function resetLogServiceFixture() {
  execSync(
    `docker exec supabase_db_Goride psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "UPDATE public.vehicle_component_schedule SET last_performed_km=NULL, last_performed_date=NULL, next_due_km=49000, next_due_date=current_date - 1, schedule_status='active' WHERE organization_id='${ORG}' AND vehicle_id='${VEHICLE}' AND category_id='${PART}'; UPDATE fleet.maintenance_alerts SET status='open', resolution_reason=NULL, resolved_at=NULL WHERE organization_id='${ORG}' AND vehicle_id='${VEHICLE}' AND category_id='${PART}';"`,
    { encoding: "utf8" },
  );
}

const { base, anonKey } = localKeys();
const fleetOps = `${base}/functions/v1/fleet-ops`;
const fleetCore = `${base}/functions/v1/fleet-core/make-server-37f42386`;

const fleetJwt = await signIn(base, anonKey, "mm-p01-fleet@local.test");
const analystJwt = await signInPlatformAal2(base, anonKey, "mm-p01-analyst@local.test");
const supportJwt = await signInPlatformAal2(base, anonKey, "mm-p01-support@local.test");
const ownerJwt = await signInPlatformAal2(base, anonKey, "mm-p01-owner@local.test");

resetLogServiceFixture();

console.log("\n--- rows before log service ---");
console.log(sqlQuery(
  `SELECT id, last_performed_km, next_due_km, schedule_status FROM public.vehicle_component_schedule WHERE organization_id='${ORG}' AND vehicle_id='${VEHICLE}' AND category_id='${PART}'`,
));
console.log(sqlQuery(
  `SELECT id, status, resolution_reason FROM fleet.maintenance_alerts WHERE organization_id='${ORG}' AND vehicle_id='${VEHICLE}' AND category_id='${PART}' ORDER BY created_at`,
));

const today = new Date().toISOString().slice(0, 10);
await req(
  "POST maintenance-logs (fleet)",
  `${fleetOps}/maintenance-logs`,
  {
    token: fleetJwt,
    anonKey,
    method: "POST",
    body: {
      vehicleId: VEHICLE,
      date: today,
      odo: 50400,
      status: "Completed",
      type: "Service",
      lines: [{ categoryId: PART, action: "replace", description: "P01 fixture service" }],
    },
  },
);

console.log("\n--- rows after log service ---");
console.log(sqlQuery(
  `SELECT id, last_performed_km, next_due_km, schedule_status FROM public.vehicle_component_schedule WHERE organization_id='${ORG}' AND vehicle_id='${VEHICLE}' AND category_id='${PART}'`,
));
console.log(sqlQuery(
  `SELECT id, status, resolution_reason FROM fleet.maintenance_alerts WHERE organization_id='${ORG}' AND vehicle_id='${VEHICLE}' AND category_id='${PART}' ORDER BY created_at`,
));

await req(
  "GET maintenance-due (fleet)",
  `${fleetOps}/maintenance-due/${encodeURIComponent(VEHICLE)}`,
  { token: fleetJwt, anonKey },
);

await req(
  "GET fleet-admin maintenance-ledger overview (owner)",
  `${fleetCore}/fleet-admin/maintenance-ledger/overview`,
  { token: ownerJwt, anonKey },
);

await req(
  "GET parts/find (fleet)",
  `${fleetCore}/parts/find?vehicleId=${encodeURIComponent(VEHICLE)}`,
  { token: fleetJwt, anonKey },
);

console.log("\n--- P-02 (1) analyst write → catalog permission 403, not mfa_required ---");
const p02AnalystWrite = await req(
  "P-02 (1) POST admin/maintenance/rules (analyst, aal2)",
  `${fleetOps}/admin/maintenance/rules`,
  {
    token: analystJwt,
    anonKey,
    method: "POST",
    logBody: true,
    body: {
      task_name: "Blocked analyst rule",
      task_code: "p02-analyst-blocked",
      template_scope: "global",
      component_id: PART,
      status: "draft",
      interval_km: 9000,
      interval_months: 12,
    },
  },
);

console.log("\n--- P-02 (2) owner draft rule → active with impact ---");
const p02OwnerDraft = await req(
  "P-02 (2a) POST admin/maintenance/rules draft (owner)",
  `${fleetOps}/admin/maintenance/rules`,
  {
    token: ownerJwt,
    anonKey,
    method: "POST",
    logBody: true,
    body: {
      task_name: "P02 owner draft rule",
      task_code: "p02-owner-draft",
      template_scope: "global",
      component_id: PART,
      status: "draft",
      interval_km: 8000,
      interval_months: 10,
    },
  },
);
const ownerDraftRuleId = p02OwnerDraft.body?.item?.id;
if (ownerDraftRuleId) {
  await req(
    "P-02 (2b) PATCH admin/maintenance/rules active (owner)",
    `${fleetOps}/admin/maintenance/rules/${ownerDraftRuleId}`,
    {
      token: ownerJwt,
      anonKey,
      method: "PATCH",
      logBody: true,
      body: { status: "active" },
    },
  );
}

console.log("\n--- P-02 (2c) car-scope rule → active, impact 1, schedule moves ---");
const p02CarDraft = await req(
  "P-02 (2c-a) POST admin/maintenance/rules car draft (owner)",
  `${fleetOps}/admin/maintenance/rules`,
  {
    token: ownerJwt,
    anonKey,
    method: "POST",
    logBody: true,
    body: {
      task_name: "P02 car scope rule",
      task_code: "p02-car-scope",
      template_scope: "variant",
      vehicle_catalog_id: CAR_CATALOG,
      component_id: PART,
      status: "draft",
      interval_km: 1500,
      interval_months: 2,
      source_type: "roam_policy",
      confidence: "uncertain",
    },
  },
);
const carScopeRuleId = p02CarDraft.body?.item?.id;
let p02CarActivate = { status: 0, body: {} };
let p02CarImpact = { status: 0, body: {} };
if (carScopeRuleId) {
  p02CarActivate = await req(
    "P-02 (2c-b) PATCH admin/maintenance/rules active car rule (owner)",
    `${fleetOps}/admin/maintenance/rules/${carScopeRuleId}`,
    {
      token: ownerJwt,
      anonKey,
      method: "PATCH",
      logBody: true,
      body: { status: "active" },
    },
  );
  p02CarImpact = await req(
    "P-02 (2c-c) GET admin/maintenance/rules/:id/impact",
    `${fleetOps}/admin/maintenance/rules/${carScopeRuleId}/impact`,
    { token: ownerJwt, anonKey, logBody: true },
  );
  const scheduleRule = sqlQuery(
    `SELECT rule_id::text FROM public.vehicle_component_schedule WHERE organization_id='${ORG}' AND vehicle_id='${VEHICLE}' AND category_id='${PART}' AND position IS NULL LIMIT 1`,
  );
  console.log(`  schedule rule_id after car activate: ${scheduleRule}`);
  if (p02CarActivate.body?.item?.status !== "active") {
    console.error("P-02 (2c) FAIL: expected active status on car rule");
    process.exitCode = 1;
  }
  const impactCount = Number(p02CarImpact.body?.impact?.count ?? p02CarImpact.body?.count ?? -1);
  if (impactCount < 1) {
    console.error(`P-02 (2c) FAIL: expected impact count >= 1, got ${impactCount}`);
    process.exitCode = 1;
  }
  if (scheduleRule !== carScopeRuleId) {
    console.error(`P-02 (2c) FAIL: schedule rule_id ${scheduleRule} !== ${carScopeRuleId}`);
    process.exitCode = 1;
  }
}

console.log("\n--- P-02 (3) support activate → proposal; rule stays draft ---");
const p02SupportDraft = await req(
  "P-02 (3a) POST admin/maintenance/rules draft (owner, for support)",
  `${fleetOps}/admin/maintenance/rules`,
  {
    token: ownerJwt,
    anonKey,
    method: "POST",
    logBody: true,
    body: {
      task_name: "P02 support proposal rule",
      task_code: "p02-support-proposal",
      template_scope: "global",
      component_id: PART,
      status: "draft",
      interval_km: 7000,
      interval_months: 8,
    },
  },
);
const supportProbeRuleId = p02SupportDraft.body?.item?.id;
if (supportProbeRuleId) {
  await req(
    "P-02 (3b) PATCH admin/maintenance/rules active (support → proposal)",
    `${fleetOps}/admin/maintenance/rules/${supportProbeRuleId}`,
    {
      token: supportJwt,
      anonKey,
      method: "PATCH",
      logBody: true,
      body: { status: "active" },
    },
  );
  console.log(
    `  rule status after support PATCH: ${sqlQuery(
      `SELECT status FROM public.maintenance_task_templates WHERE id='${supportProbeRuleId}'`,
    )}`,
  );
  console.log(
    `  proposals for rule: ${sqlQuery(
      `SELECT count(*) FROM public.catalog_governance_proposal WHERE entity_table='maintenance_task_templates' AND entity_id='${supportProbeRuleId}' AND status='pending'`,
    )}`,
  );
}

console.log("\n--- P-02 (4) owner retire used part type → 200; DELETE → 409 ---");
await req(
  "P-02 (4a) POST admin/maintenance-categories/:id/retire (owner)",
  `${fleetOps}/admin/maintenance-categories/${PART}/retire`,
  { token: ownerJwt, anonKey, method: "POST", logBody: true, body: {} },
);
await req(
  "P-02 (4b) DELETE admin/maintenance-categories/:id (owner)",
  `${fleetOps}/admin/maintenance-categories/${PART}`,
  { token: ownerJwt, anonKey, method: "DELETE", logBody: true },
);

console.log("\n--- analyst writes (extra catalog guard checks) ---");
await req(
  "POST admin/catalog/symptoms (analyst)",
  `${fleetCore}/admin/catalog/symptoms`,
  {
    token: analystJwt,
    anonKey,
    method: "POST",
    body: { label: "blocked symptom", slug: "p01-blocked" },
  },
);

console.log("\nP-02 summary:");
console.log(
  `  (1) analyst write: status=${p02AnalystWrite.status}, code=${p02AnalystWrite.body?.code ?? "—"}, message=${p02AnalystWrite.body?.message ?? p02AnalystWrite.body?.error ?? "—"}`,
);
console.log(
  `  (2c) car rule active: status=${p02CarActivate.status}, ruleStatus=${p02CarActivate.body?.item?.status ?? "—"}, impactCount=${p02CarImpact.body?.impact?.count ?? "—"}`,
);

console.log("\nP-01 / P-02 script finished.");
