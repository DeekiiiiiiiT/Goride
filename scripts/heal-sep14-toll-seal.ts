/**
 * After §1.7 deploy: seal Sep 14 toll week (finish already marked ready) and
 * refresh recon blockers so steps/tolls/complete can succeed.
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORG_ID, ACTOR_ID
 * Optional: WEEK_KEY (default 2026-09-14)
 */
const url = (Deno.env.get("SUPABASE_URL") || "").trim();
const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
const orgId = (Deno.env.get("ORG_ID") || Deno.env.get("ORGANIZATION_ID") || "").trim();
const actorId = (Deno.env.get("ACTOR_ID") || Deno.env.get("HEAL_ACTOR_ID") || "").trim();
const weekKey = (Deno.env.get("WEEK_KEY") || "2026-09-14").trim();

if (!url || !key || !orgId) {
  console.error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORG_ID");
  Deno.exit(1);
}
Deno.env.set("SUPABASE_URL", url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);

const { sealTollWeek } = await import("../supabase/functions/_fleet-server/toll_week_seal.ts");
const { runSealSideEffects } = await import(
  "../supabase/functions/_fleet-server/seal_side_effects.ts"
);
const { upsertTollPeriodRow, insertTollPeriodAudit, tollPeriodIdFor } = await import(
  "../supabase/functions/_fleet-server/toll_period_writable.ts"
);

console.log(`sealing toll week ${weekKey} for org ${orgId}…`);
const seal = await sealTollWeek({
  organizationId: orgId,
  weekKey,
  actorId: actorId || undefined,
});
console.log("seal result", seal);

const side = await runSealSideEffects({
  organizationId: orgId,
  weekKey,
  actorId: actorId || null,
  serviceLine: "rideshare",
});
console.log("side effects", side);

try {
  await upsertTollPeriodRow(orgId, weekKey, { state: "sealed" });
  await insertTollPeriodAudit(
    orgId,
    tollPeriodIdFor(orgId, weekKey),
    "seal",
    { published: seal.published, via: "heal-sep14-toll-seal" },
    actorId || null,
  );
  console.log("period state → sealed");
} catch (e) {
  console.warn("period sealed upsert:", e instanceof Error ? e.message : e);
}

console.log(JSON.stringify({ weekKey, seal, side }, null, 2));
