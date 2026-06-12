/**
 * Admin force-cancel / force-complete for stuck active rides + support lookup.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdminAny, type ProductKey } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import {
  finalizeRideLedgerFields,
  persistRideLedgerLinesForTerminalState,
} from "../../_shared/rideLedgerLines.ts";
import { syncRideToFleetKv } from "../../_shared/rideToFleetTrip.ts";
import { gridCellKey } from "../fare/buildQuote.ts";
import { cleanupRideLiveState } from "../rideGeofence.ts";
import { applyRideTransition, type ApplyTransitionDeps, type RideStatus } from "../rideLifecycle.ts";
import { isCashSettlementEnabled } from "../cashSettlement/flags.ts";
import { computeFinalFareFromRide } from "../cashSettlement/computeFinalFare.ts";
import { processCashSettlement } from "../cashSettlement/processCashSettlement.ts";
import {
  canAdminReleaseCashSettlement,
  canAdminSettleCash,
  shouldBlockCashForceComplete,
} from "./adminCashSettlement.ts";

const SUPPORT_PRODUCTS: ProductKey[] = ["rides", "driver"];

const ACTIVE_STATUSES: RideStatus[] = [
  "matching",
  "driver_assigned",
  "driver_en_route_pickup",
  "driver_arrived_pickup",
  "on_trip",
  "awaiting_cash_settlement",
];

const STUCK_TRIPS_LIMIT = 50;
const AUDIT_LIMIT = 50;

type RidesDbOrResponse = (
  c: { json: (body: unknown, status?: number) => Response },
) => Promise<{ db: SupabaseClient; tables: RidesAdminTables } | Response>;

type AdminAuditFn = (
  db: SupabaseClient,
  tables: RidesAdminTables,
  actorId: string,
  eventType: string,
  payload: Record<string, unknown>,
) => Promise<void>;

function ridesSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { db: { schema: "rides" } },
  );
}

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function loadRideRequestById(id: string): Promise<Record<string, unknown> | null> {
  const { data: native, error: nativeErr } = await ridesSvc().from("ride_requests").select("*").eq(
    "id",
    id,
  ).maybeSingle();
  if (!nativeErr && native) return native as Record<string, unknown>;

  const { data: pub } = await pubSvc().from("rides_ride_requests").select("*").eq("id", id)
    .maybeSingle();
  return (pub as Record<string, unknown> | null) ?? null;
}

async function patchRideRequest(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data: rpcData, error: rpcError } = await pubSvc().rpc("rides_patch_ride_request", {
    p_id: id,
    p_patch: patch,
  });
  if (!rpcError && rpcData != null) return true;

  const { data: directRow, error: directError } = await ridesSvc().from("ride_requests").update(patch)
    .eq("id", id).select("id").maybeSingle();
  return !directError && Boolean(directRow);
}

async function cancelRideRequestRow(
  id: string,
  cancelledBy: "rider" | "driver" | "system",
  reason: string | null,
): Promise<boolean> {
  const { data: cancelData, error: cancelError } = await pubSvc().rpc("rides_cancel_ride_request", {
    p_id: id,
    p_cancelled_by: cancelledBy,
    p_cancel_reason: reason,
  });
  if (!cancelError && cancelData != null) return true;

  return patchRideRequest(id, {
    status: "cancelled",
    cancelled_by: cancelledBy,
    cancel_reason: reason,
    updated_at: new Date().toISOString(),
  });
}

async function bumpSurgeDemand(cellKey: string, delta: number): Promise<void> {
  const db = ridesSvc();
  const { data: row } = await db.from("surge_cells").select("*").eq("cell_key", cellKey).maybeSingle();
  if (!row) {
    if (delta <= 0) return;
    await db.from("surge_cells").insert({
      cell_key: cellKey,
      open_requests: Math.max(0, delta),
      surge_multiplier: 1,
    });
    return;
  }
  const next = Math.max(0, (row.open_requests ?? 0) + delta);
  let mult = Number(row.surge_multiplier ?? 1);
  if (next >= 8) mult = Math.min(2.5, mult + 0.05);
  else if (next <= 2) mult = Math.max(1, mult - 0.02);
  await db.from("surge_cells").update({
    open_requests: next,
    surge_multiplier: mult,
    updated_at: new Date().toISOString(),
  }).eq("cell_key", cellKey);
}

async function handleTerminalRideLedgerAndSync(rideId: string): Promise<void> {
  const fresh = await loadRideRequestById(rideId);
  if (!fresh) return;
  const status = String(fresh.status ?? "");
  if (status !== "completed" && status !== "cancelled") return;

  try {
    await persistRideLedgerLinesForTerminalState(ridesSvc(), fresh);
    if (status === "completed") {
      await finalizeRideLedgerFields(ridesSvc(), rideId, fresh);
    }
  } catch (e) {
    console.error("[rides/admin] ledger persist failed:", e);
  }

  try {
    await syncRideToFleetKv(fresh);
  } catch (e) {
    console.error("[rides/admin] fleet KV sync failed:", e);
  }
}

function transitionDeps(): ApplyTransitionDeps {
  return {
    loadRideRequestById,
    patchRideRequest,
    handleTerminalRideLedgerAndSync,
    bumpSurgeDemand,
    audit: async (rideId, actorUserId, eventType, payload) => {
      await ridesSvc().from("audit_events").insert({
        ride_request_id: rideId,
        actor_user_id: actorUserId,
        event_type: eventType,
        payload,
      });
    },
    cleanupLiveState: async (rideId) => cleanupRideLiveState(ridesSvc(), rideId),
  };
}

function isActiveStatus(status: unknown): boolean {
  return ACTIVE_STATUSES.includes(status as RideStatus);
}

function parseSupportReason(body: Record<string, unknown>): {
  reason: string;
  support_reason_code: string | null;
  support_note: string | null;
} {
  const code = typeof body.support_reason_code === "string"
    ? body.support_reason_code.trim()
    : "";
  const note = typeof body.support_note === "string" ? body.support_note.trim() : "";
  const legacyReason = typeof body.reason === "string" ? body.reason.trim() : "";
  const parts = [code, note, legacyReason].filter(Boolean);
  const reason = parts.length > 0 ? parts.join(" — ") : "admin_force_cancel";
  return {
    reason,
    support_reason_code: code || null,
    support_note: note || null,
  };
}

async function enrichDriverNames(
  rides: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const driverIds = [
    ...new Set(
      rides
        .map((r) => r.assigned_driver_user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (driverIds.length === 0) return rides;

  const driverMeta: Record<string, { display_name: string | null; email: string | null }> = {};

  const { data: profiles } = await pubSvc().from("driver_profiles")
    .select("user_id, display_name, first_name, last_name")
    .in("user_id", driverIds);

  for (const p of profiles ?? []) {
    const uid = p.user_id as string;
    const name = (p.display_name as string | null) ||
      [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      null;
    driverMeta[uid] = { display_name: name, email: null };
  }

  for (const uid of driverIds) {
    if (driverMeta[uid]?.email != null) continue;
    try {
      const { data } = await pubSvc().auth.admin.getUserById(uid);
      if (data?.user?.email) {
        driverMeta[uid] = {
          display_name: driverMeta[uid]?.display_name ?? null,
          email: data.user.email,
        };
      }
    } catch {
      /* optional */
    }
  }

  return rides.map((r) => {
    const uid = r.assigned_driver_user_id as string | null;
    if (!uid || !driverMeta[uid]) return r;
    return {
      ...r,
      driver_display_name: driverMeta[uid].display_name,
      driver_email: driverMeta[uid].email,
    };
  });
}

