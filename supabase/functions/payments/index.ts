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
import { isWipayDemoMode } from "../_shared/wipayDemo.ts";
import { wipayAmountMatches, wipayCurrencyOk, wipayStatusAccepted } from "../_shared/rushMoney/wipayContract.ts";
import { queueAndExecuteRefund } from "../_shared/rushMoney/executeRefund.ts";
import { captureLines, walletDebtPayLines } from "../_shared/rushMoney/journalLines.ts";
import { loadCustomerWallet } from "../_shared/rushMoney/customerWallet.ts";

const PaymentIntentBody = z.object({
  orderId: z.string().uuid(),
  provider: z.enum(["wipay"]).optional(),
  returnOrigin: z.string().url().optional(),
});

const WalletDebtBody = z.object({
  returnOrigin: z.string().url().optional(),
});

const WipayCompleteBody = z.object({
  orderId: z.string().min(1).optional(),
  intentId: z.string().uuid().optional(),
  transactionId: z.string().optional(),
  /** Ignored for money-marking - client status is not trusted (Finding K). */
  status: z.string().optional(),
}).refine((value) => Boolean(value.orderId || value.intentId), { message: "Order or payment is required" });

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

/** WiPay sandbox public test merchant - live must use real secrets. */
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
  return wipayStatusAccepted(status);
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

