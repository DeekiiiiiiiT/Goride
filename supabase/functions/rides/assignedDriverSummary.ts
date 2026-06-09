import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AssignedDriverSummary = {
  display_name: string | null;
  profile_photo_url: string | null;
  vehicle_label: string | null;
  license_plate: string | null;
};

export async function loadAssignedDriverSummary(
  db: SupabaseClient,
  driverUserId: string,
): Promise<AssignedDriverSummary | null> {
  const { data: profile } = await db
    .from("driver_profiles")
    .select("id, display_name, profile_photo_url")
    .eq("user_id", driverUserId)
    .maybeSingle();

  if (!profile?.id) {
    return {
      display_name: null,
      profile_photo_url: null,
      vehicle_label: null,
      license_plate: null,
    };
  }

  const { data: vehicle } = await db
    .from("driver_vehicles")
    .select("make, model, color, license_plate")
    .eq("driver_profile_id", profile.id)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parts: string[] = [];
  if (vehicle?.make && vehicle?.model) {
    parts.push(`${vehicle.make} ${vehicle.model}`);
  }
  if (vehicle?.color) parts.push(String(vehicle.color));

  return {
    display_name: (profile.display_name as string | null) ?? null,
    profile_photo_url: (profile.profile_photo_url as string | null) ?? null,
    vehicle_label: parts.length > 0 ? parts.join(" · ") : null,
    license_plate: vehicle?.license_plate ? String(vehicle.license_plate) : null,
  };
}
