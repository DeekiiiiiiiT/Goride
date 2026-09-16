#!/usr/bin/env node
/**
 * F5 soak instrument (audit §F1): measure non-health traffic on make-server-37f42386.
 *
 * Usage:
 *   node scripts/check-shim-traffic.mjs              # last 24h
 *   node scripts/check-shim-traffic.mjs --hours 24
 *   node scripts/check-shim-traffic.mjs --days 7      # chunked ≤24h windows
 *   node scripts/check-shim-traffic.mjs --append-log  # also write docs/f5-soak-log.json
 *
 * Auth: ROAM_MGMT_PAT | SUPABASE_ACCESS_TOKEN | SUPABASE_PAT
 * Project: ROAM_PROJECT_REF (default csfllzzastacofsvcdsc)
 *
 * Exit 0 only when zero non-health / non-ready hits in the window.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOAK_LOG = path.join(ROOT, "docs/f5-soak-log.json");
const SHIM = "make-server-37f42386";
const DEFAULT_REF = "csfllzzastacofsvcdsc";
const IGNORE_RE = /\/(health|ready)(\?|$)/i;

function loadDotEnv() {
  for (const name of [".env.local", ".env"]) {
    const p = path.join(ROOT, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = val;
      }
    }
  }
}

loadDotEnv();

function parseArgs(argv) {
  let hours = 24;
  let days = null;
  let appendLog = false;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--hours" && argv[i + 1]) {
      hours = Number(argv[++i]);
    } else if (a === "--days" && argv[i + 1]) {
      days = Number(argv[++i]);
    } else if (a === "--append-log") {
      appendLog = true;
    } else if (a === "--help" || a === "-h") {
      console.log(
        `Usage: node scripts/check-shim-traffic.mjs [--hours N] [--days N] [--append-log]`,
      );
      process.exit(0);
    }
  }
  if (days != null && Number.isFinite(days) && days > 0) {
    hours = days * 24;
  }
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error("Invalid --hours / --days");
    process.exit(2);
  }
  return { hours, appendLog };
}

function getPat() {
  return (
    process.env.ROAM_MGMT_PAT ||
    process.env.SUPABASE_ACCESS_TOKEN ||
    process.env.SUPABASE_PAT ||
    ""
  ).trim();
}

function getProjectRef() {
  const fromEnv = (process.env.ROAM_PROJECT_REF || "").trim();
  if (fromEnv) return fromEnv;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const m = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (m) return m[1];
  return DEFAULT_REF;
}

async function queryAnalyticsLogs(pat, projectRef, sql, startIso, endIso) {
  const qs = new URLSearchParams({
    sql,
    iso_timestamp_start: startIso,
    iso_timestamp_end: endIso,
  });
  const urls = [
    `https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all?${qs}`,
    `https://api.supabase.com/platform/projects/${projectRef}/analytics/endpoints/logs.all?${qs}`,
  ];
  let lastErr = "";
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
    });
    if (!res.ok) {
      lastErr = `${res.status} ${await res.text()}`.slice(0, 300);
      continue;
    }
    const body = await res.json();
    if (Array.isArray(body?.result)) return body.result;
    if (Array.isArray(body)) return body;
    return [];
  }
  throw new Error(`Analytics logs query failed: ${lastErr}`);
}

function chunkWindows(endMs, totalHours) {
  const chunks = [];
  let cursorEnd = endMs;
  let remaining = totalHours;
  while (remaining > 0) {
    const span = Math.min(24, remaining);
    const cursorStart = cursorEnd - span * 3600_000;
    chunks.push({
      startIso: new Date(cursorStart).toISOString(),
      endIso: new Date(cursorEnd).toISOString(),
      label: new Date(cursorStart).toISOString().slice(0, 10),
    });
    cursorEnd = cursorStart;
    remaining -= span;
  }
  return chunks.reverse();
}

function isShimPath(pathStr) {
  return typeof pathStr === "string" && pathStr.includes(SHIM);
}

function isIgnorable(pathStr) {
  return IGNORE_RE.test(pathStr);
}

function mergeCounts(into, rows) {
  for (const r of rows || []) {
    const p = r?.path != null ? String(r.path) : "";
    if (!p || !isShimPath(p)) continue;
    const n = Number(r.requests) || 0;
    into.set(p, (into.get(p) || 0) + n);
  }
}

/** Idempotent by date — replaces existing row for the same UTC date. */
function appendSoakLog(entry) {
  let doc = { days: [] };
  if (fs.existsSync(SOAK_LOG)) {
    try {
      doc = JSON.parse(fs.readFileSync(SOAK_LOG, "utf8"));
      if (!Array.isArray(doc.days)) doc.days = [];
    } catch {
      doc = { days: [] };
    }
  }
  doc.days = doc.days.filter((d) => d?.date !== entry.date);
  doc.days.push(entry);
  doc.days.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  doc.updatedAt = new Date().toISOString();
  fs.writeFileSync(SOAK_LOG, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`appended soak log → ${path.relative(ROOT, SOAK_LOG)} (${entry.date} ok=${entry.ok})`);
}

