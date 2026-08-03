/**
 * Roam Enterprise — Logistics jobs service (shared dispatch primitives).
 * Domestic freight is the first vertical adapter.
 */
import { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { z } from "https://deno.land/x/zod@v3.24.2/mod.ts";
import { applyCors } from "../_shared/corsAllowlist.ts";
import {
  requireEnterpriseAccess,
  serviceClient,
  type EnterpriseAccessUser,
} from "../_shared/enterpriseAccess.ts";
import {
  canTransitionJob,
  isMarketplaceAssignee,
  validateAssignPayload,
} from "./jobMachine.ts";
import { appendJobEvent, syncJobFromShipment } from "./syncFromShipment.ts";
import {
  acceptEnterpriseJobOffer,
  declineEnterpriseJobOffer,
  reconcileAllEnterpriseMatchingJobs,
  reconcileEnterpriseJob,
  startEnterpriseJobMatching,
} from "./enterpriseMatching.ts";
import { requireLogisticsDriver } from "./driverAuth.ts";
import {
  isLiveStale,
  loadDriverPresence,
  positionFromJobSnapshot,
} from "./liveTracking.ts";
import { maybeEmitStaleGpsAlert } from "./opsAlerts.ts";

const app = new Hono().basePath("/logistics");

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
    "X-Logistics-Internal-Secret",
  ],
});

function logisticsDb() {
  return serviceClient().schema("logistics");
}

async function requireUser(c: {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
}): Promise<EnterpriseAccessUser | Response> {
  return requireEnterpriseAccess(c);
}

function requireInternal(c: {
  req: { header: (n: string) => string | undefined };
  json: (b: unknown, s?: number) => Response;
}): true | Response {
  const expected = Deno.env.get("LOGISTICS_INTERNAL_SECRET") ||
    Deno.env.get("MATCHING_INTERNAL_SECRET") ||
    "";
  const got = c.req.header("X-Logistics-Internal-Secret") || "";
  if (!expected || got !== expected) {
    return c.json({ error: "Unauthorized: invalid internal secret" }, 401);
  }
  return true;
}

app.get("/health", (c) => c.json({ ok: true, service: "logistics" }));

app.get("/jobs", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const status = c.req.query("status");
  const assigneeType = c.req.query("assigneeType");
  let q = logisticsDb()
    .from("jobs")
    .select("*")
    .eq("organization_id", user.organizationId)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (status) q = q.eq("status", status);
  if (assigneeType) q = q.eq("assignee_type", assigneeType);
  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ jobs: data ?? [] });
});

app.get("/jobs/:id", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const db = logisticsDb();
  const { data: job, error } = await db
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!job) return c.json({ error: "Not found" }, 404);
  const [stops, events] = await Promise.all([
    db.from("job_stops").select("*").eq("job_id", id).order("sequence"),
    db
      .from("job_events")
      .select("*")
      .eq("job_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
  ]);
  return c.json({
    job,
    stops: stops.data ?? [],
    events: events.data ?? [],
  });
});

/** Ops live position for assigned / in-progress jobs (Phase D). */
app.get("/jobs/:id/live", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const db = logisticsDb();
  const svc = serviceClient();

  const { data: job, error } = await db
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!job) return c.json({ error: "Not found" }, 404);

  const status = String(job.status);
  if (status !== "assigned" && status !== "in_progress") {
    return c.json({
      error: "live_unavailable",
      message: "Live tracking is only available for assigned or in-progress jobs",
      job,
      position: null,
      stops: [],
      stale: true,
    }, 409);
  }

  const { data: stops } = await db
    .from("job_stops")
    .select("*")
    .eq("job_id", id)
    .order("sequence");

  let position = job.assignee_driver_id
    ? await loadDriverPresence(svc, String(job.assignee_driver_id))
    : null;

  if (position) {
    const now = new Date().toISOString();
    await db
      .from("jobs")
      .update({
        last_lat: position.lat,
        last_lng: position.lng,
        last_heading: position.heading,
        last_located_at: position.updated_at || now,
        updated_at: now,
      })
      .eq("id", id)
      .eq("organization_id", user.organizationId);
  } else {
    position = positionFromJobSnapshot(job as Record<string, unknown>);
  }

  const stale = isLiveStale(position?.updated_at);
  if (stale && status === "in_progress") {
    await maybeEmitStaleGpsAlert(svc, {
      orgId: user.organizationId,
      jobId: id,
      shipmentId: job.external_ref_type === "freight_shipment"
        ? String(job.external_ref_id)
        : null,
      referenceCode: job.reference_code ? String(job.reference_code) : null,
      locatedAt: position?.updated_at ?? null,
    });
  }

  return c.json({
    job: {
      ...job,
      last_lat: position?.lat ?? job.last_lat,
      last_lng: position?.lng ?? job.last_lng,
      last_heading: position?.heading ?? job.last_heading,
      last_located_at: position?.updated_at ?? job.last_located_at,
    },
    position,
    stops: stops ?? [],
    stale,
  });
});

