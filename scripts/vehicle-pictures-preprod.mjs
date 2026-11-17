#!/usr/bin/env node
/**
 * C4 Part 2 helper — local pre-production run. Writes docs/vehicle-pictures-build/preprod-run.md
 * Never prints secret values.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "docs/vehicle-pictures-build/preprod-run.md");
const PREPROD_ENV = join(root, ".vehicle-pictures-preprod.env");
const LOCAL_ENV = join(root, ".env.local");
const CRON_SECRET = "local-preprod-cron-secret-16chars";
const FUNCTIONS_BASE = "http://host.docker.internal:54321/functions/v1";

const WANT_KEYS = [
  "GEMINI_API_KEY",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
];

function parseDotEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function buildPreprodEnv(status, local) {
  const lines = [];
  const used = [];
  for (const k of WANT_KEYS) {
    let v = local[k] ?? (k === "SUPABASE_URL" ? status.API_URL : null);
    if (k === "SUPABASE_SERVICE_ROLE_KEY") v = local[k] ?? status.SERVICE_ROLE_KEY;
    if (k === "SUPABASE_ANON_KEY") v = local[k] ?? status.ANON_KEY;
    if (!v) continue;
    lines.push(`${k}=${v}`);
    used.push(k);
  }
  lines.push("R2_BUCKET_PUBLIC=roam-scratch");
  lines.push("R2_BUCKET_PRIVATE=roam-scratch");
  used.push("R2_BUCKET_PUBLIC", "R2_BUCKET_PRIVATE");
  writeFileSync(PREPROD_ENV, `${lines.join("\n")}\n`, "utf8");
  return used;
}

async function sqlExec(sb, statements) {
  for (const q of statements) {
    const { error } = await sb.rpc("exec_sql", { query: q }).maybeSingle?.();
    if (error && !String(error.message).includes("Could not find the function")) {
      // fallback: use REST not available — use node-postgres via docker
    }
  }
}

async function setupDb(url, key) {
  const dockerSql = `INSERT INTO private.fleet_ops_secrets (name, value) VALUES
    ('functions_base_url', '${FUNCTIONS_BASE}'),
    ('fleet_cron_secret', '${CRON_SECRET}')
  ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;`;
  const settingsSql = `UPDATE public.kv_store_37f42386 SET value = value || '{"ai_vehicle_pictures":true,"vehicle_picture_retention_days":0,"vehicle_picture_model":"gemini-3.1-flash-image","reader_provider":"gemini","reader_model":"gemini-3.8-flash"}'::jsonb
    WHERE key = 'vehicle_pictures:settings';
  INSERT INTO public.kv_store_37f42386 (key, value)
  SELECT 'vehicle_pictures:settings', '{"ai_vehicle_pictures":true,"vehicle_picture_retention_days":0,"vehicle_picture_model":"gemini-3.1-flash-image","reader_provider":"gemini","reader_model":"gemini-3.8-flash"}'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM public.kv_store_37f42386 WHERE key = 'vehicle_pictures:settings');`;

  const full = `${dockerSql}\n${settingsSql}`;
  const r = spawnSync(
    "docker",
    ["exec", "supabase_db_Goride", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", full],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error(`DB setup failed: ${r.stderr || r.stdout}`);
  }
}

function startFleetCoreServe() {
  const child = spawn(
    "npx",
    ["supabase", "functions", "serve", "fleet-core", "--no-verify-jwt", "--env-file", PREPROD_ENV],
    { cwd: root, shell: true, detached: true, stdio: "ignore" },
  );
  child.unref();
  return child.pid;
}

async function waitFunctions(baseUrl, timeoutMs = 120_000) {
  const url = `${baseUrl}/functions/v1/fleet-core`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status !== 503) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("fleet-core serve did not become ready");
}

async function postWorker(url, key) {
  const res = await fetch(
    `${url}/functions/v1/fleet-core/make-server-37f42386/internal/vehicle-pictures/run`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Fleet-Cron-Secret": CRON_SECRET,
      },
      body: "{}",
    },
  );
  return { status: res.status, body: await res.text() };
}

async function main() {
  const stat = spawnSync("npx supabase status -o json", { cwd: root, encoding: "utf8", shell: true });
  if (stat.status !== 0) throw new Error(stat.stderr || "supabase status failed");
  const status = JSON.parse(stat.stdout);
  const local = existsSync(LOCAL_ENV) ? parseDotEnv(readFileSync(LOCAL_ENV, "utf8")) : {};
  const envKeysUsed = buildPreprodEnv(status, local);
  const url = status.API_URL;
  const key = status.SERVICE_ROLE_KEY;
  const sb = createClient(url, key);

  mkdirSync(dirname(OUT), { recursive: true });
  const lines = [];
  lines.push("# Vehicle pictures pre-production run (C4 Part 2)");
  lines.push("");
  lines.push(`Date (UTC): ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Wiring");
  lines.push(`- Env file: [.vehicle-pictures-preprod.env](../.vehicle-pictures-preprod.env) (gitignored)`);
  lines.push(`- Keys from .env.local (names only): ${envKeysUsed.join(", ")}`);
  lines.push("- R2_BUCKET_PUBLIC = roam-scratch");
  lines.push("- R2_BUCKET_PRIVATE = roam-scratch");
  lines.push(`- private.invoke_* functions base: ${FUNCTIONS_BASE}`);
  lines.push("- Cron jobs: `vehicle_picture_sweep_minute` + `vehicle_document_read_log` retention per migration 20261116175911 / 20261116183416 (local pg_cron)");
  lines.push("- KV: ai_vehicle_pictures=true, vehicle_picture_retention_days=0");

  await setupDb(url, key);
  const servePid = startFleetCoreServe();
  lines.push(`- fleet-core serve PID: ${servePid}`);
  await waitFunctions(url);

  const catalogId = "e2000005-0000-4000-8000-000000000010";
  const vehicleId = "PREPROD-ROOMY";
  const orgId = "org-mm-f01";
  await sb.from("fleet_vehicles").upsert({
    id: vehicleId,
    organization_id: orgId,
    license_plate: vehicleId,
    make: "Toyota",
    model: "Roomy",
    color: "WHITE",
    color_standard: "white",
    vehicle_catalog_id: catalogId,
    legacy_kv_id: `vehicle:${vehicleId}`,
    status: "Inactive",
    payload_json: {},
  }, { onConflict: "id" });

  await fetch(
    `${url}/functions/v1/fleet-core/make-server-37f42386/internal/vehicle-pictures/fill`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Fleet-Cron-Secret": CRON_SECRET,
      },
      body: "{}",
    },
  );

  const worker = await postWorker(url, key);
  lines.push("");
  lines.push("## Check a — worker + Gemini image");
  lines.push(`- Worker HTTP: ${worker.status}`);
  lines.push(`- Worker body (truncated): ${worker.body.slice(0, 400)}`);

  const { data: pics } = await sb.from("vehicle_picture").select("id,status,r2_key,ai_model,version").order("created_at", { ascending: false }).limit(3);
  lines.push(`- Latest picture rows: ${JSON.stringify(pics)}`);
  const ready = pics?.find((p) => p.status === "ready");
  if (ready?.r2_key) {
    lines.push(`- Picture file path (R2 key): \`${ready.r2_key}\``);
    lines.push("- Check a: **pass** if status=ready and ai_model=gemini-3.1-flash-image");
  } else {
    lines.push("- Check a: **pending/fail** — no ready row yet (re-run worker or inspect logs)");
  }

  lines.push("");
  lines.push("## Check b — visual compare");
  lines.push("- Reference: owner Stitch white Roomy PNG (local Downloads)");
  lines.push("- Compare manually against downloaded R2 object; note background, facing right, RHD, reflections in this section after review.");

  lines.push("");
  lines.push("## Check c — sweep after killed serve");
  lines.push("- Procedure: shorten lease_until on generating row, stop serve, restart, POST worker again.");

  lines.push("");
  lines.push("## Check d — regenerate + retention 0 cleanup");
  lines.push("- Procedure: queue regenerate, run worker twice, confirm vehicle_picture_version.file_deleted_at on v1.");

  lines.push("");
  lines.push("## Check e — Cloudflare WebP");
  lines.push("- Procedure: PUT _test/preprod.png to roam-scratch/roam-public flow, GET cdn-cgi image URL, delete object.");

  lines.push("");
  lines.push("## Restore");
  lines.push("- After checks: set vehicle_picture_retention_days=30 and ai_vehicle_pictures=false in KV.");

  writeFileSync(OUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});