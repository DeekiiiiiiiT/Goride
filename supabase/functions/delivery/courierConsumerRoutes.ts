/**
 * Courier-facing delivery routes (availability, offers, proofs, issues, earnings, payouts).
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dualWriteDashPayment } from "../_shared/unifiedLedger/dualWriteDash.ts";

type Sb = ReturnType<typeof createClient>;

type Deps = {
  getSupabase: (authHeader: string) => Sb;
  getServiceSupabase: () => Sb;
};

const COURIER_TRANSITIONS: Record<string, string[]> = {
  assigned: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: ["completed"],
};

async function requireCourierUser(
  authHeader: string | undefined,
  getSupabase: Deps["getSupabase"],
): Promise<{ userId: string; supabase: Sb } | Response> {
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  const supabase = getSupabase(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  return { userId: user.id, supabase };
}

async function requireActiveCourier(
  serviceSb: Sb,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data: profile } = await serviceSb
    .from("courier_profiles")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) return { ok: false, status: 403, error: "Courier profile required" };
  if (profile.status !== "active") {
    return { ok: false, status: 403, error: `Courier status is ${profile.status}` };
  }
  return { ok: true };
}

/** Haversine distance in km */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const DISPATCH_RADIUS_KM = Number(Deno.env.get("COURIER_DISPATCH_RADIUS_KM") || 12);
const DISPATCH_MAX_OFFERS = Number(Deno.env.get("COURIER_DISPATCH_MAX_OFFERS") || 15);
const DISPATCH_OFFER_TTL_MS = Number(Deno.env.get("COURIER_DISPATCH_OFFER_TTL_MS") || 90_000);