const assignBody = z.object({
  assigneeType: z.enum(["org_fleet", "client_fleet", "third_party", "roam_marketplace"]),
  assigneeDriverId: z.string().uuid().optional().nullable(),
  assigneeVehicleId: z.string().uuid().optional().nullable(),
  clientFleetAssetId: z.string().uuid().optional().nullable(),
  thirdPartyCarrierId: z.string().uuid().optional().nullable(),
  note: z.string().max(2000).optional(),
});

app.post("/jobs/:id/assign", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const parsed = assignBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const check = validateAssignPayload(b);
  if (!check.ok) {
    return c.json({ error: check.code || check.error, message: check.error }, 400);
  }

  const id = c.req.param("id");
  const db = logisticsDb();
  const { data: job, error } = await db
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!job) return c.json({ error: "Not found" }, 404);
  if (job.status === "completed" || job.status === "cancelled") {
    return c.json({ error: `Cannot assign a ${job.status} job` }, 409);
  }

  // Phase C: marketplace starts org-fleet auto-matching
  if (isMarketplaceAssignee(b.assigneeType)) {
    const match = await startEnterpriseJobMatching(id, user.id);
    if (!match.ok) {
      return c.json({ error: match.error || "matching_failed", ...match }, 500);
    }
    const { data: updated } = await db
      .from("jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return c.json({
      job: updated,
      matching: match,
    });
  }

  const now = new Date().toISOString();
  const { data: updated, error: upErr } = await db
    .from("jobs")
    .update({
      status: "assigned",
      assignee_type: b.assigneeType,
      assignee_driver_id: b.assigneeDriverId || null,
      assignee_vehicle_id: b.assigneeVehicleId || null,
      client_fleet_asset_id: b.clientFleetAssetId || null,
      third_party_carrier_id: b.thirdPartyCarrierId || null,
      assigned_at: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .select("*")
    .single();
  if (upErr) return c.json({ error: upErr.message }, 500);

  await appendJobEvent(serviceClient(), {
    orgId: user.organizationId,
    jobId: id,
    eventType: "assigned",
    fromStatus: job.status,
    toStatus: "assigned",
    actorUserId: user.id,
    note: b.note,
    payload: {
      assigneeType: b.assigneeType,
      thirdPartyCarrierId: b.thirdPartyCarrierId,
      clientFleetAssetId: b.clientFleetAssetId,
    },
  });

  return c.json({ job: updated });
});

