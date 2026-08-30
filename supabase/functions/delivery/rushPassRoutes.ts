/**
 * Rush Pass — customer subscription status, WiPay subscribe, cancel, admin grant.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin, type ProductAdminUser } from "../_shared/productAdmin.ts";
import { requireDashWrite } from "./admin/dashPermissions.ts";
import { validateBody, z } from "../_shared/validateBody.ts";
import { activateRushPassFromPaymentIntent } from "../_shared/rushPassActivate.ts";
import { loadActiveRushPassMembership } from "./rushPassMembership.ts";

export type RushPassRoutesDeps = {
  getSupabase: (authHeader: string) => SupabaseClient;
  getServiceSupabase: () => SupabaseClient;
};

type CustomerRow = { id: string; user_id: string; email?: string | null };

async function requireUser(
  authHeader: string | undefined,
  getSupabase: RushPassRoutesDeps["getSupabase"],
) {
  if (!authHeader) return { error: "Unauthorized", status: 401 as const };
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401 as const };
  return { user };
}

async function ensureCustomer(
  serviceSb: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<{ customer: CustomerRow | null; error?: string }> {
  const { data: existing } = await serviceSb
    .from("customers")
    .select("id, user_id, email")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { customer: existing as CustomerRow };

  const { data: created, error } = await serviceSb
    .from("customers")
    .insert({
      user_id: user.id,
      name: user.email?.split("@")[0] || "Customer",
      email: user.email ?? null,
    })
    .select("id, user_id, email")
    .single();
  if (error || !created) return { customer: null, error: error?.message || "customer_create_failed" };
  return { customer: created as CustomerRow };
}

function getPaymentsDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

function paymentsPublicUrl(): string {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${base}/functions/v1/payments`;
}

function wipayEnv(): string {
  return (Deno.env.get("WIPAY_ENV") || Deno.env.get("WIPAY_ENVIRONMENT") || "sandbox").toLowerCase();
}

function isSandboxWipay(): boolean {
  return wipayEnv() !== "live" && wipayEnv() !== "production";
}

function wipayGatewayUrl(): string {
  if (isSandboxWipay()) {
    return "https://jmsb.wipayfinancial.com/plugins/payments/request";
  }
  return "https://jm.wipayfinancial.com/plugins/payments/request";
}

function resolveReturnBase(origin: string | undefined, returnOrigin?: string): string {
  const raw = (returnOrigin || origin || Deno.env.get("APP_URL") || "https://roamrush.app").trim();
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://roamrush.app";
  }
}

async function loadActivePlan(sb: SupabaseClient, slug?: string) {
  let q = sb.from("rush_pass_plans").select("*").eq("is_active", true);
  if (slug) q = q.eq("slug", slug);
  else q = q.eq("slug", "rush_pass_standard");
  const { data } = await q.maybeSingle();
  return data as Record<string, unknown> | null;
}

export { loadActiveRushPassMembership } from "./rushPassMembership.ts";

/** Activate or extend membership after successful WiPay (or admin confirm). */
export { activateRushPassFromPaymentIntent } from "../_shared/rushPassActivate.ts";

