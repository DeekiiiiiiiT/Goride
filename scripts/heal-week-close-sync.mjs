#!/usr/bin/env node
/**
 * Close Week sync heal — calls prepareWeekClose via fleet-server HTTP.
 * No SQL amount edits. Collect/Pay residuals stay on Cash desk.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ORG_ID=... ACTOR_ID=... \
 *     node scripts/heal-week-close-sync.mjs --weeks=2025-12-29,2026-02-16 [--dry]
 *
 * No hardcoded org / weeks / actor — all required via env or flags.
 */
const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const orgId = (process.env.ORG_ID || process.env.ORGANIZATION_ID || "").trim();
const actorId = (process.env.ACTOR_ID || process.env.HEAL_ACTOR_ID || "").trim();
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!orgId) {
  console.error("Set ORG_ID (or ORGANIZATION_ID)");
  process.exit(1);
}
if (!actorId) {
  console.error("Set ACTOR_ID (or HEAL_ACTOR_ID) — must be a valid UUID");
  process.exit(1);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(orgId)) {
  console.error("ORG_ID must be a valid UUID");
  process.exit(1);
}
if (!UUID_RE.test(actorId)) {
  console.error("ACTOR_ID must be a valid UUID");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const weeksArg = args.find((a) => a.startsWith("--weeks="));
const weeksEnv = (process.env.WEEKS || "").trim();
const weeksRaw = weeksArg
  ? weeksArg.slice("--weeks=".length)
  : weeksEnv;
if (!weeksRaw) {
  console.error("Pass --weeks=YYYY-MM-DD,... or set WEEKS");
  process.exit(1);
}
const weeks = weeksRaw
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);
if (weeks.length === 0) {
  console.error("WEEKS / --weeks parsed empty");
  process.exit(1);
}

const base = `${url}/functions/v1/make-server-37f42386/settlements/week-close`;

async function syncWeek(weekKey) {
  const endpoints = [`${base}/sync`, `${base}/prepare`];
  let lastErr = null;
  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
        "x-organization-id": orgId,
        "x-actor-id": actorId,
      },
      body: JSON.stringify({ weekKey }),
    });
    if (res.status === 404 && endpoint.endsWith("/sync")) continue;
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      lastErr = new Error(`${res.status} ${body?.message || body?.error || text.slice(0, 200)}`);
      continue;
    }
    return body;
  }
  throw lastErr || new Error("sync failed");
}

async function main() {
  console.log(`Heal Close Week sync — ${weeks.length} week(s)${dryRun ? " (dry)" : ""}`);
  const summary = [];
  for (const weekKey of weeks) {
    if (dryRun) {
      console.log(`[dry] ${weekKey}`);
      summary.push({ weekKey, dry: true });
      continue;
    }
    process.stdout.write(`sync ${weekKey} … `);
    try {
      const p = await syncWeek(weekKey);
      const row = {
        weekKey,
        ok: true,
        tollDrift: p.tollPeriodSealDriftCount ?? null,
        rebuilt: p.periodsRebuiltAfterSeal ?? null,
        driversBlocked: p.driversBlocked ?? null,
        cashAllSettled: p.cashAllSettled ?? null,
        blockers: (p.blockers || [])
          .filter((b) => b.severity !== "warn")
          .map((b) => b.code)
          .slice(0, 8),
      };
      summary.push(row);
      console.log(
        `drift=${row.tollDrift} rebuilt=${row.rebuilt} blocked=${row.driversBlocked} [${row.blockers.join(",")}]`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.push({ weekKey, ok: false, error: msg });
      console.log(`FAIL ${msg}`);
    }
  }
  console.log(JSON.stringify({ orgId, summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