async function main() {
  const { hours, appendLog } = parseArgs(process.argv);
  const pat = getPat();
  const projectRef = getProjectRef();
  if (!pat) {
    console.error(
      "Missing ROAM_MGMT_PAT (or SUPABASE_ACCESS_TOKEN / SUPABASE_PAT). Cannot query edge logs.",
    );
    process.exit(2);
  }

  // §F1: filter server-side so limit applies to shim paths only (not all edge fns).
  const sql = `
    select log_attributes['request.pathname'] as path, count() as requests
    from logs
    where source = 'function_edge_logs'
      and log_attributes['request.pathname'] like '%make-server-37f42386%'
    group by path
    order by requests desc
    limit 200
  `.trim();

  const endMs = Date.now();
  const windows = chunkWindows(endMs, hours);
  const totals = new Map();
  const daily = [];

  for (const w of windows) {
    const rows = await queryAnalyticsLogs(pat, projectRef, sql, w.startIso, w.endIso);
    const dayMap = new Map();
    mergeCounts(dayMap, rows);
    mergeCounts(totals, rows);
    let dayNonHealth = 0;
    let dayHealth = 0;
    for (const [p, n] of dayMap) {
      if (isIgnorable(p)) dayHealth += n;
      else dayNonHealth += n;
    }
    daily.push({
      day: w.label,
      start: w.startIso,
      end: w.endIso,
      nonHealth: dayNonHealth,
      health: dayHealth,
    });
  }

  const offenders = [...totals.entries()]
    .filter(([p]) => !isIgnorable(p))
    .sort((a, b) => b[1] - a[1]);
  const healthHits = [...totals.entries()]
    .filter(([p]) => isIgnorable(p))
    .reduce((s, [, n]) => s + n, 0);
  const nonHealth = offenders.reduce((s, [, n]) => s + n, 0);

  console.log(`shim-traffic  project=${projectRef}  slug=${SHIM}  window=${hours}h`);
  console.log(`  health/ready: ${healthHits}`);
  console.log(`  non-health:   ${nonHealth}`);
  if (daily.length > 1) {
    console.log("  daily:");
    for (const d of daily) {
      console.log(`    ${d.day}  non-health=${d.nonHealth}  health=${d.health}`);
    }
  }
  if (offenders.length) {
    console.log("  top offending paths:");
    for (const [p, n] of offenders.slice(0, 25)) {
      console.log(`    ${n}\t${p}`);
    }
    if (offenders.length > 25) {
      console.log(`    … and ${offenders.length - 25} more paths`);
    }
  }

  if (appendLog) {
    // For multi-day windows, append one row per calendar day in the window.
    if (daily.length > 1) {
      for (const d of daily) {
        appendSoakLog({
          date: d.day,
          nonHealth: d.nonHealth,
          health: d.health,
          ok: d.nonHealth === 0,
          topOffenders: [],
          windowHours: 24,
        });
      }
    } else {
      const today = new Date().toISOString().slice(0, 10);
      appendSoakLog({
        date: today,
        nonHealth,
        health: healthHits,
        ok: nonHealth === 0,
        topOffenders: offenders.slice(0, 10).map(([p, n]) => ({ path: p, requests: n })),
        windowHours: hours,
      });
    }
  }

  if (nonHealth > 0) {
    console.error(`FAIL  shim has ${nonHealth} non-health hit(s) — soak not clear`);
    process.exit(1);
  }
  console.log("ok  shim non-health traffic = 0");
  process.exit(0);
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(2);
});
