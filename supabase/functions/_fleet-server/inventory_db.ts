/**
 * Inventory engine access via public.fleet_inv_* bridge (audit R6-01).
 * PostgREST only exposes schemas listed in supabase/config.toml — not fleet.
 */
import { getServiceClient } from "./service_client.ts";

export function invDb() {
  return getServiceClient();
}

/** Map fleet.inv_* RPC name to public.fleet_inv_* wrapper. */
export function invRpcName(fleetRpc: string): string {
  if (fleetRpc.startsWith("fleet_inv_")) return fleetRpc;
  if (fleetRpc.startsWith("inv_")) return `fleet_inv_${fleetRpc.slice(4)}`;
  if (fleetRpc === "legacy_inventory_draw") return "fleet_legacy_inventory_draw";
  return fleetRpc;
}
