/**
 * Notifications — courier + customer push subscribe and fanout.
 * Customer SMS remains primary via dashOrderSms (delivery function); push is additive.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { applyCors } from "../_shared/corsAllowlist.ts";

const app = new Hono().basePath("/notifications");

applyCors(app, {
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "apikey",
    "x-client-info",
    "x-request-id",
    "x-service-role",
  ],
});

type Audience = "courier" | "customer";
type PushChannel = "web" | "fcm" | "apns";

type PushSubRow = {
  id: string;
  endpoint: string;
  channel?: string | null;
  p256dh?: string | null;
  auth?: string | null;
};

app.get("/health", (c) => {
  const vapidOk = Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY"));
  const requireVapid =
    Deno.env.get("REQUIRE_VAPID") === "1" ||
    Deno.env.get("REQUIRE_VAPID") === "true" ||
    Deno.env.get("DASH_REQUIRE_VAPID") === "1";
  if (requireVapid && !vapidOk) {
    return c.json({ ok: false, service: "notifications", error: "VAPID keys missing" }, 503);
  }
  return c.json({ ok: true, service: "notifications", vapidConfigured: vapidOk });
});

function configureVapid(): boolean {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@roam.app";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

function requireVapidConfigured(): boolean {
  return (
    Deno.env.get("REQUIRE_VAPID") === "1" ||
    Deno.env.get("REQUIRE_VAPID") === "true" ||
    Deno.env.get("DASH_REQUIRE_VAPID") === "1"
  );
}

function getAuthClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}

function getServiceDelivery() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "delivery" } },
  );
}

function parseAudience(raw: unknown): Audience | null {
  const audience = String(raw || "courier");
  if (audience === "courier" || audience === "customer") return audience;
  return null;
}

function tableForAudience(audience: Audience): string {
  return audience === "customer"
    ? "customer_push_subscriptions"
    : "courier_push_subscriptions";
}

function userIdColumn(audience: Audience): string {
  return audience === "customer" ? "customer_user_id" : "courier_user_id";
}

function resolveChannel(sub: PushSubRow): PushChannel {
  if (sub.channel === "fcm" || sub.channel === "apns" || sub.channel === "web") {
    return sub.channel;
  }
  if (sub.endpoint.startsWith("fcm:")) return "fcm";
  if (sub.endpoint.startsWith("apns:")) return "apns";
  return "web";
}

function nativeDeviceToken(sub: PushSubRow, channel: "fcm" | "apns"): string {
  const prefix = `${channel}:`;
  return sub.endpoint.startsWith(prefix)
    ? sub.endpoint.slice(prefix.length)
    : sub.endpoint;
}

async function sendFcmLegacy(
  token: string,
  title: string,
  message: string,
  url: string,
): Promise<{ ok: boolean; stale: boolean }> {
  const serverKey = Deno.env.get("FCM_SERVER_KEY")?.trim();
  if (!serverKey) {
    console.warn("[notifications] FCM_SERVER_KEY not set; skipping native token");
    return { ok: false, stale: false };
  }

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      notification: { title, body: message },
      data: { url },
      priority: "high",
    }),
  });

  if (res.status === 404 || res.status === 410) {
    return { ok: false, stale: true };
  }

  const payload = await res.json().catch(() => ({})) as {
    failure?: number;
    results?: Array<{ error?: string }>;
  };

  if (!res.ok) {
    console.error("[notifications] FCM HTTP error:", res.status, payload);
    return { ok: false, stale: false };
  }

  const err = payload.results?.[0]?.error;
  if (err === "NotRegistered" || err === "InvalidRegistration") {
    return { ok: false, stale: true };
  }
  if ((payload.failure ?? 0) > 0 && err) {
    console.error("[notifications] FCM send failed:", err);
    return { ok: false, stale: false };
  }

  return { ok: true, stale: false };
}

async function fanoutPush(opts: {
  audience: Audience;
  userId: string;
  title: string;
  message: string;
  url: string;
  extraPayload?: Record<string, unknown>;
  logTag: string;
}): Promise<{ status: string; sent: number; code: number; body?: Record<string, unknown> }> {
  const sb = getServiceDelivery();
  const table = tableForAudience(opts.audience);
  const userCol = userIdColumn(opts.audience);

  const { data: subs } = await sb
    .from(table)
    .select("id, endpoint, channel, p256dh, auth")
    .eq(userCol, opts.userId);

  const rows = (subs || []) as PushSubRow[];
  if (!rows.length) {
    console.log(`[${opts.logTag}] no subscriptions`, {
      user: opts.userId.slice(0, 8),
      ...opts.extraPayload,
    });
    return { status: "no_subscribers", sent: 0, code: 202 };
  }

  const hasWeb = rows.some((s) => resolveChannel(s) === "web");
  if (hasWeb && !configureVapid()) {
    console.error(`[${opts.logTag}] VAPID not configured`, {
      user: opts.userId.slice(0, 8),
      subscribers: rows.length,
      ...opts.extraPayload,
    });
    if (requireVapidConfigured()) {
      return {
        status: "vapid_required",
        sent: 0,
        code: 503,
        body: {
          ok: false,
          error: "VAPID keys not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY",
          status: "vapid_required",
        },
      };
    }
    return {
      status: "queued_awaiting_vapid",
      sent: 0,
      code: 202,
      body: {
        ok: true,
        status: "queued_awaiting_vapid",
        channel: "web_push",
        subscribers: rows.length,
      },
    };
  }

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.message,
    url: opts.url,
    ...opts.extraPayload,
  });

  let sent = 0;
  for (const sub of rows) {
    const channel = resolveChannel(sub);
    try {
      if (channel === "fcm" || channel === "apns") {
        const token = nativeDeviceToken(sub, channel);
        const result = await sendFcmLegacy(token, opts.title, opts.message, opts.url);
        if (result.stale) {
          await sb.from(table).delete().eq("id", sub.id);
        }
        if (result.ok) sent += 1;
        continue;
      }

      if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      sent += 1;
    } catch (err) {
      console.error(`[${opts.logTag}] push failed`, err);
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await sb.from(table).delete().eq("id", sub.id);
      }
    }
  }

  return {
    status: "sent",
    sent,
    code: 200,
    body: { ok: true, status: "sent", channel: "push", sent },
  };
}

/** Persist courier or customer push subscription. */
app.post("/subscribe", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const auth = getAuthClient(authHeader);
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const audience = parseAudience(body.audience);
  if (!audience) {
    return c.json({ error: "audience must be courier or customer" }, 400);
  }

  const nativePlatform = body.platform as string | undefined;
  const nativeToken = typeof body.token === "string" ? body.token.trim() : "";
  let endpoint = String(body.endpoint || "");
  let channel: PushChannel = "web";
  let p256dh: string | null = null;
  let authKey: string | null = null;

  if (nativeToken && (nativePlatform === "fcm" || nativePlatform === "apns")) {
    channel = nativePlatform;
    endpoint = `${nativePlatform}:${nativeToken}`;
  } else {
    const keys = (body.keys || {}) as { p256dh?: string; auth?: string };
    p256dh = keys.p256dh ?? null;
    authKey = keys.auth ?? null;
    if (!endpoint) {
      return c.json({ error: "Push subscription endpoint required" }, 400);
    }
  }

  const sb = getServiceDelivery();
  const table = tableForAudience(audience);
  const userCol = userIdColumn(audience);
  const { error } = await sb.from(table).upsert(
    {
      [userCol]: user.id,
      endpoint,
      channel,
      p256dh,
      auth: authKey,
      user_agent: c.req.header("user-agent")?.slice(0, 250) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: `${userCol},endpoint` },
  );

  if (error) return c.json({ error: error.message }, 500);

  const vapidReady = Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY"));
  return c.json({
    ok: true,
    status: channel === "web"
      ? (vapidReady ? "subscribed" : "stored_awaiting_vapid")
      : "subscribed",
    channel,
    audience,
  }, 201);
});

