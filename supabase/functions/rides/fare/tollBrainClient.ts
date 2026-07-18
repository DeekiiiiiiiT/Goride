/**
 * Rides → Toll Brain Edge client (detect / record / estimate).
 * Falls back to local geofence when RIDES_USE_TOLL_BRAIN is off or Edge fails.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { TollCrossingRecord } from "./tollGeofence.ts";

function brainEnabled(): boolean {
  return Deno.env.get("RIDES_USE_TOLL_BRAIN") === "1" &&
    Deno.env.get("TOLL_BRAIN_ENABLED") !== "0";
}

function brainUrl(): string {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${base}/functions/v1/toll-brain`;
}

function secret(): string {
  return Deno.env.get("TOLL_BRAIN_INTERNAL_SECRET") || "";
}

async function brainPost(path: string, body: Record<string, unknown>): Promise<Response | null> {
  if (!brainEnabled() || !secret()) return null;
  try {
    return await fetch(`${brainUrl()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Toll-Brain-Internal-Secret": secret(),
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn("[rides/tollBrain] Edge call failed", e);
    return null;
  }
}

export function isRidesTollBrainEnabled(): boolean {
  return brainEnabled() && !!secret();
}

/** Evaluate GPS via Toll Brain; null → caller uses local evaluateTollCrossings. */
export async function brainEvaluatePoint(input: {
  lat: number;
  lng: number;
  geofenceRadiusM: number;
  alreadyCrossedPlazaIds: string[];
  recentByPlaza: Record<string, number>;
  cooldownMs?: number;
}): Promise<{ tollsCrossed: TollCrossingRecord[]; totalTollsMinor: number } | null> {
  const res = await brainPost("/v1/internal/evaluate-point", input);
  if (!res?.ok) return null;
  const data = await res.json();
  const crossed = (data.tollsCrossed || []).map((x: Record<string, unknown>) => ({
    toll_plaza_id: String(x.tollPlazaId || x.toll_plaza_id),
    toll_plaza_name: String(x.tollPlazaName || x.toll_plaza_name),
    toll_amount_minor: Number(x.tollAmountMinor ?? x.toll_amount_minor ?? 0),
    currency: String(x.currency || "JMD"),
    driver_lat: Number(x.driverLat ?? x.driver_lat ?? input.lat),
    driver_lng: Number(x.driverLng ?? x.driver_lng ?? input.lng),
  }));
  return {
    tollsCrossed: crossed,
    totalTollsMinor: Number(data.totalTollsMinor || 0),
  };
}

/** Record crossings via Toll Brain (also materializes ledger when policy allows). */
export async function brainRecordCrossings(input: {
  rideRequestId: string;
  crossings: TollCrossingRecord[];
  driverId?: string | null;
  vehicleId?: string | null;
  driverName?: string | null;
}): Promise<{ recorded: number; total: number } | null> {
  const res = await brainPost("/v1/internal/record-crossing", {
    rideRequestId: input.rideRequestId,
    driverId: input.driverId,
    vehicleId: input.vehicleId,
    driverName: input.driverName,
    crossings: input.crossings.map((c) => ({
      tollPlazaId: c.toll_plaza_id,
      tollPlazaName: c.toll_plaza_name,
      tollAmountMinor: c.toll_amount_minor,
      currency: c.currency,
      driverLat: c.driver_lat,
      driverLng: c.driver_lng,
    })),
  });
  if (!res?.ok) return null;
  const data = await res.json();
  return {
    recorded: Number(data.recorded || 0),
    total: Number(data.totalTollsMinor || 0),
  };
}

export async function brainEstimateRoute(input: {
  points: Array<{ lat: number; lng: number }>;
  geofenceRadiusM?: number;
}): Promise<{ estimatedTollsMinor: number; plazaIds: string[] } | null> {
  const res = await brainPost("/v1/internal/estimate-route", input);
  if (!res?.ok) return null;
  const data = await res.json();
  return {
    estimatedTollsMinor: Number(data.totalTollsMinor || 0),
    plazaIds: Array.isArray(data.plazaIds) ? data.plazaIds.map(String) : [],
  };
}

/** Load detect policy hints from brain (optional; unused radius fallback stays local). */
export async function loadBrainDetectHints(
  _db: SupabaseClient,
): Promise<{ geofenceRadiusM?: number; detectEnroute?: boolean } | null> {
  return null;
}
