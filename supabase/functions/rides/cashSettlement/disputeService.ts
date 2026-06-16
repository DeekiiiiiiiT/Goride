import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { riderAccountKeyForUser, PLATFORM_RECEIVABLE_KEY, type JournalLineSpec } from "./buildJournalEntries.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import { isCashSettlementDisputeFlowEnabled } from "./flags.ts";

export interface Dispute {
  id: string;
  ride_request_id: string;
  rider_user_id: string;
  driver_user_id: string;
  disputed_amount_minor: number;
  dispute_reason: string;
  dispute_status: DisputeStatus;
  rider_notes: string | null;
  admin_notes: string | null;
  resolution_amount_minor: number | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DisputeStatus =
  | "open"
  | "under_review"
  | "resolved_rider_favor"
  | "resolved_driver_favor"
  | "resolved_partial"
  | "rejected";

export type DisputeResolution =
  | "rider_favor"
  | "driver_favor"
  | "partial"
  | "rejected";

export const DISPUTE_REASONS = {
  full_fare_paid: "I paid the full fare in cash",
  incorrect_amount: "The fare amount is incorrect",
  charged_incorrectly: "I was charged incorrectly",
  other: "Other (please explain)",
} as const;

export type DisputeReasonCode = keyof typeof DISPUTE_REASONS;

const DISPUTE_WINDOW_DAYS = 7;

export interface CreateDisputeParams {
  rideId: string;
  riderUserId: string;
  driverUserId: string;
  disputedAmountMinor: number;
  reason: DisputeReasonCode;
  notes?: string;
  currency: string;
}

export interface CreateDisputeResult {
  success: boolean;
  error?: string;
  status?: number;
  disputeId?: string;
}

export const CASH_SETTLEMENT_DISPUTES_TABLE_PUBLIC = "rides_cash_settlement_disputes";

function disputesTable(table?: string): string {
  return table ?? "cash_settlement_disputes";
}

export async function createDispute(
  db: SupabaseClient,
  patchRide: (id: string, patch: Record<string, unknown>) => Promise<boolean>,
  params: CreateDisputeParams,
  opts?: { disputesTable?: string },
): Promise<CreateDisputeResult> {
  if (!isCashSettlementDisputeFlowEnabled()) {
    return { success: false, error: "feature_disabled", status: 404 };
  }

  const table = disputesTable(opts?.disputesTable);
  const existing = await getDisputeForRide(db, params.rideId, table);
  if (existing && ["open", "under_review"].includes(existing.dispute_status)) {
    return { success: false, error: "dispute_already_exists", status: 409 };
  }

  if (params.disputedAmountMinor <= 0) {
    return { success: false, error: "invalid_amount", status: 400 };
  }

  if (!Object.keys(DISPUTE_REASONS).includes(params.reason)) {
    return { success: false, error: "invalid_reason", status: 400 };
  }

  const { data, error } = await db
    .from(table)
    .insert({
      ride_request_id: params.rideId,
      rider_user_id: params.riderUserId,
      driver_user_id: params.driverUserId,
      disputed_amount_minor: params.disputedAmountMinor,
      dispute_reason: params.reason,
      dispute_status: "open",
      rider_notes: params.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[disputeService] create_dispute_failed", error);
    return { success: false, error: "insert_failed", status: 500 };
  }

  await patchRide(params.rideId, { has_active_dispute: true });

  console.info("[disputeService] dispute_created", {
    dispute_id: data.id,
    ride_id: params.rideId,
    rider_user_id: params.riderUserId,
    disputed_amount_minor: params.disputedAmountMinor,
    reason: params.reason,
  });

  return { success: true, disputeId: data.id };
}

export async function getDisputeForRide(
  db: SupabaseClient,
  rideId: string,
  table = "cash_settlement_disputes",
): Promise<Dispute | null> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("ride_request_id", rideId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[disputeService] get_dispute_failed", error);
    return null;
  }

  return data as Dispute | null;
}

export async function listDisputes(
  db: SupabaseClient,
  opts: {
    status?: DisputeStatus;
    riderId?: string;
    driverId?: string;
    page?: number;
    limit?: number;
    disputesTable?: string;
  },
): Promise<{ disputes: Dispute[]; total: number }> {
  const table = disputesTable(opts.disputesTable);
  let query = db
    .from(table)
    .select("*", { count: "exact" });

  if (opts.status) {
    query = query.eq("dispute_status", opts.status);
  }
  if (opts.riderId) {
    query = query.eq("rider_user_id", opts.riderId);
  }
  if (opts.driverId) {
    query = query.eq("driver_user_id", opts.driverId);
  }

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 20;
  const offset = (page - 1) * limit;

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[disputeService] list_disputes_failed", error);
    return { disputes: [], total: 0 };
  }

  return {
    disputes: (data ?? []) as Dispute[],
    total: count ?? 0,
  };
}