/** Remove a stored push subscription for courier or customer. */
app.post("/unsubscribe", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const auth = getAuthClient(authHeader);
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const audience = parseAudience(body.audience ?? "customer");
  if (!audience) {
    return c.json({ error: "audience must be courier or customer" }, 400);
  }

  const endpoint = String(body.endpoint || "");
  if (!endpoint) return c.json({ error: "endpoint required" }, 400);

  const sb = getServiceDelivery();
  const table = tableForAudience(audience);
  const userCol = userIdColumn(audience);
  const { error } = await sb
    .from(table)
    .delete()
    .eq(userCol, user.id)
    .eq("endpoint", endpoint);

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true, audience });
});

/** Courier offer alert — send web-push to stored subscriptions when VAPID configured. */
app.post("/courier-offer", async (c) => {
  const serviceKey = c.req.header("x-service-role") || "";
  if (serviceKey !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const courierUserId = String(body.courierUserId || "");
  const orderId = body.orderId ? String(body.orderId) : null;
  const event = String(body.event || "new_offer");
  if (!courierUserId) return c.json({ error: "courierUserId required" }, 400);

  const title = event === "offer_accepted" ? "Offer accepted" : "New delivery offer";
  const message = event === "offer_accepted"
    ? "Head to the restaurant to pick up."
    : "A nearby order is ready — open Dash Courier to accept.";

  const result = await fanoutPush({
    audience: "courier",
    userId: courierUserId,
    title,
    message,
    url: "/",
    extraPayload: { orderId, event },
    logTag: "notifications/courier-offer",
  });

  if (result.body) return c.json(result.body, result.code);
  return c.json({ ok: true, status: result.status, sent: result.sent }, result.code);
});

/** Customer order-status push — additive to SMS from dashOrderSms. */
app.post("/customer-order-status", async (c) => {
  const serviceKey = c.req.header("x-service-role") || "";
  if (serviceKey !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const customerUserId = String(body.customerUserId || "");
  const orderId = body.orderId ? String(body.orderId) : null;
  const orderNumber = String(body.orderNumber || orderId || "your order");
  const status = String(body.status || "");
  const merchantName = body.merchantName ? String(body.merchantName) : null;
  if (!customerUserId || !status) {
    return c.json({ error: "customerUserId and status required" }, 400);
  }

  const label = merchantName ? ` from ${merchantName}` : "";
  const statusMessages: Record<string, string> = {
    accepted: `${orderNumber}${label} was accepted and is being prepared.`,
    preparing: `${orderNumber}${label} is being prepared.`,
    ready: `${orderNumber}${label} is ready for pickup.`,
    picked_up: `Your courier picked up ${orderNumber}. Track in the app.`,
    in_transit: `${orderNumber} is on the way.`,
    delivered: `${orderNumber} was delivered. Enjoy!`,
    completed: `${orderNumber} is complete. Thanks for ordering.`,
    cancelled: `${orderNumber} was cancelled.`,
  };
  const message = statusMessages[status] ||
    `${orderNumber} update — status is now ${status}.`;

  const result = await fanoutPush({
    audience: "customer",
    userId: customerUserId,
    title: "Roam Rush",
    message,
    url: orderId ? `/tracking?orderId=${orderId}` : "/",
    extraPayload: { orderId, status, event: "order_status" },
    logTag: "notifications/customer-order-status",
  });

  if (result.body) return c.json(result.body, result.code);
  return c.json({ ok: true, status: result.status, sent: result.sent }, result.code);
});

/** Internal SMS intent logger — real SMS is dashOrderSms in delivery. */
app.post("/order-sms", async (c) => {
  const serviceKey = c.req.header("x-service-role") || "";
  if (serviceKey !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const phone = String(body.phone || "");
  const message = String(body.message || "").slice(0, 320);
  if (!phone || !message) return c.json({ error: "phone and message required" }, 400);

  console.log("[notifications/order-sms] deferred to dashOrderSms", {
    phone: phone.slice(-4),
    message,
  });

  return c.json({
    ok: true,
    status: "use_dash_order_sms",
    message: "Customer SMS is sent via delivery/dashOrderSms, not this endpoint.",
  }, 202);
});

Deno.serve(app.fetch);
