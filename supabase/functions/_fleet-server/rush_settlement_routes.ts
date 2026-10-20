/**
 * Rush settlement read-only routes (COD balances, delivery trip summary).
 */
import type { Hono } from "npm:hono@4.3.11";
import type { Context } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";
import { getOrgId } from "./org_scope.ts";
import {
  evaluateDeliveryReconReadiness,
} from "../../../packages/finance-core/src/deliveryReconReadiness.ts";
import {
  periodEndForAnchor,
  periodKeyFor,
  DEFAULT_FLEET_TZ,
} from "../../../packages/finance-core/src/periodKey.ts";
import { COURIER_EARNINGS_STATEMENT_KIND } from "../../../packages/finance-core/src/weekStatement.ts";

type AuthMiddleware = () => unknown;

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRIP_PAGE_LIMIT = 2000;

function normalizeWeekKey(raw: string | undefined | null): string | null {
  const day = String(raw || "").slice(0, 10);
  if (!WEEK_RE.test(day)) return null;
  return periodKeyFor(day, DEFAULT_FLEET_TZ) || day;
}

async function countRushDeliveryTrips(
  supabase: SupabaseClient,
  orgId: string,
  weekKey: string,
  weekEnd: string,
): Promise<number> {
  const { count } = await supabase
    .from("fleet_trips")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("service_line", "rush_delivery")
    .eq("status", "Completed")
    .gte("date", weekKey)
    .lte("date", weekEnd);
  return count ?? 0;
}

