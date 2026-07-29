/**
 * Transactional Dash order SMS — Digicel/Flow when configured; stub-log otherwise.
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
    accepted: `Roam Dash: ${orderRef}${label} was accepted and is being prepared.`,
    preparing: `Roam Dash: ${orderRef}${label} is being prepared.`,
    ready: `Roam Dash: ${orderRef}${label} is ready for pickup.`,
    picked_up: `Roam Dash: Your courier picked up ${orderRef}. Track in the app.`,
    in_transit: `Roam Dash: ${orderRef} is on the way.`,
    delivered: `Roam Dash: ${orderRef} was delivered. Enjoy!`,
    completed: `Roam Dash: ${orderRef} is complete. Thanks for ordering.`,
    cancelled: `Roam Dash: ${orderRef} was cancelled.`,
  };
  const message = statusMessages[input.status] ||
    `Roam Dash: ${orderRef} update — status is now ${input.status}.`;

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

/** Load customer phone for an order and send status SMS (best-effort). */
export async function notifyCustomerOrderStatus(
  // deno-lint-ignore no-explicit-any
  serviceSb: any,
  orderId: string,
  status: string,
): Promise<void> {
  try {
    const { data: order } = await serviceSb
      .from("orders")
      .select("id, order_number, customer_id, merchant_id, merchant:merchants(name), customer:customers(phone, name)")
      .eq("id", orderId)
      .single();

    if (!order) return;
    const customer = order.customer as { phone?: string | null } | null;
    const merchant = order.merchant as { name?: string | null } | null;
    const phone = customer?.phone ? String(customer.phone) : "";
    if (!phone) {
      console.log(JSON.stringify({
        svc: "dash_order_sms",
        intent: "email_or_push_deferred",
        orderId,
        status,
        reason: "no_customer_phone",
      }));
      return;
    }

    await sendDashOrderStatusSms({
      to: phone,
      orderNumber: String(order.order_number || orderId),
      status,
      merchantName: merchant?.name ?? null,
    });
  } catch (e) {
    console.error("[dash_order_sms] notify failed:", e);
  }
}
