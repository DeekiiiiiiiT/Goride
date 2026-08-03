/**
 * Roam Enterprise — Freight Forwarding service (Path B)
 * Domestic shipments + Jamaica intl mailbox pipeline (packages/manifests/hub/fulfillment).
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { z } from "https://deno.land/x/zod@v3.24.2/mod.ts";
import { applyCors } from "../_shared/corsAllowlist.ts";
import {
  requireEnterpriseAccess,
  serviceClient,
  type EnterpriseAccessUser,
} from "../_shared/enterpriseAccess.ts";
import { ledgerPostEntry } from "../_shared/unifiedLedger/postEntry.ts";
import { SHIPMENT_TRANSITIONS } from "./transitions.ts";
import { registerPipelineRoutes } from "./pipeline.ts";
import { syncJobFromShipment } from "../logistics/syncFromShipment.ts";
import { computeRateCardAmountMinor } from "./rateBill.ts";
import { assertInsideServiceZones } from "./serviceZoneGate.ts";

const app = new Hono().basePath("/freight");

applyCors(app, {
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: [
    "Content-Type",
    "Authorization",
    "apikey",
    "x-client-info",
    "X-Roam-Product-Line",
    "X-Roam-Settings-Segment",
    "X-Roam-Organization-Id",
    "Idempotency-Key",
  ],
});

function freightDb() {
  return serviceClient().schema("freight");
}

async function requireUser(c: {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
}): Promise<EnterpriseAccessUser | Response> {
  return requireEnterpriseAccess(c);
}

function refCode(): string {
  const n = Math.floor(Math.random() * 1e6)
    .toString()
    .padStart(6, "0");
  return `FF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${n}`;
}

async function appendTracking(
  orgId: string,
  shipmentId: string,
  status: string,
  actorUserId: string,
  note?: string,
  legId?: string | null,
) {
  await freightDb().from("tracking_events").insert({
    organization_id: orgId,
    shipment_id: shipmentId,
    leg_id: legId ?? null,
    status,
    note: note ?? null,
    actor_user_id: actorUserId,
    occurred_at: new Date().toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/health", (c) => c.json({ ok: true, service: "freight" }));

registerPipelineRoutes(app);

// ---------------------------------------------------------------------------
// Carriers
// ---------------------------------------------------------------------------
const carrierBody = z.object({
  name: z.string().min(1).max(200),
  isOwnFleet: z.boolean().default(false),
  contactName: z.string().max(200).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal("")),
  contactPhone: z.string().max(50).optional().nullable(),
  capacityNotes: z.string().max(2000).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

app.get("/carriers", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const own = c.req.query("own");
  let q = freightDb()
    .from("carriers")
    .select("*")
    .eq("organization_id", user.organizationId)
    .order("name");
  if (own === "true") q = q.eq("is_own_fleet", true);
  if (own === "false") q = q.eq("is_own_fleet", false);
  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ carriers: data ?? [] });
});

app.post("/carriers", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const parsed = carrierBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const { data, error } = await freightDb()
    .from("carriers")
    .insert({
      organization_id: user.organizationId,
      name: b.name,
      is_own_fleet: b.isOwnFleet,
      contact_name: b.contactName || null,
      contact_email: b.contactEmail || null,
      contact_phone: b.contactPhone || null,
      capacity_notes: b.capacityNotes || null,
      status: b.status ?? "active",
    })
    .select("*")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ carrier: data }, 201);
});

app.patch("/carriers/:id", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const parsed = carrierBody.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const { data, error } = await freightDb()
    .from("carriers")
    .update({
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.isOwnFleet !== undefined ? { is_own_fleet: b.isOwnFleet } : {}),
      ...(b.contactName !== undefined ? { contact_name: b.contactName } : {}),
      ...(b.contactEmail !== undefined ? { contact_email: b.contactEmail || null } : {}),
      ...(b.contactPhone !== undefined ? { contact_phone: b.contactPhone } : {}),
      ...(b.capacityNotes !== undefined ? { capacity_notes: b.capacityNotes } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.req.param("id"))
    .eq("organization_id", user.organizationId)
    .select("*")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ carrier: data });
});

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
const clientBody = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  billingAddress: z.string().max(500).optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

app.get("/clients", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const { data, error } = await freightDb()
    .from("clients")
    .select("*")
    .eq("organization_id", user.organizationId)
    .order("name");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ clients: data ?? [] });
});

app.post("/clients", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const parsed = clientBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const { data, error } = await freightDb()
    .from("clients")
    .insert({
      organization_id: user.organizationId,
      name: b.name,
      email: b.email || null,
      phone: b.phone || null,
      billing_address: b.billingAddress || null,
      status: b.status ?? "active",
    })
    .select("*")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ client: data }, 201);
});

// ---------------------------------------------------------------------------
// Rate cards
// ---------------------------------------------------------------------------
const rateCardBody = z.object({
  name: z.string().min(1).max(200),
  clientId: z.string().uuid().optional().nullable(),
  originLabel: z.string().max(300).optional().nullable(),
  destinationLabel: z.string().max(300).optional().nullable(),
  currency: z.string().length(3).default("JMD"),
  amountMinor: z.number().int().nonnegative(),
  pricingStrategy: z.enum(["flat", "distance_tier", "zone", "per_stop"]).optional(),
  rules: z.record(z.unknown()).optional(),
  effectiveFrom: z.string().optional().nullable(),
  effectiveTo: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).optional(),
});

app.get("/rate-cards", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const { data, error } = await freightDb()
    .from("rate_cards")
    .select("*")
    .eq("organization_id", user.organizationId)
    .order("name");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ rateCards: data ?? [] });
});

app.post("/rate-cards", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const parsed = rateCardBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const { data, error } = await freightDb()
    .from("rate_cards")
    .insert({
      organization_id: user.organizationId,
      client_id: b.clientId || null,
      name: b.name,
      origin_label: b.originLabel || null,
      destination_label: b.destinationLabel || null,
      currency: b.currency,
      amount_minor: b.amountMinor,
      pricing_strategy: b.pricingStrategy ?? "flat",
      rules: b.rules ?? {},
      effective_from: b.effectiveFrom || null,
      effective_to: b.effectiveTo || null,
      status: b.status ?? "active",
    })
    .select("*")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ rateCard: data }, 201);
});

app.patch("/rate-cards/:id", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const parsed = rateCardBody.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name != null) patch.name = b.name;
  if (b.clientId !== undefined) patch.client_id = b.clientId || null;
  if (b.originLabel !== undefined) patch.origin_label = b.originLabel || null;
  if (b.destinationLabel !== undefined) patch.destination_label = b.destinationLabel || null;
  if (b.currency != null) patch.currency = b.currency;
  if (b.amountMinor != null) patch.amount_minor = b.amountMinor;
  if (b.pricingStrategy != null) patch.pricing_strategy = b.pricingStrategy;
  if (b.rules != null) patch.rules = b.rules;
  if (b.effectiveFrom !== undefined) patch.effective_from = b.effectiveFrom || null;
  if (b.effectiveTo !== undefined) patch.effective_to = b.effectiveTo || null;
  if (b.status != null) patch.status = b.status;
  const { data, error } = await freightDb()
    .from("rate_cards")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .select("*")
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!data) return c.json({ error: "Not found" }, 404);
  return c.json({ rateCard: data });
});

// ---------------------------------------------------------------------------
// Shipments
// ---------------------------------------------------------------------------
const consignmentBody = z.object({
  description: z.string().min(1).max(500),
  quantity: z.number().int().positive().default(1),
  weightKg: z.number().nonnegative().optional().nullable(),
  lengthCm: z.number().nonnegative().optional().nullable(),
  widthCm: z.number().nonnegative().optional().nullable(),
  heightCm: z.number().nonnegative().optional().nullable(),
  declaredValueMinor: z.number().int().nonnegative().optional().nullable(),
  currency: z.string().length(3).default("JMD"),
  hazmat: z.boolean().default(false),
});

const legBody = z.object({
  sequence: z.number().int().positive(),
  carrierId: z.string().uuid().optional().nullable(),
  plannedPickupAt: z.string().optional().nullable(),
  plannedDeliveryAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const createShipmentBody = z.object({
  clientId: z.string().uuid().optional().nullable(),
  rateCardId: z.string().uuid().optional().nullable(),
  mode: z.enum(["own", "3pl", "mixed"]).default("own"),
  originLabel: z.string().min(1).max(500),
  originLat: z.number().optional().nullable(),
  originLng: z.number().optional().nullable(),
  destinationLabel: z.string().min(1).max(500),
  destinationLat: z.number().optional().nullable(),
  destinationLng: z.number().optional().nullable(),
  currency: z.string().length(3).default("JMD"),
  notes: z.string().max(4000).optional().nullable(),
  consignments: z.array(consignmentBody).min(1),
  legs: z.array(legBody).min(1),
  book: z.boolean().optional(),
});

app.get("/shipments", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const status = c.req.query("status");
  let q = freightDb()
    .from("shipments")
    .select("*")
    .eq("organization_id", user.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ shipments: data ?? [] });
});

app.get("/shipments/:id", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const db = freightDb();
  const { data: shipment, error } = await db
    .from("shipments")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!shipment) return c.json({ error: "Not found" }, 404);

  const [legs, consignments, events, documents] = await Promise.all([
    db.from("shipment_legs").select("*").eq("shipment_id", id).order("sequence"),
    db.from("consignments").select("*").eq("shipment_id", id),
    db.from("tracking_events").select("*").eq("shipment_id", id).order("occurred_at", { ascending: false }),
    db.from("documents").select("*").eq("shipment_id", id).order("created_at", { ascending: false }),
  ]);

  return c.json({
    shipment,
    legs: legs.data ?? [],
    consignments: consignments.data ?? [],
    trackingEvents: events.data ?? [],
    documents: documents.data ?? [],
  });
});

app.post("/shipments", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const parsed = createShipmentBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const db = freightDb();
  const status = b.book ? "booked" : "draft";

  // Phase E: hard reject when active service zones exist and points are outside
  if (status === "booked") {
    const zoneCheck = await assertInsideServiceZones(serviceClient(), user.organizationId, [
      { lat: b.originLat, lng: b.originLng, label: "Pickup" },
      { lat: b.destinationLat, lng: b.destinationLng, label: "Dropoff" },
    ]);
    if (!zoneCheck.ok) {
      return c.json({ error: zoneCheck.code, message: zoneCheck.message }, 400);
    }
  }

  const { data: shipment, error } = await db
    .from("shipments")
    .insert({
      organization_id: user.organizationId,
      client_id: b.clientId || null,
      rate_card_id: b.rateCardId || null,
      reference_code: refCode(),
      status,
      mode: b.mode,
      origin_label: b.originLabel,
      origin_lat: b.originLat ?? null,
      origin_lng: b.originLng ?? null,
      destination_label: b.destinationLabel,
      destination_lat: b.destinationLat ?? null,
      destination_lng: b.destinationLng ?? null,
      currency: b.currency,
      notes: b.notes || null,
    })
    .select("*")
    .single();
  if (error || !shipment) return c.json({ error: error?.message ?? "insert failed" }, 500);

  const { error: legErr } = await db.from("shipment_legs").insert(
    b.legs.map((leg) => ({
      organization_id: user.organizationId,
      shipment_id: shipment.id,
      sequence: leg.sequence,
      carrier_id: leg.carrierId || null,
      status: leg.carrierId ? "assigned" : "pending",
      planned_pickup_at: leg.plannedPickupAt || null,
      planned_delivery_at: leg.plannedDeliveryAt || null,
      notes: leg.notes || null,
    })),
  );
  if (legErr) return c.json({ error: legErr.message }, 500);

  const { error: conErr } = await db.from("consignments").insert(
    b.consignments.map((row) => ({
      organization_id: user.organizationId,
      shipment_id: shipment.id,
      description: row.description,
      quantity: row.quantity,
      weight_kg: row.weightKg ?? null,
      length_cm: row.lengthCm ?? null,
      width_cm: row.widthCm ?? null,
      height_cm: row.heightCm ?? null,
      declared_value_minor: row.declaredValueMinor ?? null,
      currency: row.currency,
      hazmat: row.hazmat,
    })),
  );
  if (conErr) return c.json({ error: conErr.message }, 500);

  await appendTracking(
    user.organizationId,
    shipment.id,
    status,
    user.id,
    status === "booked" ? "Shipment booked" : "Shipment drafted",
  );

  // Mirror booked shipments onto shared logistics dispatch board
  if (status !== "draft") {
    const { data: legs } = await db
      .from("shipment_legs")
      .select("id, sequence, status, notes")
      .eq("shipment_id", shipment.id)
      .order("sequence");
    const sync = await syncJobFromShipment(serviceClient(), shipment, {
      legs: legs ?? [],
      actorUserId: user.id,
    });
    if (sync.error) {
      console.error(
        JSON.stringify({
          event: "logistics_sync_failed",
          shipmentId: shipment.id,
          error: sync.error,
        }),
      );
    }
  }

  return c.json({ shipment }, 201);
});

app.post("/shipments/:id/transition", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const body = z
    .object({
      status: z.enum([
        "draft",
        "booked",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "exception",
      ]),
      note: z.string().max(2000).optional(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const id = c.req.param("id");
  const db = freightDb();
  const { data: shipment, error } = await db
    .from("shipments")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!shipment) return c.json({ error: "Not found" }, 404);

  const allowed = SHIPMENT_TRANSITIONS[shipment.status] ?? [];
  if (!allowed.includes(body.data.status)) {
    return c.json(
      {
        error: `Illegal transition ${shipment.status} → ${body.data.status}`,
        allowed,
      },
      409,
    );
  }

  if (body.data.status === "booked") {
    const zoneCheck = await assertInsideServiceZones(serviceClient(), user.organizationId, [
      { lat: shipment.origin_lat, lng: shipment.origin_lng, label: "Pickup" },
      { lat: shipment.destination_lat, lng: shipment.destination_lng, label: "Dropoff" },
    ]);
    if (!zoneCheck.ok) {
      return c.json({ error: zoneCheck.code, message: zoneCheck.message }, 400);
    }
  }

  const { data: updated, error: upErr } = await db
    .from("shipments")
    .update({
      status: body.data.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .select("*")
    .single();
  if (upErr) return c.json({ error: upErr.message }, 500);

  await appendTracking(
    user.organizationId,
    id,
    body.data.status,
    user.id,
    body.data.note,
  );

  const { data: legs } = await db
    .from("shipment_legs")
    .select("id, sequence, status, notes")
    .eq("shipment_id", id)
    .order("sequence");
  const sync = await syncJobFromShipment(serviceClient(), updated, {
    legs: legs ?? [],
    actorUserId: user.id,
  });
  if (sync.error) {
    console.error(
      JSON.stringify({
        event: "logistics_sync_failed",
        shipmentId: id,
        error: sync.error,
      }),
    );
  }

  return c.json({ shipment: updated });
});

/** Bill shipment via unified ledger — idempotent on Idempotency-Key / shipment id. */
app.post("/shipments/:id/bill", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const idem =
    c.req.header("Idempotency-Key") ||
    `freight-bill:${user.organizationId}:${id}`;

  const db = freightDb();
  const { data: shipment, error } = await db
    .from("shipments")
    .select("*, rate_cards(*)")
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!shipment) return c.json({ error: "Not found" }, 404);
  if (shipment.status === "cancelled") {
    return c.json({ error: "Cancelled shipments cannot be billed" }, 409);
  }
  if (shipment.billed_at) {
    return c.json({ shipment, skipped: true, reason: "already_billed" });
  }

  const card = shipment.rate_cards as Record<string, unknown> | null;
  const { data: legs } = await db
    .from("shipment_legs")
    .select("id")
    .eq("shipment_id", id);
  const stopCount = Math.max(2, (legs?.length ?? 0) + 1);

  let pricingZones: { id: string; geojson: unknown }[] = [];
  if ((card?.pricing_strategy as string | undefined) === "zone") {
    const { data: zones } = await serviceClient()
      .schema("logistics")
      .from("service_zones")
      .select("id, geojson")
      .eq("organization_id", user.organizationId)
      .eq("kind", "pricing")
      .eq("active", true);
    pricingZones = (zones ?? []).map((z) => ({ id: String(z.id), geojson: z.geojson }));
  }

  const computed = computeRateCardAmountMinor({
    card: {
      amount_minor: Number(card?.amount_minor ?? 0),
      pricing_strategy: (card?.pricing_strategy as string) || "flat",
      rules: (card?.rules as Record<string, unknown>) || {},
    },
    origin:
      shipment.origin_lat != null && shipment.origin_lng != null
        ? { lat: Number(shipment.origin_lat), lng: Number(shipment.origin_lng) }
        : null,
    destination:
      shipment.destination_lat != null && shipment.destination_lng != null
        ? { lat: Number(shipment.destination_lat), lng: Number(shipment.destination_lng) }
        : null,
    stopCount,
    pricingZones,
  });

  const amountMinor = computed.amountMinor;
  const currency =
    (card?.currency as string | undefined) ??
    shipment.currency ??
    "JMD";

  if (amountMinor <= 0) {
    return c.json({ error: "No billable amount — attach a rate card with amount" }, 400);
  }

  // Account keys: org AR (debit) ← revenue (credit)
  const result = await ledgerPostEntry({
    idempotencyKey: idem,
    entryType: "freight_shipment_invoice",
    debitAccountKey: `org:${user.organizationId}:freight:ar`,
    creditAccountKey: `org:${user.organizationId}:freight:revenue`,
    amountMinor,
    currency,
    organizationId: user.organizationId,
    product: "roam_enterprise",
    referenceType: "shipment",
    referenceId: id,
    createdByUserId: user.id,
    sourceSystem: "freight",
    sourceId: id,
    sourceIdempotencyKey: idem,
    metadata: {
      reference_code: shipment.reference_code,
      pricing_strategy: computed.strategy,
      pricing_detail: computed.detail,
    },
  });

  if (result.conflict) {
    return c.json({ error: "Idempotency conflict", result }, 409);
  }

  const { data: updated, error: upErr } = await db
    .from("shipments")
    .update({
      billed_at: new Date().toISOString(),
      billed_entry_id: result.entry_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .select("*")
    .single();
  if (upErr) return c.json({ error: upErr.message }, 500);

  await appendTracking(
    user.organizationId,
    id,
    "billed",
    user.id,
    `Billed ${amountMinor} ${currency}`,
  );

  return c.json({ shipment: updated, ledger: result });
});

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------
app.get("/dashboard", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const { data, error } = await freightDb()
    .from("shipments")
    .select("status")
    .eq("organization_id", user.organizationId);
  if (error) return c.json({ error: error.message }, 500);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return c.json({
    counts,
    exceptions: counts.exception ?? 0,
    timezone: "America/Jamaica",
  });
});

app.get("/shipments/:id/tracking", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const { data, error } = await freightDb()
    .from("tracking_events")
    .select("*")
    .eq("shipment_id", c.req.param("id"))
    .eq("organization_id", user.organizationId)
    .order("occurred_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ trackingEvents: data ?? [] });
});

const documentBody = z.object({
  kind: z.enum(["bol", "pod", "invoice", "other"]),
  storagePath: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().optional().nullable(),
  legId: z.string().uuid().optional().nullable(),
});

app.post("/shipments/:id/documents", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const parsed = documentBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const { data, error } = await freightDb()
    .from("documents")
    .insert({
      organization_id: user.organizationId,
      shipment_id: c.req.param("id"),
      leg_id: b.legId || null,
      kind: b.kind,
      storage_path: b.storagePath,
      file_name: b.fileName,
      content_type: b.contentType || null,
    })
    .select("*")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ document: data }, 201);
});

export default app;
Deno.serve(app.fetch);
