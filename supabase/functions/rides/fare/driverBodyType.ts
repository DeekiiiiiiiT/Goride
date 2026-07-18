/**
 * Resolve driver body_type_slug from presence payload or primary driver_vehicles row.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeTransportSolutionSlug, slugFromCommandoBodyType } from "../../_shared/transportSlug.ts";

function publicDb(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function resolveDriverBodyTypeSlug(
  userId: string,
  explicitSlug?: string | null,
): Promise<string | null> {
  if (explicitSlug?.trim()) {
    const s = normalizeTransportSolutionSlug(explicitSlug);
    return s || null;
  }

  const db = publicDb();
  const { data: profile, error: profileError } = await db
    .from("driver_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  // Check error — don't treat DB errors as "no profile"
  if (profileError) {
    console.error("[driverBodyType] profile lookup failed:", profileError.message);
    return null;
  }
  if (!profile?.id) return null;

  const { data: primary, error: vehicleError } = await db
    .from("driver_vehicles")
    .select("body_type")
    .eq("driver_profile_id", profile.id)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Check error — don't treat DB errors as "no vehicle"
  if (vehicleError) {
    console.error("[driverBodyType] vehicle lookup failed:", vehicleError.message);
    return null;
  }

  const label = (primary as { body_type?: string | null } | null)?.body_type?.trim();
  if (!label) return null;
  return slugFromCommandoBodyType(label) || null;
}

export async function isActiveBodyTypeSlug(
  ridesDb: SupabaseClient,
  vehicleTypesTable: string,
  slug: string,
): Promise<boolean> {
  const { data, error } = await ridesDb
    .from(vehicleTypesTable)
    .select("slug, solution_kind, is_active")
    .eq("slug", slug)
    .maybeSingle();

  // Check error — don't treat DB errors as "not active"
  if (error) {
    console.error("[driverBodyType] vehicle type lookup failed:", error.message);
    return false;
  }
  if (!data) return false;
  const row = data as { solution_kind: string; is_active: boolean };
  return row.solution_kind === "vehicle" && row.is_active !== false;
}
