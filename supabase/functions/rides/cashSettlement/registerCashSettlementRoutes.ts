import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden, allowsPassengerSurface } from "../../_shared/authEdge.ts";
import { isCashSettlementEnabled, isCashSettlementSplitPaymentEnabled, isCashSettlementSwitchToCardEnabled, isCashSettlementV2Enabled } from "./flags.ts";
import { processCardShortfallPayment } from "./processCardShortfallPayment.ts";
import { processRiderArrearsPayment } from "./processRiderArrearsPayment.ts";
import { getRiderArrearsMinor } from "./arrearsCheck.ts";
import {
  canFileDispute,
  createDispute,
  getDisputeForRide,
  DISPUTE_REASONS,
  type DisputeReasonCode,
} from "./disputeService.ts";
import { isCashSettlementDisputeFlowEnabled } from "./flags.ts";
import {
  repairIncompleteCashSettlementsForDriver,
  repairIncompleteCashSettlementsForRider,
} from "./repairIncompleteSettlement.ts";
import { repairMissingCardTripSettlementsForDriver, repairMissingCardTripSettlementsForRider } from "./processCardTripSettlement.ts";
import { repairSplitSettlementTripsForDriver } from "./repairSplitSettlementTrips.ts";
import { processCashSettlement } from "./processCashSettlement.ts";
import {
  driverAccountKeyForUser,
  driverCashAccountKeyForUser,
  driverDebtAccountKeyForUser,
  driverDigitalAccountKeyForUser,
  riderAccountKeyForUser,
} from "./buildJournalEntries.ts";
import {
  getAccountByKey,
  getDriverWallets,
  getWalletBalance,
  journalEntryTitle,
  listJournalForAccount,
  listJournalForAccountKey,
  mapJournalRowsForAccount,
} from "../../_shared/paymentAccounts.ts";
import {
  listRiderWalletTransactions,
} from "./riderWalletTransactions.ts";
import { canAccessRide } from "../rideAccess.ts";
import { settlementJournalAmountsForRide } from "./settlementJournalAmounts.ts";
import { reconcileRiderShortfallDisplay } from "./settlementRepairGuards.ts";

async function riderShortfallFromRideJournal(
  rideId: string,
  owedMinor: number,
  receivedMinor: number,
  snapshot: Record<string, unknown> | null,
): Promise<{ wallet_paid_minor: number; rider_arrears_minor: number; arrears_minor: number }> {
  let walletPaid = Number(snapshot?.wallet_paid_minor ?? 0);
  let riderArrears = Number(snapshot?.rider_arrears_minor ?? snapshot?.arrears_minor ?? 0);

  try {
    const fromJournal = await settlementJournalAmountsForRide(rideId);
    if (fromJournal.wallet_paid_minor > 0) walletPaid = fromJournal.wallet_paid_minor;
    if (fromJournal.arrears_minor > 0) riderArrears = fromJournal.arrears_minor;
  } catch (e) {
    console.error("[cashSettlement] settlement_journal_fallback_failed", e);
  }

  const reconciled = reconcileRiderShortfallDisplay({
    owedMinor,
    cashReceivedMinor: receivedMinor,
    walletPaidMinor: walletPaid,
    arrearsMinor: riderArrears,
  });

  return {
    wallet_paid_minor: reconciled.wallet_paid_minor,
    rider_arrears_minor: reconciled.rider_arrears_minor,
    arrears_minor: reconciled.rider_arrears_minor,
  };
}