async function createWipayRushPassCheckout(opts: {
  amount: number;
  customerEmail: string;
  customerId: string;
  planId: string;
  intentId: string;
  returnBase: string;
}): Promise<{ paymentUrl?: string; transactionId?: string; error?: string }> {
  const accountNumber = Deno.env.get("WIPAY_ACCOUNT_NUMBER") || Deno.env.get("WIPAY_ACCOUNT") || null;
  const apiKey = Deno.env.get("WIPAY_API_KEY") || null;
  const callbackSecret = Deno.env.get("WIPAY_CALLBACK_SECRET") ||
    (isSandboxWipay() ? "sandbox-wipay-callback" : null);

  if (!accountNumber || !apiKey) return { error: "WiPay not configured" };
  if (!callbackSecret) return { error: "WiPay callback secret not configured" };

  const responseUrl = new URL(`${paymentsPublicUrl()}/webhooks/wipay`);
  responseUrl.searchParams.set("secret", callbackSecret);
  const customerReturn = `${opts.returnBase}/payment/callback/wipay?purpose=rush_pass`;
  const orderRef = `rp${opts.intentId.replace(/-/g, "").slice(0, 14)}`;
  const accountValue = /^\d+$/.test(accountNumber) ? Number(accountNumber) : accountNumber;

  try {
    const response = await fetch(wipayGatewayUrl(), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        account_number: accountValue,
        avs: "0",
        country_code: "JM",
        currency: "JMD",
        data: JSON.stringify({
          purpose: "rush_pass",
          planId: opts.planId,
          customerId: opts.customerId,
          intentId: opts.intentId,
          returnBase: opts.returnBase,
        }),
        email: opts.customerEmail || "customer@roamrush.app",
        environment: isSandboxWipay() ? "sandbox" : "live",
        fee_structure: "merchant_absorb",
        method: "credit_card_co",
        order_id: orderRef,
        origin: "RoamRushPass",
        response_url: responseUrl.toString(),
        return_url: customerReturn,
        total: Number(opts.amount).toFixed(2),
      }),
    });
    const raw = await response.text();
    let result: { url?: string; message?: string; transaction_id?: string } = {};
    try {
      result = JSON.parse(raw) as typeof result;
    } catch {
      return { error: "Failed to create WiPay payment" };
    }
    const checkoutUrl = String(result.url || "");
    if (!checkoutUrl || checkoutUrl.includes("status=error")) {
      return { error: result.message || "WiPay error" };
    }
    return { paymentUrl: checkoutUrl, transactionId: result.transaction_id };
  } catch {
    return { error: "Failed to create WiPay payment" };
  }
}

