import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeFinalFareFromRide } from "./computeFinalFare.ts";
import { computeCashSettlementOutcome } from "./computeOutcome.ts";
import {
  buildJournalLineSpecs,
  driverAccountKeyForUser,
  riderAccountKeyForUser,
} from "./buildJournalEntries.ts";
import { buildSettlementJournalV2 } from "./buildSettlementJournalV2.ts";
import { isCashSettlementV2Enabled } from "./flags.ts";
import {
  applyPendingDebt,
  createPaymentObligation,
  getDriverDigitalAvailableMinor,
} from "./debtRepayment.ts";
import { hashSettlementRequest } from "./requestHash.ts";
import { settledRidePatch } from "./cashSettlementLifecycle.ts";
import { postPaymentJournal } from "../../_shared/paymentAccounts.ts";
import type { WalletDeltaPreview } from "./buildJournalEntries.ts";

export interface ProcessCashSettlementParams {
  ride: Record<string, unknown>;
  cashReceivedMinor: number;
  tipReceivedMinor?: number;
  idempotencyKey: string;
  actorUserId: string;
  /** Admin force-complete: skip assigned-driver check; journal still attributes to actorUserId. */
  opsBypass?: boolean;
}

export function resolveOwedFareMinor(ride: Record<string, unknown>): number | null {
  const locked = Number(ride.fare_final_minor);
  if (Number.isFinite(locked) && locked >= 0) return locked;

  const computed = computeFinalFareFromRide(ride);
  if (!("error" in computed)) return computed.fareMinor;

  const estimate = Number(ride.fare_estimate_minor);
  if (Number.isFinite(estimate) && estimate >= 0) return estimate;

  return null;
}

export type ProcessCashSettlementResult =
  | {
    ok: true;
    ride: Record<string, unknown>;
    computed: ReturnType<typeof computeCashSettlementOutcome>;
    settlement_version: 1 | 2;
    wallet_deltas?: WalletDeltaPreview;
  }
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
  if (
    !params.opsBypass &&
    String(ride.assigned_driver_user_id) !== params.actorUserId
  ) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const owedMinor = resolveOwedFareMinor(ride);
  if (owedMinor == null) {
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

  const useV2 = isCashSettlementV2Enabled();
  let walletDeltas: WalletDeltaPreview | undefined;
  let debtOpenedMinor = 0;

  let journalLines;
  if (useV2) {
    const digitalAvailable = await getDriverDigitalAvailableMinor(db, driverUserId, currency);
    const v2 = buildSettlementJournalV2({
      computed,
      rideId,
      currency,
      riderUserId,
      driverUserId,
      digitalAvailableMinor: digitalAvailable,
    });
    journalLines = v2.lines;
    walletDeltas = v2.walletDeltas;
    debtOpenedMinor = v2.debtOpenedMinor;
  } else {
    journalLines = buildJournalLineSpecs({
      computed,
      riderAccountKey: riderAccountKeyForUser(riderUserId),
      driverAccountKey: driverAccountKeyForUser(driverUserId),
      rideId,
      currency,
    });
  }

  const journalResult = await postPaymentJournal(db, {
    rideId,
    idempotencyKey,
    requestHash,
    currency,
    lines: journalLines,
    createdByUserId: params.actorUserId,
  });

  if (journalResult.conflict) {
    return { ok: false, error: "idempotency_conflict", status: 409 };
  }

  if (journalLines.length > 0) {
    const { getRidesPaymentDb } = await import("../../_shared/ridesPaymentDb.ts");
    const { db: payClient, tables } = await getRidesPaymentDb();
    const { data: posted } = await payClient
      .from(tables.journal)
      .select("entry_type")
      .eq("ride_request_id", rideId);
    const postedTypes = new Set((posted ?? []).map((r) => String(r.entry_type)));
    const incomplete = journalLines.some((line) => !postedTypes.has(line.entry_type));
    if (incomplete && !journalResult.skipped) {
      return { ok: false, error: "journal_incomplete", status: 500 };
    }
  }

  if (journalResult.skipped) {
    const existing = await loadRide(rideId);
    if (existing && String(existing.status) === "completed") {
      const snapshot = existing.cash_settlement_snapshot as Record<string, unknown> | null;
      return {
        ok: true,
        ride: existing,
        computed: computeCashSettlementOutcome(
          owedMinor,
          Number(existing.cash_received_minor ?? cashReceived),
        ),
        settlement_version: snapshot?.settlement_version === 2 ? 2 : 1,
        wallet_deltas: snapshot?.wallet_deltas as WalletDeltaPreview | undefined,
      };
    }
  }

  if (useV2 && debtOpenedMinor > 0 && journalResult.inserted > 0) {
    await createPaymentObligation(db, {
      driverUserId,
      rideRequestId: rideId,
      amountMinor: debtOpenedMinor,
      currency,
      obligationType: "change_to_rider",
    });
    await applyPendingDebt(db, driverUserId, currency, "post_settlement");
  }

  const settlementSnapshot = useV2
    ? {
      settlement_version: 2,
      owed_minor: computed.owed_minor,
      cash_received_minor: computed.cash_received_minor,
      change_credit_minor: computed.change_credit_minor,
      arrears_minor: computed.arrears_minor,
      outcome: computed.outcome,
      wallet_deltas: walletDeltas,
      debt_opened_minor: debtOpenedMinor,
      settled_at: new Date().toISOString(),
    }
    : null;

  const nowIso = new Date().toISOString();
  const patch = {
    ...settledRidePatch(
      { outcome: computed.outcome, cash_received_minor: cashReceived },
      tipReceived,
      nowIso,
    ),
    tip_minor: tipReceived > 0 ? tipReceived : Number(ride.tip_minor ?? 0),
    ...(settlementSnapshot ? { cash_settlement_snapshot: settlementSnapshot } : {}),
  };

  const patched = await patchRide(rideId, patch);
  if (!patched) {
    return { ok: false, error: "patch_failed", status: 500 };
  }

  const fresh = await loadRide(rideId);
  if (!fresh) {
    return { ok: false, error: "not_found", status: 404 };
  }

  if (useV2) {
    console.info("[cashSettlement] v2_completed", {
      ride_id: rideId,
      outcome: computed.outcome,
      change_credit_minor: computed.change_credit_minor,
      debt_opened_minor: debtOpenedMinor,
    });
  }

  return {
    ok: true,
    ride: fresh,
    computed,
    settlement_version: useV2 ? 2 : 1,
    wallet_deltas: walletDeltas,
  };
}
