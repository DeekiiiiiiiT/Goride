/**
 * Live job position helpers — join rides.driver_locations for assigned drivers.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const LIVE_STALE_MINUTES = 5;

export type LivePosition = {
  lat: number;
  lng: number;
  heading: number | null;
  updated_at: string;
  source: "presence" | "job_snapshot";
};

export function isLiveStale(updatedAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!updatedAt) return true;
  const t = new Date(updatedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > LIVE_STALE_MINUTES * 60_000;
}

export async function loadDriverPresence(
  svc: SupabaseClient,
  driverUserId: string,
): Promise<LivePosition | null> {
  const rides = svc.schema("rides");
  const { data, error } = await rides
    .from("driver_locations")
    .select("lat, lng, heading_degrees, updated_at")
    .eq("user_id", driverUserId)
    .maybeSingle();

  if (error || !data) {
    // Public view fallback
    const { data: pub } = await svc
      .from("rides_driver_locations")
      .select("lat, lng, heading_degrees, updated_at")
      .eq("user_id", driverUserId)
      .maybeSingle();
    if (!pub || pub.lat == null || pub.lng == null) return null;
    return {
      lat: Number(pub.lat),
      lng: Number(pub.lng),
      heading: pub.heading_degrees != null ? Number(pub.heading_degrees) : null,
      updated_at: String(pub.updated_at),
      source: "presence",
    };
  }

  if (data.lat == null || data.lng == null) return null;
  return {
    lat: Number(data.lat),
    lng: Number(data.lng),
    heading: data.heading_degrees != null ? Number(data.heading_degrees) : null,
    updated_at: String(data.updated_at),
    source: "presence",
  };
}

export function positionFromJobSnapshot(job: Record<string, unknown>): LivePosition | null {
  if (job.last_lat == null || job.last_lng == null) return null;
  return {
    lat: Number(job.last_lat),
    lng: Number(job.last_lng),
    heading: job.last_heading != null ? Number(job.last_heading) : null,
    updated_at: job.last_located_at ? String(job.last_located_at) : String(job.updated_at ?? ""),
    source: "job_snapshot",
  };
}
