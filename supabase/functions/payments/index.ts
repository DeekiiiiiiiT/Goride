/**
 * Payments Service - Roam Rush
 * Handles WiPay payment processing for Jamaica market (PayPal removed)
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyCors } from "../_shared/corsAllowlist.ts";
import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";
import { requireProductAdmin } from "../_shared/productAdmin.ts";
import { assertRateLimit } from "../_shared/rateLimit.ts";
import { getFlag } from "../_shared/featureFlags.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { validateBody, z } from "../_shared/validateBody.ts";

const PaymentIntentBody = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(["wipay"]).optional(),
  returnOrigin: z.string().url().optional(),
});

const app = new Hono().basePath("/payments");

applyCors(app);

function getSupabase(authHeader?: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    authHeader ? { global: { headers: { Authorization: authHeader } } } : {}
  );
}

function getServiceSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}

function wipayEnv(): string {
  return (Deno.env.get("WIPAY_ENV") ?? "sandbox").toLowerCase();
}

function isSandboxWipay(): boolean {
  const env = wipayEnv();
  return env !== "live" && env !== "production";
}

/** WiPay sandbox public test merchant — live must use real secrets. */
function wipayAccountNumber(): string | null {
  const fromEnv = Deno.env.get("WIPAY_ACCOUNT_NUMBER")?.trim();
  if (fromEnv) return fromEnv;
  return isSandboxWipay() ? "1234567890" : null;
}

function wipayApiKey(): string | null {
  const fromEnv = Deno.env.get("WIPAY_API_KEY")?.trim();
  if (fromEnv) return fromEnv;
  return isSandboxWipay() ? "123" : null;
}

/** Shared callback secret for WiPay webhooks (never trust unsigned callbacks). */
function wipayCallbackSecret(): string | null {
  const s = Deno.env.get("WIPAY_CALLBACK_SECRET");
  if (s?.trim()) return s.trim();
  return isSandboxWipay() ? "sandbox-wipay-callback" : null;
}

function isAllowedPayReturnOrigin(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    return (
      host === "roamrush.app" ||
      host.endsWith(".roamrush.app") ||
      host === "dash.roamja.com" ||
      host.endsWith(".roamja.com")
    );
  } catch {
    return false;
  }
}

function resolvePayReturnBase(originHeader: string | undefined, bodyOrigin?: string): string {
  if (bodyOrigin && isAllowedPayReturnOrigin(bodyOrigin)) {
    return new URL(bodyOrigin).origin;
  }
  if (originHeader && isAllowedPayReturnOrigin(originHeader)) {
    return new URL(originHeader).origin;
  }
  return Deno.env.get("APP_URL") ?? "https://roamrush.app";
}

