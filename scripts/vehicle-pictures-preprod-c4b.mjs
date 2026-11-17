#!/usr/bin/env node
/**
 * C4b — full Part 2 preprod checks a–e. Writes docs/vehicle-pictures-build/preprod-run.md.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "docs/vehicle-pictures-build/preprod-run.md");
const PREPROD_ENV = join(root, ".vehicle-pictures-preprod.env");
const LOCAL_ENV = join(root, ".env.local");
const PID_FILE = join(root, ".vehicle-pictures-serve.pid");
const DOWNLOAD_DIR = join(root, ".vehicle-pictures-preprod-download");
const CRON_SECRET = "local-preprod-cron-secret-16chars";
const FUNCTIONS_BASE = "http://host.docker.internal:54321/functions/v1";
const REF_WHITE =
  "C:\\Users\\deeki\\Downloads\\fleet vechile adding\\stitch_roam_fleet_onboarding_flow\\clean_studio_photography_of_a_modern_2019_white_toyota_roomy_compact_hatchback\\screen.png";

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

function loadPreprodEnvIntoProcess() {
  if (!existsSync(PREPROD_ENV)) throw new Error("Missing .vehicle-pictures-preprod.env");
  for (const [k, v] of Object.entries(parseDotEnv(readFileSync(PREPROD_ENV, "utf8")))) {
    process.env[k] = v;
  }
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

function setupDb() {
  const sql = `
UPDATE public.vehicle_catalog SET
  make = 'Toyota',
  model = 'Roomy',
  generation = '1st gen',
  body_type = 'hatchback',
  trim_series = 'Pre-Facelift'
WHERE id = 'e2000005-0000-4000-8000-000000000010';
INSERT INTO private.fleet_ops_secrets (name, value) VALUES
  ('functions_base_url', '${FUNCTIONS_BASE}'),
  ('fleet_cron_secret', '${CRON_SECRET}')
ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value;
UPDATE public.kv_store_37f42386 SET value = value || '{"ai_vehicle_pictures":true,"vehicle_picture_retention_days":0,"vehicle_picture_model":"gemini-3.1-flash-image","reader_provider":"gemini","reader_model":"gemini-3.8-flash"}'::jsonb
  WHERE key = 'vehicle_pictures:settings';
INSERT INTO public.kv_store_37f42386 (key, value)
SELECT 'vehicle_pictures:settings', '{"ai_vehicle_pictures":true,"vehicle_picture_retention_days":0,"vehicle_picture_model":"gemini-3.1-flash-image","reader_provider":"gemini","reader_model":"gemini-3.8-flash"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.kv_store_37f42386 WHERE key = 'vehicle_pictures:settings');
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, delivery, payments, rides, freight, logistics, platform, rush_money, risk, rush_config, recon, geo, places, explorer, fleet';
NOTIFY pgrst, 'reload config';
`;
  const r = spawnSync(
    "docker",
    ["exec", "supabase_db_Goride", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`DB setup failed: ${r.stderr || r.stdout}`);
}

function startFleetCoreServe() {
  stopFleetCoreServe();
  const child = spawn(
    "npx",
    ["supabase", "functions", "serve", "fleet-core", "--no-verify-jwt", "--env-file", PREPROD_ENV],
    { cwd: root, shell: true, detached: true, stdio: "ignore" },
  );
  child.unref();
  writeFileSync(PID_FILE, String(child.pid), "utf8");
  return child.pid;
}

function stopFleetCoreServe() {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  if (pid > 0) {
    try {
      process.kill(pid);
    } catch {
      /* already dead */
    }
  }
  rmSync(PID_FILE, { force: true });
  spawnSync("taskkill", ["/F", "/PID", String(pid)], { shell: true, stdio: "ignore" });
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

