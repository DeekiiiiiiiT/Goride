/**
 * Hard-reject booking when org has active service zones and pickup/dropoff are outside.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseZoneGeoJson, pointInGeoJson } from "../logistics/geo.ts";

export async function assertInsideServiceZones(
  svc: SupabaseClient,
  orgId: string,
  points: { lat: number | null | undefined; lng: number | null | undefined; label: string }[],
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const { data: zones, error } = await svc
    .schema("logistics")
    .from("service_zones")
    .select("id, name, geojson")
    .eq("organization_id", orgId)
    .eq("kind", "service")
    .eq("active", true);

  if (error) {
    return { ok: false, code: "zone_check_failed", message: error.message };
  }
  if (!zones?.length) return { ok: true }; // backward compatible empty catalogs

  for (const p of points) {
    if (p.lat == null || p.lng == null || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) {
      return {
        ok: false,
        code: "outside_service_zone",
        message: `${p.label} coordinates are required when service zones are configured`,
      };
    }
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const inside = zones.some((z) => {
      const geo = parseZoneGeoJson(z.geojson);
      return geo ? pointInGeoJson(lng, lat, geo) : false;
    });
    if (!inside) {
      return {
        ok: false,
        code: "outside_service_zone",
        message: `${p.label} is outside your active service zones`,
      };
    }
  }
  return { ok: true };
}
