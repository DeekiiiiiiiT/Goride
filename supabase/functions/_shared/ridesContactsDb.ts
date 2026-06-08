/**
 * Contacts / invites / Roam Tag DB access.
 * Hosted Supabase exposes public.rides_* views, not the rides schema.
 */
import { createClient, type PostgrestError, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type RidesContactsTables = {
  rider_contacts: string;
  rider_contact_groups: string;
  rider_contact_group_members: string;
  rider_contact_places: string;
  ride_passenger_invites: string;
  ride_trip_shares: string;
  ride_trip_share_events: string;
  booking_requests: string;
  roam_passenger_tags: string;
  passenger_authorizations: string;
};

const NATIVE_TABLES: RidesContactsTables = {
  rider_contacts: "rider_contacts",
  rider_contact_groups: "rider_contact_groups",
  rider_contact_group_members: "rider_contact_group_members",
  rider_contact_places: "rider_contact_places",
  ride_passenger_invites: "ride_passenger_invites",
  ride_trip_shares: "ride_trip_shares",
  ride_trip_share_events: "ride_trip_share_events",
  booking_requests: "booking_requests",
  roam_passenger_tags: "roam_passenger_tags",
  passenger_authorizations: "passenger_authorizations",
};

const PUBLIC_TABLES: RidesContactsTables = {
  rider_contacts: "rides_rider_contacts",
  rider_contact_groups: "rides_rider_contact_groups",
  rider_contact_group_members: "rides_rider_contact_group_members",
  rider_contact_places: "rides_rider_contact_places",
  ride_passenger_invites: "rides_ride_passenger_invites",
  ride_trip_shares: "rides_ride_trip_shares",
  ride_trip_share_events: "rides_ride_trip_share_events",
  booking_requests: "rides_booking_requests",
  roam_passenger_tags: "rides_roam_passenger_tags",
  passenger_authorizations: "rides_passenger_authorizations",
};

export type RidesContactsDb = {
  db: SupabaseClient;
  tables: RidesContactsTables;
};

let cached: RidesContactsDb | null = null;

export function isMissingRidesSchemaError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST106" ||
    msg.includes("schema must be one of") ||
    msg.includes("invalid schema")
  );
}

export function isMissingRidesContactsTableError(error: PostgrestError | null): boolean {
  if (!error) return false;
  if (isMissingRidesSchemaError(error)) return true;
  if (error.code === "PGRST205") return true;
  const msg = (error.message ?? "").toLowerCase();
  return (
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("does not exist")
  );
}

function serviceClient(schema: string): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema } },
  );
}

async function probe(schema: string, table: string): Promise<PostgrestError | null> {
  const db = serviceClient(schema);
  const { error } = await db.from(table).select("id").limit(1);
  return error;
}

/** Resolve contacts DB: public views on hosted, rides schema when exposed locally. */
export async function getRidesContactsDb(): Promise<RidesContactsDb> {
  if (cached) return cached;

  const forced = Deno.env.get("RIDES_CONTACTS_DB_SCHEMA")?.trim().toLowerCase();
  if (forced === "public") {
    cached = { db: serviceClient("public"), tables: PUBLIC_TABLES };
    return cached;
  }
  if (forced === "rides") {
    cached = { db: serviceClient("rides"), tables: NATIVE_TABLES };
    return cached;
  }

  // Prefer public views — hosted PostgREST usually omits the rides schema.
  const publicErr = await probe("public", PUBLIC_TABLES.rider_contacts);
  if (!isMissingRidesContactsTableError(publicErr)) {
    cached = { db: serviceClient("public"), tables: PUBLIC_TABLES };
    return cached;
  }

  const ridesErr = await probe("rides", NATIVE_TABLES.rider_contacts);
  if (!isMissingRidesContactsTableError(ridesErr)) {
    cached = { db: serviceClient("rides"), tables: NATIVE_TABLES };
    return cached;
  }

  throw new Error(
    "Roam Contacts is not set up on this database. Run migration " +
      "20260607120000_rider_contacts_and_delegated_booking.sql in the Supabase SQL editor, " +
      "then reload the API schema cache.",
  );
}

/** Clear cached resolution (tests / recovery after migration). */
export function resetRidesContactsDbCache(): void {
  cached = null;
}
