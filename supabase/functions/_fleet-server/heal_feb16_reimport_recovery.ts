/**
 * Focused Feb 16 recovery rebuild (one driver period) after bad Uber re-import.
 * Usage: same env as heal-week-close-sync (SUPABASE_URL + SERVICE_ROLE_KEY).
 */
const url = (Deno.env.get("SUPABASE_URL") || "").trim();
const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}
Deno.env.set("SUPABASE_URL", url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);

const orgId = Deno.env.get("ORGANIZATION_ID") || "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
const driverId = "73e5b1dc-01b4-45ee-a34a-25a3256b9841";
const weekKey = "2026-02-16";

const { rebuildPeriodsForAnchors } = await import("./driver_financial_periods.ts");
const { sealTollWeek } = await import("./toll_week_seal.ts");

console.log("Sealing tolls…");
try {
  await sealTollWeek({
    organizationId: orgId,
    weekKey,
    force: true,
  });
  console.log("Toll seal ok");
} catch (e) {
  console.warn("Toll seal:", e);
}

console.log("Rebuilding DFP…");
await rebuildPeriodsForAnchors(driverId, [weekKey]);
console.log("Done");