export function registerRushPassRoutes(app: Hono, deps: RushPassRoutesDeps) {
  const { getSupabase, getServiceSupabase } = deps;

  // GET /customer/rush-pass — status + plan
  app.get("/customer/rush-pass", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const plan = await loadActivePlan(serviceSb);
    const active = await loadActiveRushPassMembership(serviceSb, customer.id);

    const maxFreeKm = Number(
      (plan as { max_free_delivery_km?: number } | null)?.max_free_delivery_km ?? 8,
    );
    const budget = Number(
      (plan as { monthly_subsidy_budget_jmd?: number; price_jmd?: number } | null)
        ?.monthly_subsidy_budget_jmd ??
        plan?.price_jmd ??
        1500,
    );
    let subsidyUsed = 0;
    if (active) {
      const { data: orders } = await serviceSb
        .from("orders")
        .select("platform_delivery_subsidy_jmd, pricing_snapshot, promo_cost_jmd")
        .eq("rush_pass_membership_id", active.membership.id)
        .gte("placed_at", String(active.membership.current_period_start))
        .not("status", "in", '("cancelled","rejected")');
      for (const row of orders ?? []) {
        const r = row as Record<string, unknown>;
        const snap = (r.pricing_snapshot ?? {}) as Record<string, unknown>;
        const fromCol = Number(r.platform_delivery_subsidy_jmd ?? 0);
        const fromSnap = Number(
          snap.platform_delivery_subsidy_jmd ??
            snap.platformDeliverySubsidyJmd ??
            snap.promo_cost_jmd ??
            snap.promoCostJmd ??
            r.promo_cost_jmd ??
            0,
        );
        subsidyUsed += fromCol > 0 ? fromCol : fromSnap;
      }
    }
    subsidyUsed = Math.round(subsidyUsed * 100) / 100;
    const remaining = Math.max(0, Math.round((budget - subsidyUsed) * 100) / 100);

    return c.json({
      plan: plan
        ? {
          id: plan.id,
          slug: plan.slug,
          name: plan.name,
          price_jmd: Number(plan.price_jmd),
          billing_period_days: Number(plan.billing_period_days),
          free_delivery: Boolean(plan.free_delivery),
          service_fee_multiplier: Number(plan.service_fee_multiplier),
          eligible_tier_slugs: plan.eligible_tier_slugs,
          max_free_delivery_km: maxFreeKm,
          monthly_subsidy_budget_jmd: budget,
        }
        : null,
      membership: active
        ? {
          id: active.membership.id,
          status: active.membership.status,
          current_period_start: active.membership.current_period_start,
          current_period_end: active.membership.current_period_end,
          auto_renew: active.membership.auto_renew,
          source: active.membership.source,
        }
        : null,
      active: Boolean(active),
      subsidy: {
        budget_jmd: budget,
        used_jmd: subsidyUsed,
        remaining_jmd: remaining,
        max_free_delivery_km: maxFreeKm,
      },
    });
  });

  // POST /customer/rush-pass/subscribe — create WiPay intent
  app.post("/customer/rush-pass/subscribe", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const body = await validateBody(c, z.object({
      planSlug: z.string().optional(),
      returnOrigin: z.string().optional(),
    }).passthrough());
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const existing = await loadActiveRushPassMembership(serviceSb, customer.id);
    if (existing) {
      return c.json({ error: "Already subscribed", membership: existing.membership }, 409);
    }

    const plan = await loadActivePlan(serviceSb, body.planSlug);
    if (!plan) return c.json({ error: "Plan not available" }, 404);

    const returnBase = resolveReturnBase(c.req.header("origin") ?? undefined, body.returnOrigin);
    const amount = Number(plan.price_jmd);
    const pdb = getPaymentsDb();

    // Reuse pending rush-pass intent
    const nowIso = new Date().toISOString();
    const { data: existingIntent } = await pdb
      .from("payment_intents")
      .select("*")
      .eq("customer_id", customer.id)
      .eq("provider", "wipay")
      .is("order_id", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(20);

    const reusable = (existingIntent ?? []).find((row: Record<string, unknown>) => {
      const pd = (row.provider_data ?? {}) as Record<string, unknown>;
      return String(pd.purpose) === "rush_pass" &&
        String(pd.plan_id) === String(plan.id) &&
        !["completed", "paid", "failed"].includes(String(row.status ?? "").toLowerCase());
    });

    if (reusable) {
      return c.json({
        intentId: reusable.id,
        paymentRedirectUrl: reusable.client_secret,
        amount: reusable.amount,
        currency: reusable.currency ?? "JMD",
      });
    }

    const { data: intent, error: intentErr } = await pdb
      .from("payment_intents")
      .insert({
        order_id: null,
        customer_id: customer.id,
        amount,
        currency: "JMD",
        status: "pending",
        provider: "wipay",
        provider_data: {
          purpose: "rush_pass",
          plan_id: plan.id,
          customer_id: customer.id,
          returnBase,
        },
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select("*")
      .single();

    if (intentErr || !intent) {
      return c.json({ error: intentErr?.message || "intent_create_failed" }, 500);
    }

    const wipay = await createWipayRushPassCheckout({
      amount,
      customerEmail: customer.email || auth.user.email || "",
      customerId: customer.id,
      planId: String(plan.id),
      intentId: String(intent.id),
      returnBase,
    });

    if (wipay.error || !wipay.paymentUrl) {
      await pdb.from("payment_intents").update({ status: "failed" }).eq("id", intent.id);
      return c.json({ error: wipay.error || "wipay_failed" }, 500);
    }

    await pdb
      .from("payment_intents")
      .update({
        client_secret: wipay.paymentUrl,
        provider_intent_id: wipay.transactionId ?? null,
        provider_data: {
          purpose: "rush_pass",
          plan_id: plan.id,
          customer_id: customer.id,
          returnBase,
          wipay: { transactionId: wipay.transactionId },
        },
      })
      .eq("id", intent.id);

    return c.json({
      intentId: intent.id,
      paymentRedirectUrl: wipay.paymentUrl,
      amount,
      currency: "JMD",
    }, 201);
  });

  // POST /customer/rush-pass/confirm — activate after WiPay return (or admin sandbox)
  app.post("/customer/rush-pass/confirm", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const body = await validateBody(c, z.object({
      intentId: z.string().min(1),
    }));
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const pdb = getPaymentsDb();
    const { data: intent } = await pdb
      .from("payment_intents")
      .select("*")
      .eq("id", body.intentId)
      .eq("customer_id", customer.id)
      .maybeSingle();

    if (!intent) return c.json({ error: "Intent not found" }, 404);
    const status = String(intent.status ?? "").toLowerCase();
    if (status !== "completed" && status !== "paid") {
      return c.json({ error: "Payment not completed", status }, 400);
    }

    const activated = await activateRushPassFromPaymentIntent(
      serviceSb,
      intent as Record<string, unknown>,
    );
    if ("error" in activated) return c.json({ error: activated.error }, 500);

    const active = await loadActiveRushPassMembership(serviceSb, customer.id);
    return c.json({ membership: active?.membership ?? { id: activated.membershipId }, ok: true });
  });

  // POST /customer/rush-pass/cancel
  app.post("/customer/rush-pass/cancel", async (c) => {
    const auth = await requireUser(c.req.header("Authorization"), getSupabase);
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const serviceSb = getServiceSupabase();
    const { customer, error } = await ensureCustomer(serviceSb, auth.user);
    if (error || !customer) return c.json({ error: error || "profile_unavailable" }, 500);

    const active = await loadActiveRushPassMembership(serviceSb, customer.id);
    if (!active) return c.json({ error: "No active membership" }, 404);

    const { data, error: updErr } = await serviceSb
      .from("rush_pass_memberships")
      .update({
        auto_renew: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", active.membership.id)
      .select("*")
      .single();

    if (updErr) return c.json({ error: updErr.message }, 500);
    return c.json({ membership: data, message: "Auto-renew turned off; benefits continue until period end" });
  });

  // POST /admin/rush-pass/grant
  app.post("/admin/rush-pass/grant", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const denied = requireDashWrite(admin as ProductAdminUser);
    if (denied) return denied;

    const body = await validateBody(c, z.object({
      customerId: z.string().min(1),
      planSlug: z.string().optional(),
      days: z.number().int().positive().optional(),
    }));
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    const plan = await loadActivePlan(serviceSb, body.planSlug);
    if (!plan) return c.json({ error: "Plan not found" }, 404);

    const days = body.days ?? Number(plan.billing_period_days ?? 30);
    const start = new Date();
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);

    const { data: created, error } = await serviceSb
      .from("rush_pass_memberships")
      .insert({
        customer_id: body.customerId,
        plan_id: plan.id,
        status: "active",
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
        source: "admin_grant",
        auto_renew: false,
      })
      .select("*")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ membership: created }, 201);
  });

  // POST /admin/rush-pass/revoke
  app.post("/admin/rush-pass/revoke", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const denied = requireDashWrite(admin as ProductAdminUser);
    if (denied) return denied;

    const body = await validateBody(c, z.object({
      membershipId: z.string().min(1),
      customerId: z.string().optional(),
    }));
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    let q = serviceSb
      .from("rush_pass_memberships")
      .update({
        status: "cancelled",
        auto_renew: false,
        current_period_end: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.membershipId);
    if (body.customerId) q = q.eq("customer_id", body.customerId);

    const { data, error } = await q.select("*").maybeSingle();
    if (error) return c.json({ error: error.message }, 500);
    if (!data) return c.json({ error: "Membership not found" }, 404);
    return c.json({ membership: data });
  });

  // GET /admin/rush-pass/memberships
  app.get("/admin/rush-pass/memberships", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;

    const status = c.req.query("status") || undefined;
    const serviceSb = getServiceSupabase();
    let q = serviceSb
      .from("rush_pass_memberships")
      .select("*, plan:rush_pass_plans(slug, name, price_jmd), customer:customers(id, name, email)")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ memberships: data ?? [] });
  });

  // GET /admin/rush-pass/plan — active standard plan
  app.get("/admin/rush-pass/plan", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const serviceSb = getServiceSupabase();
    const plan = await loadActivePlan(serviceSb);
    if (!plan) return c.json({ error: "Plan not found" }, 404);
    return c.json({ plan });
  });

  // PUT /admin/rush-pass/plan — edit price / caps (human-approved; no auto reprice)
  app.put("/admin/rush-pass/plan", async (c) => {
    const admin = await requireProductAdmin(c, "dash");
    if (admin instanceof Response) return admin;
    const denied = requireDashWrite(admin);
    if (denied) return denied;

    const body = await validateBody(c, z.object({
      price_jmd: z.number().positive().optional(),
      max_free_delivery_km: z.number().positive().optional(),
      monthly_subsidy_budget_jmd: z.number().positive().optional(),
      service_fee_multiplier: z.number().min(0).max(1).optional(),
      name: z.string().min(1).max(120).optional(),
    }));
    if (body instanceof Response) return body;

    const serviceSb = getServiceSupabase();
    const existing = await loadActivePlan(serviceSb);
    if (!existing) return c.json({ error: "Plan not found" }, 404);

    const nextPrice = body.price_jmd ?? Number(existing.price_jmd);
    const nextKm = body.max_free_delivery_km ?? Number(existing.max_free_delivery_km ?? 8);
    const nextBudget = body.monthly_subsidy_budget_jmd ??
      Number(existing.monthly_subsidy_budget_jmd ?? existing.price_jmd);
    const nextMult = body.service_fee_multiplier ?? Number(existing.service_fee_multiplier ?? 0.5);

    if (!(nextKm > 0)) {
      return c.json({
        error: "max_free_delivery_km must be > 0",
        code: "PASS_SUBSIDY_UNBOUNDED",
      }, 400);
    }
    if (!(nextBudget > 0)) {
      return c.json({
        error: "monthly_subsidy_budget_jmd must be > 0",
        code: "PASS_SUBSIDY_UNBOUNDED",
      }, 400);
    }
    if (!(nextPrice > 0)) {
      return c.json({ error: "price_jmd must be > 0" }, 400);
    }

    // Soft warn: price below trailing 30d avg cost per active member
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: passOrders } = await serviceSb
      .from("orders")
      .select("service_fee, pricing_snapshot, rush_pass_membership_id, placed_at")
      .not("status", "in", '("cancelled")')
      .gte("placed_at", since30);
    let cost30 = 0;
    for (const o of passOrders ?? []) {
      const row = o as Record<string, unknown>;
      const snap = (row.pricing_snapshot ?? {}) as Record<string, unknown>;
      const applied = row.rush_pass_membership_id != null ||
        snap.rush_pass_applied === true ||
        snap.rushPassApplied === true;
      if (!applied) continue;
      cost30 += Number(
        snap.platform_delivery_subsidy_jmd ??
          snap.platformDeliverySubsidyJmd ??
          snap.promo_cost_jmd ??
          snap.promoCostJmd ??
          0,
      );
      const sf = Number(row.service_fee ?? 0);
      const mult = Number(snap.service_fee_multiplier ?? snap.serviceFeeMultiplier ?? 0.5);
      if (mult > 0 && mult < 1) cost30 += sf * (1 / mult - 1);
    }
    const { count: activeCount } = await serviceSb
      .from("rush_pass_memberships")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("current_period_end", new Date().toISOString());
    const members = activeCount ?? 0;
    const avgPerMember = members > 0 ? cost30 / members : 0;
    const warnings: string[] = [];
    if (avgPerMember > 0 && nextPrice < avgPerMember) {
      warnings.push(
        `Proposed price J$${nextPrice} is below trailing 30d avg Pass cost per active member J$${Math.round(avgPerMember)}`,
      );
    }

    const patch: Record<string, unknown> = {
      price_jmd: nextPrice,
      max_free_delivery_km: nextKm,
      monthly_subsidy_budget_jmd: nextBudget,
      service_fee_multiplier: nextMult,
      updated_at: new Date().toISOString(),
    };
    if (body.name) patch.name = body.name;

    const { data: updated, error } = await serviceSb
      .from("rush_pass_plans")
      .update(patch)
      .eq("id", existing.id)
      .select()
      .single();

    if (error || !updated) {
      return c.json({ error: error?.message || "update_failed" }, 500);
    }

    await serviceSb.from("pricing_change_log").insert({
      scope: "rush_pass_plan",
      actor_id: (admin as ProductAdminUser).id,
      actor_email: (admin as ProductAdminUser).email,
      action: "rush_pass_plan_updated",
      before_state: existing,
      after_state: updated,
    });

    return c.json({ plan: updated, warnings });
  });
}