export function registerRideOperationsAdminRoutes(
  admin: Hono,
  ridesDbOrResponse: RidesDbOrResponse,
  adminAudit: AdminAuditFn,
) {
  admin.get("/support/stuck-trips", async (c) => {
    const adminUser = await requireProductAdminAny(c, SUPPORT_PRODUCTS);
    if (adminUser instanceof Response) return adminUser;

    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const staleMinutes = Math.min(
      24 * 60,
      Math.max(1, Number(c.req.query("stale_minutes") ?? 15)),
    );
    const staleMs = staleMinutes * 60_000;

    const { data, error } = await db.from(tables.ride_requests)
      .select("*")
      .in("status", [...ACTIVE_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error) return c.json({ error: "list_failed", message: error.message }, 500);

    const stuck = ((data ?? []) as Record<string, unknown>[]).filter((row) => {
      const at = row.last_driver_location_at as string | null | undefined;
      if (!at) return true;
      const age = Date.now() - Date.parse(at);
      return !Number.isFinite(age) || age >= staleMs;
    }).slice(0, STUCK_TRIPS_LIMIT);

    const rides = await enrichDriverNames(stuck);
    return c.json({ rides, stale_minutes: staleMinutes });
  });

  admin.get("/rides/:id/audit", async (c) => {
    const adminUser = await requireProductAdminAny(c, SUPPORT_PRODUCTS);
    if (adminUser instanceof Response) return adminUser;

    const rideId = c.req.param("id");
    const resolved = await ridesDbOrResponse(c);
    if (resolved instanceof Response) return resolved;
    const { db, tables } = resolved;

    const { data, error } = await db.from(tables.audit_events)
      .select("id, event_type, payload, actor_user_id, created_at, ride_request_id")
      .eq("ride_request_id", rideId)
      .order("created_at", { ascending: false })
      .limit(AUDIT_LIMIT);

    if (error) return c.json({ error: "audit_failed", message: error.message }, 500);
    return c.json({ events: data ?? [] });
  });

  admin.get("/rides/:id", async (c) => {
    const adminUser = await requireProductAdminAny(c, SUPPORT_PRODUCTS);
    if (adminUser instanceof Response) return adminUser;

    const rideId = c.req.param("id");
    const ride = await loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    const [enriched] = await enrichDriverNames([ride]);
    return c.json({ ride: enriched });
  });

  admin.post("/rides/:id/cancel", async (c) => {
    const adminUser = await requireProductAdminAny(c, SUPPORT_PRODUCTS);
    if (adminUser instanceof Response) return adminUser;

    const rideId = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const { reason, support_reason_code, support_note } = parseSupportReason(body);

    const ride = await loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    const status = String(ride.status ?? "");
    if (status === "completed" || status === "cancelled") {
      return c.json({ ride, skipped: true });
    }
    if (!isActiveStatus(status)) {
      return c.json({ error: "not_active", status }, 409);
    }

    const ok = await cancelRideRequestRow(rideId, "system", reason);
    if (!ok) return c.json({ error: "cancel_failed" }, 500);

    await cleanupRideLiveState(ridesSvc(), rideId);
    const cellKey = gridCellKey(Number(ride.pickup_lat), Number(ride.pickup_lng));
    await bumpSurgeDemand(cellKey, -1);
    await handleTerminalRideLedgerAndSync(rideId);

    const resolved = await ridesDbOrResponse(c);
    if (!(resolved instanceof Response)) {
      await adminAudit(resolved.db, resolved.tables, adminUser.id, "admin_ride_force_cancel", {
        ride_id: rideId,
        reason,
        support_reason_code,
        support_note,
        from_status: status,
      });
    }

    const fresh = await loadRideRequestById(rideId);
    const [enriched] = await enrichDriverNames([fresh ?? ride]);
    return c.json({ ride: enriched });
  });

  async function ensureFareLockedForSettlement(
    rideId: string,
    ride: Record<string, unknown>,
  ): Promise<{ ok: true; ride: Record<string, unknown> } | { ok: false; error: string; status: number; message?: string }> {
    const lockedFare = Number(ride.fare_final_minor);
    if (Number.isFinite(lockedFare) && lockedFare >= 0) {
      return { ok: true, ride };
    }
    const fareResult = computeFinalFareFromRide(ride);
    if ("error" in fareResult) {
      return { ok: false, error: fareResult.error, status: 400, message: "Could not lock fare for cash settlement" };
    }
    const nowIso = new Date().toISOString();
    const locked = await patchRideRequest(rideId, {
      fare_final_minor: fareResult.fareMinor,
      fare_final_breakdown: fareResult.fareFinalBreakdown,
      platform_fee_minor: 0,
      driver_net_minor: fareResult.fareMinor,
      fare_locked_at: nowIso,
      cash_settlement_status: "pending",
    });
    if (!locked) {
      return { ok: false, error: "fare_lock_failed", status: 500, message: "Could not lock fare for cash settlement" };
    }
    const fresh = await loadRideRequestById(rideId);
    if (!fresh) {
      return { ok: false, error: "not_found", status: 404 };
    }
    return { ok: true, ride: fresh };
  }

  admin.post("/rides/:id/release-cash-settlement", async (c) => {
    const adminUser = await requireProductAdminAny(c, SUPPORT_PRODUCTS);
    if (adminUser instanceof Response) return adminUser;

    const rideId = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const { support_reason_code, support_note } = parseSupportReason(body);

    const ride = await loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    const gate = canAdminReleaseCashSettlement(
      { status: String(ride.status ?? ""), payment_method: ride.payment_method as string },
      isCashSettlementEnabled(),
    );
    if (!gate.ok) {
      return c.json({ error: gate.error }, gate.status);
    }

    const status = String(ride.status ?? "");
    const deps = transitionDeps();
    const result = await applyRideTransition(deps, {
      rideId,
      next: "awaiting_cash_settlement",
      actorUserId: adminUser.id,
      source: "system",
    });
    if (!result.ok) {
      return c.json({
        error: result.error ?? "release_failed",
        current: result.current,
      }, 409);
    }

    const resolved = await ridesDbOrResponse(c);
    if (!(resolved instanceof Response)) {
      await adminAudit(resolved.db, resolved.tables, adminUser.id, "admin_cash_release_settlement", {
        ride_id: rideId,
        from_status: status,
        support_reason_code,
        support_note,
      });
    }

    const fresh = await loadRideRequestById(rideId);
    const [enriched] = await enrichDriverNames([fresh ?? ride]);
    return c.json({ ride: enriched });
  });

  admin.post("/rides/:id/settle-cash", async (c) => {
    const adminUser = await requireProductAdminAny(c, SUPPORT_PRODUCTS);
    if (adminUser instanceof Response) return adminUser;

    const rideId = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const { support_reason_code, support_note } = parseSupportReason(body);

    const ride = await loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    const gate = canAdminSettleCash(
      { status: String(ride.status ?? ""), payment_method: ride.payment_method as string },
      isCashSettlementEnabled(),
    );
    if (!gate.ok) {
      return c.json({ error: gate.error }, gate.status);
    }

    const cashReceivedMinor = Number(body.cash_received_minor);
    if (!Number.isFinite(cashReceivedMinor) || cashReceivedMinor < 0) {
      return c.json({ error: "invalid_cash_received_minor" }, 400);
    }

    const status = String(ride.status ?? "");
    const fareLock = await ensureFareLockedForSettlement(rideId, ride);
    if (!fareLock.ok) {
      return c.json({ error: fareLock.error, message: fareLock.message }, fareLock.status);
    }

    const idempotencyKey = typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim()
      : `admin-settle:${rideId}`;

    const settleResult = await processCashSettlement(
      ridesSvc(),
      patchRideRequest,
      loadRideRequestById,
      {
        ride: fareLock.ride,
        cashReceivedMinor: Math.max(0, Math.floor(cashReceivedMinor)),
        tipReceivedMinor: body.tip_received_minor != null
          ? Number(body.tip_received_minor)
          : undefined,
        idempotencyKey,
        actorUserId: adminUser.id,
        opsBypass: true,
      },
    );

    if (!settleResult.ok) {
      return c.json({ error: settleResult.error }, settleResult.status);
    }

    await handleTerminalRideLedgerAndSync(rideId);
    await cleanupRideLiveState(ridesSvc(), rideId);

    const resolved = await ridesDbOrResponse(c);
    if (!(resolved instanceof Response)) {
      await adminAudit(resolved.db, resolved.tables, adminUser.id, "admin_cash_settle_complete", {
        ride_id: rideId,
        from_status: status,
        support_reason_code,
        support_note,
        cash_received_minor: Math.floor(cashReceivedMinor),
        outcome: settleResult.computed.outcome,
      });
    }

    const fresh = await loadRideRequestById(rideId);
    const [enriched] = await enrichDriverNames([fresh ?? ride]);
    return c.json({ ride: enriched, cash_settlement: settleResult.computed });
  });

  admin.post("/rides/:id/complete", async (c) => {
    const adminUser = await requireProductAdminAny(c, SUPPORT_PRODUCTS);
    if (adminUser instanceof Response) return adminUser;

    const rideId = c.req.param("id");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const { support_reason_code, support_note } = parseSupportReason(body);

    const ride = await loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    const status = String(ride.status ?? "");
    if (status === "completed" || status === "cancelled") {
      return c.json({ ride, skipped: true });
    }
    if (status !== "on_trip") {
      return c.json({
        error: "complete_only_on_trip",
        message: "Force complete is only allowed when the ride is on_trip. Use cancel for earlier stages.",
        status,
      }, 409);
    }

    if (shouldBlockCashForceComplete(
      { status, payment_method: ride.payment_method as string },
      isCashSettlementEnabled(),
    )) {
      return c.json({
        error: "use_release_or_settle",
        message: "Cash trips use Release to cash settlement (on trip) or Settle & complete (awaiting settlement). Generic complete is not allowed for cash.",
        status,
      }, 409);
    }

    const deps = transitionDeps();

    const result = await applyRideTransition(deps, {
      rideId,
      next: "completed",
      actorUserId: adminUser.id,
      source: "system",
    });
    if (!result.ok) {
      return c.json({ error: result.error ?? "complete_failed", current: result.current }, 409);
    }

    const resolved = await ridesDbOrResponse(c);
    if (!(resolved instanceof Response)) {
      await adminAudit(resolved.db, resolved.tables, adminUser.id, "admin_ride_force_complete", {
        ride_id: rideId,
        from_status: status,
        support_reason_code,
        support_note,
      });
    }

    const fresh = result.ride ?? await loadRideRequestById(rideId);
    const [enriched] = await enrichDriverNames([fresh ?? ride]);
    return c.json({ ride: enriched });
  });
}
