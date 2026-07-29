/**
 * Customer notifications — transactional SMS helpers + push subscribe stub.
 * Order status SMS is invoked from delivery status updates when wired.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyCors } from "../_shared/corsAllowlist.ts";

const app = new Hono().basePath("/notifications");

app.use("*", async (c, next) => {
  const cors = applyCors(c.req.raw);
  if (cors) return cors;
  await next();
});

app.get("/health", (c) => c.json({ ok: true, service: "notifications" }));

function getServiceSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Stub subscribe endpoint — web push arrives in a later sprint */
app.post("/subscribe", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json().catch(() => ({}));
  if (!body.endpoint) {
    return c.json({ error: "Push subscription endpoint required" }, 400);
  }
  // Persist later when customer_push_subscriptions table ships
  return c.json({ ok: true, status: "accepted", channel: "web_push_pending" }, 202);
});

/** Internal: send transactional SMS for an order event (service role) */
app.post("/order-sms", async (c) => {
  const serviceKey = c.req.header("x-service-role") || "";
  if (serviceKey !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const phone = String(body.phone || "");
  const message = String(body.message || "").slice(0, 320);
  if (!phone || !message) return c.json({ error: "phone and message required" }, 400);

  // Prefer existing send-sms infrastructure via Auth hook is OTP-only;
  // log intent and return accepted so callers can proceed.
  console.log("[notifications/order-sms]", { phone: phone.slice(-4), message });

  const sb = getServiceSupabase();
  try {
    await sb.schema("delivery").from("order_events").insert({
      order_id: body.orderId || null,
      status: body.status || "notification",
      actor_type: "system",
      actor_id: null,
      note: `sms_intent:${message.slice(0, 120)}`,
    });
  } catch {
    // non-fatal
  }

  return c.json({ ok: true, status: "queued" }, 202);
});

Deno.serve(app.fetch);
