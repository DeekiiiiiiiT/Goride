/**
 * Merchant Web Push + native FCM — sends notifications to subscribed merchant devices.
 *
 * Auth (this function is deployed with verify_jwt = false, so this check IS the gate):
 *   X-Merchant-Push-Secret / X-Fleet-Cron-Secret / X-Rides-Cron-Secret, or
 *   Authorization: Bearer <one of those secrets>, or Authorization: Bearer <server key>.
 *   The database trigger sends X-Fleet-Cron-Secret (see
 *   supabase/migrations/20261124044708_merchant_push_trigger_cron_secret.sql).
 *
 * Native sends: FCM_SERVICE_ACCOUNT_JSON (HTTP v1) or legacy FCM_SERVER_KEY.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
// corsOrigins directly: corsAllowlist.ts pulls the deno.land Hono build, which this
// function never uses.
import { buildCorsOriginFn } from "../_shared/corsOrigins.ts";
import { sendFcmPush } from "../_shared/fcmSend.ts";
import { authorizeInternalRequest } from "../_shared/requireInternalSecret.ts";
import { requireServiceKey, serviceKeyCandidates } from "../_shared/serviceKey.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  requireServiceKey(),
  { db: { schema: "delivery" } },
);

const corsOriginFn = buildCorsOriginFn();

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = corsOriginFn(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-merchant-push-secret, x-fleet-cron-secret, x-rides-cron-secret",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = allowed;
  return headers;
}

function jsonResponse(
  req: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
  });
}

function configureVapid() {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@roam.app";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

function formatJmd(amount: unknown) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "";
  return `J$${value.toLocaleString("en-JM", { maximumFractionDigits: 0 })}`;
}

function resolvePushRequest(body: Record<string, unknown>) {
  // Direct API: { merchantId, title, body, url }
  if (body.merchantId) {
    return {
      merchantId: String(body.merchantId),
      title: (body.title as string) || "New order",
      message: (body.body as string) || "You have a new order",
      url: (body.url as string) || "/orders",
    };
  }

  // Supabase Database Webhook: { type, record: { merchant_id, order_number, total, ... } }
  const record = body.record as Record<string, unknown> | undefined;
  if (record?.merchant_id) {
    const orderNumber = record.order_number ? String(record.order_number) : "New";
    const total = formatJmd(record.total);
    return {
      merchantId: String(record.merchant_id),
      title: "New order",
      message: total
        ? `Order #${orderNumber} — ${total}`
        : `Order #${orderNumber} received`,
      url: "/orders",
    };
  }

  return null;
}

type PushSubRow = {
  id: string;
  endpoint: string;
  channel?: string | null;
  p256dh?: string | null;
  auth?: string | null;
};

function resolveChannel(sub: PushSubRow): "web" | "fcm" | "apns" {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  // Accept the dedicated push secret, the shared cron secret (database trigger / jobs),
  // or a Bearer holding any of those — plus the server key, so the pre-rotation caller
  // (old trigger carrying the service_role JWT) keeps working until phase 8.
  const denied = authorizeInternalRequest(req, {
    envKeys: ["MERCHANT_PUSH_SECRET", "FLEET_CRON_SECRET", "RIDES_CRON_SECRET"],
    headerNames: ["X-Merchant-Push-Secret", "X-Fleet-Cron-Secret", "X-Rides-Cron-Secret"],
    alsoAccept: serviceKeyCandidates(),
  });
  if (denied) {
    const body = await denied.text();
    return new Response(body, {
      status: denied.status,
      headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const resolved = resolvePushRequest(body as Record<string, unknown>);

    if (!resolved) {
      return jsonResponse(req, { error: "merchantId or record.merchant_id required" }, 400);
    }

    const { merchantId, title, message, url } = resolved;

    const { data: subscriptions, error } = await supabase
      .from("merchant_push_subscriptions")
      .select("*")
      .eq("merchant_id", merchantId);

    if (error) {
      return jsonResponse(req, { error: error.message }, 500);
    }

    const rows = (subscriptions || []) as PushSubRow[];
    const hasWeb = rows.some((s) => resolveChannel(s) === "web");
    if (hasWeb) {
      configureVapid();
    }

    const payload = JSON.stringify({ title, body: message, url });
    let sent = 0;
    const stale: string[] = [];

    for (const sub of rows) {
      const channel = resolveChannel(sub);
      try {
        if (channel === "fcm" || channel === "apns") {
          const token = nativeDeviceToken(sub, channel);
          const result = await sendFcmPush(token, title, message, url, "merchant-push");
          if (result.stale) stale.push(sub.endpoint);
          if (result.ok) {
            sent += 1;
            await supabase
              .from("merchant_push_subscriptions")
              .update({ last_used_at: new Date().toISOString() })
              .eq("id", sub.id);
          }
          continue;
        }

        if (!sub.p256dh || !sub.auth) {
          console.warn("[merchant-push] skipping web sub missing keys:", sub.id);
          continue;
        }

        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { timeout: 10000 },
        );
        sent += 1;
        await supabase
          .from("merchant_push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale.push(sub.endpoint);
        }
        console.error("[merchant-push] send failed:", err);
      }
    }

    if (stale.length > 0) {
      await supabase
        .from("merchant_push_subscriptions")
        .delete()
        .in("endpoint", stale);
    }

    return jsonResponse(req, { ok: true, sent, stale: stale.length });
  } catch (e) {
    console.error("[merchant-push]", e);
    return jsonResponse(req, { error: "Push failed" }, 500);
  }
});
