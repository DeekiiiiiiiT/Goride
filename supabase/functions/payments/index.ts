/**
 * Payments Service - Roam Dash
 * Handles WiPay and PayPal payment processing for Jamaica market
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
  provider: z.enum(["wipay", "paypal"]).optional(),
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

/** Shared callback secret for WiPay webhooks (never trust unsigned callbacks). */
function wipayCallbackSecret(): string | null {
  const s = Deno.env.get("WIPAY_CALLBACK_SECRET");
  if (!s || !s.trim()) return null;
  return s.trim();
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

/** WiPay gateway host — sandbox vs live by WIPAY_ENV. */
function wipayGatewayUrl(): string {
  const env = (Deno.env.get("WIPAY_ENV") ?? "sandbox").toLowerCase();
  if (env === "live" || env === "production") {
    return "https://www.wipayfinancial.com/v1/gateway_live";
  }
  return "https://sandbox.wipayfinancial.com/v1/gateway_live";
}

// Health check
app.get("/health", (c) => c.json({ service: "payments", status: "ok", providers: ["wipay", "paypal"] }));

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
  const { orderId, provider = "wipay" } = body;

  const owned = await assertCustomerOwnsOrder(user.id, orderId);
  if (!owned.ok) return c.json({ error: owned.error }, owned.status);
  const order = owned.order;
  
  const serviceSupabase = getServiceSupabase();
  
  let clientSecret = null;
  let providerIntentId = null;
  let providerData = {};
  
  if (provider === "wipay") {
    const wipayResult = await createWiPayIntent(order);
    if (wipayResult.error) {
      return c.json({ error: wipayResult.error }, 500);
    }
    clientSecret = wipayResult.paymentUrl;
    providerIntentId = wipayResult.transactionId;
    providerData = wipayResult;
  } else if (provider === "paypal") {
    const paypalResult = await createPayPalOrder(order);
    if (paypalResult.error) {
      return c.json({ error: paypalResult.error }, 500);
    }
    clientSecret = paypalResult.approvalUrl;
    providerIntentId = paypalResult.orderId;
    providerData = paypalResult;
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
    clientSecret: intent.client_secret,
    provider,
    amount: intent.amount,
    currency: intent.currency
  }, 201);
});

// ============================================================================
// WiPay Integration
// ============================================================================

async function createWiPayIntent(order: any) {
  const wipayAccountNumber = Deno.env.get("WIPAY_ACCOUNT_NUMBER");
  const wipayApiKey = Deno.env.get("WIPAY_API_KEY");
  
  if (!wipayAccountNumber || !wipayApiKey) {
    return { error: "WiPay not configured" };
  }
  
  const returnUrl = Deno.env.get("APP_URL") ?? "https://dash.roamja.com";
  const callbackSecret = wipayCallbackSecret();
  if (!callbackSecret) {
    return { error: "WiPay callback secret not configured — set WIPAY_CALLBACK_SECRET" };
  }
  const responseUrl = new URL(`${returnUrl}/payment/callback/wipay`);
  // WiPay will hit our webhook/callback with this secret so we can verify authenticity.
  responseUrl.searchParams.set("secret", callbackSecret);
  
  try {
    const response = await fetchWithTimeout(wipayGatewayUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        account_number: wipayAccountNumber,
        avs: "0",
        country_code: "JM",
        currency: "JMD",
        data: JSON.stringify({ orderId: order.id }),
        environment: Deno.env.get("WIPAY_ENV") ?? "sandbox",
        fee_structure: "customer_pay",
        method: "credit_card",
        order_id: order.order_number,
        origin: "roam-dash",
        response_url: responseUrl.toString(),
        return_url: `${returnUrl}/orders/${order.id}`,
        total: order.total.toString(),
      }),
      timeoutMs: 15000,
    });
    
    const result = await response.json();
    
    if (result.status === "success") {
      return {
        paymentUrl: result.url,
        transactionId: result.transaction_id,
        raw: result
      };
    } else {
      return { error: result.message || "WiPay error" };
    }
  } catch (err) {
    console.error("WiPay error:", err);
    return { error: "Failed to create WiPay payment" };
  }
}

