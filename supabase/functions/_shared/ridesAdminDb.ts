/**
 * DB access for rides admin Edge routes.
 * Hosted projects may use either:
 * - `rides` schema (add "rides" under API → Exposed schemas), or
 * - `public.rides_*` views (migration 20260517210000_rides_public_admin_views.sql).
 */
import { createClient, type PostgrestError, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RidesAdminTables = {
  fare_rules: string;
  surge_cells: string;
  vehicle_types: string;
  service_body_types: string;
  dispatch_settings: string;
  audit_events: string;
  rider_profiles: string;
  rider_admin_notes: string;
  rider_directory_stats: string;
  ride_requests: string;
};

type Resolved = {
  db: SupabaseClient;
  tables: RidesAdminTables;
};

const RIDES_NATIVE: RidesAdminTables = {
  fare_rules: "fare_rules",
  surge_cells: "surge_cells",
  vehicle_types: "vehicle_types",
  service_body_types: "service_body_types",
  dispatch_settings: "dispatch_settings",
  audit_events: "audit_events",
  rider_profiles: "rider_profiles",
  rider_admin_notes: "rider_admin_notes",
  rider_directory_stats: "rider_directory_stats",
  ride_requests: "ride_requests",
};

const PUBLIC_VIEWS: RidesAdminTables = {
  fare_rules: "rides_fare_rules",
  surge_cells: "rides_surge_cells",
  vehicle_types: "rides_vehicle_types",
  service_body_types: "rides_service_body_types",
  dispatch_settings: "rides_dispatch_settings",
  audit_events: "rides_audit_events",
  rider_profiles: "rides_rider_profiles",
  rider_admin_notes: "rides_rider_admin_notes",
  rider_directory_stats: "rides_rider_directory_stats",
  ride_requests: "rides_ride_requests",
};

let resolved: Resolved | null = null;
let riderResolved: Resolved | null = null;

function serviceClient(schema: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema } },
  );
}

export function isMissingRidesAdminTableError(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST205") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("schema must be one of")
  );
}

async function probe(
  schema: string,
  table: string,
  selectColumn = "id",
): Promise<PostgrestError | null> {
  const db = serviceClient(schema);
  const { error } = await db.from(table).select(selectColumn).limit(1);
  return error;
}

async function resolveFromEnv(): Promise<Resolved | null> {
  const mode = Deno.env.get("RIDES_ADMIN_DB_SCHEMA")?.trim().toLowerCase();
  if (mode === "rides") {
    return { db: serviceClient("rides"), tables: RIDES_NATIVE };
  }
  if (mode === "public") {
    return { db: serviceClient("public"), tables: PUBLIC_VIEWS };
  }
  return null;
}

/**
 * DB + table names for fare_rules lookups in /v1/quote.
 * Never falls back to the rides-schema svc() client (hosted PostgREST often omits `rides`).
 */
export async function resolveFareRulesDbForQuote(): Promise<{
  db: SupabaseClient;
  fareRulesTable: string;
  vehicleTypesTable: string;
  source: "admin_resolved" | "public_views_fallback" | "public_views_forced";
}> {
  const publicFallback = () => ({
    db: serviceClient("public"),
    fareRulesTable: PUBLIC_VIEWS.fare_rules,
    vehicleTypesTable: PUBLIC_VIEWS.vehicle_types,
    source: "public_views_fallback" as const,
  });

  try {
    const r = await getRidesAdminDb();
    if (r.tables.fare_rules === RIDES_NATIVE.fare_rules) {
      const { error } = await r.db.from(r.tables.fare_rules).select("id").limit(1);
      if (isMissingRidesAdminTableError(error)) {
        return { ...publicFallback(), source: "public_views_forced" };
      }
    }
    return {
      db: r.db,
      fareRulesTable: r.tables.fare_rules,
      vehicleTypesTable: r.tables.vehicle_types,
      source: "admin_resolved",
    };
  } catch {
    return publicFallback();
  }
}

/** Resolve once per isolate; tries rides schema then public views. */
export async function getRidesAdminDb(): Promise<Resolved> {
  if (resolved) return resolved;

  const fromEnv = await resolveFromEnv();
  if (fromEnv) {
    resolved = fromEnv;
    return resolved;
  }

  const ridesErr = await probe("rides", RIDES_NATIVE.fare_rules);
  if (!isMissingRidesAdminTableError(ridesErr)) {
    resolved = { db: serviceClient("rides"), tables: RIDES_NATIVE };
    return resolved;
  }

  const publicErr = await probe("public", PUBLIC_VIEWS.fare_rules);
  if (!isMissingRidesAdminTableError(publicErr)) {
    resolved = { db: serviceClient("public"), tables: PUBLIC_VIEWS };
    return resolved;
  }

  throw new Error(
    "Rides admin tables are not available. Expose the `rides` schema in Supabase API settings, " +
      "or run migration 20260517210000_rides_public_admin_views.sql and reload the API schema cache.",
  );
}

/**
 * Rider user-management tables — resolved independently from fare/surge cache.
 * Prefers `rides` schema when exposed (works without public rider views).
 */
export async function getRiderAdminDb(): Promise<Resolved> {
  if (riderResolved) return riderResolved;

  const fromEnv = await resolveFromEnv();
  if (fromEnv) {
    riderResolved = fromEnv;
    return riderResolved;
  }

  const ridesProfileErr = await probe("rides", RIDES_NATIVE.rider_profiles, "user_id");
  if (!isMissingRidesAdminTableError(ridesProfileErr)) {
    riderResolved = { db: serviceClient("rides"), tables: RIDES_NATIVE };
    return riderResolved;
  }

  const publicProfileErr = await probe(
    "public",
    PUBLIC_VIEWS.rider_profiles,
    "user_id",
  );
  if (!isMissingRidesAdminTableError(publicProfileErr)) {
    riderResolved = { db: serviceClient("public"), tables: PUBLIC_VIEWS };
    return riderResolved;
  }

  throw new Error(
    "Rider admin is not set up on this database. Run `supabase db push` (migration " +
      "20260518150000_ensure_rider_public_views.sql) or paste that file in the Supabase SQL Editor, " +
      "then reload the API schema cache.",
  );
}
