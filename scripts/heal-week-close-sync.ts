/**
 * Close Week heal: call prepareWeekClose in-process (service role DB), no HTTP user JWT.
 *
 * Required env (no production defaults):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ORG_ID or ORGANIZATION_ID
 *   ACTOR_ID or HEAL_ACTOR_ID  (valid UUID)
 *   WEEKS  (comma-separated Monday YYYY-MM-DD)
 *
 * From repo root (PowerShell):
 *   .\scripts\heal-week-close-sync.ps1 -OrgId <uuid> -ActorId <uuid> -Weeks "2026-02-16,2026-02-23"
 *
 * Or:
 *   deno run -A --config deno.json scripts/heal-week-close-sync.ts
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
Deno.env.set("SUPABASE_URL", url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireEnv(...names: string[]): string {
  for (const name of names) {
    const v = (Deno.env.get(name) || "").trim();
    if (v) return v;
  }
  console.error(`Required env missing: one of ${names.join(", ")}`);
  Deno.exit(1);
}

const orgId = requireEnv("ORG_ID", "ORGANIZATION_ID");
const actorId = requireEnv("ACTOR_ID", "HEAL_ACTOR_ID");
if (!UUID_RE.test(orgId)) {
  console.error(`ORG_ID must be a valid UUID (got ${orgId.slice(0, 36)})`);
  Deno.exit(1);
}
if (!UUID_RE.test(actorId)) {
  console.error(`ACTOR_ID must be a valid UUID (got ${actorId.slice(0, 36)})`);
  Deno.exit(1);
}

const weeksEnv = (Deno.env.get("WEEKS") || "").trim();
if (!weeksEnv) {
  console.error("Required env WEEKS (comma-separated Monday YYYY-MM-DD) is missing");
  Deno.exit(1);
}
const weeks = weeksEnv.split(",").map((w) => w.trim()).filter(Boolean);
if (weeks.length === 0) {
  console.error("WEEKS parsed empty — pass at least one week key");
  Deno.exit(1);
}

const { prepareWeekClose } = await import(
  "../supabase/functions/_fleet-server/week_close.ts"
);

const summary: Array<Record<string, unknown>> = [];
for (const weekKey of weeks) {
  Deno.stdout.writeSync(new TextEncoder().encode(`sync ${weekKey} … `));
  try {
    // Refresh/mass heal may force reseals; Close path never does (closeWeekLaneForceOpts).
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
