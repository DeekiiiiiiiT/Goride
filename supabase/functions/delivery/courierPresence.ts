/**
 * Single write path for courier_availability lat/lng + H3 cell.
 * All presence mutations that touch coordinates must go through here (Bug #10).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEFAULT_H3_RESOLUTION, latLngToH3 } from "../_shared/h3/geoIndex.ts";

export type CourierPresenceInput = {
  driverId: string;
  lat: number | null;
  lng: number | null;
  isOnline: boolean;
  activeOrderId?: string | null;
};

export type CourierPresenceResult =
  | { ok: true }
  | { ok: false; error: string; message: string; status: 400 | 503 | 500 };

export async function upsertCourierPresence(
  serviceSb: SupabaseClient,
  input: CourierPresenceInput,
): Promise<CourierPresenceResult> {
  const { driverId, isOnline, activeOrderId = null } = input;
  let lat = input.lat;
  let lng = input.lng;
  let h3Cell: string | null = null;
  let h3Res: number | null = null;

  const hasCoords =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  if (isOnline && !hasCoords) {
    return {
      ok: false,
      error: "location_required",
      message: "Online couriers must send lat/lng",
      status: 400,
    };
  }

  if (hasCoords) {
    try {
      h3Cell = latLngToH3(lat!, lng!, DEFAULT_H3_RESOLUTION);
      h3Res = DEFAULT_H3_RESOLUTION;
    } catch (e) {
      if (isOnline) {
        return {
          ok: false,
          error: "presence_h3_required",
          message: e instanceof Error
            ? e.message
            : "Couldn't index your location — try again",
          status: 503,
        };
      }
      // Offline heartbeat with coords but H3 failed: refuse half-row (coords without cell)
      return {
        ok: false,
        error: "presence_h3_required",
        message: e instanceof Error
          ? e.message
          : "Couldn't index your location — try again",
        status: 503,
      };
    }
  }

  if (isOnline && (!h3Cell || h3Res == null)) {
    return {
      ok: false,
      error: "presence_h3_required",
      message: "Couldn't index your location — try again",
      status: 503,
    };
  }

  const { error } = await serviceSb.rpc("delivery_courier_upsert_presence", {
    p_driver_id: driverId,
    p_lat: hasCoords ? lat : null,
    p_lng: hasCoords ? lng : null,
    p_h3_cell: h3Cell,
    p_h3_res: h3Res,
    p_is_online: isOnline,
    p_active_order_id: activeOrderId,
  });

  if (error) {
    const msg = error.message || "presence_upsert_failed";
    if (msg.includes("presence_h3_required") || msg.includes("location_required")) {
      return {
        ok: false,
        error: msg.includes("location") ? "location_required" : "presence_h3_required",
        message: msg.includes("location")
          ? "Online couriers must send lat/lng"
          : "Couldn't index your location — try again",
        status: msg.includes("location") ? 400 : 503,
      };
    }
    return { ok: false, error: "presence_upsert_failed", message: msg, status: 500 };
  }

  return { ok: true };
}
