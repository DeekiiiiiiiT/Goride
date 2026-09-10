#!/usr/bin/env node
/**
 * One-time Close Week sync heal — calls prepareWeekClose via fleet-server.
 * No SQL amount edits. Collect/Pay residuals stay on Cash desk.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ORGANIZATION_ID=... \
 *     node scripts/heal-week-close-sync.mjs [--weeks=2025-12-29,2026-02-16] [--dry]
 *
 * Default week list = Phase 0 heal backlog (unpublished seals + toll drift).
 */
const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const orgId = process.env.ORGANIZATION_ID || "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const weeksArg = args.find((a) => a.startsWith("--weeks="));
const DEFAULT_WEEKS = [
  "2025-12-08",
  "2025-12-15",
  "2025-12-22",
  "2025-12-29",
  "2026-01-05",
  "2026-01-12",
  "2026-02-02",
  "2026-02-09",
  "2026-02-16",
  "2026-02-23",
  "2026-03-02",
  "2026-03-09",
  "2026-03-16",
  "2026-03-23",
  "2026-03-30",
  "2026-04-06",
  "2026-05-04",
  "2026-05-11",
  "2026-05-18",
  "2026-05-25",
  "2026-06-01",
  "2026-06-08",
  "2026-06-15",
  "2026-06-22",
  "2026-06-29",
  "2026-07-06",
  "2026-07-13",
  "2026-07-20",
  "2026-07-27",
  "2026-08-03",
  "2026-08-10",
  "2026-08-17",
  "2026-08-24",
];
const weeks = weeksArg
  ? weeksArg
      .slice("--weeks=".length)
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean)
  : DEFAULT_WEEKS;

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