async function courierWeekStatementExists(
  supabase: SupabaseClient,
  orgId: string,
  weekKey: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .schema("ledger")
    .from("week_statements")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("week_key", weekKey)
    .eq("kind", COURIER_EARNINGS_STATEMENT_KIND);
  if (error) {
    console.warn("[rush] courier week_statements lookup failed", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/** Plate-normalized bridge: courier_vehicles.license_plate ↔ fleet.vehicles.license_plate. */
async function courierVehicleBridgeExists(
  supabase: SupabaseClient,
  orgId: string,
): Promise<boolean> {
  const delivery = supabase.schema("delivery");
  const { data: couriers, error: cpErr } = await delivery
    .from("courier_profiles")
    .select("user_id")
    .eq("fleet_id", orgId);
  if (cpErr || !couriers?.length) return false;

  const userIds = couriers.map((c) => String(c.user_id)).filter(Boolean);
  const { data: cvRows, error: cvErr } = await delivery
    .from("courier_vehicles")
    .select("license_plate")
    .in("user_id", userIds)
    .eq("status", "active");
  if (cvErr || !cvRows?.length) return false;

  const plates = [
    ...new Set(
      cvRows
        .map((r) => String(r.license_plate ?? "").replace(/\s+/g, "").toUpperCase())
        .filter(Boolean),
    ),
  ];
  if (!plates.length) return false;

  const { data: fleetVehicles, error: fvErr } = await supabase
    .from("fleet_vehicles")
    .select("license_plate")
    .eq("organization_id", orgId);
  if (fvErr || !fleetVehicles?.length) return false;

  const fleetPlates = new Set(
    fleetVehicles
      .map((v) => String(v.license_plate ?? "").replace(/\s+/g, "").toUpperCase())
      .filter(Boolean),
  );
  return plates.some((p) => fleetPlates.has(p));
}

export function registerRushSettlementRoutes(
  app: Hono,
  deps: {
    supabase: SupabaseClient;
    requireAuth: AuthMiddleware;
    getOrgId?: (c: Context) => string | null;
  },
) {
  const { supabase, requireAuth } = deps;
  const resolveOrgId = deps.getOrgId ?? getOrgId;
  const BASE = "";

  /** Read-only COD / cash owed to Roam for fleet couriers. */
  app.get(`${BASE}/rush/courier-cash-balances`, requireAuth() as never, async (c) => {
    try {
      const orgId = resolveOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const settlementOn = await isFeatureEnabled(FEATURE_FLAGS.RUSH_SETTLEMENT, orgId);
      if (!settlementOn) {
        return c.json({ enabled: false, balances: [], message: "Rush settlement not enabled" });
      }

      const delivery = supabase.schema("delivery");
      const { data: couriers, error: cpErr } = await delivery
        .from("courier_profiles")
        .select("user_id, display_name, fleet_id")
        .eq("fleet_id", orgId);

      if (cpErr) throw cpErr;
      const userIds = (couriers ?? []).map((c) => String(c.user_id)).filter(Boolean);
      if (!userIds.length) return c.json({ enabled: true, balances: [], source: "none" });

      const nameById = new Map(
        (couriers ?? []).map((c) => [String(c.user_id), c.display_name ?? "Courier"]),
      );

      // Production: remittance accounts are the COD authority (no READ_V2 flag).
      const { data: accounts, error: acctErr } = await delivery
        .from("courier_remittance_accounts")
        .select("courier_id, balance_minor, is_paused, updated_at")
        .in("courier_id", userIds);
      if (acctErr) throw acctErr;
      const rows = (accounts ?? []).map((b) => ({
        courierId: String(b.courier_id),
        courierName: nameById.get(String(b.courier_id)) ?? "Courier",
        owedToRoam: Number(b.balance_minor ?? 0) / 100,
        isPaused: Boolean(b.is_paused),
        updatedAt: b.updated_at,
        readOnly: true,
      }));
      return c.json({ enabled: true, balances: rows, source: "remittance_v2" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  /**
   * Mon–Sun delivery earnings summary for a fleet week (Monday weekKey).
   * Uses periodKeyFor / periodEndForAnchor — no rolling default when weekKey is set.
   */
  app.get(`${BASE}/rush/courier-week-summary`, requireAuth() as never, async (c) => {
    try {
      const orgId = resolveOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const weekKeyRaw = c.req.query("weekKey");
      const weekKey = normalizeWeekKey(weekKeyRaw);
      if (!weekKey) {
        return c.json({
          error: "INVALID_WEEK",
          message: "weekKey is required (YYYY-MM-DD Monday anchor)",
        }, 400);
      }
      const weekEnd = periodEndForAnchor(weekKey);

      const totalCount = await countRushDeliveryTrips(supabase, orgId, weekKey, weekEnd);
      const truncated = totalCount > TRIP_PAGE_LIMIT;

      const { data: trips, error } = await supabase
        .from("fleet_trips")
        .select("id, driver_id, amount, date, status, service_line")
        .eq("organization_id", orgId)
        .eq("service_line", "rush_delivery")
        .eq("status", "Completed")
        .gte("date", weekKey)
        .lte("date", weekEnd)
        .limit(TRIP_PAGE_LIMIT);

      if (error) throw error;

      const byDriver = new Map<string, { deliveries: number; gross: number }>();
      for (const t of trips ?? []) {
        const did = String(t.driver_id ?? "");
        if (!did) continue;
        const cur = byDriver.get(did) ?? { deliveries: 0, gross: 0 };
        cur.deliveries += 1;
        cur.gross += Number(t.amount ?? 0);
        byDriver.set(did, cur);
      }

      const rows = [...byDriver.entries()].map(([driverId, v]) => ({
        driverId,
        deliveries: v.deliveries,
        grossEarnings: Math.round(v.gross * 100) / 100,
      }));

      return c.json({
        weekKey,
        weekEnd,
        rows,
        tripCount: totalCount,
        meta: { truncated, limit: TRIP_PAGE_LIMIT, counted: totalCount },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  /** §7 delivery recon prerequisites for the wizard gate. */
  app.get(`${BASE}/rush/delivery-recon-readiness`, requireAuth() as never, async (c) => {
    try {
      const orgId = resolveOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const weekKey = normalizeWeekKey(c.req.query("weekKey")) ?? normalizeWeekKey(
        periodKeyFor(new Date().toISOString(), DEFAULT_FLEET_TZ),
      );
      if (!weekKey) {
        return c.json({ error: "INVALID_WEEK", message: "weekKey must be YYYY-MM-DD" }, 400);
      }
      const weekEnd = periodEndForAnchor(weekKey);

      const [projectionOn, settlementOn, tripCount, statementExists, bridgeExists] = await Promise.all([
        isFeatureEnabled(FEATURE_FLAGS.RUSH_TRIP_PROJECTION, orgId),
        isFeatureEnabled(FEATURE_FLAGS.RUSH_SETTLEMENT, orgId),
        countRushDeliveryTrips(supabase, orgId, weekKey, weekEnd),
        courierWeekStatementExists(supabase, orgId, weekKey),
        courierVehicleBridgeExists(supabase, orgId),
      ]);

      const evaluation = evaluateDeliveryReconReadiness({
        rushTripProjectionOn: projectionOn,
        rushDeliveryTripCount: tripCount,
        courierWeekStatementExists: statementExists,
        courierVehicleBridgeExists: bridgeExists,
        rushSettlementSignedOff: settlementOn,
      });

      return c.json({
        weekKey,
        weekEnd,
        ...evaluation,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  /**
   * @deprecated Use GET /rush/courier-week-summary?weekKey= (Mon–Sun). This endpoint uses a
   * rolling 7-day window and may truncate at 2000 rows without meta.truncated.
   */
  app.get(`${BASE}/rush/delivery-settlement-summary`, requireAuth() as never, async (c) => {
    try {
      const orgId = resolveOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const since = c.req.query("since") ||
        new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      const { data: trips, error } = await supabase
        .from("fleet_trips")
        .select("id, driver_id, amount, date, status, service_line")
        .eq("organization_id", orgId)
        .eq("service_line", "rush_delivery")
        .eq("status", "Completed")
        .gte("date", since)
        .limit(2000);

      if (error) throw error;

      const byDriver = new Map<string, { deliveries: number; gross: number }>();
      for (const t of trips ?? []) {
        const did = String(t.driver_id ?? "");
        if (!did) continue;
        const cur = byDriver.get(did) ?? { deliveries: 0, gross: 0 };
        cur.deliveries += 1;
        cur.gross += Number(t.amount ?? 0);
        byDriver.set(did, cur);
      }

      const rows = [...byDriver.entries()].map(([driverId, v]) => ({
        driverId,
        deliveries: v.deliveries,
        grossEarnings: Math.round(v.gross * 100) / 100,
      }));

      return c.json({ since, rows, tripCount: trips?.length ?? 0 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
