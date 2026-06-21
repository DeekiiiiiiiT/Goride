/**
 * Merchant Web Push — sends notifications to subscribed merchant devices.
 * Invoke with service role: { merchantId, title, body, url }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { db: { schema: "delivery" } },
);

function configureVapid() {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@roam.app";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    configureVapid();
    const body = await req.json();
    const merchantId = body.merchantId as string;
    const title = (body.title as string) || "New order";
    const message = (body.body as string) || "You have a new order";
    const url = (body.url as string) || "/orders";

    if (!merchantId) {
      return new Response(JSON.stringify({ error: "merchantId required" }), { status: 400 });
    }

    const { data: subscriptions, error } = await supabase
      .from("merchant_push_subscriptions")
      .select("*")
      .eq("merchant_id", merchantId);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
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

    return new Response(JSON.stringify({ ok: true, sent, stale: stale.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[merchant-push]", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
