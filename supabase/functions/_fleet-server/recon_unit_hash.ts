import { getServiceClient } from "./service_client.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { canonicalFactLines, sha256Hex } from "./recon_projection.ts";

function sb() {
  return getServiceClient();
}

async function policyVersion(orgId: string): Promise<string> {
  const { data } = await sb()
    .from("fleet_earnings_policies")
    .select("updated_at")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return String((data as { updated_at?: string } | null)?.updated_at || "");
}

function linesFrom(
  rows: Array<{ id?: string; updated_at?: string; amount?: number }> | null,
): Array<{ id: string; updatedAt: string; amount: number }> {
  return (rows ?? []).map((row) => ({
    id: String(row.id || ""),
    updatedAt: String(row.updated_at || ""),
    amount: Number(row.amount) || 0,
  }));
}

export async function hashVehicleWeekFacts(
  orgId: string,
  weekKey: string,
  vehicleId: string,
): Promise<string> {
  const end = periodEndForAnchor(weekKey);
  const [{ data }, policy] = await Promise.all([
    sb()
      .from("fleet_fuel_entries")
      .select("id, updated_at, amount")
      .eq("organization_id", orgId)
      .eq("vehicle_id", vehicleId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(5000),
    policyVersion(orgId),
  ]);
  return sha256Hex(canonicalFactLines(linesFrom(data as never), policy));
}

export async function hashDriverWeekFacts(
  orgId: string,
  weekKey: string,
  driverId: string,
): Promise<string> {
  const end = periodEndForAnchor(weekKey);
  const [trips, tolls, fuel, policy] = await Promise.all([
    sb()
      .from("fleet_trips")
      .select("id, updated_at, amount")
      .eq("organization_id", orgId)
      .eq("driver_id", driverId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(8000),
    sb()
      .from("fleet_toll_ledger")
      .select("id, updated_at, amount")
      .eq("organization_id", orgId)
      .eq("driver_id", driverId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(8000),
    sb()
      .from("fleet_fuel_entries")
      .select("id, updated_at, amount")
      .eq("organization_id", orgId)
      .eq("driver_id", driverId)
      .gte("date", weekKey)
      .lte("date", end)
      .limit(5000),
    policyVersion(orgId),
  ]);
  const rows = [
    ...linesFrom(trips.data as never),
    ...linesFrom(tolls.data as never),
    ...linesFrom(fuel.data as never),
  ];
  return sha256Hex(canonicalFactLines(rows, policy));
}
