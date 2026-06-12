import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeCashSettlementOutcome } from "./computeOutcome.ts";
import {
  buildJournalLineSpecs,
  driverAccountKeyForUser,
  riderAccountKeyForUser,
} from "./buildJournalEntries.ts";
import { hashSettlementRequest } from "./requestHash.ts";
import { settledRidePatch } from "./cashSettlementLifecycle.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";

export interface ProcessCashSettlementParams {
  ride: Record<string, unknown>;
  cashReceivedMinor: number;
  tipReceivedMinor?: number;
  idempotencyKey: string;
  actorUserId: string;
}

export type ProcessCashSettlementResult =
  | { ok: true; ride: Record<string, unknown>; computed: ReturnType<typeof computeCashSettlementOutcome> }
  | { ok: false; error: string; status: number };

export async function processCashSettlement(
  db: SupabaseClient,
  patchRide: (id: string, patch: Record<string, unknown>) => Promise<boolean>,
  loadRide: (id: string) => Promise<Record<string, unknown> | null>,
  params: ProcessCashSettlementParams,
): Promise<ProcessCashSettlementResult> {
  const ride = params.ride;
  const rideId = String(ride.id);
  const status = String(ride.status ?? "");

  if (status !== "awaiting_cash_settlement") {
    return { ok: false, error: "invalid_status", status: 409 };
  }
  if (String(ride.assigned_driver_user_id) !== params.actorUserId) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const owedMinor = Number(ride.fare_final_minor);
  if (!Number.isFinite(owedMinor) || owedMinor < 0) {
    return { ok: false, error: "fare_not_locked", status: 400 };
  }

  const cashReceived = Math.max(0, Math.floor(Number(params.cashReceivedMinor) || 0));
  const tipReceived = Math.max(0, Math.floor(Number(params.tipReceivedMinor ?? 0) || 0));
  const idempotencyKey = String(params.idempotencyKey ?? "").trim();
  if (!idempotencyKey) {
    return { ok: false, error: "idempotency_key_required", status: 400 };
  }

  const requestHash = await hashSettlementRequest({
    cash_received_minor: cashReceived,
    tip_received_minor: tipReceived,
  });

  const computed = computeCashSettlementOutcome(owedMinor, cashReceived);
  const currency = String(ride.currency ?? "JMD");
  const riderUserId = String(ride.rider_user_id);
  const driverUserId = String(ride.assigned_driver_user_id);

  const lines = buildJournalLineSpecs({
    computed,
    riderAccountKey: riderAccountKeyForUser(riderUserId),
    driverAccountKey: driverAccountKeyForUser(driverUserId),
    rideId,
    currency,
  });

  const journalResult = await postPaymentJournal(db, {
    rideId,
    idempotencyKey,
    requestHash,
    currency,
    lines,
    createdByUserId: params.actorUserId,
  });

  if (journalResult.conflict) {
    return { ok: false, error: "idempotency_conflict", status: 409 };
  }

  if (journalResult.skipped) {
    const existing = await loadRide(rideId);
    if (existing && String(existing.status) === "completed") {
      return {
        ok: true,
        ride: existing,
        computed: computeCashSettlementOutcome(
          owedMinor,
          Number(existing.cash_received_minor ?? cashReceived),
        ),
      };
    }
  }

  const nowIso = new Date().toISOString();
  const patch = {
    ...settledRidePatch(
      { outcome: computed.outcome, cash_received_minor: cashReceived },
      tipReceived,
      nowIso,
    ),
    tip_minor: tipReceived > 0 ? tipReceived : Number(ride.tip_minor ?? 0),
  };

  const patched = await patchRide(rideId, patch);
  if (!patched) {
    return { ok: false, error: "patch_failed", status: 500 };
  }

  const fresh = await loadRide(rideId);
  if (!fresh) {
    return { ok: false, error: "not_found", status: 404 };
  }

  return { ok: true, ride: fresh, computed };
}
