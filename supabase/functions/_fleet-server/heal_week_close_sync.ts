/**
 * One-time heal: call prepareWeekClose in-process (service role DB), no HTTP user JWT.
 *
 * From repo root (PowerShell):
 *   .\scripts\heal-week-close-sync.ps1
 *
 * Or manually after setting SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY:
 *   deno run -A --config deno.json supabase/functions/_fleet-server/heal_week_close_sync.ts
 */
const url = (Deno.env.get("SUPABASE_URL") || "").trim();
const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
if (!url || !key) {
  console.error(
    "Need non-empty SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before imports.\n" +
      "Tip: run .\\scripts\\heal-week-close-sync.ps1 from the repo root.",
  );
  Deno.exit(1);
}
// Re-set trimmed values so eager module clients (toll_settlement) see them.
Deno.env.set("SUPABASE_URL", url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);

const { prepareWeekClose } = await import("./week_close.ts");

const orgId = Deno.env.get("ORGANIZATION_ID") || "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
const actorId = Deno.env.get("HEAL_ACTOR_ID") || "00000000-0000-0000-0000-0000000000he";
const weeksEnv = Deno.env.get("WEEKS");
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
const weeks = weeksEnv
  ? weeksEnv.split(",").map((w) => w.trim()).filter(Boolean)
  : DEFAULT_WEEKS;

const summary: Array<Record<string, unknown>> = [];
for (const weekKey of weeks) {
  Deno.stdout.writeSync(new TextEncoder().encode(`sync ${weekKey} … `));
  try {
    const p = await prepareWeekClose(orgId, weekKey, actorId, {
      forceAllLaneReseals: true,
    });
    const blockers = (p.blockers || [])
      .filter((b) => b.severity !== "warn")
      .map((b) => b.code)
      .slice(0, 8);
    const row = {
      weekKey,
      ok: true,
      tollDrift: p.tollPeriodSealDriftCount ?? null,
      rebuilt: p.periodsRebuiltAfterSeal ?? null,
      driversBlocked: p.driversBlocked ?? null,
      cashAllSettled: p.cashAllSettled ?? null,
      blockers,
    };
    summary.push(row);
    console.log(
      `drift=${row.tollDrift} rebuilt=${row.rebuilt} blocked=${row.driversBlocked} [${blockers.join(",")}]`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    summary.push({ weekKey, ok: false, error: msg });
    console.log(`FAIL ${msg}`);
  }
}

console.log(JSON.stringify({ orgId, summary }, null, 2));
