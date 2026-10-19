/**
 * Rev 6: Re-heal Super Lube → Jampet / United → Unipet in-process (edge attach path).
 *
 *   PowerShell: load keys then:
 *   deno run -A --config deno.json scripts/rev6-reheal-g5-aliases.ts
 */
const url = (Deno.env.get("SUPABASE_URL") || "https://csfllzzastacofsvcdsc.supabase.co").trim();
const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
if (!key) {
  console.error("Need SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}
Deno.env.set("SUPABASE_URL", url);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", key);

const { rehealMerchantAliasByLookup } = await import(
  "../supabase/functions/_fleet-server/station_merchant_aliases.ts"
);

const ORG = "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
const targets = [
  {
    rawName: "SUPER LUBE SERVICE CENTRE",
    stationId: "8cbe8d0e-06a7-471b-b19b-39435cfbd331",
  },
  {
    rawName: "UNITED PETROLEUM JA LTD LYNDHURST",
    stationId: "st_145e8645",
  },
];

let total = 0;
for (const t of targets) {
  const result = await rehealMerchantAliasByLookup({
    organizationId: ORG,
    issuer: "jaa",
    rawName: t.rawName,
    stationId: t.stationId,
  });
  console.log(t.rawName, result);
  total += Number(result?.healed || 0);
}
console.log("total_healed", total);
