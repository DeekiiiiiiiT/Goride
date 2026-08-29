/**
 * Driver Location Supply — Load available drivers for matching
 *
 * Supports two modes:
 * - Legacy: Bounded table scan with JS Haversine filter
 * - H3: Index-based lookup via RPC only (never .in() hex sets in URL)
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEFAULT_H3_RESOLUTION } from "../../_shared/h3/geoIndex.ts";

const DRIVER_LOCATIONS_SELECT_FULL = "user_id, lat, lng, updated_at, body_type_slug";
const DRIVER_LOCATIONS_SELECT_BASE = "user_id, lat, lng, updated_at";
const LEGACY_SUPPLY_LIMIT = 500;

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
    .eq("available_for_rides", true)
    .order("updated_at", { ascending: false })
    .limit(LEGACY_SUPPLY_LIMIT);

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
      if (rows && rows.length === 0) {
        // Valid empty market — do not storm alternate sources
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
 * Load driver locations using H3 cell index.
 * On RPC failure → legacy loader only (never PostgREST .in() hex URL).
 */
export async function loadDriverLocationsH3(
  h3Cells: string[],
  freshSince: string,
  h3Res: number = DEFAULT_H3_RESOLUTION,
): Promise<{ locations: DriverLocation[]; source: "h3" | "legacy" }> {
  if (h3Cells.length === 0) {
    return { locations: await loadAvailableDriverLocations(freshSince), source: "legacy" };
  }

  const db = pubSvc();
  const res = Number.isFinite(h3Res) ? Math.trunc(h3Res) : DEFAULT_H3_RESOLUTION;

  const { data: rpcData, error: rpcError } = await db.rpc("rides_drivers_in_h3_cells", {
    p_h3_cells: h3Cells,
    p_fresh_since: freshSince,
    p_h3_res: res,
    p_limit: 500,
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
      h3_res: res,
    }));

    return { locations, source: "h3" };
  }

  console.log(JSON.stringify({
    svc: "matching",
    ts: new Date().toISOString(),
    event: "h3_driver_locs_rpc_failed",
    error: rpcError?.message ?? "unknown",
    cells: h3Cells.length,
    h3_res: res,
    fell_back: true,
  }));

  return {
    locations: await loadAvailableDriverLocations(freshSince),
    source: "legacy",
  };
}
