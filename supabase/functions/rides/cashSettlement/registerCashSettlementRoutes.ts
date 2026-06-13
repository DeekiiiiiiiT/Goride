import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden } from "../../_shared/authEdge.ts";
import { isCashSettlementEnabled, isCashSettlementV2Enabled } from "./flags.ts";
import { processCashSettlement } from "./processCashSettlement.ts";
import {
  driverCashAccountKeyForUser,
  driverDebtAccountKeyForUser,
  driverDigitalAccountKeyForUser,
} from "./buildJournalEntries.ts";
import {
  getDriverWallets,
  getWalletBalance,
  journalEntryTitle,
  listJournalForAccount,
  listJournalForAccountKey,
} from "../../_shared/paymentAccounts.ts";
import { canAccessRide } from "../rideAccess.ts";

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

function mapJournalRows(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row.id),
    ride_request_id: row.ride_request_id ? String(row.ride_request_id) : null,
    entry_type: String(row.entry_type),
    amount_minor: Number(row.amount_minor),
    currency: String(row.currency),
    description: journalEntryTitle(String(row.entry_type)),
    created_at: String(row.created_at),
    metadata: row.metadata ?? {},
  }));
}

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
    const received = Number(ride.cash_received_minor ?? 0);
    const outcome = String(ride.cash_settlement_outcome ?? "");

    if (snapshot && typeof snapshot === "object") {
      return c.json({
        summary: {
          ride_id: rideId,
          outcome,
          owed_minor: Number(snapshot.owed_minor ?? owed),
          cash_received_minor: Number(snapshot.cash_received_minor ?? received),
          change_credit_minor: Number(snapshot.change_credit_minor ?? 0),
          arrears_minor: Number(snapshot.arrears_minor ?? 0),
          currency,
          settlement_version: snapshot.settlement_version === 2 ? 2 : 1,
          wallet_deltas: snapshot.wallet_deltas ?? undefined,
          debt_opened_minor: Number(snapshot.debt_opened_minor ?? 0),
        },
      });
    }

    return c.json({
      summary: {
        ride_id: rideId,
        outcome,
        owed_minor: owed,
        cash_received_minor: received,
        change_credit_minor: Math.max(0, received - owed),
        arrears_minor: Math.max(0, owed - received),
        currency,
        settlement_version: 1,
      },
    });
  });

  app.get("/v1/wallet", async (c) => {
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }

    const currency = c.req.query("currency")?.trim() || "JMD";
    const wallet = await getWalletBalance(deps.svc(), auth.user.id, "rider", currency);
    return c.json({ wallet });
  });

  app.get("/v1/wallet/journal", async (c) => {
    if (!isCashSettlementEnabled()) {
      return c.json({ transactions: [] });
    }
    const auth = await deps.requireUser(c.req.header("Authorization"));
    if ("error" in auth) return c.json({ error: auth.error }, auth.status);
    if (deps.ridesUserSurfaceRole(auth.user) !== "passenger") {
      return jsonEdgeForbidden(c, "forbidden_role");
    }
    const currency = c.req.query("currency")?.trim() || "JMD";
    const rows = await listJournalForAccount(deps.svc(), auth.user.id, "rider", currency);
    return c.json({ transactions: mapJournalRows(rows) });
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
    const accountKey = isCashSettlementV2Enabled()
      ? driverWalletAccountKey(auth.user.id, walletFilter)
      : null;
    const rows = accountKey
      ? await listJournalForAccountKey(deps.svc(), accountKey, currency)
      : await listJournalForAccount(deps.svc(), auth.user.id, "driver", currency);
    return c.json({ transactions: mapJournalRows(rows) });
  });
}
