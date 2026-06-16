import type { Hono, Context } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import {
  isCashSettlementDisputeFlowEnabled,
} from "../cashSettlement/flags.ts";
import {
  listDisputes,
  resolveDispute,
  CASH_SETTLEMENT_DISPUTES_TABLE_PUBLIC,
  type DisputeResolution,
  type DisputeStatus,
  DISPUTE_REASONS,
} from "../cashSettlement/disputeService.ts";

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

function pubSvc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

const DISPUTES_TABLE = CASH_SETTLEMENT_DISPUTES_TABLE_PUBLIC;
const RIDE_REQUESTS_TABLE = "rides_ride_requests";

async function loadRideRequestById(id: string): Promise<Record<string, unknown> | null> {
  const { data } = await pubSvc().from(RIDE_REQUESTS_TABLE).select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function patchRideRequest(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data: rpcData, error: rpcError } = await pubSvc().rpc("rides_patch_ride_request", {
    p_id: id,
    p_patch: patch,
  });
  return !rpcError && rpcData != null;
}

export function registerDisputeAdminRoutes(
  app: Hono,
  ridesDbOrResponse: RidesDbOrResponse,
  adminAudit: AdminAuditFn,
): void {
  app.get("/disputes", async (c: Context) => {
    if (!isCashSettlementDisputeFlowEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const dbOrRes = await ridesDbOrResponse(c);
    if (dbOrRes instanceof Response) return dbOrRes;
    const { db, tables } = dbOrRes;

    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const status = c.req.query("status") as DisputeStatus | undefined;
    const riderId = c.req.query("rider_id");
    const driverId = c.req.query("driver_id");
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));

    const result = await listDisputes(pubSvc(), {
      status,
      riderId,
      driverId,
      page,
      limit,
      disputesTable: DISPUTES_TABLE,
    });

    return c.json({
      disputes: result.disputes.map((d) => ({
        ...d,
        reason_label: DISPUTE_REASONS[d.dispute_reason as keyof typeof DISPUTE_REASONS] ?? d.dispute_reason,
      })),
      total: result.total,
      page,
      limit,
    });
  });

  app.get("/disputes/:id", async (c: Context) => {
    if (!isCashSettlementDisputeFlowEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const dbOrRes = await ridesDbOrResponse(c);
    if (dbOrRes instanceof Response) return dbOrRes;
    const { db, tables } = dbOrRes;

    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const disputeId = c.req.param("id");
    const { data: dispute, error } = await pubSvc()
      .from(DISPUTES_TABLE)
      .select("*")
      .eq("id", disputeId)
      .single();

    if (error || !dispute) {
      return c.json({ error: "not_found" }, 404);
    }

    const ride = await loadRideRequestById(String(dispute.ride_request_id));

    return c.json({
      dispute: {
        ...dispute,
        reason_label: DISPUTE_REASONS[dispute.dispute_reason as keyof typeof DISPUTE_REASONS] ?? dispute.dispute_reason,
      },
      ride: ride
        ? {
            id: ride.id,
            pickup_address: ride.pickup_address,
            dropoff_address: ride.dropoff_address,
            fare_final_minor: ride.fare_final_minor ?? ride.fare_estimate_minor,
            cash_received_minor: ride.cash_received_minor,
            cash_settlement_outcome: ride.cash_settlement_outcome,
            currency: ride.currency,
            completed_at: ride.completed_at,
          }
        : null,
    });
  });

  app.post("/disputes/:id/resolve", async (c: Context) => {
    if (!isCashSettlementDisputeFlowEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const dbOrRes = await ridesDbOrResponse(c);
    if (dbOrRes instanceof Response) return dbOrRes;
    const { db, tables } = dbOrRes;

    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const disputeId = c.req.param("id");

    const { data: dispute, error: fetchError } = await pubSvc()
      .from(DISPUTES_TABLE)
      .select("*")
      .eq("id", disputeId)
      .single();

    if (fetchError || !dispute) {
      return c.json({ error: "not_found" }, 404);
    }

    const ride = await loadRideRequestById(String(dispute.ride_request_id));
    if (!ride) {
      return c.json({ error: "ride_not_found" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const resolution = body.resolution as DisputeResolution;
    const resolutionAmountMinor = typeof body.resolution_amount_minor === "number"
      ? Math.max(0, Math.floor(body.resolution_amount_minor))
      : undefined;
    const adminNotes = typeof body.admin_notes === "string" ? body.admin_notes.trim() : "";

    const validResolutions: DisputeResolution[] = ["rider_favor", "driver_favor", "partial", "rejected"];
    if (!validResolutions.includes(resolution)) {
      return c.json({ error: "invalid_resolution", valid_resolutions: validResolutions }, 400);
    }

    if (!adminNotes) {
      return c.json({ error: "admin_notes_required" }, 400);
    }

    if (resolution === "partial" && (resolutionAmountMinor == null || resolutionAmountMinor <= 0)) {
      return c.json({ error: "resolution_amount_required_for_partial" }, 400);
    }

    const actorId = adminUser.id;
    const result = await resolveDispute(
      pubSvc(),
      patchRideRequest,
      {
        disputeId,
        adminUserId: actorId,
        resolution,
        resolutionAmountMinor,
        adminNotes,
        currency: String(ride.currency ?? "JMD"),
        riderUserId: String(dispute.rider_user_id),
        rideId: String(dispute.ride_request_id),
      },
      { disputesTable: DISPUTES_TABLE },
    );

    if (!result.success) {
      return c.json({ error: result.error }, result.status as 400);
    }

    await adminAudit(db, tables, actorId, "dispute_resolved", {
      dispute_id: disputeId,
      ride_request_id: dispute.ride_request_id,
      resolution,
      resolution_amount_minor: resolutionAmountMinor ?? 0,
    });

    return c.json({ success: true });
  });

  app.post("/disputes/:id/review", async (c: Context) => {
    if (!isCashSettlementDisputeFlowEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const dbOrRes = await ridesDbOrResponse(c);
    if (dbOrRes instanceof Response) return dbOrRes;
    const { db, tables } = dbOrRes;

    const adminUser = await requireProductAdmin(c, "rides");
    if (adminUser instanceof Response) return adminUser;

    const disputeId = c.req.param("id");

    const { data: dispute, error: fetchError } = await pubSvc()
      .from(DISPUTES_TABLE)
      .select("dispute_status, ride_request_id")
      .eq("id", disputeId)
      .single();

    if (fetchError || !dispute) {
      return c.json({ error: "not_found" }, 404);
    }

    if (dispute.dispute_status !== "open") {
      return c.json({ error: "not_open", current_status: dispute.dispute_status }, 409);
    }

    const { error: updateError } = await pubSvc()
      .from(DISPUTES_TABLE)
      .update({
        dispute_status: "under_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", disputeId);

    if (updateError) {
      return c.json({ error: "update_failed" }, 500);
    }

    const actorId = adminUser.id;
    await adminAudit(db, tables, actorId, "dispute_under_review", {
      dispute_id: disputeId,
      ride_request_id: dispute.ride_request_id,
    });

    return c.json({ success: true, status: "under_review" });
  });
}
