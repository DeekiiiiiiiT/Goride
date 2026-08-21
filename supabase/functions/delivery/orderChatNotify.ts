/**
 * Push fan-out for new order chat messages (customer / courier / merchant).
 */
export async function notifyOrderChatRecipients(opts: {
  orderId: string;
  orderNumber?: string | null;
  merchantId: string;
  pair: string;
  senderUserId: string;
  senderRole: string;
  preview: string;
  customerUserId: string | null;
  courierUserId: string | null;
}): Promise<void> {
  const base = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceKey) return;

  const preview = opts.preview.length > 80 ? `${opts.preview.slice(0, 79)}…` : opts.preview;
  const title = "New message";
  const orderLabel = opts.orderNumber ? `#${opts.orderNumber}` : "your order";
  const message = `${orderLabel}: ${preview}`;
  const url = `/orders?orderId=${opts.orderId}&pair=${opts.pair}`;

  const tasks: Promise<unknown>[] = [];

  const pushCustomerOrCourier = async (audience: "customer" | "courier", userId: string) => {
    if (!userId || userId === opts.senderUserId) return;
    try {
      await fetch(`${base}/functions/v1/notifications/order-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-role": serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          audience,
          userId,
          title,
          message,
          orderId: opts.orderId,
          pair: opts.pair,
          url: audience === "customer"
            ? `/tracking?orderId=${opts.orderId}`
            : `/delivery?orderId=${opts.orderId}`,
        }),
      });
    } catch (e) {
      console.warn("[orderChat] notify failed", audience, e);
    }
  };

  if (opts.pair === "customer_courier" || opts.pair === "customer_merchant" || opts.pair === "support") {
    if (opts.customerUserId) tasks.push(pushCustomerOrCourier("customer", opts.customerUserId));
  }
  if (opts.pair === "customer_courier" || opts.pair === "merchant_courier" || opts.pair === "support") {
    if (opts.courierUserId) tasks.push(pushCustomerOrCourier("courier", opts.courierUserId));
  }

  if (
    (opts.pair === "customer_merchant" || opts.pair === "merchant_courier" || opts.pair === "support") &&
    opts.senderRole !== "merchant"
  ) {
    const merchantSecret =
      Deno.env.get("MERCHANT_PUSH_SECRET") ||
      Deno.env.get("FLEET_CRON_SECRET") ||
      serviceKey;
    tasks.push(
      (async () => {
        try {
          await fetch(`${base}/functions/v1/merchant-push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Merchant-Push-Secret": merchantSecret,
              Authorization: `Bearer ${merchantSecret}`,
            },
            body: JSON.stringify({
              merchantId: opts.merchantId,
              title,
              body: message,
              url,
            }),
          });
        } catch (e) {
          console.warn("[orderChat] merchant-push failed", e);
        }
      })(),
    );
  }

  await Promise.allSettled(tasks);
}
