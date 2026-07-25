/**
 * Merchant Web Push — sends notifications to subscribed merchant devices.
 * Requires MERCHANT_PUSH_SECRET (or FLEET_CRON_SECRET) via X-Merchant-Push-Secret
 * or Authorization: Bearer <secret>. Database webhooks must send the same secret.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { buildCorsOriginFn } from "../_shared/corsAllowlist.ts";
import { requireInternalSecret } from "../_shared/requireInternalSecret.ts";
import { timingSafeEqual } from "../_shared/timingSafeEqual.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeadersFor(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  // Accept dedicated secret or shared cron secret (for DB webhook / service invoke)
  const denied = requireInternalSecret(req, {
    envKeys: ["MERCHANT_PUSH_SECRET", "FLEET_CRON_SECRET", "RIDES_CRON_SECRET"],
    headerNames: ["X-Merchant-Push-Secret", "X-Fleet-Cron-Secret", "X-Rides-Cron-Secret"],
  });
  // Also allow Authorization: Bearer <secret> for supabase.functions.invoke with service role wrappers
  if (denied) {
    const auth = req.headers.get("Authorization") ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const expected =
      Deno.env.get("MERCHANT_PUSH_SECRET")?.trim() ||
      Deno.env.get("FLEET_CRON_SECRET")?.trim() ||
      Deno.env.get("RIDES_CRON_SECRET")?.trim() ||
      "";
    if (!expected || !bearer || !timingSafeEqual(bearer, expected)) {
      // Service-role JWT is not a push secret — reject anon/user spam
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
      if (!serviceKey || !bearer || !timingSafeEqual(bearer, serviceKey)) {
        const body = await denied.text();
        return new Response(body, {
          status: denied.status,
          headers: { ...corsHeadersFor(req), "Content-Type": "application/json" },
        });
      }
    }
  }

  try {
    configureVapid();
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

    const payload = JSON.stringify({ title, body: message, url });
    let sent = 0;
    const stale: string[] = [];

    for (const sub of subscriptions || []) {
      try {
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
