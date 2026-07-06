/**
 * Payments Service - Roam Dash
 * Handles WiPay and PayPal payment processing for Jamaica market
 */

import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { cors } from "https://deno.land/x/hono@v4.3.11/middleware.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const app = new Hono().basePath("/payments");

app.use("*", cors());

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
  
  const body = await c.req.json();
  const { orderId, provider = "wipay" } = body;
  
  const serviceSupabase = getServiceSupabase();
  const { data: order, error: orderError } = await serviceSupabase
    .schema("delivery")
    .from("orders")
    .select("*, merchant:merchant_id(*)")
    .eq("id", orderId)
    .single();
  
  if (orderError || !order) {
    return c.json({ error: "Order not found" }, 404);
  }
  
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
      customer_id: order.customer_id,
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
  
  try {
    const response = await fetch("https://sandbox.wipayfinancial.com/v1/gateway_live", {
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
        response_url: `${returnUrl}/payment/callback/wipay`,
        return_url: `${returnUrl}/orders/${order.id}`,
        total: order.total.toString(),
      }),
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

// WiPay webhook callback
app.post("/webhooks/wipay", async (c) => {
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
    // Get merchant_id from order
    const { data: order } = await serviceSupabase
      .schema("delivery")
      .from("orders")
      .select("merchant_id")
      .eq("id", intent.order_id)
      .single();

    const { data: txn } = await serviceSupabase
      .schema("payments")
      .from("transactions")
      .insert({
        intent_id: intent.id,
        order_id: intent.order_id,
        customer_id: intent.customer_id,
        amount: intent.amount,
        net_amount: intent.amount,
        currency: "JMD",
        status: "completed",
        provider: "wipay",
        provider_transaction_id: transaction_id,
        provider_data: body,
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
          merchantId: order?.merchant_id ? String(order.merchant_id) : null,
          amount: Number(intent.amount),
          currency: "JMD",
          kind: "order_capture",
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
    throw new Error("PayPal not configured");
  }
  
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: "grant_type=client_credentials"
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
    
    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
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
      })
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
  
  const body = await c.req.json();
  const { paypalOrderId, orderId } = body;
  
  const serviceSupabase = getServiceSupabase();
  
  try {
    const accessToken = await getPayPalAccessToken();
    const baseUrl = Deno.env.get("PAYPAL_ENV") === "live" 
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
    
    const response = await fetch(`${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      }
    });
    
    const result = await response.json();
    
    if (result.status === "COMPLETED") {
      const { data: intent } = await serviceSupabase
        .schema("payments")
        .from("payment_intents")
        .select("*")
        .eq("provider_intent_id", paypalOrderId)
        .single();
      
      if (intent) {
        await serviceSupabase
          .schema("payments")
          .from("payment_intents")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", intent.id);
        
        // Get merchant_id from order
        const { data: order } = await serviceSupabase
          .schema("delivery")
          .from("orders")
          .select("merchant_id")
          .eq("id", orderId)
          .single();

        const capture = result.purchase_units[0].payments.captures[0];
        
        const { data: txn } = await serviceSupabase
          .schema("payments")
          .from("transactions")
          .insert({
            intent_id: intent.id,
            order_id: orderId,
            customer_id: intent.customer_id,
            amount: intent.amount,
            net_amount: intent.amount,
            currency: "JMD",
            status: "completed",
            provider: "paypal",
            provider_transaction_id: capture.id,
            provider_data: result,
            payment_method: "paypal",
          })
          .select("id")
          .single();

        // Dual-write to unified ledger with merchantId
        if (txn?.id) {
          try {
            const { dualWriteDashPayment } = await import("../_shared/unifiedLedger/dualWriteDash.ts");
            await dualWriteDashPayment({
              transactionId: String(txn.id),
              orderId: String(orderId),
              merchantId: order?.merchant_id ? String(order.merchant_id) : null,
              amount: Number(intent.amount),
              currency: "JMD",
              kind: "order_capture",
            });
          } catch (e) {
            console.error("[payments/paypal] unified dual-write failed:", e);
          }
        }
        
        await serviceSupabase
          .schema("delivery")
          .from("orders")
          .update({ status: "confirmed", payment_status: "paid" })
          .eq("id", orderId);
      }
      
      return c.json({ success: true, captureId: result.purchase_units[0].payments.captures[0].id });
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
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  
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
    .select("merchant_id")
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
      initiated_by: "system"
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
  
  // TODO: Process actual refund with payment provider
  // For now, mark as pending for manual processing
  
  return c.json({ refund }, 201);
});

// ============================================================================
// Merchant Payouts (Roam Partner settlements)
// ============================================================================

app.post("/payouts/merchant", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { merchantId, amount, currency = "JMD", reference } = body;

  if (!merchantId || !amount) {
    return c.json({ error: "merchantId and amount required" }, 400);
  }

  const serviceSupabase = getServiceSupabase();

  // Create payout record
  const { data: payout, error } = await serviceSupabase
    .schema("payments")
    .from("payouts")
    .insert({
      recipient_type: "merchant",
      recipient_id: merchantId,
      amount,
      currency,
      status: "pending",
      reference,
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  // Dual-write to unified ledger
  if (payout?.id) {
    try {
      const { dualWriteDashPayment } = await import("../_shared/unifiedLedger/dualWriteDash.ts");
      await dualWriteDashPayment({
        transactionId: `payout:${payout.id}`,
        orderId: reference || `payout-${payout.id}`,
        merchantId: String(merchantId),
        amount,
        currency,
        kind: "merchant_payout",
      });
    } catch (e) {
      console.error("[payments/merchant-payout] unified dual-write failed:", e);
    }
  }

  return c.json({ payout }, 201);
});

// ============================================================================
// Courier Payouts (Roam Courier earnings)
// ============================================================================

app.post("/payouts/courier", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json();
  const { courierId, amount, currency = "JMD", reference } = body;

  if (!courierId || !amount) {
    return c.json({ error: "courierId and amount required" }, 400);
  }

  const serviceSupabase = getServiceSupabase();

  // Create payout record
  const { data: payout, error } = await serviceSupabase
    .schema("payments")
    .from("payouts")
    .insert({
      recipient_type: "courier",
      recipient_id: courierId,
      amount,
      currency,
      status: "pending",
      reference,
    })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  // Dual-write to unified ledger
  if (payout?.id) {
    try {
      const { dualWriteDashPayment } = await import("../_shared/unifiedLedger/dualWriteDash.ts");
      await dualWriteDashPayment({
        transactionId: `payout:${payout.id}`,
        orderId: reference || `payout-${payout.id}`,
        courierId: String(courierId),
        amount,
        currency,
        kind: "courier_payout",
      });
    } catch (e) {
      console.error("[payments/courier-payout] unified dual-write failed:", e);
    }
  }

  return c.json({ payout }, 201);
});

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
    .select("id, type, last4, brand, exp_month, exp_year, is_default")
    .eq("customer_id", customer.id)
    .eq("is_active", true);
  
  return c.json({ methods: methods || [] });
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
