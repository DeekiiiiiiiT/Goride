import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildNativeCashSettled,
  buildNativeRideCharge,
  nativeTollCallsFor,
  type NativeTollMoment,
  type RideTollCrossingRow,
} from "./nativeTollPayload.ts";

export interface NativeTollSyncDeps {
  loadCrossings: (rideId: string) => Promise<RideTollCrossingRow[]>;
  resolveVehicleId: (ride: Record<string, unknown>) => Promise<string | null>;
  callRpc: (
    fn: "toll_sys_native_ride_charge" | "toll_sys_native_cash_settled",
    companyId: string,
    payload: Record<string, unknown>,
  ) => Promise<{ error?: { code?: string; message?: string } | null }>;
}

async function defaultLoadCrossings(
  ridesDb: SupabaseClient,
  rideId: string,
): Promise<RideTollCrossingRow[]> {
  const { data, error } = await ridesDb
    .from("ride_toll_crossings")
    .select("id, toll_plaza_id, toll_amount_minor, crossed_at")
    .eq("ride_request_id", rideId);
  if (error) {
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  return (data ?? []) as RideTollCrossingRow[];
}

async function defaultResolveVehicleId(ride: Record<string, unknown>): Promise<string | null> {
  const driverId = ride.assigned_driver_user_id ? String(ride.assigned_driver_user_id) : "";
  if (!driverId) return null;
  try {
    const { getFleetDriverContext } = await import("../../_shared/fleetDriverContext.ts");
    const ctx = await getFleetDriverContext(driverId);
    return ctx.assignedVehicleId ?? null;
  } catch {
    return null;
  }
}

export function makeNativeTollSyncDeps(
  ridesDb: SupabaseClient,
  pubDb: SupabaseClient,
): NativeTollSyncDeps {
  return {
    loadCrossings: (rideId) => defaultLoadCrossings(ridesDb, rideId),
    resolveVehicleId: (ride) => defaultResolveVehicleId(ride),
    callRpc: async (fn, companyId, payload) => {
      const { error } = await pubDb.rpc(fn, { p_company: companyId, p_ride: payload });
      return { error: error ? { code: error.code, message: error.message } : null };
    },
  };
}

export async function syncNativeTollsWithDeps(
  deps: NativeTollSyncDeps,
  ride: Record<string, unknown>,
  moment: NativeTollMoment,
): Promise<void> {
  const rideId = String(ride.id ?? "");
  try {
    const kinds = nativeTollCallsFor(ride, moment);
    if (kinds.length === 0) return;

    const companyId = String(ride.organization_id ?? "");
    if (!companyId) return;

    const crossings = rideId ? await deps.loadCrossings(rideId) : [];
    const vehicleId = await deps.resolveVehicleId(ride);

    for (const kind of kinds) {
      if (kind === "ride_charge") {
        const payload = buildNativeRideCharge(ride, crossings, vehicleId);
        const { error } = await deps.callRpc("toll_sys_native_ride_charge", companyId, payload);
        if (error) {
          throw Object.assign(new Error(error.message ?? "rpc_failed"), { code: error.code });
        }
      } else if (kind === "cash_settled") {
        const payload = buildNativeCashSettled(ride);
        const { error } = await deps.callRpc("toll_sys_native_cash_settled", companyId, payload);
        if (error) {
          throw Object.assign(new Error(error.message ?? "rpc_failed"), { code: error.code });
        }
      }
    }
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error("[toll-v2] native sync failed", {
      rideId,
      moment,
      code: err.code ?? "unknown",
      message: err.message ?? String(e),
    });
  }
}

export async function syncNativeTolls(
  ridesDb: SupabaseClient,
  pubDb: SupabaseClient,
  ride: Record<string, unknown>,
  moment: NativeTollMoment,
): Promise<void> {
  const deps = makeNativeTollSyncDeps(ridesDb, pubDb);
  await syncNativeTollsWithDeps(deps, ride, moment);
}