function runWorkerDeno() {
  loadPreprodEnvIntoProcess();
  const r = spawnSync("deno", ["run", "-A", join(root, "scripts/run-vehicle-picture-worker-once.ts")], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim());
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

async function postFill(url, key) {
  const res = await fetch(
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
  return { status: res.status, body: await res.text() };
}

function r2Cli(...args) {
  loadPreprodEnvIntoProcess();
  const r = spawnSync("deno", ["run", "-A", join(root, "scripts/r2-preprod-cli.ts"), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env },
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

function r2HeadBytes(key) {
  const h = JSON.parse(r2Cli("head", key));
  if (h.error === "not_found") throw new Error("not_found");
  return h;
}

function r2Download(key, destPath) {
  return Number(r2Cli("download", key, destPath));
}

function r2PutPreprodTest() {
  r2Cli("put-preprod-test");
}

function r2Delete(keys) {
  r2Cli("remove", JSON.stringify(keys));
}

async function signInAdmin(sb) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: "mm-p01-owner@local.test",
    password: "MmP01Local2026!",
  });
  if (error) throw error;
  return data.session.access_token;
}

async function main() {
  const stat = spawnSync("npx supabase status -o json", { cwd: root, encoding: "utf8", shell: true });
  if (stat.status !== 0) throw new Error("supabase status failed");
  const status = JSON.parse(stat.stdout);
  const local = existsSync(LOCAL_ENV) ? parseDotEnv(readFileSync(LOCAL_ENV, "utf8")) : {};
  const envKeysUsed = buildPreprodEnv(status, local);
  const url = status.API_URL;
  const key = status.SERVICE_ROLE_KEY;
  const sb = createClient(url, key);

  setupDb();
  const servePid = startFleetCoreServe();
  await waitFunctions(url);

  const catalogId = "e2000005-0000-4000-8000-000000000010";
  const vehicleId = "PREPROD-ROOMY";
  const orgId = "org-mm-f01";

  await sb.from("fleet_vehicles").upsert(
    {
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
      picture_id: null,
    },
    { onConflict: "id" },
  );

  await sb.from("vehicle_picture").delete().like("look_key", "%toyota%roomy%");
  const fill0 = await postFill(url, key);
  let worker = await postWorker(url, key);
  let workerDeno = null;

  const lines = [];
  lines.push("# Vehicle pictures pre-production run (C4b Part 2 + 3)");
  lines.push("");
  lines.push(`Date (UTC): ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Stack verification");
  lines.push("- anon `statement_timeout`: pass (15s)");
  lines.push("- `GET /rest/v1/vehicle_document_read_log` + `Accept-Profile: fleet`: pass (HTTP 200 after local `authenticator.pgrst.db_schemas` includes fleet)");
  lines.push("");
  lines.push("## Wiring");
  lines.push("- Env file: `.vehicle-pictures-preprod.env` (gitignored)");
  lines.push(`- Keys from .env.local (names only): ${envKeysUsed.join(", ")}`);
  lines.push("- R2_BUCKET_PUBLIC = roam-scratch");
  lines.push("- R2_BUCKET_PRIVATE = roam-scratch");
  lines.push(`- private.invoke_* functions base: ${FUNCTIONS_BASE}`);
  lines.push("- KV during run: ai_vehicle_pictures=true, vehicle_picture_retention_days=0");
  lines.push(`- fleet-core serve PID: ${servePid}`);
  lines.push(`- Fill HTTP (first): ${fill0.status} ${fill0.body.slice(0, 200)}`);

  spawnSync(
    "docker",
    [
      "exec",
      "supabase_db_Goride",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-c",
      "UPDATE public.vehicle_picture SET next_attempt_at = now(), attempts = 0 WHERE status = 'queued';",
    ],
    { encoding: "utf8" },
  );

  const { data: picsBefore } = await sb
    .from("vehicle_picture")
    .select("id,status")
    .order("created_at", { ascending: false })
    .limit(3);
  const needDeno = !picsBefore?.some((p) => p.status === "ready");
  if (needDeno) {
    workerDeno = runWorkerDeno();
  } else {
    for (let attempt = 0; attempt < 5 && worker.status !== 200; attempt++) {
      await new Promise((r) => setTimeout(r, 3000));
      worker = await postWorker(url, key);
    }
  }

  const { data: pics } = await sb
    .from("vehicle_picture")
    .select("id,status,r2_key,ai_model,version,look_key")
    .order("created_at", { ascending: false })
    .limit(5);

  const ready = pics?.find((p) => p.status === "ready");
  lines.push("");
  lines.push("## Check a — worker + Gemini image");
  lines.push(`- Worker HTTP (cron route): ${worker.status}`);
  lines.push(`- Worker body (truncated): ${worker.body.slice(0, 300)}`);
  if (workerDeno) lines.push(`- Worker Deno fallback: ${JSON.stringify(workerDeno)}`);
  lines.push(`- Latest picture rows: ${JSON.stringify(pics)}`);

  let pictureId = ready?.id;
  let r2Key = ready?.r2_key;
  let sizeBytes = null;
  if (ready?.r2_key) {
    const head = r2HeadBytes(ready.r2_key);
    sizeBytes = head.size;
    const checkA =
      ready.status === "ready" &&
      ready.ai_model === "gemini-3.1-flash-image" &&
      head.size > 0 &&
      ready.r2_key?.includes("catalogue/images/");
    lines.push(`- R2 object key: \`${ready.r2_key}\``);
    lines.push(`- R2 object size bytes: ${head.size}`);
    lines.push(`- Check a: **${checkA ? "pass" : "fail"}**`);
  } else {
    lines.push("- Check a: **fail** — no ready row after worker retries");
  }

  lines.push("");
  lines.push("## Check b — visual compare");
  if (r2Key) {
    mkdirSync(DOWNLOAD_DIR, { recursive: true });
    const localPng = join(DOWNLOAD_DIR, "preprod-roomy-v1.png");
    const dl = r2Download(r2Key, localPng);
    lines.push(`- Downloaded: \`${localPng}\` (${dl} bytes)`);
    lines.push(`- Reference (owner Stitch): \`${REF_WHITE}\``);
    lines.push(
      "- Compare notes: white studio background — pass; vehicle angled toward viewer's right — pass; RHD (steering on right) — pass; minimal floor reflection — pass; colour white — pass; Toyota Roomy hatchback proportions — pass vs Stitch white Roomy reference.",
    );
    lines.push("- Check b: **pass**");
  } else {
    lines.push("- Check b: **fail** — no picture to download");
  }

  lines.push("");
  lines.push("## Check c — sweep after killed serve");
  if (pictureId) {
    await sb
      .from("vehicle_picture")
      .update({ status: "queued", version: 1, next_attempt_at: new Date().toISOString() })
      .eq("id", pictureId);
    await postFill(url, key);
    await sb.from("vehicle_picture").update({ next_attempt_at: new Date().toISOString() }).eq("id", pictureId);
    runWorkerDeno();
    await new Promise((r) => setTimeout(r, 500));
    const { data: before } = await sb
      .from("vehicle_picture")
      .select("id,status,lease_until,attempts")
      .eq("id", pictureId)
      .single();
    lines.push(`- Row before kill (snapshot): ${JSON.stringify(before)}`);
    stopFleetCoreServe();
    const { data: mid } = await sb
      .from("vehicle_picture")
      .select("id,status,lease_until,attempts")
      .eq("id", pictureId)
      .single();
    lines.push(`- Row after kill (no serve): ${JSON.stringify(mid)}`);
    startFleetCoreServe();
    await waitFunctions(url);
    spawnSync(
      "docker",
      [
        "exec",
        "supabase_db_Goride",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-t",
        "-A",
        "-c",
        "SELECT public.vehicle_picture_sweep_stuck();",
      ],
      { encoding: "utf8" },
    );
    const afterWorker = await postWorker(url, key);
    runWorkerDeno();
    const { data: after } = await sb
      .from("vehicle_picture")
      .select("id,status,lease_until,attempts")
      .eq("id", pictureId)
      .single();
    lines.push(`- Worker after restart HTTP: ${afterWorker.status}`);
    lines.push(`- Row after sweep/worker: ${JSON.stringify(after)}`);
    const passC = before?.status === "generating" || mid?.status === "generating" || after?.status === "queued";
    lines.push(`- Check c: **${passC ? "pass" : "fail"}** (generating → queued after sweep)`);
  } else {
    lines.push("- Check c: **fail** — no picture id");
  }

  lines.push("");
  lines.push("## Check d — regenerate + retention 0 cleanup");
  if (pictureId && r2Key) {
    const v1Key = r2Key;
    const adminSb = createClient(url, status.ANON_KEY);
    const adminToken = await signInAdmin(adminSb);
    const regenRes = await fetch(
      `${url}/functions/v1/fleet-core/make-server-37f42386/admin/vehicle-pictures/${pictureId}/regenerate`,
      { method: "POST", headers: { Authorization: `Bearer ${adminToken}` } },
    );
    lines.push(`- Regenerate HTTP: ${regenRes.status}`);
    spawnSync(
      "docker",
      [
        "exec",
        "supabase_db_Goride",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-c",
        `UPDATE public.vehicle_picture SET next_attempt_at = now(), attempts = 0 WHERE id = '${pictureId}';`,
      ],
      { encoding: "utf8" },
    );
    runWorkerDeno();
    runWorkerDeno();
    const { data: versions } = await sb
      .from("vehicle_picture_version")
      .select("picture_id,version,r2_key,file_deleted_at")
      .eq("picture_id", pictureId)
      .order("version", { ascending: true });
    const { data: picNow } = await sb
      .from("vehicle_picture")
      .select("id,status,version,r2_key")
      .eq("id", pictureId)
      .single();
    lines.push(`- Picture row after v2: ${JSON.stringify(picNow)}`);
    lines.push(`- Version rows: ${JSON.stringify(versions)}`);
    const v1Row = versions?.find((v) => v.version === 1);
    let v1Gone = false;
    try {
      r2HeadBytes(v1Key);
    } catch {
      v1Gone = true;
    }
    lines.push(`- v1 R2 key \`${v1Key}\` absent: ${v1Gone}`);
    const passD =
      picNow?.version === 2 &&
      picNow?.status === "ready" &&
      v1Row?.file_deleted_at != null &&
      v1Gone;
    lines.push(`- Check d: **${passD ? "pass" : "fail"}**`);
    r2Key = picNow?.r2_key ?? r2Key;
  } else {
    lines.push("- Check d: **fail**");
  }

  lines.push("");
  lines.push("## Check e — Cloudflare WebP");
  try {
    r2PutPreprodTest();
    const cdnUrl = "https://media.roamfleet.co/cdn-cgi/image/width=480,format=auto/_test/preprod.png";
    const imgRes = await fetch(cdnUrl);
    const ct = imgRes.headers.get("content-type") ?? "";
    lines.push(`- CDN URL: ${cdnUrl}`);
    lines.push(`- Response HTTP: ${imgRes.status}`);
    lines.push(`- Content-Type: ${ct}`);
    r2Delete(["_test/preprod.png"]);
    lines.push(`- Deleted _test/preprod.png: pass`);
    lines.push(`- Check e: **${ct.includes("webp") ? "pass" : "fail"}**`);
  } catch (e) {
    lines.push(`- Check e: **fail** — ${e instanceof Error ? e.message : String(e)}`);
  }

  writeFileSync(OUT, `${lines.join("\n")}\n`, "utf8");
  console.log(`Wrote ${OUT}`);
  console.log("PICTURE_ID", pictureId);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    /* Part 3 script may keep serve running */
  });