app.post("/jobs/:id/transition", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const body = z
    .object({
      status: z.enum([
        "unassigned",
        "matching",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
        "exception",
      ]),
      note: z.string().max(2000).optional(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const id = c.req.param("id");
  const db = logisticsDb();
  const { data: job, error } = await db
    .from("jobs")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!job) return c.json({ error: "Not found" }, 404);

  if (!canTransitionJob(job.status, body.data.status)) {
    return c.json(
      {
        error: `Illegal transition ${job.status} → ${body.data.status}`,
        allowed: [],
      },
      409,
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: body.data.status,
    updated_at: now,
  };
  if (body.data.status === "unassigned") {
    patch.assignee_type = null;
    patch.assignee_driver_id = null;
    patch.assignee_vehicle_id = null;
    patch.client_fleet_asset_id = null;
    patch.third_party_carrier_id = null;
    patch.assigned_at = null;
    patch.matching_wave = 0;
  }
  if (body.data.status === "in_progress" && !job.started_at) {
    patch.started_at = now;
  }
  if (body.data.status === "completed") {
    patch.completed_at = now;
  }

  const { data: updated, error: upErr } = await db
    .from("jobs")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .select("*")
    .single();
  if (upErr) return c.json({ error: upErr.message }, 500);

  // Cancel marketplace offers when ops yank the job out of matching
  if (job.status === "matching" && body.data.status !== "matching") {
    await db
      .from("job_offers")
      .update({ status: "superseded" })
      .eq("job_id", id)
      .eq("status", "pending");
  }

  await appendJobEvent(serviceClient(), {
    orgId: user.organizationId,
    jobId: id,
    eventType: "transition",
    fromStatus: job.status,
    toStatus: body.data.status,
    actorUserId: user.id,
    note: body.data.note,
  });

  if (body.data.status === "exception") {
    const { emitJobExceptionAlert } = await import("./opsAlerts.ts");
    await emitJobExceptionAlert(serviceClient(), {
      orgId: user.organizationId,
      jobId: id,
      shipmentId: job.external_ref_type === "freight_shipment"
        ? String(job.external_ref_id)
        : null,
      referenceCode: job.reference_code ? String(job.reference_code) : null,
      note: body.data.note,
    });
  }

  return c.json({ job: updated });
});

// ---------------------------------------------------------------------------
// Driver marketplace offers (org fleet drivers via apps/driver)
// ---------------------------------------------------------------------------
app.get("/v1/drivers/offers", async (c) => {
  const driver = await requireLogisticsDriver(c);
  if (driver instanceof Response) return driver;
  const now = new Date().toISOString();

  // Expire stale before listing
  await logisticsDb()
    .from("job_offers")
    .update({ status: "expired" })
    .eq("driver_user_id", driver.id)
    .eq("status", "pending")
    .lte("expires_at", now);

  const { data: offers, error } = await logisticsDb()
    .from("job_offers")
    .select("*")
    .eq("driver_user_id", driver.id)
    .eq("status", "pending")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return c.json({ error: error.message }, 500);

  const jobIds = [...new Set((offers ?? []).map((o) => String(o.job_id)))];
  let jobsById: Record<string, Record<string, unknown>> = {};
  if (jobIds.length) {
    const { data: jobs } = await logisticsDb()
      .from("jobs")
      .select(
        "id, reference_code, pickup_label, dropoff_label, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, status, organization_id",
      )
      .in("id", jobIds);
    jobsById = Object.fromEntries((jobs ?? []).map((j) => [String(j.id), j]));
  }

  return c.json({
    offers: (offers ?? []).map((o) => ({
      ...o,
      kind: "logistics_job",
      job: jobsById[String(o.job_id)] ?? null,
    })),
  });
});

app.post("/v1/drivers/offers/:offerId/accept", async (c) => {
  const driver = await requireLogisticsDriver(c);
  if (driver instanceof Response) return driver;
  const offerId = c.req.param("offerId");
  const result = await acceptEnterpriseJobOffer(offerId, driver.id);
  if (!result.ok) {
    return c.json({ error: result.error || "accept_failed" }, 409);
  }
  return c.json(result);
});

app.post("/v1/drivers/offers/:offerId/decline", async (c) => {
  const driver = await requireLogisticsDriver(c);
  if (driver instanceof Response) return driver;
  const offerId = c.req.param("offerId");
  const result = await declineEnterpriseJobOffer(offerId, driver.id);
  if (!result.ok && result.error === "offer_not_found") {
    return c.json({ error: "offer_not_found" }, 404);
  }
  return c.json(result);
});

app.post("/internal/reconcile-job", async (c) => {
  const auth = requireInternal(c);
  if (auth !== true) return auth;
  const body = z.object({ job_id: z.string().uuid() }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);
  const result = await reconcileEnterpriseJob(body.data.job_id);
  return c.json(result);
});

app.post("/internal/reconcile-all-matching", async (c) => {
  const auth = requireInternal(c);
  if (auth !== true) return auth;
  const n = await reconcileAllEnterpriseMatchingJobs();
  return c.json({ ok: true, reconciled: n });
});

/** Internal: freight (or other adapters) can upsert a job from a shipment payload. */
app.post("/internal/sync-from-shipment", async (c) => {
  const auth = requireInternal(c);
  if (auth !== true) return auth;
  const body = z
    .object({
      shipment: z.object({
        id: z.string().uuid(),
        organization_id: z.string().uuid(),
        reference_code: z.string(),
        status: z.string(),
        origin_label: z.string(),
        origin_lat: z.number().nullable().optional(),
        origin_lng: z.number().nullable().optional(),
        destination_label: z.string(),
        destination_lat: z.number().nullable().optional(),
        destination_lng: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
      legs: z
        .array(
          z.object({
            id: z.string().uuid(),
            sequence: z.number().int(),
            status: z.string().optional(),
            notes: z.string().nullable().optional(),
          }),
        )
        .optional(),
      actorUserId: z.string().uuid().optional().nullable(),
    })
    .safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const result = await syncJobFromShipment(serviceClient(), body.data.shipment, {
    legs: body.data.legs,
    actorUserId: body.data.actorUserId,
  });
  if (result.error) return c.json({ error: result.error }, 500);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Service zones (Phase E)
// ---------------------------------------------------------------------------
const zoneBody = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["service", "pricing"]).default("service"),
  geojson: z.record(z.unknown()),
  active: z.boolean().optional(),
});

app.get("/zones", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const kind = c.req.query("kind");
  let q = logisticsDb()
    .from("service_zones")
    .select("*")
    .eq("organization_id", user.organizationId)
    .order("name");
  if (kind) q = q.eq("kind", kind);
  const { data, error } = await q;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ zones: data ?? [] });
});

