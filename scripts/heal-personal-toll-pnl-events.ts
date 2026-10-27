/**
 * §1.3 — backfill personal toll P&L events (toll_charge + charged_to_driver + offset).
 *
 * Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * From repo root:
 *   deno run -A --config deno.json scripts/heal-personal-toll-pnl-events.ts
 */
const url = (Deno.env.get("SUPABASE_URL") || "").trim();
const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
if (!url || !key) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}
Deno.env.set("SUPABASE_URL", url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);

const { healPersonalTollPnlEvents } = await import(
  "../supabase/functions/_fleet-server/heal_personal_toll_pnl_events.ts"
);

const { results } = await healPersonalTollPnlEvents();
console.log(JSON.stringify({ results }, null, 2));
const failed = results.some(
  (r) =>
    r.tollCharge === "error" ||
    r.chargedToDriver === "error" ||
    r.personalOffset === "error",
);
Deno.exit(failed ? 1 : 0);
