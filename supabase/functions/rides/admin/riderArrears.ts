/**
 * Admin — riders with outstanding wallet arrears.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import { getRiderAdminDb } from "../../_shared/ridesAdminDb.ts";
import { getRidesPaymentDb } from "../../_shared/ridesPaymentDb.ts";
import { isCashSettlementV2Enabled } from "../cashSettlement/flags.ts";
import { walletBalanceFromMinor } from "../../_shared/paymentAccounts.ts";

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export function registerRiderArrearsRoutes(admin: Hono): void {
  admin.get("/riders/arrears", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    if (!isCashSettlementV2Enabled()) {
      return c.json({ error: "feature_disabled", message: "Requires CASH_SETTLEMENT_V2=1" }, 404);
    }

    const currency = c.req.query("currency")?.trim() || "JMD";
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 50)));
    const offset = (page - 1) * limit;

    try {
      const { db: payDb, tables: payTables } = await getRidesPaymentDb();

      const { data: accountRows, error: accErr, count } = await payDb
        .from(payTables.accounts)
        .select("user_id, balance_minor, currency, created_at", { count: "exact" })
        .eq("role", "rider")
        .eq("currency", currency)
        .lt("balance_minor", 0)
        .order("balance_minor", { ascending: true })
        .range(offset, offset + limit - 1);

      if (accErr) {
        return c.json({ error: "query_failed", message: accErr.message }, 500);
      }

      const rows = accountRows ?? [];
      const userIds = rows.map((r) => String(r.user_id)).filter(Boolean);

      const { db: riderDb, tables: riderTables } = await getRiderAdminDb();
      const profileMap = new Map<string, Record<string, unknown>>();
      if (userIds.length > 0) {
        const { data: profiles } = await riderDb
          .from(riderTables.rider_profiles)
          .select("user_id, display_name, phone, account_status")
          .in("user_id", userIds);
        for (const p of profiles ?? []) {
          profileMap.set(String(p.user_id), p as Record<string, unknown>);
        }
      }

      const auth = serviceAuth();
      const emailMap = new Map<string, string | null>();
      await Promise.all(
        userIds.map(async (uid) => {
          try {
            const { data } = await auth.auth.admin.getUserById(uid);
            emailMap.set(uid, data.user?.email ?? null);
          } catch {
            emailMap.set(uid, null);
          }
        }),
      );

      const riders = rows.map((row) => {
        const uid = String(row.user_id ?? "");
        const profile = profileMap.get(uid);
        const balanceMinor = Number(row.balance_minor ?? 0);
        const view = walletBalanceFromMinor(balanceMinor, currency);
        return {
          user_id: uid,
          display_name: (profile?.display_name as string | null) ?? null,
          email: emailMap.get(uid) ?? null,
          phone: (profile?.phone as string | null) ?? null,
          account_status: (profile?.account_status as string | undefined) ?? "active",
          arrears_minor: view.arrears_minor,
          currency,
          last_arrears_at: row.created_at ?? null,
        };
      });

      return c.json({
        riders,
        total: count ?? riders.length,
        page,
        limit,
      });
    } catch (e) {
      return c.json({
        error: "list_failed",
        message: e instanceof Error ? e.message : String(e),
      }, 500);
    }
  });
}