type RegisterDeps = {
  svc: () => SupabaseClient;
  requireUser: (authHeader: string | undefined) => Promise<
    { user: { id: string } } | { error: string; status: number }
  >;
  ridesUserSurfaceRole: (user: { id: string }) => string | null;
  loadRideRequestById: (id: string) => Promise<Record<string, unknown> | null>;
  patchRideRequest: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  handleTerminalRideLedgerAndSync: (rideId: string) => Promise<void>;
  cleanupLiveState: (rideId: string) => Promise<void>;
  audit: (
    rideId: string,
    actorUserId: string | null,
    eventType: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  sanitizeRideForDriver: (ride: Record<string, unknown>, pinRequired: boolean) => Record<string, unknown>;
  loadDispatchSettingsForRides: () => Promise<{ pin_verification_required_for_start: boolean }>;
};

function driverWalletAccountKey(
  userId: string,
  wallet: string,
): string | null {
  switch (wallet) {
    case "digital":
      return driverDigitalAccountKeyForUser(userId);
    case "cash":
      return driverCashAccountKeyForUser(userId);
    case "debt":
      return driverDebtAccountKeyForUser(userId);
    default:
      return null;
  }
}

export function registerCashSettlementRoutes(app: Hono, deps: RegisterDeps): void {
  app.post("/v1/requests/:id/cash-settlement", async (c) => {
    if (!isCashSettlementEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) !== "driver") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    const cashReceivedMinor = Number(body.cash_received_minor);
    if (!Number.isFinite(cashReceivedMinor) || cashReceivedMinor < 0) {
      return c.json({ error: "invalid_cash_received_minor" }, 400);
    }

    const result = await processCashSettlement(
      deps.svc(),
      deps.patchRideRequest,
      deps.loadRideRequestById,
      {
        ride,
        cashReceivedMinor,
        tipReceivedMinor: body.tip_received_minor != null
          ? Number(body.tip_received_minor)
          : undefined,
        idempotencyKey: typeof body.idempotency_key === "string" ? body.idempotency_key : "",
        actorUserId: auth.user.id,
      },
    );

    if (!result.ok) {
      if (result.error === "idempotency_conflict") {
        return c.json({ error: "idempotency_conflict", message: "Duplicate key with different amount" }, 409);
      }
      return c.json({ error: result.error }, result.status as 400);
    }

    await deps.handleTerminalRideLedgerAndSync(rideId);
    await deps.cleanupLiveState(rideId);

    const auditEvent = result.settlement_version === 2
      ? "cash_settlement_v2_completed"
      : "cash_settlement_submitted";

    await deps.audit(rideId, auth.user.id, auditEvent, {
      outcome: result.computed.outcome,
      owed_minor: result.computed.owed_minor,
      cash_received_minor: result.computed.cash_received_minor,
      arrears_minor: result.computed.arrears_minor,
      change_credit_minor: result.computed.change_credit_minor,
      settlement_version: result.settlement_version,
      wallet_deltas: result.wallet_deltas,
      debt_opened_minor: result.wallet_deltas?.driver_debt_opened_minor ?? 0,
    });

    const debtOpened = result.wallet_deltas?.driver_debt_opened_minor ?? 0;
    if (debtOpened > 0) {
      await deps.audit(rideId, auth.user.id, "debt_obligation_opened", {
        debt_opened_minor: debtOpened,
        currency: String(ride.currency ?? "JMD"),
      });
    }

    const settings = await deps.loadDispatchSettingsForRides();
    const fresh = await deps.loadRideRequestById(rideId);
    return c.json({
      ride: deps.sanitizeRideForDriver(
        fresh ?? result.ride,
        settings.pin_verification_required_for_start,
      ),
      outcome: result.computed.outcome,
      owed_minor: result.computed.owed_minor,
      cash_received_minor: result.computed.cash_received_minor,
      arrears_minor: result.computed.arrears_minor,
      change_credit_minor: result.computed.change_credit_minor,
      settlement_version: result.settlement_version,
      wallet_deltas: result.wallet_deltas,
      wallet_paid_minor: result.wallet_paid_minor,
      rider_arrears_minor: result.rider_arrears_minor,
      driver_digital_credit_minor: result.driver_digital_credit_minor,
      platform_guarantee_minor: result.platform_guarantee_minor,
    });
  });

  app.get("/v1/requests/:id/settlement-summary", async (c) => {
    if (!isCashSettlementEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);
    if (!canAccessRide(ride, auth.user.id)) {
      return jsonEdgeForbidden(c, "forbidden");
    }

    const snapshot = ride.cash_settlement_snapshot as Record<string, unknown> | null;
    const currency = String(ride.currency ?? "JMD");
    const owed = Number(ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0);
    let received = Number(ride.cash_received_minor ?? 0);
    const outcome = String(ride.cash_settlement_outcome ?? "");

    if (snapshot && typeof snapshot === "object") {
      received = Number(snapshot.cash_received_minor ?? received);
      const owedMinor = Number(snapshot.owed_minor ?? owed);
      if (received <= 0) {
        try {
          const fromJournal = await settlementJournalAmountsForRide(rideId);
          if (fromJournal.cash_received_minor > 0) received = fromJournal.cash_received_minor;
        } catch (e) {
          console.error("[cashSettlement] settlement_journal_fallback_failed", e);
        }
      }
      const shortfall = await riderShortfallFromRideJournal(rideId, owedMinor, received, snapshot);
      return c.json({
        summary: {
          ride_id: rideId,
          outcome,
          owed_minor: owedMinor,
          cash_received_minor: received,
          change_credit_minor: Number(snapshot.change_credit_minor ?? 0),
          arrears_minor: shortfall.arrears_minor,
          currency,
          settlement_version: snapshot.settlement_version === 2 ? 2 : 1,
          wallet_deltas: snapshot.wallet_deltas ?? undefined,
          debt_opened_minor: Number(snapshot.debt_opened_minor ?? 0),
          wallet_paid_minor: shortfall.wallet_paid_minor,
          rider_arrears_minor: shortfall.rider_arrears_minor,
          driver_digital_credit_minor: Number(snapshot.driver_digital_credit_minor ?? 0),
          platform_guarantee_minor: Number(snapshot.platform_guarantee_minor ?? 0),
        },
      });
    }

    let arrears = Math.max(0, owed - received);
    if (received <= 0) {
      try {
        const fromJournal = await settlementJournalAmountsForRide(rideId);
        if (fromJournal.cash_received_minor > 0) received = fromJournal.cash_received_minor;
      } catch (e) {
        console.error("[cashSettlement] settlement_journal_fallback_failed", e);
      }
    }
    const shortfall = await riderShortfallFromRideJournal(rideId, owed, received, null);
    arrears = shortfall.arrears_minor;

    return c.json({
      summary: {
        ride_id: rideId,
        outcome,
        owed_minor: owed,
        cash_received_minor: received,
        change_credit_minor: Math.max(0, received - owed),
        arrears_minor: arrears,
        wallet_paid_minor: shortfall.wallet_paid_minor,
        rider_arrears_minor: shortfall.rider_arrears_minor,
        currency,
        settlement_version: 1,
      },
    });
  });

  app.post("/v1/requests/:id/pay-shortfall", async (c) => {
    if (!isCashSettlementSwitchToCardEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    if (!canAccessRide(ride, auth.user.id)) {
      return jsonEdgeForbidden(c, "forbidden");
    }

    const body = await c.req.json().catch(() => ({}));
    const paymentMethodId = typeof body.payment_method_id === "string" ? body.payment_method_id : "";
    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : "";

    if (!paymentMethodId) {
      return c.json({ error: "payment_method_id_required" }, 400);
    }
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }

    const currency = String(ride.currency ?? "JMD");
    const riderArrearsMinor = await getRiderArrearsMinor(deps.svc(), auth.user.id, currency);

    if (riderArrearsMinor <= 0) {
      return c.json({ error: "no_arrears", message: "No outstanding balance to pay" }, 400);
    }

    const result = await processCardShortfallPayment(
      deps.svc(),
      deps.patchRideRequest,
      deps.loadRideRequestById,
      {
        rideId,
        riderUserId: auth.user.id,
        driverUserId: String(ride.assigned_driver_user_id ?? ""),
        shortfallMinor: riderArrearsMinor,
        currency,
        paymentMethodId,
        idempotencyKey,
      },
    );

    if (!result.success) {
      return c.json({ error: result.error }, result.status as 400);
    }

    await deps.audit(rideId, auth.user.id, "card_shortfall_payment_completed", {
      amount_paid_minor: result.amountPaidMinor,
      new_arrears_minor: result.newArrearsMinor,
      payment_method_id: paymentMethodId,
      currency,
    });

    return c.json({
      success: true,
      amount_paid_minor: result.amountPaidMinor,
      new_arrears_minor: result.newArrearsMinor,
      currency,
    });
  });

  app.post("/v1/requests/:id/dispute", async (c) => {
    if (!isCashSettlementDisputeFlowEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    if (String(ride.rider_user_id) !== auth.user.id) {
      return jsonEdgeForbidden(c, "forbidden");
    }

    const currency = String(ride.currency ?? "JMD");
    const arrearsMinor = await getRiderArrearsMinor(deps.svc(), auth.user.id, currency);

    const canDispute = canFileDispute(ride, arrearsMinor);
    if (!canDispute.allowed) {
      return c.json({ error: canDispute.reason ?? "cannot_dispute" }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason : "";
    const notes = typeof body.notes === "string" ? body.notes : "";

    if (!reason || !Object.keys(DISPUTE_REASONS).includes(reason)) {
      return c.json({ error: "invalid_reason", valid_reasons: Object.keys(DISPUTE_REASONS) }, 400);
    }

    const result = await createDispute(
      deps.svc(),
      deps.patchRideRequest,
      {
        rideId,
        riderUserId: auth.user.id,
        driverUserId: String(ride.assigned_driver_user_id ?? ""),
        disputedAmountMinor: arrearsMinor,
        reason: reason as DisputeReasonCode,
        notes,
        currency,
      },
    );

    if (!result.success) {
      return c.json({ error: result.error }, result.status as 400);
    }

    await deps.audit(rideId, auth.user.id, "dispute_created", {
      dispute_id: result.disputeId,
      disputed_amount_minor: arrearsMinor,
      reason,
      currency,
    });

    return c.json({
      dispute_id: result.disputeId,
      status: "open",
    });
  });

  app.get("/v1/requests/:id/dispute", async (c) => {
    if (!isCashSettlementDisputeFlowEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);

    const rideId = c.req.param("id");
    const ride = await deps.loadRideRequestById(rideId);
    if (!ride) return c.json({ error: "not_found" }, 404);

    if (!canAccessRide(ride, auth.user.id)) {
      return jsonEdgeForbidden(c, "forbidden");
    }

    const dispute = await getDisputeForRide(deps.svc(), rideId);

    const currency = String(ride.currency ?? "JMD");
    const arrearsMinor = await getRiderArrearsMinor(deps.svc(), auth.user.id, currency);
    const canDispute = canFileDispute(ride, arrearsMinor);

    return c.json({
      dispute: dispute
        ? {
            id: dispute.id,
            status: dispute.dispute_status,
            reason: dispute.dispute_reason,
            disputed_amount_minor: dispute.disputed_amount_minor,
            resolution_amount_minor: dispute.resolution_amount_minor,
            rider_notes: dispute.rider_notes,
            created_at: dispute.created_at,
            resolved_at: dispute.resolved_at,
          }
        : null,
      can_file_dispute: canDispute.allowed,
      cannot_dispute_reason: canDispute.reason,
      dispute_reasons: DISPUTE_REASONS,
    });
  });

  app.get("/v1/wallet", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const currency = c.req.query("currency")?.trim() || "JMD";
    if (isCashSettlementV2Enabled()) {
      try {
        await repairIncompleteCashSettlementsForRider(deps.svc(), auth.user.id, currency);
        await repairMissingCardTripSettlementsForRider(deps.svc(), auth.user.id, currency);
      } catch (e) {
        console.error("[cashSettlement] rider_repair_incomplete_failed", e);
      }
    }
    const wallet = await getWalletBalance(deps.svc(), auth.user.id, "rider", currency);
    return c.json({ wallet });
  });

  app.post("/v1/wallet/pay-arrears", async (c) => {
    if (!isCashSettlementSwitchToCardEnabled()) {
      return c.json({ error: "feature_disabled" }, 404);
    }

    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const body = await c.req.json().catch(() => ({}));
    const paymentMethodId = typeof body.payment_method_id === "string" ? body.payment_method_id : "";
    const idempotencyKey = typeof body.idempotency_key === "string" ? body.idempotency_key : "";
    const currency = typeof body.currency === "string" && body.currency.trim()
      ? body.currency.trim()
      : "JMD";

    if (!paymentMethodId) {
      return c.json({ error: "payment_method_id_required" }, 400);
    }
    if (!idempotencyKey) {
      return c.json({ error: "idempotency_key_required" }, 400);
    }

    const result = await processRiderArrearsPayment(deps.svc(), {
      riderUserId: auth.user.id,
      currency,
      paymentMethodId,
      idempotencyKey,
      source: "wallet",
    });

    if (!result.success) {
      return c.json({ error: result.error }, result.status as 400);
    }

    await deps.audit(`wallet:${auth.user.id}`, auth.user.id, "wallet_arrears_payment_completed", {
      amount_paid_minor: result.amountPaidMinor,
      new_arrears_minor: result.newArrearsMinor,
      payment_method_id: paymentMethodId,
      payment_source: result.paymentSource,
      currency,
    });

    return c.json({
      success: true,
      amount_paid_minor: result.amountPaidMinor,
      new_arrears_minor: result.newArrearsMinor,
      currency,
      payment_method_id: paymentMethodId,
      payment_source: result.paymentSource,
    });
  });

  app.get("/v1/wallet/journal", async (c) => {
    if (!isCashSettlementEnabled()) {
      return c.json({ transactions: [] });
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (!allowsPassengerSurface(auth.user)) {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    const currency = c.req.query("currency")?.trim() || "JMD";
    if (isCashSettlementV2Enabled()) {
      try {
        await repairIncompleteCashSettlementsForRider(deps.svc(), auth.user.id, currency);
        await repairMissingCardTripSettlementsForRider(deps.svc(), auth.user.id, currency);
      } catch (e) {
        console.error("[cashSettlement] rider_repair_on_journal_failed", e);
      }
    }
    const rows = await listRiderWalletTransactions(deps.svc(), auth.user.id, currency);
    return c.json({
      transactions: rows.map((row) => ({
        id: row.id,
        ride_request_id: row.ride_request_id,
        entry_type: row.entry_type,
        amount_minor: row.amount_minor,
        currency: row.currency,
        description: row.title,
        created_at: row.date,
        is_credit: row.is_credit,
        metadata: {},
      })),
    });
  });

  app.get("/v1/drivers/me/wallet", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) !== "driver") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    const currency = c.req.query("currency")?.trim() || "JMD";
    const wallet = await getWalletBalance(deps.svc(), auth.user.id, "driver", currency);
    return c.json({ wallet });
  });

  app.get("/v1/drivers/me/wallets", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) !== "driver") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    const currency = c.req.query("currency")?.trim() || "JMD";
    if (isCashSettlementV2Enabled()) {
      try {
        await repairIncompleteCashSettlementsForDriver(deps.svc(), auth.user.id, currency);
        await repairMissingCardTripSettlementsForDriver(deps.svc(), auth.user.id, currency);
        await repairSplitSettlementTripsForDriver(deps.svc(), auth.user.id, currency);
      } catch (e) {
        console.error("[cashSettlement] repair_incomplete_failed", e);
      }
      const wallets = await getDriverWallets(deps.svc(), auth.user.id, currency);
      return c.json({ wallets });
    }
    const legacy = await getWalletBalance(deps.svc(), auth.user.id, "driver", currency);
    return c.json({
      wallets: {
        currency,
        digital: legacy,
        cash: { currency, balance_minor: 0, available_minor: 0, arrears_minor: 0, credit_minor: 0 },
        debt: { currency, balance_minor: 0, available_minor: 0, arrears_minor: 0, credit_minor: 0 },
      },
    });
  });

  app.get("/v1/drivers/me/wallet/journal", async (c) => {
    if (!isCashSettlementEnabled()) {
      return c.json({ transactions: [] });
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) !== "driver") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    const currency = c.req.query("currency")?.trim() || "JMD";
    const walletFilter = c.req.query("wallet")?.trim() || "digital";

    type MappedTx = {
      id: string;
      ride_request_id: string | null;
      entry_type: string;
      amount_minor: number;
      currency: string;
      description: string;
      created_at: string;
      is_credit: boolean;
      metadata: Record<string, unknown>;
    };

    async function journalForAccountKey(accountKey: string): Promise<MappedTx[]> {
      const account = await getAccountByKey(deps.svc(), accountKey, currency);
      if (!account) return [];
      const rows = await listJournalForAccountKey(deps.svc(), accountKey, currency);
      return mapJournalRowsForAccount(String(account.id), rows).map((row) => ({
        id: row.id,
        ride_request_id: row.ride_request_id,
        entry_type: row.entry_type,
        amount_minor: row.amount_minor,
        currency: row.currency,
        description: row.description,
        created_at: row.created_at,
        is_credit: row.is_credit,
        metadata: row.metadata,
      }));
    }

    let mapped: MappedTx[] = [];

    if (isCashSettlementV2Enabled() && walletFilter === "digital") {
      const digitalKey = driverDigitalAccountKeyForUser(auth.user.id);
      const legacyKey = driverAccountKeyForUser(auth.user.id);
      const [digitalTx, legacyTx] = await Promise.all([
        journalForAccountKey(digitalKey),
        journalForAccountKey(legacyKey),
      ]);
      const seen = new Set<string>();
      mapped = [...digitalTx, ...legacyTx]
        .filter((row) => {
          if (seen.has(row.id)) return false;
          seen.add(row.id);
          return true;
        })
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 50);
    } else {
      const accountKey = isCashSettlementV2Enabled()
        ? driverWalletAccountKey(auth.user.id, walletFilter)
        : `user:${auth.user.id}:driver`;
      mapped = accountKey
        ? await journalForAccountKey(accountKey)
        : (await listJournalForAccount(deps.svc(), auth.user.id, "driver", currency)).map((row) => ({
          id: String(row.id),
          ride_request_id: row.ride_request_id ? String(row.ride_request_id) : null,
          entry_type: String(row.entry_type),
          amount_minor: Number(row.amount_minor),
          currency: String(row.currency),
          description: journalEntryTitle(String(row.entry_type)),
          created_at: String(row.created_at),
          is_credit: false,
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
        }));
    }

    return c.json({
      transactions: mapped.map((row) => ({
        id: row.id,
        ride_request_id: row.ride_request_id,
        entry_type: row.entry_type,
        amount_minor: row.amount_minor,
        currency: row.currency,
        description: row.description,
        created_at: row.created_at,
        is_credit: row.is_credit,
        metadata: row.metadata,
      })),
    });
  });
}
