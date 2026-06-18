/**
 * Join haulage manifest onto ride rows for driver/rider reads.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOOKINGS_TABLE = "rides_haulage_bookings";
const LINES_TABLE = "rides_haulage_booking_lines";

export async function loadHaulageManifestForRide(
  db: SupabaseClient,
  rideRequestId: string,
) {
  const { data: booking } = await db.from(BOOKINGS_TABLE)
    .select("*")
    .eq("ride_request_id", rideRequestId)
    .maybeSingle();
  if (!booking) return null;

  const { data: lines } = await db.from(LINES_TABLE)
    .select("*")
    .eq("haulage_booking_id", (booking as { id: string }).id)
    .order("created_at");

  const b = booking as Record<string, unknown>;
  return {
    haulage_booking_id: String(b.id),
    stairs_level: b.stairs_level,
    prep_status: b.prep_status,
    total_weight_kg: Number(b.total_weight_kg),
    total_volume_cm3: Number(b.total_volume_cm3),
    min_body_type_slug: b.min_body_type_slug,
    fill_percent: Number(b.fill_percent),
    recommended_gear: Array.isArray(b.recommended_gear)
      ? b.recommended_gear
      : (typeof b.recommended_gear === "object" && b.recommended_gear)
      ? b.recommended_gear
      : [],
    manifest_summary: String(b.manifest_summary ?? ""),
    lines: (lines ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      item_id: String(row.item_id),
      variant_id: String(row.variant_id),
      qty: Number(row.qty),
      label: String(row.variant_label),
      item_title: String(row.item_title),
      weight_kg: Number(row.weight_kg),
      length_cm: row.length_cm != null ? Number(row.length_cm) : null,
      width_cm: row.width_cm != null ? Number(row.width_cm) : null,
      height_cm: row.height_cm != null ? Number(row.height_cm) : null,
      fragile: Boolean(row.fragile),
      requires_disassembly: Boolean(row.requires_disassembly),
      upright_only: Boolean(row.upright_only),
    })),
  };
}

export async function attachHaulageManifestIfNeeded(
  db: SupabaseClient,
  ride: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (ride.vehicle_option !== "haulage") return ride;
  const manifest = await loadHaulageManifestForRide(db, String(ride.id));
  if (!manifest) return ride;
  return { ...ride, haulage_manifest: manifest };
}

export async function loadHaulagePipelineItems(
  db: SupabaseClient,
  userId: string,
) {
  const { data: rides } = await db.from("rides_ride_requests")
    .select("id, status, scheduled_pickup_at, pickup_address, dropoff_address, vehicle_option, fare_estimate_minor, currency, created_at")
    .eq("rider_user_id", userId)
    .eq("vehicle_option", "haulage")
    .in("status", ["scheduled", "matching", "driver_assigned", "driver_en_route_pickup", "driver_arrived_pickup", "on_trip"])
    .order("created_at", { ascending: false })
    .limit(10);

  const items = [];
  for (const row of rides ?? []) {
    const r = row as Record<string, unknown>;
    const manifest = await loadHaulageManifestForRide(db, String(r.id));
    const when = r.scheduled_pickup_at ? String(r.scheduled_pickup_at) : null;
    items.push({
      kind: "haulage" as const,
      id: String(r.id),
      title: when
        ? `Haulage · ${new Date(when).toLocaleString("en-JM", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
        : "Haulage pickup",
      subtitle: manifest?.manifest_summary ?? null,
      scheduled_at: when,
      pickup_address: r.pickup_address ? String(r.pickup_address) : null,
      dropoff_address: r.dropoff_address ? String(r.dropoff_address) : null,
      status: String(r.status),
      detail_lines: [
        manifest ? `${manifest.total_weight_kg} kg total` : "",
        manifest?.prep_status === "needs_unhooking" ? "Unhooking help needed" : "",
        manifest?.stairs_level && manifest.stairs_level !== "none"
          ? `Stairs: ${manifest.stairs_level}`
          : "",
      ].filter(Boolean),
    });
  }
  return items;
}