function paymentsPublicUrl(): string {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/payments`;
}

function wipaySuccess(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return s === "success" || s === "successful" || s === "completed" || s === "paid" || s === "ok" || s === "approved" || s === "1" || s === "true";
}

function payloadString(payload: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function readWipayPayload(c: { req: { method: string; url: string; header: (n: string) => string | undefined; json: () => Promise<unknown>; parseBody: () => Promise<Record<string, unknown>> } }): Promise<Record<string, unknown>> {
  const url = new URL(c.req.url);
  const fromQuery: Record<string, unknown> = {};
  url.searchParams.forEach((value, key) => {
    if (key !== "secret") fromQuery[key] = value;
  });
  if (c.req.method === "GET" || c.req.method === "HEAD") return fromQuery;

  const contentType = c.req.header("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await c.req.json();
      if (json && typeof json === "object") return { ...fromQuery, ...(json as Record<string, unknown>) };
      return fromQuery;
    }
    const form = await c.req.parseBody();
    return { ...fromQuery, ...form };
  } catch {
    return fromQuery;
  }
}

async function findWipayIntent(
  serviceSupabase: ReturnType<typeof getServiceSupabase>,
  payload: Record<string, unknown>,
  orderIdHint?: string,
) {
  const transactionId = payloadString(payload, "transaction_id", "transactionId", "transactionid");
  if (transactionId) {
    const { data } = await serviceSupabase
      .schema("payments")
      .from("payment_intents")
      .select("*")
      .eq("provider_intent_id", transactionId)
      .maybeSingle();
    if (data) return data;
  }

  const orderRef = orderIdHint || payloadString(payload, "order_id", "orderId");
  if (!orderRef) return null;

  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderRef);
  let orderId = uuidLike ? orderRef : "";
  if (!orderId) {
    const { data: order } = await serviceSupabase
      .schema("delivery")
      .from("orders")
      .select("id")
      .eq("order_number", orderRef)
      .maybeSingle();
    orderId = String(order?.id ?? "");
  }
  if (!orderId) return null;

  const { data: intents } = await serviceSupabase
    .schema("payments")
    .from("payment_intents")
    .select("*")
    .eq("order_id", orderId)
    .eq("provider", "wipay")
    .order("created_at", { ascending: false })
    .limit(1);
  return intents?.[0] ?? null;
}

async function completeWipayIntent(
  serviceSupabase: ReturnType<typeof getServiceSupabase>,
  intent: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const pd = (intent.provider_data ?? {}) as Record<string, unknown>;
  const isRushPass = String(pd.purpose || "") === "rush_pass" || !intent.order_id;

  const alreadyPaid = String(intent.status) === "completed";
  if (!alreadyPaid) {
    await serviceSupabase
      .schema("payments")
      .from("payment_intents")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        provider_data: { ...(intent.provider_data as Record<string, unknown> | null ?? {}), callback: payload },
      })
      .eq("id", intent.id);
  }

  // Phase 3 Rush Pass — activate membership; skip order capture split
  if (isRushPass && String(pd.purpose || "") === "rush_pass") {
    const transactionId = payloadString(payload, "transaction_id", "transactionId", "transactionid")
      || String(intent.provider_intent_id ?? "");
    if (!alreadyPaid) {
      await serviceSupabase
        .schema("payments")
        .from("transactions")
        .insert({
          intent_id: intent.id,
          order_id: null,
          customer_id: intent.customer_id,
          amount: intent.amount,
          net_amount: intent.amount,
          currency: "JMD",
          status: "completed",
          provider: "wipay",
          provider_transaction_id: transactionId,
          provider_data: { ...payload, purpose: "rush_pass" },
          payment_method: "credit_card",
        });
    }

    try {
      const { activateRushPassFromPaymentIntent } = await import("../_shared/rushPassActivate.ts");
      const updatedIntent = {
        ...intent,
        status: "completed",
        provider_data: { ...pd, callback: payload },
      };
      const result = await activateRushPassFromPaymentIntent(serviceSupabase, updatedIntent);
      if ("error" in result) {
        console.error("[payments/wipay] rush pass activate failed:", result.error);
      }
      return result && "membershipId" in result ? String(result.membershipId) : "rush_pass";
    } catch (e) {
      console.error("[payments/wipay] rush pass activate error:", e);
      return "rush_pass";
    }
  }

  if (!intent.order_id) {
    return "";
  }

  if (!alreadyPaid) {
    const { data: order } = await serviceSupabase
      .schema("delivery")
      .from("orders")
      .select(
        "merchant_id, courier_id, platform_fee, service_fee, processing_fee, delivery_fee, tip, courier_tip_net, subtotal, discount, merchant_commission_amount, delivery_fee_platform_amount, delivery_fee_courier_amount, peak_pay_amount, tax_food_jmd, tax_platform_jmd, platform_delivery_subsidy_jmd, small_order_fee",
      )
      .eq("id", intent.order_id)
      .single();

    const { computeDashCaptureSplit } = await import("../_shared/dashMoneySplit.ts");
    const split = computeDashCaptureSplit(order || {}, Number(intent.amount));
    const transactionId = payloadString(payload, "transaction_id", "transactionId", "transactionid")
      || String(intent.provider_intent_id ?? "");

    const { data: txn } = await serviceSupabase
      .schema("payments")
      .from("transactions")
      .insert({
        intent_id: intent.id,
        order_id: intent.order_id,
        customer_id: intent.customer_id,
        amount: intent.amount,
        net_amount: split.merchantReceivable,
        currency: "JMD",
        status: "completed",
        provider: "wipay",
        provider_transaction_id: transactionId,
        provider_data: { ...payload, money_split: split },
        payment_method: "credit_card",
      })
      .select("id")
      .maybeSingle();

    if (txn?.id) {
      try {
        const { dualWriteDashPayment } = await import("../_shared/unifiedLedger/dualWriteDash.ts");
        await dualWriteDashPayment({
          transactionId: String(txn.id),
          orderId: String(intent.order_id),
          merchantId: split.merchantId,
          courierId: split.courierId,
          amount: split.merchantReceivable,
          currency: "JMD",
          kind: "order_capture",
          split,
        });
      } catch (e) {
        console.error("[payments/wipay] unified dual-write failed:", e);
      }
    }
  }

  // Keep kitchen status as placed — "confirmed" is not a valid orders.status.
  await serviceSupabase
    .schema("delivery")
    .from("orders")
    .update({ payment_status: "paid" })
    .eq("id", intent.order_id);

  return String(intent.order_id);
}

function verifyWipayCallbackSecret(c: { req: { header: (n: string) => string | undefined; url: string } }): boolean {
  const expected = wipayCallbackSecret();
  if (!expected) {
    console.error("[payments] WIPAY_CALLBACK_SECRET is not set — rejecting webhook");
    return false;
  }
  const fromHeader = c.req.header("X-WiPay-Callback-Secret") ?? "";
  let fromQuery = "";
  try {
    fromQuery = new URL(c.req.url).searchParams.get("secret") ?? "";
  } catch {
    fromQuery = "";
  }
  const provided = fromHeader || fromQuery;
  return Boolean(provided) && timingSafeEqual(provided, expected);
}

/** Resolve delivery customer row for an authenticated user. */
async function getCustomerForUser(userId: string) {
  const serviceSupabase = getServiceSupabase();
  const { data: customer } = await serviceSupabase
    .schema("delivery")
    .from("customers")
    .select("id, account_status")
    .eq("user_id", userId)
    .maybeSingle();
  return customer as { id: string; account_status?: string } | null;
}

/** Ensure the authenticated user owns the order (by customer_id). */
async function assertCustomerOwnsOrder(
  userId: string,
  orderId: string,
): Promise<
  | { ok: true; order: Record<string, unknown>; customerId: string }
  | { ok: false; status: number; error: string }
> {
  const customer = await getCustomerForUser(userId);
  if (!customer) return { ok: false, status: 403, error: "Forbidden" };
  if (String(customer.account_status || "active") === "suspended") {
    return { ok: false, status: 403, error: "Account suspended" };
  }

  const serviceSupabase = getServiceSupabase();
  const { data: order, error } = await serviceSupabase
    .schema("delivery")
    .from("orders")
    .select("*, merchant:merchant_id(*)")
    .eq("id", orderId)
    .single();

  if (error || !order) return { ok: false, status: 404, error: "Order not found" };
  if (String(order.customer_id) !== String(customer.id)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, order: order as Record<string, unknown>, customerId: String(customer.id) };
}

/** Jamaica Payments API host — https://docs.wipayfinancial.com/platforms-and-environments */
function wipayGatewayUrl(): string {
  if (isSandboxWipay()) {
    return "https://jmsb.wipayfinancial.com/plugins/payments/request";
  }
  return "https://jm.wipayfinancial.com/plugins/payments/request";
}

// Health check
app.get("/health", (c) => c.json({ service: "payments", status: "ok", providers: ["wipay"] }));

// ============================================================================
// Payment Intents
// ============================================================================

// Create a payment intent for an order
app.post("/intents", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  if (!(await getFlag("PAYMENTS_INTENTS_ENABLED", true))) {
    return c.json({ error: "payments_disabled" }, 503);
  }

  const limited = await assertRateLimit(c, `payments:intents:${user.id}`, {
    max: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;
  
  const body = await validateBody(c, PaymentIntentBody);
  if (body instanceof Response) return body;
  const { orderId, provider = "wipay", returnOrigin } = body;

  const owned = await assertCustomerOwnsOrder(user.id, orderId);
  if (!owned.ok) return c.json({ error: owned.error }, owned.status);
  const order = owned.order;
  const returnBase = resolvePayReturnBase(c.req.header("origin"), returnOrigin);
  
  const serviceSupabase = getServiceSupabase();
  
  // Reuse an existing pending (non-completed) payment intent for the same order/provider.
  // This prevents double-charges if the client double-taps "Place Order" or resumes mid-flow.
  const orderPaymentStatus = String(order.payment_status ?? "").toLowerCase();
  if (orderPaymentStatus === "paid") {
    return c.json({ error: "Order already paid" }, 409);
  }

  const nowIso = new Date().toISOString();
  const { data: existingIntent } = await serviceSupabase
    .schema("payments")
    .from("payment_intents")
    .select("*")
    .eq("order_id", orderId)
    .eq("customer_id", owned.customerId)
    .eq("provider", provider)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingIntent) {
    const intentStatus = String(existingIntent.status ?? "").toLowerCase();
    if (intentStatus === "completed" || intentStatus === "paid") {
      return c.json({ error: "Order already paid" }, 409);
    }

    return c.json({
      intentId: existingIntent.id,
      paymentRedirectUrl: existingIntent.client_secret,
      clientSecret: existingIntent.client_secret, // legacy alias
      provider: existingIntent.provider,
      amount: existingIntent.amount,
      currency: existingIntent.currency,
    }, 200);
  }

  let clientSecret = null;
  let providerIntentId = null;
  let providerData = {};
  
  if (provider === "wipay") {
    const wipayResult = await createWiPayIntent(order, returnBase, user.email ?? "");
    if (wipayResult.error) {
      return c.json({ error: wipayResult.error }, 500);
    }
    clientSecret = wipayResult.paymentUrl;
    providerIntentId = wipayResult.transactionId;
    providerData = wipayResult;
  } else {
    return c.json({ error: "Unsupported payment provider" }, 400);
  }
  
  const { data: intent, error } = await serviceSupabase
    .schema("payments")
    .from("payment_intents")
    .insert({
      order_id: orderId,
      customer_id: owned.customerId,
      amount: order.total,
      currency: "JMD",
      provider,
      provider_intent_id: providerIntentId,
      provider_data: providerData,
      client_secret: clientSecret,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
    })
    .select()
    .single();
  
  if (error) return c.json({ error: error.message }, 500);
  
  return c.json({ 
    intentId: intent.id,
    paymentRedirectUrl: intent.client_secret,
    clientSecret: intent.client_secret, // legacy alias
    provider,
    amount: intent.amount,
    currency: intent.currency
  }, 201);
});

// ============================================================================
// WiPay Integration
// ============================================================================

async function createWiPayIntent(order: any, returnBase: string, customerEmail: string) {
  const accountNumber = wipayAccountNumber();
  const apiKey = wipayApiKey();
  
  if (!accountNumber || !apiKey) {
    return { error: "WiPay not configured" };
  }
  
  const callbackSecret = wipayCallbackSecret();
  if (!callbackSecret) {
    return { error: "WiPay callback secret not configured — set WIPAY_CALLBACK_SECRET" };
  }
  const responseUrl = new URL(`${paymentsPublicUrl()}/webhooks/wipay`);
  responseUrl.searchParams.set("secret", callbackSecret);
  const customerReturn = `${returnBase}/payment/callback/wipay`;
  const orderRef = String(order.order_number || order.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
  const accountValue = /^\d+$/.test(accountNumber) ? Number(accountNumber) : accountNumber;

  try {
    const response = await fetchWithTimeout(wipayGatewayUrl(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_number: accountValue,
        avs: "0",
        country_code: "JM",
        currency: "JMD",
        data: JSON.stringify({ orderId: order.id, returnBase }),
        email: customerEmail || "customer@roamrush.app",
        environment: isSandboxWipay() ? "sandbox" : "live",
        fee_structure: "merchant_pay",
        method: "credit_card_co",
        order_id: orderRef || "order",
        origin: "RoamRush",
        response_url: responseUrl.toString(),
        return_url: customerReturn,
        total: Number(order.total).toFixed(2),
      }),
      timeoutMs: 15000,
    });

    const raw = await response.text();
    let result: { url?: string; message?: string; transaction_id?: string } = {};
    try {
      result = JSON.parse(raw) as { url?: string; message?: string; transaction_id?: string };
    } catch {
      console.error("WiPay non-JSON response:", raw.slice(0, 300));
      return { error: "Failed to create WiPay payment" };
    }

    const checkoutUrl = String(result.url || "");
    if (!checkoutUrl || checkoutUrl.includes("status=error")) {
      return { error: result.message || "WiPay error" };
    }
    return {
      paymentUrl: checkoutUrl,
      transactionId: result.transaction_id,
      returnBase,
      raw: result,
    };
  } catch (err) {
    console.error("WiPay error:", err);
    return { error: "Failed to create WiPay payment" };
  }
}

// WiPay webhook — no user JWT; verified with WIPAY_CALLBACK_SECRET.
app.all("/webhooks/wipay", async (c) => {
  if (!verifyWipayCallbackSecret(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const payload = await readWipayPayload(c);
  const serviceSupabase = getServiceSupabase();
  const intent = await findWipayIntent(serviceSupabase, payload);
  if (!intent) {
    return c.json({ error: "Intent not found" }, 404);
  }

  const success = wipaySuccess(payload.status ?? payload.payment_status);
  let orderId = String(intent.order_id);
  if (success) {
    orderId = await completeWipayIntent(serviceSupabase, intent as Record<string, unknown>, payload);
  } else {
    await serviceSupabase
      .schema("payments")
      .from("payment_intents")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        provider_data: { ...(intent.provider_data as Record<string, unknown> | null ?? {}), callback: payload },
      })
      .eq("id", intent.id);
  }

  const providerData = (intent.provider_data ?? {}) as { returnBase?: string; purpose?: string };
  const returnBase = isAllowedPayReturnOrigin(String(providerData.returnBase ?? ""))
    ? String(providerData.returnBase)
    : (Deno.env.get("APP_URL") ?? "https://roamrush.app");
  const isPass = String(providerData.purpose || "") === "rush_pass";
  const customerReturn = isPass
    ? `${returnBase}/payment/callback/wipay?status=${success ? "success" : "failed"}&purpose=rush_pass`
    : `${returnBase}/payment/callback/wipay?status=${success ? "success" : "failed"}&order_id=${encodeURIComponent(orderId)}`;

  const accept = c.req.header("accept") ?? "";
  const contentType = c.req.header("content-type") ?? "";
  const wantsJson = contentType.includes("application/json") && !accept.includes("text/html");
  if (wantsJson || c.req.header("x-wipay-no-redirect") === "1") {
    return c.json({ received: true, success, orderId });
  }
  return c.redirect(customerReturn, 302);
});

const WipayCompleteBody = z.object({
  orderId: z.string().min(1),
  transactionId: z.string().optional(),
  status: z.string().optional(),
});

// Customer return from WiPay hosted page — marks the order paid so the kitchen can see it.
app.post("/wipay/complete", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await validateBody(c, WipayCompleteBody);
  if (body instanceof Response) return body;

  const serviceSupabase = getServiceSupabase();
  const payload = {
    order_id: body.orderId,
    transaction_id: body.transactionId,
    status: body.status,
  };
  const intent = await findWipayIntent(serviceSupabase, payload, body.orderId);
  if (!intent) return c.json({ error: "Payment not found" }, 404);

  const owned = await assertCustomerOwnsOrder(user.id, String(intent.order_id));
  if (!owned.ok) return c.json({ error: owned.error }, owned.status);

  if (!wipaySuccess(body.status) && String(intent.status) !== "completed") {
    return c.json({ error: "Payment not completed" }, 400);
  }

  const orderId = await completeWipayIntent(
    serviceSupabase,
    intent as Record<string, unknown>,
    { ...payload, status: body.status ?? "success" },
  );
  return c.json({ success: true, orderId });
});

// ============================================================================
// Refunds
// ============================================================================

app.post("/refunds", async (c) => {
  const admin = await requireProductAdmin(c, "dash");
  if (admin instanceof Response) return admin;

  // Align with Dash write bar — dash_ops cannot move money
  const DASH_REFUND_ROLES = new Set([
    "dash_admin",
    "platform_owner",
    "platform_support",
    "superadmin",
  ]);
  if (!admin.roles.some((r) => DASH_REFUND_ROLES.has(r))) {
    return c.json({
      error: "forbidden",
      message: "dash_admin or platform role required for refunds",
    }, 403);
  }

  const limited = await assertRateLimit(c, `payments:refunds:${admin.id}`, {
    max: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;
  
  const body = await c.req.json();
  const { transactionId, amount, reason } = body;
  
  const serviceSupabase = getServiceSupabase();
  
  const { data: transaction } = await serviceSupabase
    .schema("payments")
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();
  
  if (!transaction) {
    return c.json({ error: "Transaction not found" }, 404);
  }

  // Get merchant_id from order
  const { data: order } = await serviceSupabase
    .schema("delivery")
    .from("orders")
    .select("merchant_id, total, payment_status")
    .eq("id", transaction.order_id)
    .single();
  
  const refundAmount = amount || transaction.amount;
  
  const { data: refund, error } = await serviceSupabase
    .schema("payments")
    .from("refunds")
    .insert({
      transaction_id: transactionId,
      order_id: transaction.order_id,
      amount: refundAmount,
      currency: transaction.currency,
      reason,
      status: "pending",
      initiated_by: admin.id,
    })
    .select()
    .single();
  
  if (error) return c.json({ error: error.message }, 500);

  // Dual-write refund to unified ledger
  if (refund?.id) {
    try {
      const { dualWriteDashPayment } = await import("../_shared/unifiedLedger/dualWriteDash.ts");
      await dualWriteDashPayment({
        transactionId: `refund:${refund.id}`,
        orderId: String(transaction.order_id),
        merchantId: order?.merchant_id ? String(order.merchant_id) : null,
        amount: refundAmount,
        currency: transaction.currency,
        kind: "order_refund",
      });
    } catch (e) {
      console.error("[payments/refund] unified dual-write failed:", e);
    }
  }
  
  // Process refund with payment provider when configured
  let providerRefundId: string | null = null;
  let refundStatus = "pending";
  const provider = String(transaction.provider || "").toLowerCase();

  try {
    if (provider === "paypal") {
      return c.json({
        error: "PayPal is no longer supported — refund historical PayPal captures manually",
        refund,
      }, 502);
    } else if (provider === "wipay") {
      // WiPay refund API varies by account — fail closed until WIPAY_REFUND_URL is set
      const refundUrl = Deno.env.get("WIPAY_REFUND_URL");
      const apiKey = Deno.env.get("WIPAY_API_KEY");
      if (!refundUrl || !apiKey) {
        return c.json({
          error: "WiPay refund not configured (set WIPAY_REFUND_URL + WIPAY_API_KEY)",
          refund,
        }, 502);
      }
      const wipayRes = await fetch(refundUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transaction_id: transaction.provider_transaction_id,
          amount: refundAmount,
          reason,
        }),
      });
      const wipayJson = await wipayRes.json().catch(() => ({}));
      if (!wipayRes.ok) {
        return c.json({ error: "WiPay refund failed", details: wipayJson, refund }, 502);
      }
      providerRefundId = String(wipayJson.id || wipayJson.refund_id || "");
      refundStatus = "completed";
    } else {
      return c.json({
        error: `Refund provider '${provider || "unknown"}' not supported`,
        refund,
      }, 400);
    }

    const { data: updated } = await serviceSupabase
      .schema("payments")
      .from("refunds")
      .update({
        status: refundStatus,
        provider_refund_id: providerRefundId,
        completed_at: new Date().toISOString(),
      })
      .eq("id", refund.id)
      .select()
      .single();

    // Sync delivery order payment_status when provider completes
    if (refundStatus === "completed" && transaction.order_id) {
      const paidAmt = Number(transaction.amount) || 0;
      const { data: allRefunds } = await serviceSupabase
        .schema("payments")
        .from("refunds")
        .select("amount, status")
        .eq("order_id", transaction.order_id)
        .in("status", ["pending", "completed"]);
      const refundedSum = (allRefunds || []).reduce(
        (s, r) => s + Number((r as { amount?: number }).amount || 0),
        0,
      );
      const nextStatus = refundedSum >= paidAmt - 0.001 ? "refunded" : "partially_refunded";
      await serviceSupabase
        .schema("delivery")
        .from("orders")
        .update({ payment_status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", transaction.order_id);
    }

    return c.json({ refund: updated || refund }, 201);
  } catch (e) {
    console.error("[payments/refund] provider error:", e);
    return c.json({
      error: e instanceof Error ? e.message : "Refund provider error",
      refund,
    }, 502);
  }
});

// ============================================================================
// Merchant Payouts (Roam Partner settlements)
// ============================================================================

app.post("/payouts/merchant", async (c) => {
  return c.json(
    {
      error: "deprecated",
      message:
        "Use POST /delivery/admin/finance/payouts. payments.merchant_payouts exists; this duplicate route is retired.",
    },
    410,
  );
});

// ============================================================================
// Courier Payouts — DEPRECATED (use /delivery/courier/payouts/close-period)
// ============================================================================

app.post("/payouts/courier", async (c) => {
  return c.json(
    {
      error: "deprecated",
      message:
        "Use POST /delivery/courier/payouts/close-period. payments.courier_payouts exists; this duplicate route is retired.",
    },
    410,
  );
});

/* LEGACY payout bodies removed — see git history if needed.
app.post("/payouts/merchant_LEGACY_REMOVED", async () => {});
app.post("/payouts/courier_LEGACY_REMOVED", async () => {});
*/
// ============================================================================
// Customer Payment Methods
// ============================================================================

app.get("/methods", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const serviceSupabase = getServiceSupabase();
  
  const { data: customer } = await serviceSupabase
    .schema("delivery")
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .single();
  
  if (!customer) {
    return c.json({ methods: [] });
  }
  
  const { data: methods } = await serviceSupabase
    .schema("payments")
    .from("customer_payment_methods")
    .select("id, type, last4, brand, exp_month, exp_year, is_default, provider")
    .eq("customer_id", customer.id)
    .eq("is_active", true);
  
  return c.json({ methods: methods || [] });
});

/**
 * Store tokenized card metadata only.
 * Requires provider_token from WiPay (or other processor) — never accepts raw PAN.
 * Production card vault needs real WiPay tokenization before customers can save cards.
 */
const SaveMethodBody = z.object({
  providerToken: z.string().min(8).max(512),
  provider: z.enum(["wipay"]).default("wipay"),
  type: z.enum(["card"]).default("card"),
  last4: z.string().regex(/^\d{4}$/),
  brand: z.string().min(1).max(32),
  expMonth: z.coerce.number().int().min(1).max(12),
  expYear: z.coerce.number().int().min(2024).max(2100),
  isDefault: z.boolean().optional(),
});

app.post("/methods", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const limited = await assertRateLimit(c, `payments:methods:${user.id}`, {
    max: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = await validateBody(c, SaveMethodBody);
  if (body instanceof Response) return body;

  // Reject anything that looks like a full PAN was pasted into token field
  if (/^\d{12,19}$/.test(body.providerToken.replace(/\s/g, ""))) {
    return c.json({
      error: "Raw card numbers are not accepted. Use a processor provider_token from WiPay tokenization.",
    }, 400);
  }

  const serviceSupabase = getServiceSupabase();
  let { data: customer } = await serviceSupabase
    .schema("delivery")
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!customer) {
    const { data: created, error: createErr } = await serviceSupabase
      .schema("delivery")
      .from("customers")
      .insert({
        user_id: user.id,
        name: user.email?.split("@")[0] || "Customer",
        email: user.email,
      })
      .select("id")
      .single();
    if (createErr || !created) {
      return c.json({ error: createErr?.message || "Failed to create customer" }, 500);
    }
    customer = created;
  }

  if (body.isDefault) {
    await serviceSupabase
      .schema("payments")
      .from("customer_payment_methods")
      .update({ is_default: false })
      .eq("customer_id", customer.id);
  }

  const { data: method, error } = await serviceSupabase
    .schema("payments")
    .from("customer_payment_methods")
    .insert({
      customer_id: customer.id,
      provider: body.provider,
      provider_method_id: body.providerToken,
      type: body.type,
      last4: body.last4,
      brand: body.brand,
      exp_month: body.expMonth,
      exp_year: body.expYear,
      is_default: body.isDefault ?? false,
      is_active: true,
    })
    .select("id, type, last4, brand, exp_month, exp_year, is_default, provider")
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({
    method,
    note: "Stored tokenized metadata only. Real WiPay tokenization is required for production card saving.",
  }, 201);
});

// ============================================================================
// Transaction History
// ============================================================================

app.get("/transactions", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const serviceSupabase = getServiceSupabase();
  
  const { data: customer } = await serviceSupabase
    .schema("delivery")
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .single();
  
  if (!customer) {
    return c.json({ transactions: [] });
  }
  
  const { data: transactions } = await serviceSupabase
    .schema("payments")
    .from("transactions")
    .select("*")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(50);
  
  return c.json({ transactions: transactions || [] });
});

Deno.serve(app.fetch);