async function completeWalletDebt(
  serviceSupabase: ReturnType<typeof getServiceSupabase>,
  intent: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<string> {
  const customerId = String(intent.customer_id || "");
  const amount = Number(intent.amount);
  if (!customerId || !Number.isFinite(amount) || amount <= 0) return "";
  const transactionId = payloadString(payload, "transaction_id", "transactionId", "transactionid")
    || String(intent.provider_intent_id ?? "");
  const reportedAmount = payloadString(payload, "total", "amount");
  const reportedCurrency = payloadString(payload, "currency") || "JMD";
  const amountMismatch = !isWipayDemoMode() && reportedAmount && !wipayAmountMatches(amount, reportedAmount);
  const currencyMismatch = !wipayCurrencyOk(reportedCurrency);
  if (amountMismatch || currencyMismatch) {
    await serviceSupabase.schema("payments").from("payment_intents").update({
      status: "review",
      provider_data: { ...(intent.provider_data as Record<string, unknown> | null ?? {}), callback: payload, review: amountMismatch ? "amount_mismatch" : "currency_mismatch" },
    }).eq("id", intent.id);
    return "";
  }
  const { data: completion, error: completionError } = await serviceSupabase.schema("payments").rpc(
    "complete_payment_intent",
    {
      p_intent_id: intent.id,
      p_provider: "wipay",
      p_provider_transaction_id: transactionId,
      p_amount: amount,
      p_currency: "JMD",
      p_net_amount: amount,
      p_provider_data: { ...payload, purpose: "wallet_debt" },
    },
  );
  if (completionError) {
    console.error("[payments/wipay] wallet debt complete", completionError.message);
    return "";
  }
  const result = (completion ?? {}) as { action?: string };
  if (result.action === "replay") {
    const { data: fresh } = await serviceSupabase.schema("payments").from("payment_intents")
      .select("status")
      .eq("id", intent.id)
      .maybeSingle();
    if (String(fresh?.status || "") === "superseded") return "";
  }
  if (result.action !== "captured" && result.action !== "replay") return "";
  const { error: journalError } = await serviceSupabase.rpc("rush_post_journal", {
    p_idempotency_key: `wallet-pay:${intent.id}`,
    p_event_type: "wallet_payment",
    p_order_id: null,
    p_correlation_id: intent.id,
    p_lines: walletDebtPayLines(customerId, amount),
    p_actor_type: "system",
    p_reason: "Balance paid",
    p_evidence: {},
    p_policy_version: null,
  });
  if (journalError) {
    console.error("[payments/wipay] wallet debt journal", journalError.message);
    return "";
  }
  return "wallet_debt";
}

async function completeWipayIntent(
  serviceSupabase: ReturnType<typeof getServiceSupabase>,
  intent: Record<string, unknown>,
  payload: Record<string, unknown>,
) {
  const pd = (intent.provider_data ?? {}) as Record<string, unknown>;
  if (String(pd.purpose || "") === "wallet_debt") {
    return completeWalletDebt(serviceSupabase, intent, payload);
  }
  const isRushPass = String(pd.purpose || "") === "rush_pass" || !intent.order_id;

  const alreadyPaid = String(intent.status) === "completed";
  const isOrderCapture = Boolean(intent.order_id) && String(pd.purpose || "") !== "rush_pass";
  if (!alreadyPaid && !isOrderCapture) {
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

  // Phase 3 Rush Pass - activate membership; skip order capture split
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
    const reportedAmount = payloadString(payload, "total", "amount");
    const reportedCurrency = payloadString(payload, "currency") || "JMD";
    const amountMismatch = !isWipayDemoMode() && reportedAmount && !wipayAmountMatches(Number(intent.amount), reportedAmount);
    const currencyMismatch = !wipayCurrencyOk(reportedCurrency);
    const { data: priorCapture } = await serviceSupabase.schema("payments").from("transactions")
      .select("id")
      .eq("order_id", intent.order_id)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    if (priorCapture?.id) {
      const { data: extra } = await serviceSupabase.schema("payments").from("transactions").insert({
        intent_id: intent.id,
        order_id: intent.order_id,
        amount: Number(intent.amount),
        currency: "JMD",
        status: "duplicate_superseded",
        provider: "wipay",
        provider_transaction_id: transactionId || `extra:${intent.id}`,
        failure_reason: "second_capture",
      }).select("id").maybeSingle();
      if (extra?.id) {
        await serviceSupabase.schema("payments").from("refunds").insert({
          transaction_id: extra.id,
          order_id: intent.order_id,
          amount: Number(intent.amount),
          currency: "JMD",
          reason: "Duplicate capture refund",
          status: "pending",
          idempotency_key: `dup-capture:${extra.id}`,
        });
      }
      return "";
    }

    if (amountMismatch || currencyMismatch) {
      await serviceSupabase.schema("payments").from("payment_intents").update({
        status: "review",
        provider_data: { ...(intent.provider_data as Record<string, unknown> | null ?? {}), callback: payload, review: amountMismatch ? "amount_mismatch" : "currency_mismatch" },
      }).eq("id", intent.id);
      await serviceSupabase.schema("rush_money").from("recon_exceptions").upsert({
        source: "wipay",
        reference: String(intent.id),
        detail: amountMismatch ? "Amount did not match the payment" : "Currency did not match the payment",
      }, { onConflict: "source,reference" });
      return "";
    }

    const { data: completion, error: completionError } = await serviceSupabase.schema("payments").rpc(
      "complete_payment_intent",
      {
        p_intent_id: intent.id,
        p_provider: "wipay",
        p_provider_transaction_id: transactionId,
        p_amount: Number(intent.amount),
        p_currency: "JMD",
        p_net_amount: split.merchantReceivable,
        p_provider_data: { ...payload, money_split: split },
      },
    );
    if (completionError) {
      console.error("[payments/wipay] complete_payment_intent", completionError.message);
      return "";
    }
    const result = (completion ?? {}) as { action?: string; transaction_id?: string; refund_id?: string };
    if (result.action === "captured" && result.transaction_id) {
      try {
        await serviceSupabase.rpc("rush_post_journal", {
          p_idempotency_key: `capture:${result.transaction_id}`,
          p_event_type: "capture",
          p_order_id: intent.order_id,
          p_correlation_id: result.transaction_id,
          p_lines: captureLines(String(intent.order_id), Number(intent.amount)),
          p_actor_type: "system",
          p_reason: "Card captured",
          p_evidence: {},
          p_policy_version: null,
        });
        await serviceSupabase.rpc("rush_transition_money_state", {
          p_order_id: intent.order_id,
          p_to: "captured",
        });
      } catch (e) {
        console.error("[payments/wipay] capture journal", e);
      }
    }
    if ((result.action === "duplicate_refund_required" || result.action === "late_capture_refund_required") && result.refund_id) {
      const { executeRefundById } = await import("../_shared/rushMoney/executeRefund.ts");
      await executeRefundById(String(result.refund_id));
    }
  }

  return String(intent.order_id);
}

function verifyWipayCallbackSecret(c: { req: { header: (n: string) => string | undefined; url: string } }): boolean {
  const expected = wipayCallbackSecret();
  if (!expected) {
    console.error("[payments] WIPAY_CALLBACK_SECRET is not set - rejecting webhook");
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

/** Jamaica Payments API host - https://docs.wipayfinancial.com/platforms-and-environments */
function wipayGatewayUrl(): string {
  if (isSandboxWipay()) {
    return "https://jmsb.wipayfinancial.com/plugins/payments/request";
  }
  return "https://jm.wipayfinancial.com/plugins/payments/request";
}

// Health check
app.get("/health", (c) => c.json({ service: "payments", status: "ok", providers: ["wipay"] }));

app.post("/wallet-debt", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (!(await getFlag("PAYMENTS_INTENTS_ENABLED", true))) {
    return c.json({ error: "payments_disabled" }, 503);
  }
  const limited = await assertRateLimit(c, `payments:wallet-debt:${user.id}`, { max: 10, windowMs: 60_000 });
  if (limited) return limited;
  const body = await validateBody(c, WalletDebtBody);
  if (body instanceof Response) return body;
  const customer = await getCustomerForUser(user.id);
  if (!customer) return c.json({ error: "Forbidden" }, 403);
  if (String(customer.account_status || "active") === "suspended") {
    return c.json({ error: "Account suspended" }, 403);
  }
  const serviceSupabase = getServiceSupabase();
  const wallet = await loadCustomerWallet(serviceSupabase, customer.id);
  const owed = Math.round(Math.max(0, wallet.balanceMajor) * 100) / 100;
  if (owed <= 0) return c.json({ error: "Nothing to pay" }, 409);
  const returnBase = resolvePayReturnBase(c.req.header("origin"), body.returnOrigin);
  const nowIso = new Date().toISOString();
  const { data: openIntents } = await serviceSupabase.schema("payments").from("payment_intents")
    .select("*")
    .eq("customer_id", customer.id)
    .is("order_id", null)
    .eq("provider", "wipay")
    .in("status", ["pending", "created"])
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });
  const reusable = (openIntents || []).find((row) => {
    const purpose = String((row.provider_data as { purpose?: string } | null)?.purpose || "");
    return purpose === "wallet_debt" && Math.abs(Number(row.amount) - owed) < 0.001;
  });
  if (reusable) {
    if (isWipayDemoMode()) {
      const done = await completeWipayIntent(serviceSupabase, reusable as Record<string, unknown>, {
        status: "success",
        transaction_id: String(reusable.provider_intent_id || `DEMO-BAL-${reusable.id}`),
        demo: true,
      });
      if (!done) return c.json({ error: "Could not record the payment" }, 500);
      return c.json({ intentId: reusable.id, demoPaid: true, purpose: "wallet_debt", amount: reusable.amount, currency: "JMD" });
    }
    return c.json({
      intentId: reusable.id,
      paymentRedirectUrl: reusable.client_secret,
      amount: reusable.amount,
      currency: reusable.currency,
      purpose: "wallet_debt",
    });
  }
  for (const row of openIntents || []) {
    const purpose = String((row.provider_data as { purpose?: string } | null)?.purpose || "");
    if (purpose === "wallet_debt") {
      await serviceSupabase.schema("payments").from("payment_intents").update({ status: "expired" }).eq("id", row.id);
    }
  }
  const charge = {
    id: customer.id,
    order_number: `BAL${customer.id.replace(/-/g, "").slice(0, 12)}`,
    total: owed,
    purpose: "wallet_debt",
  };
  let clientSecret: string | null = null;
  let providerIntentId: string | null = null;
  let providerData: Record<string, unknown> = { purpose: "wallet_debt", returnBase, customer_id: customer.id };
  if (isWipayDemoMode()) {
    providerIntentId = `DEMO-BAL-${customer.id.slice(0, 8)}-${Date.now()}`;
    clientSecret = `demo://${providerIntentId}`;
    providerData = { ...providerData, demo: true, mode: "wipay_demo" };
  } else {
    const wipayResult = await createWiPayIntent(charge, returnBase, user.email ?? "");
    if (wipayResult.error) return c.json({ error: wipayResult.error }, 500);
    clientSecret = wipayResult.paymentUrl ?? null;
    providerIntentId = wipayResult.transactionId ?? null;
    providerData = { ...providerData, ...wipayResult, purpose: "wallet_debt", returnBase };
  }
  const { data: intent, error } = await serviceSupabase.schema("payments").from("payment_intents").insert({
    order_id: null,
    customer_id: customer.id,
    amount: owed,
    currency: "JMD",
    provider: "wipay",
    provider_intent_id: providerIntentId,
    provider_data: providerData,
    client_secret: clientSecret,
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  }).select().single();
  if (error || !intent) return c.json({ error: error?.message || "Could not start the payment" }, 500);
  if (isWipayDemoMode()) {
    const done = await completeWipayIntent(serviceSupabase, intent as Record<string, unknown>, {
      status: "success",
      transaction_id: String(providerIntentId),
      demo: true,
    });
    if (!done) return c.json({ error: "Could not record the payment" }, 500);
    return c.json({ intentId: intent.id, demoPaid: true, purpose: "wallet_debt", amount: intent.amount, currency: "JMD" }, 201);
  }
  return c.json({
    intentId: intent.id,
    paymentRedirectUrl: intent.client_secret,
    amount: intent.amount,
    currency: intent.currency,
    purpose: "wallet_debt",
  }, 201);
});

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

    // Sandbox demo: finish pending intents without WiPay hosted checkout
    if (provider === "wipay" && isWipayDemoMode()) {
      const demoTxn =
        String(existingIntent.provider_intent_id ?? "") ||
        `DEMO-${String(order.order_number || orderId).slice(0, 24)}-${Date.now()}`;
      await completeWipayIntent(serviceSupabase, existingIntent as Record<string, unknown>, {
        status: "success",
        transaction_id: demoTxn,
        demo: true,
        message: "WIPAY_DEMO auto-capture",
      });
      return c.json({
        intentId: existingIntent.id,
        demoPaid: true,
        orderId,
        provider: existingIntent.provider,
        amount: existingIntent.amount,
        currency: existingIntent.currency,
      }, 200);
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
  let providerData: Record<string, unknown> = {};
  
  if (provider === "wipay") {
    if (isWipayDemoMode()) {
      const demoTxn = `DEMO-${String(order.order_number || orderId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}-${Date.now()}`;
      providerIntentId = demoTxn;
      clientSecret = `demo://${demoTxn}`;
      providerData = { demo: true, mode: "wipay_demo" };
    } else {
      const wipayResult = await createWiPayIntent(order, returnBase, user.email ?? "");
      if (wipayResult.error) {
        return c.json({ error: wipayResult.error }, 500);
      }
      clientSecret = wipayResult.paymentUrl;
      providerIntentId = wipayResult.transactionId;
      providerData = wipayResult as Record<string, unknown>;
    }
  } else {
    return c.json({ error: "Unsupported payment provider" }, 400);
  }
  
  await serviceSupabase
    .schema("payments")
    .from("payment_intents")
    .update({ status: "expired" })
    .eq("order_id", orderId)
    .eq("provider", provider)
    .in("status", ["pending", "created"]);

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

  if (provider === "wipay" && isWipayDemoMode()) {
    await completeWipayIntent(serviceSupabase, intent as Record<string, unknown>, {
      status: "success",
      transaction_id: String(providerIntentId ?? intent.id),
      demo: true,
      message: "WIPAY_DEMO auto-capture",
    });
    return c.json({
      intentId: intent.id,
      demoPaid: true,
      orderId,
      provider,
      amount: intent.amount,
      currency: intent.currency,
    }, 201);
  }
  
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
    return { error: "WiPay callback secret not configured. Set WIPAY_CALLBACK_SECRET" };
  }
  if (!isWipayDemoMode() && !isSandboxWipay() && !Deno.env.get("WIPAY_STATUS_URL")) {
    return { error: "Card checkout is paused until payment confirmation is configured" };
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
        data: JSON.stringify({ orderId: order.id, returnBase, purpose: order.purpose || "order" }),
        email: customerEmail || "customer@roamrush.app",
        environment: isSandboxWipay() ? "sandbox" : "live",
        fee_structure: "merchant_absorb",
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

// WiPay webhook - no user JWT; verified with WIPAY_CALLBACK_SECRET.
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

  const success = wipaySuccess(payload.status);
  if (success && !isWipayDemoMode() && !isSandboxWipay()) {
    const statusUrl = Deno.env.get("WIPAY_STATUS_URL");
    if (!statusUrl) {
      console.error("[payments/wipay] live capture refused: WIPAY_STATUS_URL is not set");
      return c.json({ error: "provider_status_unconfirmed" }, 409);
    }
    const transactionId = payloadString(payload, "transaction_id", "transactionId", "transactionid");
    const confirmed = await fetch(statusUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${wipayApiKey() ?? ""}` },
      body: JSON.stringify({ transaction_id: transactionId }),
    }).then(async (res) => {
      const body = await res.json().catch(() => ({})) as { status?: string };
      return res.ok && wipayStatusAccepted(body.status);
    }).catch(() => false);
    if (!confirmed) return c.json({ error: "provider_status_unconfirmed" }, 409);
  }
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
  const purpose = String(providerData.purpose || "");
  const customerReturn = purpose === "rush_pass"
    ? `${returnBase}/payment/callback/wipay?status=${success ? "success" : "failed"}&purpose=rush_pass`
    : purpose === "wallet_debt"
    ? `${returnBase}/payment/callback/wipay?status=${success ? "success" : "failed"}&purpose=wallet_debt&intent_id=${encodeURIComponent(String(intent.id))}`
    : `${returnBase}/payment/callback/wipay?status=${success ? "success" : "failed"}&order_id=${encodeURIComponent(orderId)}`;

  const accept = c.req.header("accept") ?? "";
  const contentType = c.req.header("content-type") ?? "";
  const wantsJson = contentType.includes("application/json") && !accept.includes("text/html");
  if (wantsJson || c.req.header("x-wipay-no-redirect") === "1") {
    return c.json({ received: true, success, orderId });
  }
  return c.redirect(customerReturn, 302);
});

/**
 * Customer return from WiPay hosted page - poll-only.
 * Only the secret-verified webhook may mark an intent completed.
 * This endpoint reports whether the webhook (or prior path) already completed payment.
 */
app.post("/wipay/complete", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await validateBody(c, WipayCompleteBody);
  if (body instanceof Response) return body;

  const serviceSupabase = getServiceSupabase();
  if (body.intentId) {
    const { data: debtIntent } = await serviceSupabase.schema("payments").from("payment_intents")
      .select("*")
      .eq("id", body.intentId)
      .maybeSingle();
    const debtPurpose = String((debtIntent?.provider_data as { purpose?: string } | null)?.purpose || "");
    if (!debtIntent || debtPurpose !== "wallet_debt") {
      return c.json({ error: "Payment not found" }, 404);
    }
    const customer = await getCustomerForUser(user.id);
    if (!customer || String(debtIntent.customer_id) !== String(customer.id)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    const debtStatus = String(debtIntent.status ?? "").toLowerCase();
    if (debtStatus === "completed" || debtStatus === "paid") {
      return c.json({ success: true, purpose: "wallet_debt", status: debtStatus });
    }
    if (debtStatus === "failed" || debtStatus === "cancelled" || debtStatus === "expired" || debtStatus === "superseded") {
      return c.json({ success: false, error: "Payment failed", code: "payment_failed", status: debtStatus }, 400);
    }
    return c.json({ success: false, code: "pending_confirmation", status: debtStatus || "pending", purpose: "wallet_debt" }, 202);
  }

  if (!body.orderId) return c.json({ error: "Payment not found" }, 404);
  // Prefer order_id match for customer poll (avoid loose transaction_id alone)
  const byOrder = await findWipayIntent(
    serviceSupabase,
    { order_id: body.orderId },
    body.orderId,
  );
  const intent = byOrder ?? (body.transactionId
    ? await findWipayIntent(serviceSupabase, { transaction_id: body.transactionId }, body.orderId)
    : null);
  if (!intent) return c.json({ error: "Payment not found" }, 404);

  // Rush Pass uses /customer/rush-pass/confirm - refuse order-complete for null order intents
  if (!intent.order_id) {
    return c.json({
      error: "Not an order payment",
      code: "not_order_intent",
    }, 400);
  }

  const owned = await assertCustomerOwnsOrder(user.id, String(intent.order_id));
  if (!owned.ok) return c.json({ error: owned.error }, owned.status);

  const status = String(intent.status ?? "").toLowerCase();
  if (status === "completed" || status === "paid") {
    return c.json({ success: true, orderId: String(intent.order_id), status });
  }
  if (status === "review") {
    return c.json({ success: false, error: "We're still confirming this payment", code: "payment_review" }, 409);
  }
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return c.json({
      success: false,
      error: "Payment failed",
      code: "payment_failed",
      status,
      orderId: String(intent.order_id),
    }, 400);
  }

  // Pending - webhook has not completed yet; client must poll (do NOT trust body.status)
  return c.json({
    success: false,
    code: "pending_confirmation",
    status: status || "pending",
    orderId: String(intent.order_id),
  }, 202);
});

// ============================================================================
// Refunds
// ============================================================================

app.post("/refunds", async (c) => {
  const admin = await requireProductAdmin(c, "dash");
  if (admin instanceof Response) return admin;

  // Align with Dash write bar - dash_ops cannot move money
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
  
  const body = await c.req.json().catch(() => null);
  const parsed = z.object({
    transactionId: z.string().uuid(),
    amount: z.number().positive(),
    reason: z.string().min(1).max(500),
    orderId: z.string().uuid().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid refund request" }, 400);
  const { transactionId, amount, reason } = parsed.data;

  const serviceSupabase = getServiceSupabase();
  const { data: transaction } = await serviceSupabase
    .schema("payments")
    .from("transactions")
    .select("id, order_id, amount")
    .eq("id", transactionId)
    .single();
  if (!transaction?.order_id) return c.json({ error: "Transaction not found" }, 404);

  const queued = await queueAndExecuteRefund({
    orderId: String(transaction.order_id),
    transactionId,
    amount,
    reason,
    initiatedBy: admin.id,
    idempotencyKey: `admin-refund:${transactionId}:${amount}:${reason}`.slice(0, 180),
  });
  if (!queued.ok) return c.json({ error: queued.error }, queued.status as 400);
  return c.json({ refund: queued.refund, providerError: queued.providerError ?? null }, queued.providerCompleted ? 201 : 202);
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
// Courier Payouts - DEPRECATED (use /delivery/courier/payouts/close-period)
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

/* LEGACY payout bodies removed - see git history if needed.
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
 * Requires provider_token from WiPay (or other processor) - never accepts raw PAN.
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