export interface ResolveDisputeParams {
  disputeId: string;
  adminUserId: string;
  resolution: DisputeResolution;
  resolutionAmountMinor?: number;
  adminNotes: string;
  currency: string;
  riderUserId: string;
  rideId: string;
}

export interface ResolveDisputeResult {
  success: boolean;
  error?: string;
  status?: number;
}

export async function resolveDispute(
  db: SupabaseClient,
  patchRide: (id: string, patch: Record<string, unknown>) => Promise<boolean>,
  params: ResolveDisputeParams,
  opts?: { disputesTable?: string },
): Promise<ResolveDisputeResult> {
  if (!isCashSettlementDisputeFlowEnabled()) {
    return { success: false, error: "feature_disabled", status: 404 };
  }

  const table = disputesTable(opts?.disputesTable);
  const { data: dispute, error: fetchError } = await db
    .from(table)
    .select("*")
    .eq("id", params.disputeId)
    .single();

  if (fetchError || !dispute) {
    return { success: false, error: "not_found", status: 404 };
  }

  if (!["open", "under_review"].includes(dispute.dispute_status)) {
    return { success: false, error: "already_resolved", status: 409 };
  }

  const statusMap: Record<DisputeResolution, DisputeStatus> = {
    rider_favor: "resolved_rider_favor",
    driver_favor: "resolved_driver_favor",
    partial: "resolved_partial",
    rejected: "rejected",
  };

  const newStatus = statusMap[params.resolution];
  const resolutionAmount =
    params.resolution === "rider_favor"
      ? dispute.disputed_amount_minor
      : params.resolution === "partial"
        ? (params.resolutionAmountMinor ?? 0)
        : 0;

  if (resolutionAmount > 0) {
    const journalLines = buildDisputeResolutionJournal({
      rideId: params.rideId,
      riderUserId: params.riderUserId,
      resolutionAmountMinor: resolutionAmount,
      currency: params.currency,
      disputeId: params.disputeId,
    });

    const journalResult = await postPaymentJournal(undefined, {
      rideId: params.rideId,
      idempotencyKey: `dispute_resolution:${params.disputeId}`,
      requestHash: `dispute:${params.disputeId}:${resolutionAmount}`,
      currency: params.currency,
      lines: journalLines,
      createdByUserId: params.adminUserId,
    });

    if (journalResult.conflict) {
      return { success: false, error: "journal_conflict", status: 409 };
    }
  }

  const now = new Date().toISOString();
  const { error: updateError } = await db
    .from(table)
    .update({
      dispute_status: newStatus,
      resolution_amount_minor: resolutionAmount > 0 ? resolutionAmount : null,
      resolved_by: params.adminUserId,
      resolved_at: now,
      admin_notes: params.adminNotes,
      updated_at: now,
    })
    .eq("id", params.disputeId);

  if (updateError) {
    console.error("[disputeService] resolve_dispute_update_failed", updateError);
    return { success: false, error: "update_failed", status: 500 };
  }

  await patchRide(params.rideId, { has_active_dispute: false });

  console.info("[disputeService] dispute_resolved", {
    dispute_id: params.disputeId,
    resolution: params.resolution,
    resolution_amount_minor: resolutionAmount,
    admin_user_id: params.adminUserId,
  });

  return { success: true };
}

function buildDisputeResolutionJournal(params: {
  rideId: string;
  riderUserId: string;
  resolutionAmountMinor: number;
  currency: string;
  disputeId: string;
}): JournalLineSpec[] {
  const riderKey = riderAccountKeyForUser(params.riderUserId);

  return [
    {
      entry_type: "dispute_resolution_credit" as const,
      debit_account_key: PLATFORM_RECEIVABLE_KEY,
      credit_account_key: riderKey,
      amount_minor: params.resolutionAmountMinor,
      metadata: {
        ride_request_id: params.rideId,
        currency: params.currency,
        dispute_id: params.disputeId,
        resolution_amount_minor: params.resolutionAmountMinor,
        description: "Dispute resolution credit to rider",
      },
    },
  ];
}

export function canFileDispute(
  ride: Record<string, unknown>,
  arrearsMinor: number,
): { allowed: boolean; reason?: string } {
  if (!isCashSettlementDisputeFlowEnabled()) {
    return { allowed: false, reason: "feature_disabled" };
  }

  if (arrearsMinor <= 0) {
    return { allowed: false, reason: "no_arrears" };
  }

  const outcome = String(ride.cash_settlement_outcome ?? "");
  if (!["underpay", "split", "unpaid"].includes(outcome)) {
    return { allowed: false, reason: "invalid_outcome" };
  }

  const completedAt = ride.completed_at ? new Date(String(ride.completed_at)) : null;
  if (completedAt) {
    const windowEnd = new Date(completedAt.getTime() + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnd) {
      return { allowed: false, reason: "window_expired" };
    }
  }

  if (ride.has_active_dispute === true) {
    return { allowed: false, reason: "dispute_exists" };
  }

  return { allowed: true };
}
