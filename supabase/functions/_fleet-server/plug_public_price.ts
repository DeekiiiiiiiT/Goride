import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { plugPriceDecision } from "../_shared/plugCore.ts";

/** Fleet fuel save notes a public price. It does not change the fleet fuel row. */
export async function noteFleetPrice(entry: {
  liters?: number;
  amount?: number;
  matchedStationId?: string;
  metadata?: { stationResolutionState?: string };
}): Promise<void> {
  const stationId = entry.matchedStationId;
  const litres = Number(entry.liters) || 0;
  const amount = Number(entry.amount) || 0;
  if (!stationId || !(litres > 0) || !(amount > 0)) return;
  if (entry.metadata?.stationResolutionState && entry.metadata.stationResolutionState !== "verified") return;

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const sb = createClient(url, key);
  const price = amount / litres;
  const estimate = await latestRetailEstimate(sb);
  const decision = estimate ? plugPriceDecision(price, estimate) : "hold";
  await sb.schema("places").from("price_observation").insert({
    station_id: stationId,
    grade: "e10_87",
    price_per_litre: price,
    origin_app: "roam_fleet",
    in_band: decision === "publish",
  });
  if (decision !== "publish") return;
  await sb.schema("places").from("price_current").upsert({
    station_id: stationId,
    grade: "e10_87",
    price_per_litre: price,
    observed_at: new Date().toISOString(),
  });
  const { data: card } = await sb.schema("places").from("public_station").select("prices").eq("id", stationId).maybeSingle();
  if (!card) return;
  const prices = { ...(card.prices || {}), e10_87: price };
  await sb.schema("places").from("public_station").update({
    prices,
    price_updated_at: new Date().toISOString(),
  }).eq("id", stationId);
}

async function latestRetailEstimate(sb: SupabaseClient): Promise<number | null> {
  const { data, error } = await sb.schema("places").rpc("latest_retail_estimate", { p_grade: "e10_87" });
  if (error) return null;
  const value = Number(data);
  return value > 0 ? value : null;
}
