/**
 * Rush settlement read-only routes (COD balances, delivery trip summary).
 */
import type { Hono } from "npm:hono";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature_flags.ts";

type AuthMiddleware = () => unknown;
type GetOrgId = (c: { req: { header: (n: string) => string | undefined } }) => string | null;

export function registerRushSettlementRoutes(
  app: Hono,
  deps: {
    supabase: SupabaseClient;
    requireAuth: AuthMiddleware;
    getOrgId: GetOrgId;
  },
) {
  const { supabase, requireAuth, getOrgId } = deps;
  const BASE = "/make-server-37f42386";

  /** Read-only COD / cash owed to Roam for fleet couriers. */
  app.get(`${BASE}/rush/courier-cash-balances`, requireAuth(), async (c) => {
    try {
      const orgId = getOrgId(c);
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
      if (!userIds.length) return c.json({ enabled: true, balances: [] });

      const { data: balances, error: balErr } = await delivery
        .from("courier_cash_balances")
        .select("courier_id, balance_minor, updated_at")
        .in("courier_id", userIds);

      if (balErr) throw balErr;

      const nameById = new Map(
        (couriers ?? []).map((c) => [String(c.user_id), c.display_name ?? "Courier"]),
      );

      const rows = (balances ?? []).map((b) => ({
        courierId: String(b.courier_id),
        courierName: nameById.get(String(b.courier_id)) ?? "Courier",
        owedToRoamMinor: Number(b.balance_minor ?? 0),
        owedToRoam: Number(b.balance_minor ?? 0) / 100,
        updatedAt: b.updated_at,
        readOnly: true,
      }));

      return c.json({ enabled: true, balances: rows });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  /** Delivery revenue summary for courier settlements desk. */
  app.get(`${BASE}/rush/delivery-settlement-summary`, requireAuth(), async (c) => {
    try {
      const orgId = getOrgId(c);
      if (!orgId) return c.json({ error: "Organization required" }, 403);

      const since = c.req.query("since") ||
        new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

      const { data: trips, error } = await supabase
        .from("fleet_trips")
        .select("id, driver_id, amount, date, status, service_line")
        .eq("organization_id", orgId)
        .eq("service_line", "rush_delivery")
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
