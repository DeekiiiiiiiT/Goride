#!/usr/bin/env node
/**
 * C4 Part 3 — parse real test certs locally. Appends to preprod-run.md. Never logs PII.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, appendFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC_DIR = join(root, ".vehicle-docs-test");
const OUT = join(root, "docs/vehicle-pictures-build/preprod-run.md");
const WHITELIST = new Set([
  "plate", "vin", "chassis", "engineNumber", "cc", "make", "model", "year", "colorAsWritten",
  "bodyAsWritten", "fuel", "seating", "certificateNumber", "controlNumber", "mvid", "laNumber",
  "issueDate", "expiryDate",
]);

const PII_KEYS = /owner|address|trn|name/i;

function loadStatus() {
  const stat = spawnSync("npx supabase status -o json", { cwd: root, encoding: "utf8", shell: true });
  if (stat.status !== 0) throw new Error("supabase status failed");
  return JSON.parse(stat.stdout);
}

async function signIn(sb) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: "mm-f01-fleet@local.test",
    password: "MmF01Local2026!",
  });
  if (error) throw error;
  return data.session.access_token;
}

async function parseDoc(baseUrl, token, type, filePath) {
  const buf = readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buf]), filePath.split(/[/\\]/).pop());
  form.append("type", type);
  let last = { status: 0, body: {} };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(
      `${baseUrl}/functions/v1/fleet-core/make-server-37f42386/parse-document`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
    );
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 200) };
    }
    last = { status: res.status, body, attempt };
  if (res.status === 503 || (body?.error && String(body.error).includes("503"))) {
      if (attempt < 3) await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    break;
  }
  return last;
}

function fieldLines(fields) {
  const lines = [];
  for (const [k, v] of Object.entries(fields || {})) {
    if (PII_KEYS.test(k)) lines.push(`- ${k}: **FAIL** (forbidden key present)`);
    else if (!WHITELIST.has(k)) lines.push(`- ${k}: **FAIL** (not whitelisted)`);
    else lines.push(`- ${k}: pass (present)`);
  }
  return lines;
}

function part3Passed(sections) {
  const text = sections.join("\n");
  if (text.includes("HTTP 500") || text.includes("**FAIL**")) return false;
  if (!text.includes("HTTP 200")) return false;
  return true;
}

async function main() {
  if (!existsSync(join(DOC_DIR, "fitness.png")) || !existsSync(join(DOC_DIR, "registration.png"))) {
    throw new Error("Missing .vehicle-docs-test/fitness.png or registration.png");
  }
  const status = loadStatus();
  const sb = createClient(status.API_URL, status.ANON_KEY);
  const token = await signIn(sb);

  const sections = ["", "## Part 3 — Real Jamaican documents", ""];
  let lastError = "";
  for (const [type, file, label] of [
    ["fitness_certificate", join(DOC_DIR, "fitness.png"), "Fitness"],
    ["vehicle_registration", join(DOC_DIR, "registration.png"), "Registration"],
  ]) {
    const r = await parseDoc(status.API_URL, token, type, file);
    sections.push(`### ${label} (HTTP ${r.status}, attempt ${r.attempt ?? 1})`);
    if (r.body?.fields) sections.push(...fieldLines(r.body.fields));
    if (r.body?.flags?.length) sections.push(`- flags: ${r.body.flags.join(", ")}`);
    if (r.body?.colorStandard !== undefined) sections.push(`- colorStandard: ${r.body.colorStandard ?? "null"}`);
    if (!r.body?.success && r.body?.error) {
      lastError = String(r.body.error);
      sections.push(`- error: ${lastError.slice(0, 120)}`);
    }
    sections.push("");
  }

  const logRows = spawnSync(
    "docker",
    [
      "exec", "supabase_db_Goride", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
      "SELECT count(*) FROM fleet.vehicle_document_read_log WHERE read_at > now() - interval '15 minutes'",
    ],
    { encoding: "utf8" },
  );
  sections.push(`- read log recent row count: ${logRows.stdout?.trim() || "0"}`);

  const logSql = spawnSync(
    "docker",
    [
      "exec", "supabase_db_Goride", "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
      "SELECT coalesce(jsonb_object_keys(fields_json), '') FROM fleet.vehicle_document_read_log ORDER BY read_at DESC LIMIT 2",
    ],
    { encoding: "utf8" },
  );
  sections.push("### Log / retention");
  if (logSql.stdout?.trim()) {
    sections.push("- **FAIL** fields_json has keys in read log");
  } else {
    sections.push("- pass: recent read log rows have empty/minimal fields_json");
  }

  const pass = part3Passed(sections);
  if (pass) {
    rmSync(DOC_DIR, { recursive: true, force: true });
    sections.push(`- Deleted .vehicle-docs-test: ${existsSync(DOC_DIR) ? "FAIL" : "pass"}`);
  } else {
    sections.push("- Deleted .vehicle-docs-test: skipped (Part 3 did not pass)");
    if (lastError) sections.push(`- logged reason (truncated): ${lastError.slice(0, 200)}`);
  }

  appendFileSync(OUT, `${sections.join("\n")}\n`, "utf8");
  console.log(pass ? "Part 3 appended; folder removed" : "Part 3 appended; folder kept");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});