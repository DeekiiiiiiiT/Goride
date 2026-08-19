/**
 * Transactional Dash order SMS — Digicel/Flow when configured; stub-log otherwise.
 * Push fanout (additive) goes through notifications/customer-order-status.
 */
export async function sendDashOrderStatusSms(input: {
  to: string;
  orderNumber: string;
  status: string;
  merchantName?: string | null;
}): Promise<boolean> {
  const to = String(input.to || "").trim();
  if (!to) return false;

  const label = input.merchantName ? ` from ${input.merchantName}` : "";
  const orderRef = input.orderNumber || "your order";
  const statusMessages: Record<string, string> = {
    accepted: `Roam Rush: ${orderRef}${label} was accepted and is being prepared.`,
    preparing: `Roam Rush: ${orderRef}${label} is being prepared.`,
    ready: `Roam Rush: ${orderRef}${label} is ready for pickup.`,
    picked_up: `Roam Rush: Your courier picked up ${orderRef}. Track in the app.`,
    in_transit: `Roam Rush: ${orderRef} is on the way.`,
    delivered: `Roam Rush: ${orderRef} was delivered. Enjoy!`,
    completed: `Roam Rush: ${orderRef} is complete. Thanks for ordering.`,
    cancelled: `Roam Rush: ${orderRef} was cancelled.`,
  };
  const message = statusMessages[input.status] ||
    `Roam Rush: ${orderRef} update — status is now ${input.status}.`;

  const stub = Deno.env.get("SMS_HOOK_STUB_LOG_OK") === "1" ||
    Deno.env.get("DASH_SMS_STUB_LOG_OK") === "1";
  if (stub) {
    console.log(JSON.stringify({ svc: "dash_order_sms", to, message }));
    return true;
  }

  const digicelUrl = Deno.env.get("DIGICEL_SMS_API_URL");
  const digicelKey = Deno.env.get("DIGICEL_SMS_API_KEY");
  if (digicelUrl && digicelKey) {
    try {
      const res = await fetch(digicelUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${digicelKey}`,
        },
        body: JSON.stringify({ to, message }),
      });
      return res.ok;
    } catch (e) {
      console.error("[dash_order_sms] Digicel failed:", e);
    }
  }

  const flowUrl = Deno.env.get("FLOW_SMS_API_URL");
  const flowKey = Deno.env.get("FLOW_SMS_API_KEY");
  if (flowUrl && flowKey) {
    try {
      const res = await fetch(flowUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${flowKey}`,
        },
        body: JSON.stringify({ to, message }),
      });
      return res.ok;
    } catch (e) {
      console.error("[dash_order_sms] Flow failed:", e);
    }
  }

  // Fail soft — log intent so ops can see missing carrier config
  console.warn("[dash_order_sms] No SMS carrier configured; message not sent:", { to, status: input.status });
  return false;
}

async function notifyCustomerOrderPush(input: {
  customerUserId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  merchantName?: string | null;
}): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceKey) return;

  try {
    await fetch(`${base}/functions/v1/notifications/customer-order-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        "x-service-role": serviceKey,
      },
      body: JSON.stringify({
        customerUserId: input.customerUserId,
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        status: input.status,
        merchantName: input.merchantName ?? null,
      }),
    });
  } catch (e) {
    console.error("[dash_order_sms] customer push fanout failed:", e);
  }
}

function prefEnabled(prefs: unknown, key: string, fallback: boolean): boolean {
  if (!prefs || typeof prefs !== "object") return fallback;
  const value = (prefs as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : fallback;
}

/** Load customer phone for an order and send status SMS + additive push (best-effort). */
export async function notifyCustomerOrderStatus(
  // deno-lint-ignore no-explicit-any
  serviceSb: any,
  orderId: string,
  status: string,
): Promise<void> {
  try {
    const { data: order } = await serviceSb
      .from("orders")
      .select("id, order_number, customer_id, merchant_id, merchant:merchants(name), customer:customers(phone, name, user_id, notification_prefs)")
      .eq("id", orderId)
      .single();

    if (!order) return;
    const customer = order.customer as {
      phone?: string | null;
      user_id?: string | null;
      notification_prefs?: unknown;
    } | null;
    const merchant = order.merchant as { name?: string | null } | null;
    const orderNumber = String(order.order_number || orderId);
    const merchantName = merchant?.name ?? null;
    const phone = customer?.phone ? String(customer.phone) : "";
    const customerUserId = customer?.user_id ? String(customer.user_id) : "";
    const prefs = customer?.notification_prefs;
    const smsOn = prefEnabled(prefs, "smsUpdates", true);
    const pushOn = prefEnabled(prefs, "orderUpdates", true);

    if (phone && smsOn) {
      await sendDashOrderStatusSms({
        to: phone,
        orderNumber,
        status,
        merchantName,
      });
    } else if (phone && !smsOn) {
      console.log(JSON.stringify({
        svc: "dash_order_sms",
        intent: "sms_skipped_opt_out",
        orderId,
        status,
      }));
    } else {
      console.log(JSON.stringify({
        svc: "dash_order_sms",
        intent: "sms_skipped_no_phone",
        orderId,
        status,
      }));
    }

    if (customerUserId && pushOn) {
      await notifyCustomerOrderPush({
        customerUserId,
        orderId,
        orderNumber,
        status,
        merchantName,
      });
    }
  } catch (e) {
    console.error("[dash_order_sms] notify failed:", e);
  }
}