// WiPay webhook callback — requires WIPAY_CALLBACK_SECRET (header or ?secret=)
app.post("/webhooks/wipay", async (c) => {
  if (!verifyWipayCallbackSecret(c)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const serviceSupabase = getServiceSupabase();
  
  const { transaction_id, status, order_id, data } = body;
  
  const { data: intent } = await serviceSupabase
    .schema("payments")
    .from("payment_intents")
    .select("*")
    .eq("provider_intent_id", transaction_id)
    .single();
  
  if (!intent) {
    return c.json({ error: "Intent not found" }, 404);
  }
  
  const isSuccess = status === "success";
  
  await serviceSupabase
    .schema("payments")
    .from("payment_intents")
    .update({
      status: isSuccess ? "completed" : "failed",
      completed_at: new Date().toISOString(),
      provider_data: body
    })
    .eq("id", intent.id);
  
  if (isSuccess) {
    // Get fee fields for Model A split
    const { data: order } = await serviceSupabase
      .schema("delivery")
      .from("orders")
      .select("merchant_id, courier_id, platform_fee, delivery_fee, tip")
      .eq("id", intent.order_id)
      .single();

    const { computeDashCaptureSplit } = await import("../_shared/dashMoneySplit.ts");
    const split = computeDashCaptureSplit(order || {}, Number(intent.amount));

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
        provider_transaction_id: transaction_id,
        provider_data: {
          ...body,
          money_split: split,
        },
        payment_method: "credit_card"
      })
      .select("id")
      .single();

    // Dual-write to unified ledger
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
    
    await serviceSupabase
      .schema("delivery")
      .from("orders")
      .update({ status: "confirmed", payment_status: "paid" })
      .eq("id", intent.order_id);
  }
  
  return c.json({ received: true });
});

// ============================================================================
// PayPal Integration
// ============================================================================

async function getPayPalAccessToken() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  const baseUrl = Deno.env.get("PAYPAL_ENV") === "live" 
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
  
  if (!clientId || !clientSecret) {
    throw new Error(
      "PayPal not configured — set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET via supabase secrets set",
    );
  }
  
  const response = await fetchWithTimeout(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: "grant_type=client_credentials",
    timeoutMs: 15000,
  });
  
  const data = await response.json();
  return data.access_token;
}

async function createPayPalOrder(order: any) {
  try {
    const accessToken = await getPayPalAccessToken();
    const baseUrl = Deno.env.get("PAYPAL_ENV") === "live" 
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
    const returnUrl = Deno.env.get("APP_URL") ?? "https://dash.roamja.com";
    
    const response = await fetchWithTimeout(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: order.id,
          description: `Roam Dash Order #${order.order_number}`,
          custom_id: order.id,
          amount: {
            currency_code: "USD",
            value: (order.total / 155).toFixed(2) // Convert JMD to USD (approx rate)
          }
        }],
        application_context: {
          brand_name: "Roam Dash",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          return_url: `${returnUrl}/payment/callback/paypal?orderId=${order.id}`,
          cancel_url: `${returnUrl}/orders/${order.id}?cancelled=true`
        }
      }),
      timeoutMs: 15000,
    });
    
    const result = await response.json();
    
    if (result.id) {
      const approvalUrl = result.links.find((l: any) => l.rel === "approve")?.href;
      return {
        orderId: result.id,
        approvalUrl,
        raw: result
      };
    } else {
      return { error: result.message || "PayPal error" };
    }
  } catch (err) {
    console.error("PayPal error:", err);
    return { error: "Failed to create PayPal order" };
  }
}