app.post("/zones", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const parsed = zoneBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  const { parseZoneGeoJson } = await import("./geo.ts");
  if (!parseZoneGeoJson(b.geojson)) {
    return c.json({ error: "invalid_geojson", message: "geojson must be Polygon or MultiPolygon" }, 400);
  }
  const { data, error } = await logisticsDb()
    .from("service_zones")
    .insert({
      organization_id: user.organizationId,
      name: b.name,
      kind: b.kind,
      geojson: b.geojson,
      active: b.active ?? true,
    })
    .select("*")
    .single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ zone: data }, 201);
});

app.patch("/zones/:id", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const parsed = zoneBody.partial().safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
  const b = parsed.data;
  if (b.geojson) {
    const { parseZoneGeoJson } = await import("./geo.ts");
    if (!parseZoneGeoJson(b.geojson)) {
      return c.json({ error: "invalid_geojson" }, 400);
    }
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name != null) patch.name = b.name;
  if (b.kind != null) patch.kind = b.kind;
  if (b.geojson != null) patch.geojson = b.geojson;
  if (b.active != null) patch.active = b.active;
  const { data, error } = await logisticsDb()
    .from("service_zones")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .select("*")
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!data) return c.json({ error: "Not found" }, 404);
  return c.json({ zone: data });
});

app.delete("/zones/:id", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const { error } = await logisticsDb()
    .from("service_zones")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organizationId);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Ops alerts inbox (Phase F)
// ---------------------------------------------------------------------------
app.get("/alerts", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const unreadOnly = c.req.query("unread") === "1";
  let q = logisticsDb()
    .from("ops_alerts")
    .select("*")
    .eq("organization_id", user.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (unreadOnly) q = q.is("read_at", null);
  const [{ data, error }, unreadRes] = await Promise.all([
    q,
    logisticsDb()
      .from("ops_alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", user.organizationId)
      .is("read_at", null),
  ]);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ alerts: data ?? [], unreadCount: unreadRes.count ?? 0 });
});

app.post("/alerts/:id/read", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const id = c.req.param("id");
  const now = new Date().toISOString();
  const { data, error } = await logisticsDb()
    .from("ops_alerts")
    .update({ read_at: now })
    .eq("id", id)
    .eq("organization_id", user.organizationId)
    .is("read_at", null)
    .select("*")
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!data) {
    const { data: existing } = await logisticsDb()
      .from("ops_alerts")
      .select("*")
      .eq("id", id)
      .eq("organization_id", user.organizationId)
      .maybeSingle();
    if (!existing) return c.json({ error: "Not found" }, 404);
    return c.json({ alert: existing });
  }
  return c.json({ alert: data });
});

app.post("/alerts/read-all", async (c) => {
  const user = await requireUser(c);
  if (user instanceof Response) return user;
  const now = new Date().toISOString();
  const { error } = await logisticsDb()
    .from("ops_alerts")
    .update({ read_at: now })
    .eq("organization_id", user.organizationId)
    .is("read_at", null);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

Deno.serve(app.fetch);
