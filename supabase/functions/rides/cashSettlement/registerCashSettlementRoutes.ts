import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsonEdgeForbidden } from "../../_shared/authEdge.ts";
import { isCashSettlementEnabled } from "./flags.ts";
import { processCashSettlement } from "./processCashSettlement.ts";
import { getWalletBalance, listJournalForAccount } from "../../_shared/paymentAccounts.ts";

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

    await deps.audit(rideId, auth.user.id, "cash_settlement_submitted", {
      outcome: result.computed.outcome,
      owed_minor: result.computed.owed_minor,
      cash_received_minor: result.computed.cash_received_minor,
      arrears_minor: result.computed.arrears_minor,
      change_credit_minor: result.computed.change_credit_minor,
    });

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
    const transactions = rows.map((row) => ({
      id: String(row.id),
      ride_request_id: row.ride_request_id ? String(row.ride_request_id) : null,
      entry_type: String(row.entry_type),
      amount_minor: Number(row.amount_minor),
      currency: String(row.currency),
      description: String(row.entry_type).replace(/_/g, " "),
      created_at: String(row.created_at),
      metadata: row.metadata ?? {},
    }));
    return c.json({ transactions });
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
    const rows = await listJournalForAccount(deps.svc(), auth.user.id, "driver", currency);
    const transactions = rows.map((row) => ({
      id: String(row.id),
      ride_request_id: row.ride_request_id ? String(row.ride_request_id) : null,
      entry_type: String(row.entry_type),
      amount_minor: Number(row.amount_minor),
      currency: String(row.currency),
      description: String(row.entry_type).replace(/_/g, " "),
      created_at: String(row.created_at),
      metadata: row.metadata ?? {},
    }));
    return c.json({ transactions });
  });
}