// Capture PayPal payment after approval
app.post("/paypal/capture", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  
  const body = await c.req.json();
  const { paypalOrderId, orderId } = body;
  if (!paypalOrderId || !orderId) {
    return c.json({ error: "paypalOrderId and orderId required" }, 400);
  }

  const owned = await assertCustomerOwnsOrder(user.id, String(orderId));
  if (!owned.ok) return c.json({ error: owned.error }, owned.status);
  
  const serviceSupabase = getServiceSupabase();
  
  try {
    const accessToken = await getPayPalAccessToken();
    const baseUrl = Deno.env.get("PAYPAL_ENV") === "live" 
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
    
    const response = await fetchWithTimeout(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      timeoutMs: 15000,
    });
    
    const result = await response.json();
    
    if (result.status === "COMPLETED") {
      const { data: intent } = await serviceSupabase
        .schema("payments")
        .from("payment_intents")
        .select("*")
        .eq("provider_intent_id", paypalOrderId)
        .single();

      if (!intent) {
        return c.json({ error: "Payment intent not found" }, 404);
      }
      // Intent must belong to this customer and match the claimed order
      if (String(intent.customer_id) !== owned.customerId) {
        return c.json({ error: "Forbidden" }, 403);
      }
      if (String(intent.order_id) !== String(orderId)) {
        return c.json({ error: "Order mismatch" }, 403);
      }
      
      await serviceSupabase
        .schema("payments")
        .from("payment_intents")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", intent.id);
      
      const order = owned.order;
      const capture = result.purchase_units[0].payments.captures[0];

      const { data: feeOrder } = await serviceSupabase
        .schema("delivery")
        .from("orders")
        .select("merchant_id, courier_id, platform_fee, delivery_fee, tip")
        .eq("id", intent.order_id)
        .single();

      const { computeDashCaptureSplit } = await import("../_shared/dashMoneySplit.ts");
      const split = computeDashCaptureSplit(
        feeOrder || order || {},
        Number(intent.amount),
      );
      
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
          provider: "paypal",
          provider_transaction_id: capture.id,
          provider_data: { ...result, money_split: split },
          payment_method: "paypal",
        })
        .select("id")
        .single();

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
          console.error("[payments/paypal] unified dual-write failed:", e);
        }
      }
      
      await serviceSupabase
        .schema("delivery")
        .from("orders")
        .update({ status: "confirmed", payment_status: "paid" })
        .eq("id", intent.order_id);
      
      return c.json({ success: true, captureId: capture.id });
    } else {
      return c.json({ error: "Payment not completed", status: result.status }, 400);
    }
  } catch (err) {
    console.error("PayPal capture error:", err);
    return c.json({ error: "Failed to capture payment" }, 500);
  }
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
      const paypalEnv = Deno.env.get("PAYPAL_ENV") || "sandbox";
      const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
      const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
      const captureId = String(transaction.provider_transaction_id || "");
      if (!clientId || !clientSecret || !captureId) {
        return c.json({
          error: "PayPal refund not configured (missing credentials or capture id)",
          refund,
        }, 502);
      }
      const base = paypalEnv === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const basic = btoa(`${clientId}:${clientSecret}`);
      const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (!tokenRes.ok) {
        return c.json({ error: "PayPal auth failed", refund }, 502);
      }
      const tokenJson = await tokenRes.json();
      const refundRes = await fetch(`${base}/v2/payments/captures/${captureId}/refund`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenJson.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: {
            value: Number(refundAmount).toFixed(2),
            currency_code: String(transaction.currency || "USD"),
          },
        }),
      });
      const refundJson = await refundRes.json().catch(() => ({}));
      if (!refundRes.ok) {
        return c.json({ error: "PayPal refund failed", details: refundJson, refund }, 502);
      }
      providerRefundId = String(refundJson.id || "");
      refundStatus = "completed";
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
  provider: z.enum(["wipay", "paypal"]).default("wipay"),
  type: z.enum(["card", "paypal"]).default("card"),
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
