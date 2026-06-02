/**
 * Admin force-cancel / force-complete for stuck active rides.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import {
  finalizeRideLedgerFields,
  persistRideLedgerLinesForTerminalState,
} from "../../_shared/rideLedgerLines.ts";
import { syncRideToFleetKv } from "../../_shared/rideToFleetTrip.ts";
import { gridCellKey } from "../fare/buildQuote.ts";
import { cleanupRideLiveState } from "../rideGeofence.ts";
import { applyRideTransition, type ApplyTransitionDeps, type RideStatus } from "../rideLifecycle.ts";

const ACTIVE_STATUSES: RideStatus[] = [
  "matching",
  "driver_assigned",
  "driver_en_route_pickup",
  "driver_arrived_pickup",
  "on_trip",
];

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

export function registerRideOperationsAdminRoutes(
  admin: Hono,
  ridesDbOrResponse: RidesDbOrResponse,
  adminAudit: AdminAuditFn,
) {
  admin.post("/rides/:id/cancel", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const rideId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "admin_force_cancel";

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
        from_status: status,
      });
    }

    const fresh = await loadRideRequestById(rideId);
    return c.json({ ride: fresh });
  });

  admin.post("/rides/:id/complete", async (c) => {
    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const rideId = c.req.param("id");
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

    const result = await applyRideTransition(transitionDeps(), {
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
      });
    }

    return c.json({ ride: result.ride ?? await loadRideRequestById(rideId) });
  });
}
