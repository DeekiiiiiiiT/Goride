import type { Hono, Context } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireProductAdmin } from "../../_shared/productAdmin.ts";
import type { RidesAdminTables } from "../../_shared/ridesAdminDb.ts";
import { isCashSettlementAdminOverrideEnabled } from "../cashSettlement/flags.ts";
import {
  riderAccountKeyForUser,
  driverDigitalAccountKeyForUser,
  PLATFORM_RECEIVABLE_KEY,
  PLATFORM_CLEARING_KEY,
  type JournalLineSpec,
} from "../cashSettlement/buildJournalEntries.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import { getRiderArrearsMinor } from "../cashSettlement/arrearsCheck.ts";

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

function svc(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function loadRideRequestById(id: string): Promise<Record<string, unknown> | null> {
  const { data } = await svc().from("ride_requests").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function patchRideRequest(id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { error } = await svc().from("ride_requests").update(patch).eq("id", id);
  return !error;
}

export const OVERRIDE_REASON_CODES = {
  goodwill: "Goodwill gesture",
  system_error: "System error correction",
  driver_confirmed_paid: "Driver confirmed full payment received",
  duplicate_charge: "Duplicate charge correction",
  late_cash_confirmation: "Late cash confirmation from driver",
  support_ticket: "Support ticket resolution",
  fare_recalculation: "Fare recalculation",
  promo_credit: "Promotional credit",
  damage_deduction: "Damage deduction",
  other: "Other",
} as const;

export type OverrideReasonCode = keyof typeof OVERRIDE_REASON_CODES;

export type OverrideActionType =
  | "arrears_writeoff"
  | "arrears_partial_writeoff"
  | "manual_settle"
  | "driver_credit"
  | "driver_debit"
  | "settlement_void";

async function insertOverrideAudit(
  params: {
    rideRequestId?: string;
    riderUserId?: string;
    driverUserId?: string;
    actionType: OverrideActionType;
    amountMinor: number;
    currency: string;
    reasonCode: string;
    adminNotes?: string;
    performedBy: string;
  },
): Promise<void> {
  await svc().from("admin_settlement_overrides").insert({
    ride_request_id: params.rideRequestId ?? null,
    rider_user_id: params.riderUserId ?? null,
    driver_user_id: params.driverUserId ?? null,
    action_type: params.actionType,
    amount_minor: params.amountMinor,
    currency: params.currency,
    reason_code: params.reasonCode,
    admin_notes: params.adminNotes ?? null,
    performed_by: params.performedBy,
  });
}

function buildArrearsWriteoffJournal(params: {
  rideId?: string;
  riderUserId: string;
  amountMinor: number;
  currency: string;
  reasonCode: string;
  adminUserId: string;
}): JournalLineSpec[] {
  const riderKey = riderAccountKeyForUser(params.riderUserId);

  return [
    {
      entry_type: "admin_arrears_writeoff" as const,
      debit_account_key: PLATFORM_RECEIVABLE_KEY,
      credit_account_key: riderKey,
      amount_minor: params.amountMinor,
      metadata: {
        ride_request_id: params.rideId ?? null,
        currency: params.currency,
        reason_code: params.reasonCode,
        admin_user_id: params.adminUserId,
        description: "Admin arrears write-off",
      },
    },
  ];
}

function buildDriverAdjustmentJournal(params: {
  rideId: string;
  driverUserId: string;
  adjustmentMinor: number;
  currency: string;
  reasonCode: string;
  adminUserId: string;
}): JournalLineSpec[] {
  const driverKey = driverDigitalAccountKeyForUser(params.driverUserId);
  const isCredit = params.adjustmentMinor > 0;
  const amount = Math.abs(params.adjustmentMinor);

  return [
    {
      entry_type: isCredit ? "admin_driver_credit" as const : "admin_driver_debit" as const,
      debit_account_key: isCredit ? PLATFORM_CLEARING_KEY : driverKey,
      credit_account_key: isCredit ? driverKey : PLATFORM_CLEARING_KEY,
      amount_minor: amount,
      metadata: {
        ride_request_id: params.rideId,
        currency: params.currency,
        reason_code: params.reasonCode,
        admin_user_id: params.adminUserId,
        adjustment_minor: params.adjustmentMinor,
        description: isCredit ? "Admin driver credit" : "Admin driver debit",
      },
    },
  ];
}

export function registerSettlementOverrideRoutes(
  app: Hono,
  ridesDbOrResponse: RidesDbOrResponse,
  adminAudit: AdminAuditFn,
): void {
  app.post("/riders/:userId/writeoff-arrears", async (c: Context) => {
    if (!isCashSettlementAdminOverrideEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const dbOrRes = await ridesDbOrResponse(c);
    if (dbOrRes instanceof Response) return dbOrRes;
    const { db, tables } = dbOrRes;

    const adminCheck = await requireProductAdmin(c, "rides");
    if (adminCheck) return adminCheck;

    const riderUserId = c.req.param("userId");
    const body = await c.req.json().catch(() => ({}));
    
    const rideId = typeof body.ride_id === "string" ? body.ride_id : undefined;
    const amountMinor = typeof body.amount_minor === "number" 
      ? Math.max(0, Math.floor(body.amount_minor)) 
      : 0;
    const reasonCode = typeof body.reason_code === "string" ? body.reason_code : "";
    const adminNotes = typeof body.notes === "string" ? body.notes.trim() : "";
    const currency = typeof body.currency === "string" ? body.currency : "JMD";

    if (!reasonCode || !Object.keys(OVERRIDE_REASON_CODES).includes(reasonCode)) {
      return c.json({ error: "invalid_reason_code", valid_codes: Object.keys(OVERRIDE_REASON_CODES) }, 400);
    }

    const currentArrears = await getRiderArrearsMinor(svc(), riderUserId, currency);
    if (currentArrears <= 0) {
      return c.json({ error: "no_arrears", message: "Rider has no outstanding arrears" }, 400);
    }

    const writeoffAmount = amountMinor > 0 ? Math.min(amountMinor, currentArrears) : currentArrears;

    const actorId = c.get("userId") as string ?? "";
    const journalLines = buildArrearsWriteoffJournal({
      rideId,
      riderUserId,
      amountMinor: writeoffAmount,
      currency,
      reasonCode,
      adminUserId: actorId,
    });

    const journalResult = await postPaymentJournal(svc(), {
      rideId: rideId ?? `admin_writeoff_${riderUserId}_${Date.now()}`,
      idempotencyKey: `admin_writeoff:${riderUserId}:${Date.now()}`,
      requestHash: `writeoff:${writeoffAmount}:${reasonCode}`,
      currency,
      lines: journalLines,
      createdByUserId: actorId,
    });

    if (journalResult.conflict) {
      return c.json({ error: "journal_conflict" }, 409);
    }

    await insertOverrideAudit({
      rideRequestId: rideId,
      riderUserId,
      actionType: amountMinor > 0 && amountMinor < currentArrears ? "arrears_partial_writeoff" : "arrears_writeoff",
      amountMinor: writeoffAmount,
      currency,
      reasonCode,
      adminNotes,
      performedBy: actorId,
    });

    await adminAudit(db, tables, actorId, "admin_arrears_writeoff", {
      rider_user_id: riderUserId,
      ride_request_id: rideId ?? null,
      amount_minor: writeoffAmount,
      reason_code: reasonCode,
    });

    const newArrears = await getRiderArrearsMinor(svc(), riderUserId, currency);

    return c.json({
      success: true,
      amount_written_off_minor: writeoffAmount,
      new_arrears_minor: newArrears,
      currency,
    });
  });

  app.post("/rides/:rideId/adjust-driver-credit", async (c: Context) => {
    if (!isCashSettlementAdminOverrideEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const dbOrRes = await ridesDbOrResponse(c);
    if (dbOrRes instanceof Response) return dbOrRes;
    const { db, tables } = dbOrRes;

    const adminCheck = await requireProductAdmin(c, "rides");
    if (adminCheck) return adminCheck;

    const rideId = c.req.param("rideId");
    const ride = await loadRideRequestById(rideId);
    if (!ride) {
      return c.json({ error: "ride_not_found" }, 404);
    }

    const driverUserId = String(ride.assigned_driver_user_id ?? "");
    if (!driverUserId) {
      return c.json({ error: "no_assigned_driver" }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const adjustmentMinor = typeof body.adjustment_minor === "number" 
      ? Math.floor(body.adjustment_minor) 
      : 0;
    const reasonCode = typeof body.reason_code === "string" ? body.reason_code : "";
    const adminNotes = typeof body.notes === "string" ? body.notes.trim() : "";
    const currency = String(ride.currency ?? "JMD");

    if (adjustmentMinor === 0) {
      return c.json({ error: "invalid_adjustment", message: "Adjustment amount must be non-zero" }, 400);
    }

    if (!reasonCode || !Object.keys(OVERRIDE_REASON_CODES).includes(reasonCode)) {
      return c.json({ error: "invalid_reason_code", valid_codes: Object.keys(OVERRIDE_REASON_CODES) }, 400);
    }

    const actorId = c.get("userId") as string ?? "";
    const journalLines = buildDriverAdjustmentJournal({
      rideId,
      driverUserId,
      adjustmentMinor,
      currency,
      reasonCode,
      adminUserId: actorId,
    });

    const journalResult = await postPaymentJournal(svc(), {
      rideId,
      idempotencyKey: `admin_driver_adj:${rideId}:${Date.now()}`,
      requestHash: `driver_adj:${adjustmentMinor}:${reasonCode}`,
      currency,
      lines: journalLines,
      createdByUserId: actorId,
    });

    if (journalResult.conflict) {
      return c.json({ error: "journal_conflict" }, 409);
    }

    await insertOverrideAudit({
      rideRequestId: rideId,
      driverUserId,
      actionType: adjustmentMinor > 0 ? "driver_credit" : "driver_debit",
      amountMinor: Math.abs(adjustmentMinor),
      currency,
      reasonCode,
      adminNotes,
      performedBy: actorId,
    });

    await adminAudit(db, tables, actorId, adjustmentMinor > 0 ? "admin_driver_credit" : "admin_driver_debit", {
      ride_request_id: rideId,
      driver_user_id: driverUserId,
      adjustment_minor: adjustmentMinor,
      reason_code: reasonCode,
    });

    return c.json({
      success: true,
      adjustment_minor: adjustmentMinor,
      currency,
    });
  });

  app.get("/settlement-overrides", async (c: Context) => {
    if (!isCashSettlementAdminOverrideEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const dbOrRes = await ridesDbOrResponse(c);
    if (dbOrRes instanceof Response) return dbOrRes;

    const adminCheck = await requireProductAdmin(c, "rides");
    if (adminCheck) return adminCheck;

    const riderId = c.req.query("rider_id");
    const driverId = c.req.query("driver_id");
    const rideId = c.req.query("ride_id");
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
    const offset = (page - 1) * limit;

    let query = svc()
      .from("admin_settlement_overrides")
      .select("*", { count: "exact" });

    if (riderId) query = query.eq("rider_user_id", riderId);
    if (driverId) query = query.eq("driver_user_id", driverId);
    if (rideId) query = query.eq("ride_request_id", rideId);

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return c.json({ error: "query_failed" }, 500);
    }

    return c.json({
      overrides: (data ?? []).map((row) => ({
        ...row,
        reason_label: OVERRIDE_REASON_CODES[row.reason_code as OverrideReasonCode] ?? row.reason_code,
      })),
      total: count ?? 0,
      page,
      limit,
    });
  });

  app.get("/reason-codes", async (c: Context) => {
    const adminCheck = await requireProductAdmin(c, "rides");
    if (adminCheck) return adminCheck;

    return c.json({ reason_codes: OVERRIDE_REASON_CODES });
  });
}
