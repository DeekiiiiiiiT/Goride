import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Fire-and-forget worker kick via SQL (pg_net). */
export async function kickVehiclePictureWorker(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.rpc("kick_vehicle_picture_worker");
  if (error) console.warn("[vehicle_picture_kick] worker:", error.message);
}

export async function kickVehiclePictureFill(
  supabase: SupabaseClient,
  afterId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("kick_vehicle_picture_fill", {
    p_after_id: afterId,
  });
  if (error) console.warn("[vehicle_picture_kick] fill:", error.message);
}