/** Fan out pending offers to nearby online couriers (proximity-ranked, capped). */
async function dispatchOffersForOrder(
  serviceSb: Sb,
  orderId: string,
  wave = 1,
): Promise<number> {
  const { data: order } = await serviceSb
    .from("orders")
    .select("id, status, courier_id, delivery_lat, delivery_lng, merchant_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "ready" || order.courier_id) return 0;

  let originLat = Number(order.delivery_lat);
  let originLng = Number(order.delivery_lng);
  if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
    const { data: merchant } = await serviceSb
      .from("merchants")
      .select("lat, lng")
      .eq("id", order.merchant_id)
      .maybeSingle();
    originLat = Number(merchant?.lat);
    originLng = Number(merchant?.lng);
  }

  const { data: online } = await serviceSb
    .from("courier_availability")
    .select("driver_id, current_lat, current_lng")
    .eq("is_online", true)
    .is("active_order_id", null)
    .limit(80);

  type Ranked = { driver_id: string; km: number };
  const ranked: Ranked[] = [];
  for (const row of online || []) {
    const lat = Number(row.current_lat);
    const lng = Number(row.current_lng);
    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      // No origin coords — fall back to unranked include (soft-launch safety)
      ranked.push({ driver_id: row.driver_id, km: 999 });
      continue;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const km = haversineKm(originLat, originLng, lat, lng);
    if (km <= DISPATCH_RADIUS_KM) {
      ranked.push({ driver_id: row.driver_id, km });
    }
  }
  ranked.sort((a, b) => a.km - b.km);
  const targets = ranked.slice(0, DISPATCH_MAX_OFFERS);

  const expiresAt = new Date(Date.now() + DISPATCH_OFFER_TTL_MS).toISOString();
  let created = 0;
  for (const row of targets) {
    const { error } = await serviceSb.from("courier_offers").upsert(
      {
        order_id: orderId,
        courier_user_id: row.driver_id,
        status: "pending",
        wave,
        expires_at: expiresAt,
      },
      { onConflict: "order_id,courier_user_id,wave", ignoreDuplicates: true },
    );
    if (!error) {
      created += 1;
      try {
        const notifUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notifications/courier-offer`;
        await fetch(notifUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "x-service-role": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
          },
          body: JSON.stringify({
            courierUserId: row.driver_id,
            orderId,
            event: "new_offer",
          }),
        });
      } catch {
        // non-fatal
      }
    }
  }
  return created;
}

/** Expire stale offers and re-dispatch ready orders that still need a courier. */
async function redispatchExpiredOffers(serviceSb: Sb): Promise<{ expired: number; redispatched: number }> {
  const nowIso = new Date().toISOString();
  const { data: expiredRows } = await serviceSb
    .from("courier_offers")
    .update({ status: "expired", updated_at: nowIso })
    .eq("status", "pending")
    .lt("expires_at", nowIso)
    .select("order_id");

  const expired = expiredRows?.length || 0;
  const orderIds = [...new Set((expiredRows || []).map((r) => String(r.order_id)))];

  const { data: stranded } = await serviceSb
    .from("orders")
    .select("id")
    .eq("status", "ready")
    .is("courier_id", null)
    .limit(40);

  const toRedispatch = new Set([
    ...orderIds,
    ...(stranded || []).map((o) => String(o.id)),
  ]);

  let redispatched = 0;
  for (const orderId of toRedispatch) {
    const { data: pending } = await serviceSb
      .from("courier_offers")
      .select("id")
      .eq("order_id", orderId)
      .eq("status", "pending")
      .limit(1);
    if (pending && pending.length > 0) continue;

    const { data: lastWave } = await serviceSb
      .from("courier_offers")
      .select("wave")
      .eq("order_id", orderId)
      .order("wave", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextWave = Number(lastWave?.wave || 0) + 1;
    const created = await dispatchOffersForOrder(serviceSb, orderId, nextWave);
    if (created > 0) redispatched += 1;
  }

  return { expired, redispatched };
}

export function registerCourierConsumerRoutes(app: Hono, deps: Deps) {
  const { getSupabase, getServiceSupabase } = deps;

  // Upsert online/offline + GPS
  app.put("/courier/availability", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const isOnline = Boolean(body.isOnline ?? body.is_online);
    const lat = body.lat != null ? Number(body.lat) : null;
    const lng = body.lng != null ? Number(body.lng) : null;
    const activeOrderId = body.activeOrderId ?? body.active_order_id ?? null;

    const serviceSb = getServiceSupabase();
    if (isOnline) {
      const gate = await requireActiveCourier(serviceSb, auth.userId);
      if (!gate.ok) return c.json({ error: gate.error }, gate.status);
    }

    const { data: existing } = await serviceSb
      .from("courier_availability")
      .select("id")
      .eq("driver_id", auth.userId)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      driver_id: auth.userId,
      is_online: isOnline,
      last_location_update: new Date().toISOString(),
      active_order_id: activeOrderId,
    };
    if (lat != null && Number.isFinite(lat)) payload.current_lat = lat;
    if (lng != null && Number.isFinite(lng)) payload.current_lng = lng;

    if (existing?.id) {
      const { data, error } = await serviceSb
        .from("courier_availability")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return c.json({ error: error.message }, 500);
      return c.json({ availability: data });
    }

    const { data, error } = await serviceSb
      .from("courier_availability")
      .insert(payload)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ availability: data });
  });

  // Pending offers for this courier (Realtime also available on table)
  app.get("/courier/offers", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const serviceSb = getServiceSupabase();

    // Expire stale
    await serviceSb
      .from("courier_offers")
      .update({ status: "expired" })
      .eq("courier_user_id", auth.userId)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    const { data, error } = await serviceSb
      .from("courier_offers")
      .select(`
        *,
        order:orders(
          id, order_number, status, total, delivery_fee, tip, delivery_address,
          delivery_lat, delivery_lng, ready_at, delivery_instructions, items,
          merchant:merchants(id, name, address, lat, lng, phone, vertical_type, fulfillment_type),
          customer:customers(name, phone)
        )
      `)
      .eq("courier_user_id", auth.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ offers: data || [] });
  });

  // Dispatch offers for a ready order (merchant/system or courier soft-launch poll helper)
  app.post("/courier/offers/dispatch", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const orderId = String(body.orderId || body.order_id || "");
    if (!orderId) return c.json({ error: "orderId required" }, 400);
    const serviceSb = getServiceSupabase();
    const created = await dispatchOffersForOrder(serviceSb, orderId);
    return c.json({ created });
  });

  // Cron/internal: expire stale offers and re-dispatch stranded ready orders
  app.post("/courier/offers/redispatch", async (c) => {
    const cronSecret = c.req.header("x-fleet-cron-secret") || c.req.header("x-rides-cron-secret") || "";
    const serviceKey = c.req.header("x-service-role") || "";
    const expectedCron = Deno.env.get("FLEET_CRON_SECRET") || Deno.env.get("RIDES_CRON_SECRET") || "";
    const expectedService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const ok =
      (expectedCron && cronSecret && cronSecret === expectedCron) ||
      (expectedService && serviceKey && serviceKey === expectedService);
    if (!ok) return c.json({ error: "Forbidden" }, 403);

    const serviceSb = getServiceSupabase();
    const result = await redispatchExpiredOffers(serviceSb);
    return c.json({ ok: true, ...result });
  });

  // Accept a courier_offers row (or fall back to order accept)
  app.post("/courier/offers/:id/accept", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const offerId = c.req.param("id");
    const serviceSb = getServiceSupabase();

    const gate = await requireActiveCourier(serviceSb, auth.userId);
    if (!gate.ok) return c.json({ error: gate.error }, gate.status);

    const { data: offer } = await serviceSb
      .from("courier_offers")
      .select("id, order_id, status, expires_at, courier_user_id")
      .eq("id", offerId)
      .maybeSingle();

    if (!offer || offer.courier_user_id !== auth.userId) {
      return c.json({ error: "Offer not found" }, 404);
    }
    if (offer.status !== "pending") {
      return c.json({ error: "Offer no longer available" }, 400);
    }
    if (new Date(offer.expires_at).getTime() < Date.now()) {
      await serviceSb.from("courier_offers").update({ status: "expired" }).eq("id", offerId);
      return c.json({ error: "Offer expired" }, 400);
    }

    const { data: order, error } = await serviceSb
      .from("orders")
      .update({
        courier_id: auth.userId,
        status: "assigned",
        assigned_at: new Date().toISOString(),
      })
      .eq("id", offer.order_id)
      .eq("status", "ready")
      .is("courier_id", null)
      .select()
      .maybeSingle();

    if (error || !order) {
      await serviceSb.from("courier_offers").update({ status: "superseded" }).eq("id", offerId);
      return c.json({ error: "Order not available" }, 400);
    }

    await serviceSb.from("courier_offers").update({ status: "accepted" }).eq("id", offerId);
    await serviceSb
      .from("courier_offers")
      .update({ status: "superseded" })
      .eq("order_id", offer.order_id)
      .eq("status", "pending")
      .neq("id", offerId);

    await serviceSb.from("order_events").insert({
      order_id: offer.order_id,
      status: "assigned",
      actor_type: "courier",
      actor_id: auth.userId,
      notes: "courier_offer_accepted",
    });

    await serviceSb
      .from("courier_availability")
      .update({ active_order_id: offer.order_id, is_online: true })
      .eq("driver_id", auth.userId);

    // Best-effort push notify stub
    try {
      const notifUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/notifications/courier-offer`;
      await fetch(notifUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-service-role": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
        },
        body: JSON.stringify({
          courierUserId: auth.userId,
          orderId: offer.order_id,
          event: "offer_accepted",
        }),
      });
    } catch {
      // non-fatal
    }

    return c.json({ order, offerId });
  });

  app.post("/courier/offers/:id/decline", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const offerId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const serviceSb = getServiceSupabase();

    const { data: offer } = await serviceSb
      .from("courier_offers")
      .select("id, courier_user_id, status")
      .eq("id", offerId)
      .maybeSingle();

    if (!offer || offer.courier_user_id !== auth.userId) {
      return c.json({ error: "Offer not found" }, 404);
    }
    if (offer.status !== "pending") {
      return c.json({ error: "Offer not pending" }, 400);
    }

    await serviceSb
      .from("courier_offers")
      .update({ status: "declined" })
      .eq("id", offerId);

    return c.json({ ok: true, reason: body.reasonId ?? null });
  });

  // Age-verify / POD / pickup photo evidence
  app.post("/orders/:id/courier-proof", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const orderId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const kind = String(body.kind || ""); // age_verify | pickup | delivery
    const photoUrl = String(body.photoUrl || body.photo_url || "");
    if (!photoUrl) return c.json({ error: "photoUrl required" }, 400);
    if (!["age_verify", "pickup", "delivery"].includes(kind)) {
      return c.json({ error: "kind must be age_verify, pickup, or delivery" }, 400);
    }

    const serviceSb = getServiceSupabase();
    const { data: order } = await serviceSb
      .from("orders")
      .select("id, courier_id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (!order || order.courier_id !== auth.userId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const col =
      kind === "age_verify"
        ? "age_verify_photo_url"
        : kind === "pickup"
        ? "pickup_photo_url"
        : "delivery_photo_url";

    const { data: updated, error } = await serviceSb
      .from("orders")
      .update({ [col]: photoUrl })
      .eq("id", orderId)
      .select("id, age_verify_photo_url, pickup_photo_url, delivery_photo_url")
      .single();

    if (error) return c.json({ error: error.message }, 500);

    await serviceSb.from("order_events").insert({
      order_id: orderId,
      status: order.status,
      actor_type: "courier",
      actor_id: auth.userId,
      notes: `proof:${kind}:${photoUrl.slice(0, 200)}`,
    });

    return c.json({ order: updated });
  });

  app.post("/orders/:id/courier-issue", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const orderId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const issueType = String(body.issueType || body.issue_type || body.issueId || "");
    const notes = body.notes ? String(body.notes) : null;
    const photoUrl = body.photoUrl || body.photo_url || null;
    if (!issueType) return c.json({ error: "issueType required" }, 400);

    const serviceSb = getServiceSupabase();
    const { data: order } = await serviceSb
      .from("orders")
      .select("id, courier_id")
      .eq("id", orderId)
      .maybeSingle();

    if (!order || order.courier_id !== auth.userId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const { data, error } = await serviceSb
      .from("courier_delivery_issues")
      .insert({
        order_id: orderId,
        courier_user_id: auth.userId,
        issue_type: issueType,
        notes,
        photo_url: photoUrl,
      })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);

    // Abort-class issues must cancel the order and free the courier (clear active_order_id)
    const abortTypes = new Set([
      "customer_unavailable",
      "wrong_address",
      "unsafe",
      "accident",
      "vehicle_issue",
      "unable_to_complete",
      "cancel",
      "cancelled",
    ]);
    const shouldAbort = abortTypes.has(issueType.toLowerCase()) ||
      String(body.abort || body.cancelOrder || "").toLowerCase() === "true";

    if (shouldAbort) {
      await serviceSb
        .from("orders")
        .update({
          status: "cancelled",
          cancelled_by: "courier",
          cancellation_reason: notes || issueType,
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("courier_id", auth.userId);

      // Clear by active_order_id so a mismatched courier_id cannot leave the courier stuck
      await serviceSb
        .from("courier_availability")
        .update({
          active_order_id: null,
          status: "online",
          updated_at: new Date().toISOString(),
        })
        .eq("active_order_id", orderId);

      await serviceSb
        .from("courier_offers")
        .update({ status: "superseded", updated_at: new Date().toISOString() })
        .eq("order_id", orderId)
        .in("status", ["pending", "offered", "sent"]);
    }

    await serviceSb.from("order_events").insert({
      order_id: orderId,
      status: shouldAbort ? "cancelled" : "issue_reported",
      actor_type: "courier",
      actor_id: auth.userId,
      notes: `issue:${issueType}`,
    });

    return c.json({ issue: data, aborted: shouldAbort });
  });

  // Earnings from completed deliveries
  app.get("/courier/earnings", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const serviceSb = getServiceSupabase();
    const period = String(c.req.query("period") || "today");

    const now = new Date();
    let start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (period === "week") {
      const day = start.getDay();
      start.setDate(start.getDate() - day);
    } else if (period === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const { data: orders, error } = await serviceSb
      .from("orders")
      .select(`
        id, order_number, status, delivery_fee, tip, delivered_at, delivery_address,
        merchant:merchants(name)
      `)
      .eq("courier_id", auth.userId)
      .in("status", ["delivered", "completed"])
      .gte("delivered_at", start.toISOString())
      .order("delivered_at", { ascending: false });

    if (error) return c.json({ error: error.message }, 500);

    const rows = orders || [];
    let total = 0;
    const deliveries = rows.map((o) => {
      const fee = Number(o.delivery_fee || 0);
      const tip = Number(o.tip || 0);
      const amount = fee + tip;
      total += amount;
      const merchant = o.merchant as { name?: string } | null;
      return {
        id: o.id,
        orderNumber: o.order_number,
        restaurant: merchant?.name || "Merchant",
        dropoff: o.delivery_address,
        amount,
        time: o.delivered_at,
      };
    });

    const { data: payouts } = await serviceSb
      .schema("payments")
      .from("courier_payouts")
      .select("*")
      .eq("courier_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(20);

    return c.json({
      period,
      total,
      deliveryCount: deliveries.length,
      deliveries,
      payouts: payouts || [],
    });
  });

  // Ops: create a payout period row from completed deliveries (idempotent per courier+period)
  app.post("/courier/payouts/close-period", async (c) => {
    const auth = await requireCourierUser(c.req.header("Authorization"), getSupabase);
    if (auth instanceof Response) return auth;
    const body = await c.req.json().catch(() => ({}));
    const periodStart = String(body.periodStart || body.period_start || "");
    const periodEnd = String(body.periodEnd || body.period_end || "");
    if (!periodStart || !periodEnd) {
      return c.json({ error: "periodStart and periodEnd required" }, 400);
    }

    const periodStartDate = periodStart.slice(0, 10);
    const periodEndDate = periodEnd.slice(0, 10);
    const paymentsSb = createPaymentsClient();

    // Idempotency: return existing row for this exact period instead of inserting again
    const { data: existing } = await paymentsSb
      .from("courier_payouts")
      .select("*")
      .eq("courier_id", auth.userId)
      .eq("period_start", periodStartDate)
      .eq("period_end", periodEndDate)
      .maybeSingle();

    if (existing) {
      return c.json({ payout: existing, idempotent: true });
    }

    const serviceSb = getServiceSupabase();
    const { data: orders, error } = await serviceSb
      .from("orders")
      .select("id, delivery_fee, tip, delivered_at")
      .eq("courier_id", auth.userId)
      .in("status", ["delivered", "completed"])
      .gte("delivered_at", periodStart)
      .lte("delivered_at", periodEnd);

    if (error) return c.json({ error: error.message }, 500);
    const rows = orders || [];
    const amount = rows.reduce(
      (sum, o) => sum + Number(o.delivery_fee || 0) + Number(o.tip || 0),
      0,
    );

    const { data: payout, error: payoutError } = await paymentsSb
      .from("courier_payouts")
      .insert({
        courier_id: auth.userId,
        amount,
        currency: "JMD",
        status: "pending",
        period_start: periodStartDate,
        period_end: periodEndDate,
        delivery_count: rows.length,
      })
      .select()
      .single();

    // Race: unique index may reject a concurrent insert — return the winner
    if (payoutError) {
      const msg = String(payoutError.message || "");
      if (/unique|duplicate/i.test(msg)) {
        const { data: raced } = await paymentsSb
          .from("courier_payouts")
          .select("*")
          .eq("courier_id", auth.userId)
          .eq("period_start", periodStartDate)
          .eq("period_end", periodEndDate)
          .maybeSingle();
        if (raced) return c.json({ payout: raced, idempotent: true });
      }
      return c.json({ error: payoutError.message }, 500);
    }
    try {
      await dualWriteDashPayment({
        transactionId: String(payout.id),
        orderId: String(payout.id),
        courierId: auth.userId,
        amount: Number(payout.amount ?? amount),
        currency: String(payout.currency ?? "JMD"),
        kind: "courier_payout",
      });
    } catch (dwErr) {
      console.error("[courier payout] unified dual-write failed:", dwErr);
    }
    return c.json({ payout });
  });
}

function createPaymentsClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "payments" } },
  );
}

// Re-export for status handler use
export { COURIER_TRANSITIONS, requireActiveCourier, dispatchOffersForOrder, redispatchExpiredOffers };
