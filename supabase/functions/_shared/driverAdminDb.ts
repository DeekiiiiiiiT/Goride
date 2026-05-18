/**
 * DB access for driver admin Edge routes.
 * Uses public.driver_profiles + public.rides_* views (or rides schema when exposed).
 */
import { createClient, type PostgrestError, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type DriverAdminTables = {
  driver_profiles: string;
  driver_directory_stats: string;
  driver_locations: string;
  driver_offers: string;
  ride_requests: string;
};

type Resolved = {
  db: SupabaseClient;
  tables: DriverAdminTables;
  ridesDb: SupabaseClient | null;
};

const PUBLIC_TABLES: DriverAdminTables = {
  driver_profiles: "driver_profiles",
  driver_directory_stats: "driver_directory_stats",
  driver_locations: "rides_driver_locations",
  driver_offers: "rides_driver_offers",
  ride_requests: "rides_ride_requests",
};

const RIDES_NATIVE: DriverAdminTables = {
  driver_profiles: "driver_profiles",
  driver_directory_stats: "driver_directory_stats",
  driver_locations: "driver_locations",
  driver_offers: "driver_offers",
  ride_requests: "ride_requests",
};

let resolved: Resolved | null = null;

function serviceClient(schema: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema } },
  );
}

export function isMissingDriverAdminTableError(error: PostgrestError | null): boolean {
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
  selectColumn = "user_id",
): Promise<PostgrestError | null> {
  const db = serviceClient(schema);
  const { error } = await db.from(table).select(selectColumn).limit(1);
  return error;
}

async function resolveFromEnv(): Promise<Resolved | null> {
  const mode = Deno.env.get("DRIVER_ADMIN_DB_SCHEMA")?.trim().toLowerCase();
  if (mode === "rides") {
    const ridesDb = serviceClient("rides");
    return {
      db: serviceClient("public"),
      tables: PUBLIC_TABLES,
      ridesDb,
    };
  }
  if (mode === "public") {
    return {
      db: serviceClient("public"),
      tables: PUBLIC_TABLES,
      ridesDb: null,
    };
  }
  return null;
}

/** Public driver_profiles + rides views; optional native rides client for direct schema access. */
export async function getDriverAdminDb(): Promise<Resolved> {
  if (resolved) return resolved;

  const fromEnv = await resolveFromEnv();
  if (fromEnv) {
    resolved = fromEnv;
    return resolved;
  }

  const profileErr = await probe("public", PUBLIC_TABLES.driver_profiles, "user_id");
  if (!isMissingDriverAdminTableError(profileErr)) {
    const statsErr = await probe(
      "public",
      PUBLIC_TABLES.driver_directory_stats,
      "driver_user_id",
    );
    if (!isMissingDriverAdminTableError(statsErr)) {
      const ridesDbErr = await probe("rides", RIDES_NATIVE.driver_locations, "user_id");
      resolved = {
        db: serviceClient("public"),
        tables: PUBLIC_TABLES,
        ridesDb: isMissingDriverAdminTableError(ridesDbErr) ? null : serviceClient("rides"),
      };
      return resolved;
    }
  }

  throw new Error(
    "Driver admin is not set up on this database. Run migration 20260519120000_driver_admin_directory.sql " +
      "and reload the API schema cache.",
  );
}
