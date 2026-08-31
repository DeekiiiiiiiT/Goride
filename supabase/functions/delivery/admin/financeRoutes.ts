/**
 * Dash admin — finance, payouts, disputes, reviews, promotions.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../../_shared/productAdmin.ts";
import { dualWriteDashPayment } from "../../_shared/unifiedLedger/dualWriteDash.ts";
import { requireDashWrite } from "./dashPermissions.ts";
import { getDb } from "./merchantAdminShared.ts";

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

export function registerFinanceAdminRoutes(app: Hono) {
  const admin = new Hono();

  admin.use("*", async (c, next) => {
    const result = await requireProductAdmin(c, "dash");
    if (result instanceof Response) return result;
    c.set("adminUser", result);
    await next();
  });

  admin.get("/payouts", async (c) => {
    const { merchant_id, status } = c.req.query();
    const page = Math.max(parseInt(c.req.query("page") || "1", 10) || 1, 1);
    const limit = Math.min(parseInt(c.req.query("limit") || "50", 10) || 50, 100);
    const offset = (page - 1) * limit;
    const pdb = getPaymentsDb();
    let query = pdb.from("merchant_payouts").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (merchant_id) query = query.eq("merchant_id", merchant_id);
    if (status) query = query.eq("status", status);
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return c.json({ error: error.message }, 500);
    try {
      const { shadowCompareAsync } = await import("../../_shared/unifiedLedger/shadowRead.ts");
      const { isLedgerReadUnifiedDashEnabled } = await import("../../_shared/unifiedLedger/flags.ts");
      shadowCompareAsync({
        island: "dash_payments",
        legacyCount: count ?? data?.length ?? 0,
        sampleKeys: (data ?? []).map((r: { id?: string }) => String(r.id ?? "")).filter(Boolean).slice(0, 20),
      });
      if (isLedgerReadUnifiedDashEnabled()) {
        const { listUnifiedLedgerEntries } = await import("../../_shared/unifiedLedger/queries.ts");
        const { entries, total } = await listUnifiedLedgerEntries({
          products: ["roam_dash", "roam_partner", "roam_courier"],
          sourceSystem: "dash_payments",
          limit,
          offset,
        });
        return c.json({ payouts: entries, total, page, limit, source: "ledger.entries" });
      }
    } catch (shErr) {
      console.error("[dash finance] shadow/unified read:", shErr);
    }
    return c.json({ payouts: data ?? [], total: count ?? 0, page, limit, source: "payments.merchant_payouts" });
  });

  admin.get("/payouts/:id", async (c) => {
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_payouts").select("*").eq("id", c.req.param("id")).single();
    if (error || !data) return c.json({ error: "Payout not found" }, 404);
    return c.json({ payout: data });
  });

  admin.post("/payouts", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const merchantId = body.merchant_id as string;
    const amountNum = Number(body.amount);
    const feeNum = Number(body.fee ?? 0) || 0;
    if (!merchantId || Number.isNaN(amountNum) || amountNum <= 0) {
      return c.json({ error: "merchant_id and positive amount required" }, 400);
    }
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_payouts").insert({
      merchant_id: merchantId,
      amount: amountNum,
      fee: feeNum,
      net_amount: amountNum - feeNum,
      currency: body.currency ?? "JMD",
      status: "pending",
      period_start: body.period_start ?? null,
      period_end: body.period_end ?? null,
      order_count: Number(body.order_count ?? 0) || 0,
      bank_account_last4: body.bank_account_last4 ?? null,
      notes: body.notes ?? body.reference ?? null,
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    try {
      await dualWriteDashPayment({
        transactionId: String(data.id),
        orderId: String(data.id),
        merchantId,
        amount: Number(data.net_amount ?? amountNum - feeNum),
        currency: String(data.currency ?? "JMD"),
        kind: "merchant_payout",
      });
    } catch (dwErr) {
      console.error("[dash finance] merchant_payout dual-write failed:", dwErr);
    }
    return c.json({ payout: data }, 201);
  });

  admin.post("/payouts/:id/hold", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const reason = String(body.reason || "Held by admin");
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_payouts")
      .update({ status: "held", notes: reason })
      .eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    // Reverse unified mirror so held payouts do not leave phantom partner credits.
    try {
      const amt = Number(data?.net_amount ?? data?.amount ?? 0);
      if (amt > 0 && data?.merchant_id) {
        await dualWriteDashPayment({
          transactionId: `${data.id}:hold`,
          orderId: String(data.id),
          merchantId: String(data.merchant_id),
          amount: amt,
          currency: String(data.currency ?? "JMD"),
          kind: "merchant_payout_reversal",
        });
      }
    } catch (dwErr) {
      console.error("[dash finance] merchant_payout hold reverse dual-write failed:", dwErr);
    }
    return c.json({ payout: data });
  });

  admin.post("/payouts/:id/release", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_payouts")
      .update({ status: "pending" })
      .eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ payout: data });
  });

  admin.post("/adjustments", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const merchantId = body.merchant_id as string;
    const amount = Number(body.amount);
    const reason = String(body.reason || "").trim();
    if (!merchantId || !reason || Number.isNaN(amount)) {
      return c.json({ error: "merchant_id, amount, and reason required" }, 400);
    }
    const pdb = getPaymentsDb();
    const { data, error } = await pdb.from("merchant_adjustments").insert({
      merchant_id: merchantId,
      amount,
      reason,
      created_by: admin.id,
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ adjustment: data }, 201);
  });

  admin.get("/disputes", async (c) => {
    const status = c.req.query("status");
    const db = getDb();
    let query = db.from("order_disputes").select("*").order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    const { data, error } = await query.limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ disputes: data ?? [] });
  });

  admin.patch("/disputes/:id", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();

    const { data: existing, error: fetchErr } = await db
      .from("order_disputes")
      .select("*")
      .eq("id", c.req.param("id"))
      .maybeSingle();
    if (fetchErr || !existing) return c.json({ error: "Dispute not found" }, 404);

    const nextStatus = body.status != null ? String(body.status) : String(existing.status);
    const refundAmount = body.refund_amount != null
      ? Number(body.refund_amount)
      : (existing.refund_amount != null ? Number(existing.refund_amount) : null);

    let refundResult: Record<string, unknown> | null = null;
    if (nextStatus === "refunded" && refundAmount != null && refundAmount > 0) {
      const { orchestrateOrderRefund } = await import("./orderRefund.ts");
      const authHeader = c.req.header("Authorization") || "";
      const result = await orchestrateOrderRefund({
        orderId: String(existing.order_id),
        amount: refundAmount,
        reason: String(body.resolution_notes || existing.resolution_notes || "Dispute refund"),
        admin: adminUser,
        authHeader,
      });
      if (!result.ok) {
        return c.json({
          error: result.error,
          message: "Refund failed — dispute was not marked refunded",
        }, result.status);
      }
      refundResult = {
        payment_status: result.payment_status,
        providerCompleted: result.providerCompleted,
        providerError: result.providerError ?? null,
        refund: result.refund,
      };
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      handled_by: adminUser.id,
    };
    if (body.status) updates.status = body.status;
    if (body.resolution_notes != null) updates.resolution_notes = body.resolution_notes;
    if (body.refund_amount != null) updates.refund_amount = Number(body.refund_amount);
    const { data, error } = await db.from("order_disputes")
      .update(updates).eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ dispute: data, refund: refundResult });
  });

  admin.get("/reviews", async (c) => {
    const merchantId = c.req.query("merchant_id");
    const flagged = c.req.query("flagged") === "true";
    const db = getDb();
    let query = db.from("orders")
      .select("id, order_number, merchant_id, customer_rating, customer_review, review_hidden, placed_at")
      .not("customer_review", "is", null)
      .order("placed_at", { ascending: false });
    if (merchantId) query = query.eq("merchant_id", merchantId);
    if (flagged) query = query.eq("review_hidden", true);
    const { data, error } = await query.limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ reviews: data ?? [] });
  });

  admin.patch("/reviews/:orderId", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const db = getDb();
    const { data, error } = await db.from("orders")
      .update({ review_hidden: Boolean(body.review_hidden) })
      .eq("id", c.req.param("orderId"))
      .select("id, order_number, customer_rating, customer_review, review_hidden")
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ review: data });
  });

  admin.get("/promotions", async (c) => {
    const merchantId = c.req.query("merchant_id");
    const status = c.req.query("status");
    const db = getDb();
    let query = db.from("merchant_promotions").select("*").order("created_at", { ascending: false });
    if (merchantId) query = query.eq("merchant_id", merchantId);
    if (status) query = query.eq("status", status);
    const { data, error } = await query.limit(100);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ promotions: data ?? [] });
  });

  admin.post("/promotions", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(adminUser);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const merchantId = String(body.merchant_id || "").trim();
    const type = String(body.type || "").trim();
    const title = String(body.title || "").trim();
    const dateStart = String(body.date_start || body.dateStart || "").trim();
    const promoCode = String(body.promo_code || body.promoCode || "").trim().toUpperCase();
    if (!merchantId) return c.json({ error: "merchant_id is required" }, 400);
    if (!type) return c.json({ error: "type is required" }, 400);
    if (type === "bogo") return c.json({ error: "BOGO promotions are not available yet" }, 400);
    if (!title) return c.json({ error: "title is required" }, 400);
    if (!dateStart) return c.json({ error: "date_start is required" }, 400);

    const db = getDb();
    if (type === "free_delivery") {
      const { data: profile } = await db
        .from("global_pricing_profiles")
        .select("rules")
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const pfd = ((profile?.rules as Record<string, unknown> | undefined)
        ?.promo_free_delivery ?? {}) as Record<string, unknown>;
      const maxKm = Number(pfd.max_free_delivery_km ?? 8);
      const budget = Number(pfd.monthly_subsidy_budget_jmd ?? 1500);
      if (!(maxKm > 0) || !(budget > 0)) {
        return c.json({
          error:
            "Platform promo free-delivery caps are missing. Set them under Pricing → Customer rules before creating a free-delivery promo.",
          code: "PROMO_FD_SUBSIDY_UNBOUNDED",
        }, 400);
      }
    }

    const { data, error } = await db.from("merchant_promotions").insert({
      merchant_id: merchantId,
      type,
      title,
      discount_percent: body.discount_percent ?? body.discountPercent ?? null,
      discount_amount: body.discount_amount ?? body.discountAmount ?? null,
      min_order: body.min_order ?? body.minOrder ?? null,
      applies_to: body.applies_to ?? body.appliesTo ?? "entire_order",
      promo_code: promoCode || null,
      customer_eligibility: body.customer_eligibility ?? body.customerEligibility ?? "all",
      date_start: dateStart,
      date_end: body.date_end ?? body.dateEnd ?? null,
      usage_limit_per_customer: body.usage_limit_per_customer ?? body.usageLimitPerCustomer ?? null,
      status: body.status || "active",
    }).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ promotion: data }, 201);
  });

  admin.post("/promotions/:id/disable", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const db = getDb();
    const { data, error } = await db.from("merchant_promotions")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ promotion: data });
  });

  /** Set promotion status: active | paused | ended | scheduled */
  admin.patch("/promotions/:id/status", async (c) => {
    const admin = c.get("adminUser") as ProductAdminUser;
    const denied = requireDashWrite(admin);
    if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const status = String(body.status || "").trim().toLowerCase();
    if (!["active", "paused", "ended", "scheduled"].includes(status)) {
      return c.json({ error: "status must be active, paused, ended, or scheduled" }, 400);
    }
    const db = getDb();
    const { data, error } = await db.from("merchant_promotions")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", c.req.param("id")).select().single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ promotion: data });
  });

  app.route("/admin/finance", admin);
}
