/**
 * Transactional Dash order SMS — Digicel/Flow when configured; stub-log otherwise.
 * Uses enterprise.notifications.* templates/channels + platform.notifications.quiet_hours.
 * Push fanout (additive) goes through notifications/customer-order-status.
 */
import { ORDER_CUSTOMER_EMBED_WITH_USER } from "../delivery/orderSelectEmbeds.ts";
import {
  isWithinQuietHours,
  substituteTemplate,
  type QuietHours,
} from "./rushSettings/enterpriseReaders.ts";
import { getSetting } from "./rushSettings/getSetting.ts";

type NotifyChannel = "sms" | "push" | "email";

type NotificationChannels = {
  orderPlaced: NotifyChannel[];
  orderAccepted: NotifyChannel[];
  courierAssigned: NotifyChannel[];
  outForDelivery: NotifyChannel[];
  delivered: NotifyChannel[];
  cancelled: NotifyChannel[];
};

type MessageTemplate = { key: string; channel: NotifyChannel; body: string };

/** Map order status → enterprise notification event + template key. */
function statusToEvent(status: string): {
  event: keyof NotificationChannels;
  templateKey: string;
} | null {
  switch (status) {
    case "placed":
    case "pending":
      return { event: "orderPlaced", templateKey: "order_placed" };
    case "accepted":
    case "preparing":
    case "ready":
      return { event: "orderAccepted", templateKey: "order_accepted" };
    case "picked_up":
    case "assigned":
      return { event: "courierAssigned", templateKey: "courier_assigned" };
    case "in_transit":
      return { event: "outForDelivery", templateKey: "out_for_delivery" };
    case "delivered":
    case "completed":
      return { event: "delivered", templateKey: "delivered" };
    case "cancelled":
      return { event: "cancelled", templateKey: "cancelled" };
    default:
      return null;
  }
}

const FALLBACK_SMS: Record<string, string> = {
  accepted: "Order {order_number} was accepted and is being prepared.",
  preparing: "Order {order_number} is being prepared.",
  ready: "Order {order_number} is ready for pickup.",
  picked_up: "Your courier picked up order {order_number}. Track in the app.",
  in_transit: "Order {order_number} is on the way. ETA {eta}.",
  delivered: "Order {order_number} was delivered. Enjoy!",
  completed: "Order {order_number} is complete. Thanks for ordering.",
  cancelled: "Order {order_number} was cancelled.",
};

/** Same carrier path as customer order texts. */
export async function sendDashText(to: string, message: string): Promise<boolean> {
  const destination = String(to || "").trim();
  if (!destination || !message) return false;

  const stub = Deno.env.get("SMS_HOOK_STUB_LOG_OK") === "1" ||
    Deno.env.get("DASH_SMS_STUB_LOG_OK") === "1";
  if (stub) {
    console.log(JSON.stringify({ svc: "dash_order_sms", to: destination, message }));
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
        body: JSON.stringify({ to: destination, message }),
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
        body: JSON.stringify({ to: destination, message }),
      });
      return res.ok;
    } catch (e) {
      console.error("[dash_order_sms] Flow failed:", e);
    }
  }

  console.warn("[dash_order_sms] No SMS carrier configured; message not sent:", { to: destination });
  return false;
}

async function resolveSmsBody(input: {
  orderNumber: string;
  status: string;
  merchantName?: string | null;
  eta?: string | null;
}): Promise<{ message: string; smsAllowed: boolean }> {
  const mapped = statusToEvent(input.status);
  const [channels, templates, senderName] = await Promise.all([
    getSetting<NotificationChannels>("enterprise.notifications.channels"),
    getSetting<MessageTemplate[]>("enterprise.notifications.templates"),
    getSetting<string>("enterprise.notifications.sender_name"),
  ]);

  // Transactional: send unless channel disabled for this event
  let smsAllowed = true;
  if (mapped) {
    const list = channels?.[mapped.event];
    if (Array.isArray(list)) smsAllowed = list.includes("sms");
  }
  if (!smsAllowed) {
    return { message: "", smsAllowed: false };
  }

  const vars = {
    order_number: input.orderNumber || "your order",
    eta: input.eta || "soon",
    merchant: input.merchantName || "",
    status: input.status,
  };

  const templateList = Array.isArray(templates) ? templates : [];
  const tpl = mapped
    ? templateList.find((t) => t.key === mapped.templateKey && t.channel === "sms") ||
      templateList.find((t) => t.key === mapped.templateKey)
    : undefined;

  const body = tpl?.body ||
    FALLBACK_SMS[input.status] ||
    "Order {order_number} update — status is now {status}.";
  const filled = substituteTemplate(body, vars);
  const sender = String(senderName || "Roam Rush").trim() || "Roam Rush";
  const message = filled.startsWith(sender) ? filled : `${sender}: ${filled}`;
  return { message, smsAllowed: true };
}

export async function sendDashOrderStatusSms(input: {
  to: string;
  orderNumber: string;
  status: string;
  merchantName?: string | null;
  eta?: string | null;
}): Promise<boolean> {
  const { message, smsAllowed } = await resolveSmsBody(input);
  if (!smsAllowed || !message) return false;
  return sendDashText(input.to, message);
}

/**
 * Marketing / promo SMS — respects quiet hours (America/Jamaica).
 * Transactional order status never calls this.
 */
export async function sendDashMarketingSms(input: {
  to: string;
  message: string;
}): Promise<{ sent: boolean; skipped?: "quiet_hours" | "empty" }> {
  const quiet = await getSetting<QuietHours>("platform.notifications.quiet_hours");
  if (quiet && isWithinQuietHours(quiet)) {
    console.log(JSON.stringify({
      svc: "dash_order_sms",
      intent: "marketing_skipped_quiet_hours",
    }));
    return { sent: false, skipped: "quiet_hours" };
  }
  const ok = await sendDashText(input.to, input.message);
  return { sent: ok, skipped: ok ? undefined : "empty" };
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
      .select(`id, order_number, customer_id, merchant_id, estimated_delivery_at, merchant:merchants(name), ${ORDER_CUSTOMER_EMBED_WITH_USER}`)
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

    let etaLabel: string | null = null;
    const etaAt = (order as { estimated_delivery_at?: string | null }).estimated_delivery_at;
    if (etaAt) {
      const ms = Date.parse(String(etaAt));
      if (Number.isFinite(ms)) {
        const mins = Math.max(1, Math.round((ms - Date.now()) / 60_000));
        etaLabel = `${mins} min`;
      }
    }

    const mapped = statusToEvent(status);
    const channels = await getSetting<NotificationChannels>("enterprise.notifications.channels");
    const pushChannelOn = mapped
      ? (channels?.[mapped.event] ?? ["push"]).includes("push")
      : true;

    if (phone && smsOn) {
      await sendDashOrderStatusSms({
        to: phone,
        orderNumber,
        status,
        merchantName,
        eta: etaLabel,
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

    // Transactional push: always attempt when channel enabled (quiet hours do not apply)
    if (customerUserId && pushOn && pushChannelOn) {
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
