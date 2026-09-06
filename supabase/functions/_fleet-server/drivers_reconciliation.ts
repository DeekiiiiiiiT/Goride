/**
 * Server-side Uber SSOT (trips) vs Ledger reconciliation for one driver + one window.
 * GET /drivers/:id/reconciliation?from=&to=
 *
 * Both sides use the same {from,to} calendar window — never two different ranges.
 */
import type { Context, Hono } from "npm:hono";
import { requireAuth } from "./rbac_middleware.ts";
import { getOrgId } from "./org_scope.ts";
import * as kv from "./kv_store.tsx";
import { getServiceClient } from "./service_client.ts";
import { fetchAllLedgerEventValuesForDrivers } from "./ledger_driver_events.ts";
import {
  aggregateCanonicalEventsToLedgerDriverOverview,
  canonicalEventInSelectedWindow,
} from "./ledger_money_aggregate.ts";

const PREFIX = "/make-server-37f42386";

function asStr(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isUberPlatform(platform: unknown): boolean {
  const p = String(platform ?? "").trim().toLowerCase();
  return p === "uber" || p.startsWith("uber ");
}

function isCompletedTripStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s.includes("cancel") || s.includes("fail")) return false;
  return s.includes("complet") || s === "complete";
}

/** Trip SSOT Uber net for one completed trip (fare + tips + prior + promo − refund). */
function uberTripSsotNet(trip: Record<string, unknown>): number {
  const fare = Number(trip.uberFareComponents) || 0;
  const tips = Number(trip.uberTips) || 0;
  const prior = Number(trip.uberPriorPeriodAdjustment) || 0;
  const promo = Number(trip.uberPromotions) || Number(trip.uberPromo) || 0;
  const refund =
    Number(trip.uberRefundExpense) ||
    Number(trip.uberRefundsAndExpenses) ||
    Number(trip.uberRefund) ||
    0;
  const composed = fare + tips + prior + promo - refund;
  if (Math.abs(composed) > 0.005) return composed;
  return Number(trip.amount) || 0;
}

async function expandDriverIds(driverId: string): Promise<string[]> {
  const ids = [driverId];
  try {
    const driverRecord = await kv.get(`driver:${driverId}`);
    if (driverRecord) {
      const uber = asStr((driverRecord as any).uberDriverId).trim();
      const indrive = asStr((driverRecord as any).inDriveDriverId).trim();
      if (uber) ids.push(uber);
      if (indrive) ids.push(indrive);
    }
  } catch {
    /* non-fatal */
  }
  const expanded: string[] = [];
  for (const id of ids) {
    expanded.push(id);
    const lc = id.toLowerCase();
    if (lc !== id) expanded.push(lc);
  }
  return [...new Set(expanded.filter(Boolean))];
}

/** Sum Uber trip SSOT from fleet_trips for driver aliases in [from, to]. */
async function sumUberTripSsot(
  driverIds: string[],
  from: string,
  to: string,
  orgId: string | null,
): Promise<{ net: number; tripCount: number }> {
  const sb = getServiceClient();
  let q = sb
    .from("fleet_trips")
    .select("driver_id, status, date, platform, amount, payload_json")
    .in("driver_id", driverIds)
    .gte("date", from)
    .lte("date", to)
    .limit(20_000);
  if (orgId) q = q.eq("organization_id", orgId);
  const { data, error } = await q;
  if (error) {
    console.warn("[drivers/reconciliation] fleet_trips query failed:", error.message);
    return { net: 0, tripCount: 0 };
  }

  let net = 0;
  let tripCount = 0;
  for (const row of data || []) {
    const payload =
      row.payload_json && typeof row.payload_json === "object"
        ? (row.payload_json as Record<string, unknown>)
        : {};
    const platform = row.platform ?? payload.platform;
    if (!isUberPlatform(platform)) continue;
    const status = row.status ?? payload.status;
    if (!isCompletedTripStatus(status)) continue;
    const trip = {
      ...payload,
      amount: row.amount ?? payload.amount,
      platform,
      status,
      date: row.date ?? payload.date,
    };
    const tripNet = uberTripSsotNet(trip);
    if (Math.abs(tripNet) < 0.005) continue;
    net = round2(net + tripNet);
    tripCount += 1;
  }
  return { net, tripCount };
}

/** Ledger Uber netEarnings for the same window via canonical events. */
async function sumUberLedgerNet(
  c: Context,
  driverIds: string[],
  from: string,
  to: string,
): Promise<{ net: number; source: "ledger_events" | "unavailable" }> {
  try {
    const events = await fetchAllLedgerEventValuesForDrivers(driverIds, c, {
      from: `${from}T00:00:00.000Z`,
      to: `${to}T23:59:59.999Z`,
      maxRows: 50_000,
    });
    const period = events.filter((v: any) =>
      canonicalEventInSelectedWindow(v as Record<string, unknown>, from, to),
    );
    const overview = aggregateCanonicalEventsToLedgerDriverOverview(period, [], [], "Uber");
    const uber = (overview.period as any)?.uber;
    return {
      net: round2(Number(uber?.netEarnings) || 0),
      source: "ledger_events",
    };
  } catch (e) {
    console.warn("[drivers/reconciliation] ledger aggregate failed:", e);
    return { net: 0, source: "unavailable" };
  }
}

export function registerDriversReconciliationRoutes(app: Hono) {
  app.get(`${PREFIX}/drivers/:id/reconciliation`, requireAuth({ requireOrg: true }), async (c: Context) => {
    const driverId = asStr(c.req.param("id")).trim();
    const from = asStr(c.req.query("from")).slice(0, 10);
    const to = asStr(c.req.query("to")).slice(0, 10);
    if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return c.json({ error: "driverId, from, and to (yyyy-MM-dd) are required" }, 400);
    }

    const orgId = getOrgId(c);
    const aliases = await expandDriverIds(driverId);

    const [ssot, ledger] = await Promise.all([
      sumUberTripSsot(aliases, from, to, orgId),
      sumUberLedgerNet(c, aliases, from, to),
    ]);

    const ssotNet = ssot.net;
    const ledgerNet = ledger.net;
    const delta = round2(ssotNet - ledgerNet);
    const source =
      ledger.source === "ledger_events" && ssot.tripCount >= 0
        ? "trips_vs_ledger"
        : "unavailable";

    return c.json({
      success: true,
      orgId,
      driverId,
      from,
      to,
      source,
      ssot: { netEarnings: ssotNet, tripCount: ssot.tripCount },
      ledger: { netEarnings: ledgerNet },
      delta,
      status: Math.abs(delta) <= 0.05 ? "reconciled" : "mismatch",
    });
  });
}
