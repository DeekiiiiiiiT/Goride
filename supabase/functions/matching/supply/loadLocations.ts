/**
 * Driver Location Supply — Load available drivers for matching
 *
 * Supports two modes:
 * - Legacy: Full table scan with JS Haversine filter
 * - H3 (Phase 4): Index-based lookup with cell query
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DRIVER_LOCATIONS_SELECT_FULL = "user_id, lat, lng, updated_at, body_type_slug";
const DRIVER_LOCATIONS_SELECT_BASE = "user_id, lat, lng, updated_at";

export interface DriverLocation {
  user_id: string;
  lat: number;
  lng: number;
  updated_at: string;
  body_type_slug: string | null;
}

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function queryFreshDriverLocations(
  db: SupabaseClient,
  table: string,
  select: string,
  freshSince: string,
): Promise<{ rows: DriverLocation[] | null; error: string | null }> {
  const { data, error } = await db
    .from(table)
    .select(select)
    .gte("updated_at", freshSince)
    .eq("available_for_rides", true);

  if (error) return { rows: null, error: error.message };

  const rows = (data ?? []).map((row: Record<string, unknown>) => ({
    user_id: String(row.user_id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    updated_at: String(row.updated_at),
    body_type_slug: (row as { body_type_slug?: string | null }).body_type_slug ?? null,
  }));

  return { rows, error: null };
}

/**
 * Load fresh online drivers for matching.
 * Retries without body_type_slug when API schema cache lags migrations.
 */
export async function loadAvailableDriverLocations(freshSince: string): Promise<DriverLocation[]> {
  const selects = [DRIVER_LOCATIONS_SELECT_FULL, DRIVER_LOCATIONS_SELECT_BASE];
  const sources: Array<{ db: SupabaseClient; table: string }> = [
    { db: svc(), table: "driver_locations" },
    { db: pubSvc(), table: "rides_driver_locations" },
  ];
  let lastError: string | null = null;

  for (const select of selects) {
    for (const { db, table } of sources) {
      const { rows, error } = await queryFreshDriverLocations(db, table, select, freshSince);
      if (error) {
        lastError = error;
        continue;
      }
      if (rows && rows.length > 0) return rows;
      if (rows && rows.length === 0 && select === DRIVER_LOCATIONS_SELECT_BASE) {
        return rows;
      }
    }
  }

  if (lastError) {
    console.log(JSON.stringify({
      svc: "matching",
      ts: new Date().toISOString(),
      event: "load_driver_locs_failed",
      error: lastError,
      fresh_since: freshSince,
    }));
  }

  return [];
}

/**
 * Load driver locations using H3 cell index (Phase 4).
 * Falls back to legacy scan if H3 not enabled or no results.
 */
export async function loadDriverLocationsH3(
  h3Cells: string[],
  freshSince: string,
): Promise<{ locations: DriverLocation[]; source: "h3" | "legacy" }> {
  if (h3Cells.length === 0) {
    return { locations: await loadAvailableDriverLocations(freshSince), source: "legacy" };
  }

  const db = pubSvc();

  // Try the RPC function first
  const { data: rpcData, error: rpcError } = await db.rpc("rides_drivers_in_h3_cells", {
    p_h3_cells: h3Cells,
    p_fresh_since: freshSince,
  });

  if (!rpcError && rpcData) {
    const locations = (rpcData as Record<string, unknown>[]).map((row) => ({
      user_id: String(row.user_id),
      lat: Number(row.lat),
      lng: Number(row.lng),
      updated_at: String(row.updated_at),
      body_type_slug: (row as { body_type_slug?: string | null }).body_type_slug ?? null,
    }));

    console.log(JSON.stringify({
      svc: "matching",
      ts: new Date().toISOString(),
      event: "h3_driver_locs_loaded",
      cells: h3Cells.length,
      drivers: locations.length,
    }));

    return { locations, source: "h3" };
  }

  // Fallback to direct query
  const { data, error } = await svc()
    .from("driver_locations")
    .select("user_id, lat, lng, updated_at, body_type_slug")
    .in("h3_cell", h3Cells)
    .gte("updated_at", freshSince)
    .eq("available_for_rides", true);

  if (error) {
    console.log(JSON.stringify({
      svc: "matching",
      ts: new Date().toISOString(),
      event: "h3_driver_locs_failed",
      error: error.message,
      rpc_error: rpcError?.message,
      cells: h3Cells.length,
    }));
    return { locations: await loadAvailableDriverLocations(freshSince), source: "legacy" };
  }

  const locations = (data ?? []).map((row: Record<string, unknown>) => ({
    user_id: String(row.user_id),
    lat: Number(row.lat),
    lng: Number(row.lng),
    updated_at: String(row.updated_at),
    body_type_slug: (row as { body_type_slug?: string | null }).body_type_slug ?? null,
  }));

  return { locations, source: "h3" };
}
