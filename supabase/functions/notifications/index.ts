/**
 * Notifications — courier web-push subscribe + offer alerts.
 * Customer SMS remains on dashOrderSms (delivery function), not this stub.
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

/** Persist courier push subscription (requires VAPID for later delivery). */
app.post("/subscribe", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

  const auth = getAuthClient(authHeader);
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json().catch(() => ({}));
  const endpoint = String(body.endpoint || "");
  if (!endpoint) {
    return c.json({ error: "Push subscription endpoint required" }, 400);
  }

  const keys = (body.keys || {}) as { p256dh?: string; auth?: string };
  const audience = String(body.audience || "courier");
  if (audience !== "courier") {
    return c.json({ error: "Only courier audience is supported here" }, 400);
  }

  const sb = getServiceDelivery();
  const { error } = await sb.from("courier_push_subscriptions").upsert(
    {
      courier_user_id: user.id,
      endpoint,
      p256dh: keys.p256dh ?? null,
      auth: keys.auth ?? null,
      user_agent: c.req.header("user-agent")?.slice(0, 250) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "courier_user_id,endpoint" },
  );

  if (error) return c.json({ error: error.message }, 500);

  const vapidReady = Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY"));
  return c.json({
    ok: true,
    status: vapidReady ? "subscribed" : "stored_awaiting_vapid",
    channel: "web_push",
  }, 201);
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

  const sb = getServiceDelivery();
  const { data: subs } = await sb
    .from("courier_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("courier_user_id", courierUserId);

  if (!subs?.length) {
    console.log("[notifications/courier-offer] no subscriptions", {
      courier: courierUserId.slice(0, 8),
      orderId,
      event,
    });
    return c.json({ ok: true, status: "no_subscribers", sent: 0 }, 202);
  }

  if (!configureVapid()) {
    console.error("[notifications/courier-offer] VAPID not configured", {
      courier: courierUserId.slice(0, 8),
      orderId,
      event,
      subscribers: subs.length,
    });
    if (requireVapidConfigured()) {
      return c.json({
        ok: false,
        error: "VAPID keys not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY",
        status: "vapid_required",
      }, 503);
    }
    return c.json({
      ok: true,
      status: "queued_awaiting_vapid",
      channel: "web_push",
      subscribers: subs.length,
    }, 202);
  }

  const payload = JSON.stringify({
    title,
    body: message,
    url: "/",
    orderId,
    event,
  });

  let sent = 0;
  for (const sub of subs) {
    if (!sub.endpoint || !sub.p256dh || !sub.auth) continue;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      );
      sent += 1;
    } catch (err) {
      console.error("[notifications/courier-offer] push failed", err);
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await sb.from("courier_push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }

  return c.json({ ok: true, status: "sent", channel: "web_push", sent }, 200);
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
