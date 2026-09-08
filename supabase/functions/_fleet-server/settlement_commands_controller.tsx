/**
 * Settlement command API — Phase 3 immutable movements + dual-write to KV txs.
 *
 * Routes under /make-server-37f42386/settlements:
 *   POST /collect | /pay | /write-off | /reverse | /verify | /runs
 *   GET  /runs/:runId | /queue | /movements
 *   POST /:movementId/approve
 *
 * N-3: Handlers use getServiceClient() (service_role) — RLS on settlement_* /
 * driver_financial_periods is defence-in-depth for direct PostgREST only.
 * Live tenant isolation is the organizationId threaded into every list/mutate.
 */
import { Hono, type Context, type Next } from "npm:hono";
import * as kv from "./kv_store.tsx";
import {
  requireAuth,
  requirePermission,
  hasPermission,
  type RbacUser,
  type Permission,
} from "./rbac_middleware.ts";
import { getOrgId, stampOrg } from "./org_scope.ts";
import { getServiceClient } from "./service_client.ts";
import { safeErrorResponse } from "./safe_error.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import {
  syncPeriodCashFromTransactions,
  getDriverFinancialPeriodDetail,
  type DriverFinancialPeriodRow,
} from "./driver_financial_periods.ts";
import {
  toMinor,
  fromMinor,
  assertExpectedOutstanding,
  assertPeriodCasClaimed,
  companyOwesResidual,
  driverOwesResidual,
  enforcePayCap,
  enforceCollectCap,
  buildMovementRow,
  SettlementCommandError,
  type SettlementMovementKind,
} from "./settlement_commands.ts";
import {
  assertPeriodNotFrozen,
  assertFrozenPeriodHashIntact,
  assertPeriodEndedForSettlement,
} from "./settlement_period_freeze.ts";
import {
  SETTLEMENT_APPROVAL_THRESHOLD,
  requiresSettlementApproval,
} from "../../../packages/finance-core/src/settlementApproval.ts";

function requiresApproval(amount: number, threshold = SETTLEMENT_APPROVAL_THRESHOLD): boolean {
  return requiresSettlementApproval(amount, threshold);
}

const app = new Hono();
app.use("*", requireAuth({ strict: true }));

const BASE = "/make-server-37f42386/settlements";
const sb = getServiceClient;

/** settlements.* OR transactions.edit until desk roles are fully wired. */
function requireSettlementPerm(primary: Permission) {
  return async (c: Context, next: Next) => {
    const user = c.get("rbacUser") as RbacUser | undefined;
    if (!user) return c.json({ error: "Unauthorized: No user context" }, 401);
    const ok =
      hasPermission(user.resolvedRole, primary) ||
      hasPermission(user.resolvedRole, "transactions.edit");
    if (!ok) {
      return c.json(
        {
          error: "Forbidden",
          message: `Requires "${primary}" or "transactions.edit".`,
          required: [primary, "transactions.edit"],
          currentRole: user.resolvedRole,
        },
        403,
      );
    }
    await next();
  };
}

function mapMovement(row: Record<string, unknown>) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    driverId: row.driver_id,
    periodAnchor: row.period_anchor,
    kind: row.kind,
    amountMinor: Number(row.amount_minor) || 0,
    amount: fromMinor(Number(row.amount_minor) || 0),
    method: row.method,
    reference: row.reference,
    reason: row.reason,
    actorId: row.actor_id,
    idempotencyKey: row.idempotency_key,
    reversesMovementId: row.reverses_movement_id,
    approvalState: row.approval_state,
    status: row.status,
    sourceTransactionId: row.source_transaction_id,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function mapPeriod(row: DriverFinancialPeriodRow | null) {
  if (!row) return null;
  return {
    driverId: row.driverId,
    periodAnchor: row.periodAnchor,
    periodEnd: row.periodEnd,
    settlementAmount: row.settlementAmount,
    settlementPaid: row.settlementPaid,
    cashReturned: row.cashReturned,
    cashWrittenOff: row.cashWrittenOff,
    cashStillHeld: row.cashStillHeld,
    settlementStatus: row.settlementStatus,
    payoutNet: row.payoutNet,
    rowVersion: row.rowVersion ?? 1,
    projectionVersion: row.projectionVersion,
  };
}

async function loadPeriodDb(
  driverId: string,
  periodAnchor: string,
  organizationId: string | null,
): Promise<Record<string, unknown> | null> {
  // Prefer org-scoped row; fall back to legacy null-org periods for cutover.
  if (organizationId) {
    const { data, error } = await sb()
      .from("driver_financial_periods")
      .select("*")
      .eq("driver_id", driverId)
      .eq("period_anchor", periodAnchor)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as Record<string, unknown>;
  }
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("driver_id", driverId)
    .eq("period_anchor", periodAnchor)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const rowOrg = (data as { organization_id?: string | null }).organization_id;
  if (
    organizationId &&
    rowOrg &&
    String(rowOrg) !== organizationId
  ) {
    return null;
  }
  return data as Record<string, unknown>;
}

async function findMovementByIdempotency(
  organizationId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb()
    .from("settlement_movements")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown> | null;
}

/**
 * Load-bearing CAS: claim period write lock before any movement insert.
 * CAS must use the row_version observed when residual was computed — not a re-read.
 * Fails closed with STALE_RESIDUAL when another writer already bumped.
 */
async function claimPeriodWriteLock(
  driverId: string,
  periodAnchor: string,
  organizationId: string | null,
  expectedRowVersion: number,
): Promise<void> {
  const existing = await loadPeriodDb(driverId, periodAnchor, organizationId);
  if (!existing?.id) {
    throw new SettlementCommandError(
      "PERIOD_NOT_FOUND",
      "No financial period for this driver/week",
      404,
    );
  }
  const expected = Number(expectedRowVersion) || 1;
  const live = Number(existing.row_version) || 1;
  // Early stale check — same semantics as UPDATE … WHERE row_version = expected.
  if (live !== expected) {
    assertPeriodCasClaimed(null);
  }
  const next = expected + 1;
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .update({ row_version: next })
    .eq("id", existing.id)
    .eq("row_version", expected)
    .select("id")
    .maybeSingle();
  if (error) {
    throw new SettlementCommandError(
      "STALE_RESIDUAL",
      error.message || "Failed to claim period write lock",
      409,
    );
  }
  assertPeriodCasClaimed(data);
}

async function loadDriverName(driverId: string): Promise<string> {
  try {
    const d = await kv.get(`driver:${driverId}`);
    if (d && typeof d === "object" && (d as { name?: string }).name) {
      return String((d as { name: string }).name);
    }
  } catch {
    /* ignore */
  }
  return driverId;
}

function buildDualWriteTx(opts: {
  kind: Exclude<SettlementMovementKind, "reverse" | "verify">;
  driverId: string;
  driverName: string;
  amount: number;
  method: string;
  weekAnchor: string;
  reference?: string;
  reason?: string;
  transactionId: string;
  movementId: string;
}): Record<string, unknown> {
  const periodEnd = periodEndForAnchor(opts.weekAnchor);
  const today = new Date().toISOString().slice(0, 10);
  const metaBase = {
    workPeriodStart: opts.weekAnchor,
    workPeriodEnd: periodEnd,
    settlementMovementId: opts.movementId,
  };

  if (opts.kind === "pay") {
    const isCash = opts.method === "Cash";
    return {
      id: opts.transactionId,
      driverId: opts.driverId,
      driverName: opts.driverName,
      amount: Math.abs(opts.amount),
      date: today,
      description: opts.reason
        ? `Driver payout (${opts.method}): ${opts.reason}`
        : `Driver payout via ${opts.method}`,
      category: "Driver Payouts",
      type: "Payout",
      paymentMethod: opts.method || "Cash",
      status: isCash ? "Completed" : "Pending",
      isReconciled: isCash,
      referenceNumber: opts.reference,
      time: new Date().toLocaleTimeString(),
      timestamp: new Date().toISOString(),
      metadata: metaBase,
    };
  }

  if (opts.kind === "write_off") {
    return {
      id: opts.transactionId,
      driverId: opts.driverId,
      driverName: opts.driverName,
      amount: Math.abs(opts.amount),
      date: today,
      description: opts.reason
        ? `Cash write-off: ${opts.reason}`
        : "Cash write-off",
      category: "Cash Write Off",
      type: "Cash_Write_Off",
      paymentMethod: "Other",
      status: "Completed",
      isReconciled: true,
      time: new Date().toLocaleTimeString(),
      timestamp: new Date().toISOString(),
      metadata: { ...metaBase, writeOffReason: opts.reason || "" },
    };
  }

  // collect
  const isCash = opts.method === "Cash";
  return {
    id: opts.transactionId,
    driverId: opts.driverId,
    driverName: opts.driverName,
    amount: Math.abs(opts.amount),
    date: today,
    description: opts.reason || "Cash Payment from Driver",
    category: "Cash Collection",
    type: "Payment_Received",
    paymentMethod: opts.method || "Cash",
    status: isCash ? "Completed" : "Pending",
    isReconciled: isCash,
    referenceNumber: opts.reference,
    time: new Date().toLocaleTimeString(),
    timestamp: new Date().toISOString(),
    metadata: metaBase,
  };
}

async function insertMovementAndDualWrite(
  c: any,
  opts: {
    organizationId: string;
    actorId: string;
    kind: Exclude<SettlementMovementKind, "reverse" | "verify">;
    driverId: string;
    weekAnchor: string;
    amount: number;
    method: string;
    reference?: string;
    reason?: string;
    idempotencyKey: string;
    approvalState?: string;
    status?: string;
    metadata?: Record<string, unknown>;
    /** Version observed when residual/caps were computed — required for load-bearing CAS. */
    expectedRowVersion: number;
  },
): Promise<{ movement: Record<string, unknown>; period: DriverFinancialPeriodRow | null }> {
  // Calendar close first — open weeks cannot Collect / Pay / Write-off / batch.
  assertPeriodEndedForSettlement(opts.weekAnchor);

  // Claim lock first — two concurrent pays must not both insert.
  await claimPeriodWriteLock(
    opts.driverId,
    opts.weekAnchor,
    opts.organizationId,
    opts.expectedRowVersion,
  );

  const transactionId = crypto.randomUUID();
  const movementId = crypto.randomUUID();
  const driverName = await loadDriverName(opts.driverId);

  const row = buildMovementRow({
    organizationId: opts.organizationId,
    driverId: opts.driverId,
    periodAnchor: opts.weekAnchor,
    kind: opts.kind,
    amountMinor: toMinor(opts.amount),
    method: opts.method,
    reference: opts.reference,
    reason: opts.reason,
    actorId: opts.actorId,
    idempotencyKey: opts.idempotencyKey,
    approvalState: (opts.approvalState as any) || "none",
    status: (opts.status as any) || "posted",
    sourceTransactionId: transactionId,
    metadata: { ...(opts.metadata || {}), dualWriteTxId: transactionId },
  });
  row.id = movementId;

  const { data: inserted, error } = await sb()
    .from("settlement_movements")
    .insert(row)
    .select("*")
    .single();
  if (error) {
    // Race: unique idempotency — return existing
    if (String(error.message || "").toLowerCase().includes("duplicate") ||
      error.code === "23505") {
      const existing = await findMovementByIdempotency(
        opts.organizationId,
        opts.idempotencyKey,
      );
      if (existing) {
        const period = await getDriverFinancialPeriodDetail(
          opts.driverId,
          opts.weekAnchor,
        );
        return { movement: existing, period };
      }
    }
    throw new Error(error.message);
  }

  const tx = buildDualWriteTx({
    kind: opts.kind,
    driverId: opts.driverId,
    driverName,
    amount: opts.amount,
    method: opts.method,
    weekAnchor: opts.weekAnchor,
    reference: opts.reference,
    reason: opts.reason,
    transactionId,
    movementId: String(inserted.id),
  });
  await kv.set(`transaction:${transactionId}`, stampOrg(tx, c));

  await syncPeriodCashFromTransactions(opts.driverId, opts.weekAnchor);

  const period = await getDriverFinancialPeriodDetail(opts.driverId, opts.weekAnchor);
  return { movement: inserted as Record<string, unknown>, period };
}

function commandErrorResponse(c: any, e: unknown) {
  if (e instanceof SettlementCommandError) {
    return c.json(
      {
        error: e.code,
        code: e.code,
        message: e.message,
        ...(e.details || {}),
      },
      e.status as 400 | 409,
    );
  }
  return safeErrorResponse(c, e, "settlements");
}

async function requireOrgId(c: any): Promise<string | Response> {
  const orgId = getOrgId(c);
  if (!orgId) {
    return c.json(
      { error: "ORG_REQUIRED", message: "organizationId is required for settlement commands" },
      400,
    );
  }
  return orgId;
}

// ── POST /collect ───────────────────────────────────────────────────────────
app.post(`${BASE}/collect`, requireSettlementPerm("settlements.collect"), async (c) => {
  try {
    const orgOrResp = await requireOrgId(c);
    if (typeof orgOrResp !== "string") return orgOrResp;
    const organizationId = orgOrResp;
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();

    const driverId = String(body.driverId || "").trim();
    const weekAnchor = String(body.weekAnchor || body.periodAnchor || "").slice(0, 10);
    const amount = Number(body.amount);
    const method = String(body.method || "Cash");
    const reference = body.reference ? String(body.reference) : undefined;
    const note = body.note ? String(body.note) : undefined;
    const reasonFromBody = body.reason ? String(body.reason).trim() : "";
    const overFromNote = note?.match(/\[Over-collection\]\s*(.+)/i)?.[1]?.trim() || "";
    const reason = reasonFromBody || overFromNote || undefined;
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    const expectedOutstanding = Number(body.expectedOutstanding);
    const allowOver =
      !!body.allowOverCollect ||
      !!body.allowOver ||
      (!!reason && Number(body.amount) > Number(body.expectedOutstanding) + 0.005);

    if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(weekAnchor) || !idempotencyKey) {
      return c.json({ error: "driverId, weekAnchor, and idempotencyKey are required" }, 400);
    }

    const existing = await findMovementByIdempotency(organizationId, idempotencyKey);
    if (existing) {
      const period = await getDriverFinancialPeriodDetail(driverId, weekAnchor);
      return c.json({ success: true, idempotent: true, movement: mapMovement(existing), period: mapPeriod(period) });
    }

    const periodDb = await loadPeriodDb(driverId, weekAnchor, organizationId);
    if (!periodDb) {
      return c.json({ error: "PERIOD_NOT_FOUND", message: "No financial period for this driver/week" }, 404);
    }
    assertPeriodNotFrozen({
      metadata: (periodDb.metadata as Record<string, unknown>) || null,
      settlementStatus: String(periodDb.settlement_status || ""),
      signedAt: periodDb.signed_at ? String(periodDb.signed_at) : null,
    });
    await assertFrozenPeriodHashIntact(periodDb as Parameters<typeof assertFrozenPeriodHashIntact>[0]);
    const settlementAmount = Number(periodDb.settlement_amount) || 0;
    const owed = driverOwesResidual(settlementAmount);
    assertExpectedOutstanding(owed, expectedOutstanding);
    enforceCollectCap(owed, amount, allowOver, reason);
    const observedVersion = Number(periodDb.row_version) || 1;

    const { movement, period } = await insertMovementAndDualWrite(c, {
      organizationId,
      actorId: user.userId,
      kind: "collect",
      driverId,
      weekAnchor,
      amount,
      method,
      reference,
      reason,
      idempotencyKey,
      expectedRowVersion: observedVersion,
    });
    return c.json({ success: true, movement: mapMovement(movement), period: mapPeriod(period) });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

// ── POST /pay ───────────────────────────────────────────────────────────────
app.post(`${BASE}/pay`, requireSettlementPerm("settlements.pay"), async (c) => {
  try {
    const orgOrResp = await requireOrgId(c);
    if (typeof orgOrResp !== "string") return orgOrResp;
    const organizationId = orgOrResp;
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();

    const driverId = String(body.driverId || "").trim();
    const weekAnchor = String(body.weekAnchor || body.periodAnchor || "").slice(0, 10);
    const amount = Number(body.amount);
    const method = String(body.method || "Cash");
    const reference = body.reference ? String(body.reference) : undefined;
    const reason = body.reason ? String(body.reason) : undefined;
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    const expectedOutstanding = Number(body.expectedOutstanding);

    if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(weekAnchor) || !idempotencyKey) {
      return c.json({ error: "driverId, weekAnchor, and idempotencyKey are required" }, 400);
    }

    const existing = await findMovementByIdempotency(organizationId, idempotencyKey);
    if (existing) {
      const period = await getDriverFinancialPeriodDetail(driverId, weekAnchor);
      return c.json({ success: true, idempotent: true, movement: mapMovement(existing), period: mapPeriod(period) });
    }

    const periodDb = await loadPeriodDb(driverId, weekAnchor, organizationId);
    if (!periodDb) {
      return c.json({ error: "PERIOD_NOT_FOUND", message: "No financial period for this driver/week" }, 404);
    }
    assertPeriodNotFrozen({
      metadata: (periodDb.metadata as Record<string, unknown>) || null,
      settlementStatus: String(periodDb.settlement_status || ""),
      signedAt: periodDb.signed_at ? String(periodDb.signed_at) : null,
    });
    await assertFrozenPeriodHashIntact(periodDb as Parameters<typeof assertFrozenPeriodHashIntact>[0]);
    const settlementAmount = Number(periodDb.settlement_amount) || 0;
    const settlementPaid = Number(periodDb.settlement_paid) || 0;
    const residual = companyOwesResidual(settlementAmount);
    assertExpectedOutstanding(residual, expectedOutstanding);
    // Entitlement = already paid + still owed (gross positive claim for the week).
    enforcePayCap(settlementPaid, settlementPaid + residual, amount);
    const observedVersion = Number(periodDb.row_version) || 1;

    const needsApproval = requiresApproval(amount) && method !== "Cash";
    const { movement, period } = await insertMovementAndDualWrite(c, {
      organizationId,
      actorId: user.userId,
      kind: "pay",
      driverId,
      weekAnchor,
      amount,
      method,
      reference,
      reason,
      idempotencyKey,
      approvalState: needsApproval ? "pending" : "none",
      status: needsApproval ? "pending" : method === "Cash" ? "posted" : "pending",
      expectedRowVersion: observedVersion,
    });
    return c.json({
      success: true,
      movement: mapMovement(movement),
      period: mapPeriod(period),
      requiresApproval: needsApproval,
    });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

// ── POST /write-off ─────────────────────────────────────────────────────────
app.post(`${BASE}/write-off`, requireSettlementPerm("settlements.write_off"), async (c) => {
  try {
    const orgOrResp = await requireOrgId(c);
    if (typeof orgOrResp !== "string") return orgOrResp;
    const organizationId = orgOrResp;
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();

    const driverId = String(body.driverId || "").trim();
    const weekAnchor = String(body.weekAnchor || body.periodAnchor || "").slice(0, 10);
    const amount = Number(body.amount);
    const reason = String(body.reason || "").trim();
    const reference = body.reference ? String(body.reference) : undefined;
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    const expectedOutstanding = Number(body.expectedOutstanding);

    if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(weekAnchor) || !idempotencyKey) {
      return c.json({ error: "driverId, weekAnchor, and idempotencyKey are required" }, 400);
    }
    if (!reason) {
      return c.json({ error: "reason is required for write-offs" }, 400);
    }

    const existing = await findMovementByIdempotency(organizationId, idempotencyKey);
    if (existing) {
      const period = await getDriverFinancialPeriodDetail(driverId, weekAnchor);
      return c.json({ success: true, idempotent: true, movement: mapMovement(existing), period: mapPeriod(period) });
    }

    const periodDb = await loadPeriodDb(driverId, weekAnchor, organizationId);
    if (!periodDb) {
      return c.json({ error: "PERIOD_NOT_FOUND", message: "No financial period for this driver/week" }, 404);
    }
    assertPeriodNotFrozen({
      metadata: (periodDb.metadata as Record<string, unknown>) || null,
      settlementStatus: String(periodDb.settlement_status || ""),
      signedAt: periodDb.signed_at ? String(periodDb.signed_at) : null,
    });
    await assertFrozenPeriodHashIntact(periodDb as Parameters<typeof assertFrozenPeriodHashIntact>[0]);
    const settlementAmount = Number(periodDb.settlement_amount) || 0;
    const owed = driverOwesResidual(settlementAmount);
    assertExpectedOutstanding(owed, expectedOutstanding);
    enforceCollectCap(owed, amount, false);
    const observedVersion = Number(periodDb.row_version) || 1;

    const { movement, period } = await insertMovementAndDualWrite(c, {
      organizationId,
      actorId: user.userId,
      kind: "write_off",
      driverId,
      weekAnchor,
      amount,
      method: "Other",
      reference,
      reason,
      idempotencyKey,
      expectedRowVersion: observedVersion,
    });
    return c.json({ success: true, movement: mapMovement(movement), period: mapPeriod(period) });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

// ── POST /reverse ───────────────────────────────────────────────────────────
app.post(`${BASE}/reverse`, requireSettlementPerm("settlements.reverse"), async (c) => {
  try {
    const orgOrResp = await requireOrgId(c);
    if (typeof orgOrResp !== "string") return orgOrResp;
    const organizationId = orgOrResp;
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();

    let movementId = String(body.movementId || "").trim();
    const sourceTransactionId = String(body.sourceTransactionId || "").trim();
    const reason = String(body.reason || "").trim();
    const idempotencyKey = String(body.idempotencyKey || "").trim();

    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    if (!movementId && !sourceTransactionId) {
      return c.json({ error: "movementId or sourceTransactionId is required" }, 400);
    }
    if (!reason) {
      return c.json({ error: "reason is required for reversals" }, 400);
    }

    const existing = await findMovementByIdempotency(organizationId, idempotencyKey);
    if (existing) {
      const period = await getDriverFinancialPeriodDetail(
        String(existing.driver_id),
        String(existing.period_anchor).slice(0, 10),
      );
      return c.json({ success: true, idempotent: true, movement: mapMovement(existing), period: mapPeriod(period) });
    }

    // Legacy bridge: resolve movement from dual-write / pre-migration transaction id.
    if (!movementId && sourceTransactionId) {
      const { data: byTx } = await sb()
        .from("settlement_movements")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("source_transaction_id", sourceTransactionId)
        .neq("kind", "reverse")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byTx?.id) {
        movementId = String(byTx.id);
      } else {
        // No movement row — void KV tx only (never hard-delete).
        const tx = await kv.get(`transaction:${sourceTransactionId}`);
        if (!tx || typeof tx !== "object") {
          return c.json({ error: "MOVEMENT_NOT_FOUND", message: "No movement or transaction to reverse" }, 404);
        }
        const t = tx as Record<string, unknown>;
        const driverId = String(t.driverId || "");
        const meta = (t.metadata as Record<string, unknown>) || {};
        const weekAnchor = String(meta.workPeriodStart || t.date || "").slice(0, 10);
        if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(weekAnchor)) {
          return c.json({ error: "INVALID_TX", message: "Transaction missing driver/week for reverse" }, 400);
        }
        const periodForLock = await loadPeriodDb(driverId, weekAnchor, organizationId);
        const observedVersion = Number(periodForLock?.row_version) || 1;
        await claimPeriodWriteLock(driverId, weekAnchor, organizationId, observedVersion);
        const next = {
          ...t,
          status: "Reversed",
          isReconciled: false,
          metadata: {
            ...meta,
            reversedAt: new Date().toISOString(),
            reverseReason: reason,
            reversedBy: user.userId,
          },
        };
        await kv.set(`transaction:${sourceTransactionId}`, stampOrg(next, c));

        const reverseRow = buildMovementRow({
          organizationId,
          driverId,
          periodAnchor: weekAnchor,
          kind: "reverse",
          amountMinor: toMinor(Math.abs(Number(t.amount) || 0)),
          method: t.paymentMethod ? String(t.paymentMethod) : null,
          reference: t.referenceNumber ? String(t.referenceNumber) : null,
          reason,
          actorId: user.userId,
          idempotencyKey,
          status: "posted",
          sourceTransactionId,
          metadata: { legacyTxReverse: true, reversedKind: "legacy_tx" },
        });
        const { data: inserted, error: insErr } = await sb()
          .from("settlement_movements")
          .insert(reverseRow)
          .select("*")
          .single();
        if (insErr) throw new Error(insErr.message);
        await syncPeriodCashFromTransactions(driverId, weekAnchor);
        const period = await getDriverFinancialPeriodDetail(driverId, weekAnchor);
        return c.json({
          success: true,
          movement: mapMovement(inserted as Record<string, unknown>),
          period: mapPeriod(period),
          legacy: true,
        });
      }
    }

    const { data: original, error: loadErr } = await sb()
      .from("settlement_movements")
      .select("*")
      .eq("id", movementId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!original) {
      return c.json({ error: "MOVEMENT_NOT_FOUND", message: "Movement not found for this organization" }, 404);
    }
    if (String(original.status) === "void" || String(original.kind) === "reverse") {
      return c.json({ error: "ALREADY_REVERSED", message: "Movement is already void or is a reversal" }, 400);
    }

    const driverId = String(original.driver_id);
    const weekAnchor = String(original.period_anchor).slice(0, 10);
    const sourceTxId = original.source_transaction_id
      ? String(original.source_transaction_id)
      : null;

    // Claim period lock before void + reverse insert (version observed now).
    const periodForLock = await loadPeriodDb(driverId, weekAnchor, organizationId);
    const observedVersion = Number(periodForLock?.row_version) || 1;
    await claimPeriodWriteLock(driverId, weekAnchor, organizationId, observedVersion);

    // Mark original void (append-only: row stays, status flips).
    await sb()
      .from("settlement_movements")
      .update({
        status: "void",
        metadata: {
          ...((original.metadata as Record<string, unknown>) || {}),
          voidedAt: new Date().toISOString(),
          voidReason: reason,
          voidedBy: user.userId,
        },
      })
      .eq("id", movementId);

    // Dual-write: mark source KV tx so cash sync excludes it (no hard delete).
    if (sourceTxId) {
      const tx = await kv.get(`transaction:${sourceTxId}`);
      if (tx && typeof tx === "object") {
        const next = {
          ...(tx as Record<string, unknown>),
          status: "Reversed",
          isReconciled: false,
          metadata: {
            ...(((tx as Record<string, unknown>).metadata as Record<string, unknown>) || {}),
            reversedAt: new Date().toISOString(),
            reverseReason: reason,
            reversedBy: user.userId,
          },
        };
        await kv.set(`transaction:${sourceTxId}`, stampOrg(next, c));
      }
    }

    const reverseRow = buildMovementRow({
      organizationId,
      driverId,
      periodAnchor: weekAnchor,
      kind: "reverse",
      amountMinor: Number(original.amount_minor) || 0,
      method: original.method ? String(original.method) : null,
      reference: original.reference ? String(original.reference) : null,
      reason,
      actorId: user.userId,
      idempotencyKey,
      reversesMovementId: movementId,
      status: "posted",
      sourceTransactionId: sourceTxId,
      metadata: { reversedKind: original.kind },
    });

    const { data: inserted, error: insErr } = await sb()
      .from("settlement_movements")
      .insert(reverseRow)
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);

    await syncPeriodCashFromTransactions(driverId, weekAnchor);
    const period = await getDriverFinancialPeriodDetail(driverId, weekAnchor);

    return c.json({
      success: true,
      movement: mapMovement(inserted as Record<string, unknown>),
      period: mapPeriod(period),
    });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

// ── POST /verify — bank clear / verify pending movement or legacy tx ─────────
app.post(`${BASE}/verify`, requireSettlementPerm("settlements.pay"), async (c) => {
  try {
    const orgOrResp = await requireOrgId(c);
    if (typeof orgOrResp !== "string") return orgOrResp;
    const organizationId = orgOrResp;
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();

    const movementId = String(body.movementId || "").trim();
    const sourceTransactionId = String(body.sourceTransactionId || "").trim();
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    const note = body.note ? String(body.note) : undefined;

    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    if (!movementId && !sourceTransactionId) {
      return c.json({ error: "movementId or sourceTransactionId is required" }, 400);
    }

    const existing = await findMovementByIdempotency(organizationId, idempotencyKey);
    if (existing) {
      return c.json({ success: true, idempotent: true, movement: mapMovement(existing) });
    }

    let targetMovement: Record<string, unknown> | null = null;
    if (movementId) {
      const { data, error } = await sb()
        .from("settlement_movements")
        .select("*")
        .eq("id", movementId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      targetMovement = data as Record<string, unknown> | null;
    } else if (sourceTransactionId) {
      const { data } = await sb()
        .from("settlement_movements")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("source_transaction_id", sourceTransactionId)
        .neq("kind", "reverse")
        .neq("kind", "verify")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      targetMovement = data as Record<string, unknown> | null;
    }

    const txId =
      (targetMovement?.source_transaction_id
        ? String(targetMovement.source_transaction_id)
        : null) ||
      (sourceTransactionId || null);

    if (txId) {
      const tx = await kv.get(`transaction:${txId}`);
      if (tx && typeof tx === "object") {
        const next = {
          ...(tx as Record<string, unknown>),
          status: "Verified",
          isReconciled: true,
          metadata: {
            ...(((tx as Record<string, unknown>).metadata as Record<string, unknown>) || {}),
            verifiedAt: new Date().toISOString(),
            verifiedBy: user.userId,
            verifyNote: note || null,
          },
        };
        await kv.set(`transaction:${txId}`, stampOrg(next, c));
      }
    }

    if (targetMovement?.id) {
      await sb()
        .from("settlement_movements")
        .update({
          status: "posted",
          metadata: {
            ...((targetMovement.metadata as Record<string, unknown>) || {}),
            verifiedAt: new Date().toISOString(),
            verifiedBy: user.userId,
            verifyNote: note || null,
          },
        })
        .eq("id", String(targetMovement.id));
    }

    const driverId = targetMovement
      ? String(targetMovement.driver_id)
      : "";
    const weekAnchor = targetMovement
      ? String(targetMovement.period_anchor).slice(0, 10)
      : "";

    // Resolve driver/week from KV when no movement (legacy verify).
    let resolvedDriver = driverId;
    let resolvedWeek = weekAnchor;
    if ((!resolvedDriver || !resolvedWeek) && txId) {
      const tx = await kv.get(`transaction:${txId}`);
      if (tx && typeof tx === "object") {
        const t = tx as Record<string, unknown>;
        const meta = (t.metadata as Record<string, unknown>) || {};
        resolvedDriver = String(t.driverId || "");
        resolvedWeek = String(meta.workPeriodStart || t.date || "").slice(0, 10);
      }
    }

    if (!resolvedDriver || !/^\d{4}-\d{2}-\d{2}$/.test(resolvedWeek)) {
      return c.json({ error: "VERIFY_TARGET_INVALID", message: "Could not resolve driver/week for verify" }, 400);
    }

    const periodForLock = await loadPeriodDb(resolvedDriver, resolvedWeek, organizationId);
    const observedVersion = Number(periodForLock?.row_version) || 1;
    await claimPeriodWriteLock(resolvedDriver, resolvedWeek, organizationId, observedVersion);

    const amountMinor = targetMovement
      ? Number(targetMovement.amount_minor) || 0
      : toMinor(
        Math.abs(
          Number(
            ((await kv.get(`transaction:${txId}`)) as { amount?: number } | null)?.amount || 0,
          ),
        ),
      );

    const verifyRow = buildMovementRow({
      organizationId,
      driverId: resolvedDriver,
      periodAnchor: resolvedWeek,
      kind: "verify",
      amountMinor,
      method: targetMovement?.method ? String(targetMovement.method) : null,
      reason: note,
      actorId: user.userId,
      idempotencyKey,
      status: "posted",
      sourceTransactionId: txId,
      metadata: {
        verifiedMovementId: targetMovement?.id ? String(targetMovement.id) : null,
      },
    });

    const { data: inserted, error: insErr } = await sb()
      .from("settlement_movements")
      .insert(verifyRow)
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);

    await syncPeriodCashFromTransactions(resolvedDriver, resolvedWeek);
    const period = await getDriverFinancialPeriodDetail(resolvedDriver, resolvedWeek);

    return c.json({
      success: true,
      movement: mapMovement(inserted as Record<string, unknown>),
      period: mapPeriod(period),
    });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

// ── POST /runs (batch) ──────────────────────────────────────────────────────
app.post(`${BASE}/runs`, requireSettlementPerm("settlements.pay"), async (c) => {
  try {
    const orgOrResp = await requireOrgId(c);
    if (typeof orgOrResp !== "string") return orgOrResp;
    const organizationId = orgOrResp;
    const user = c.get("rbacUser") as RbacUser;
    const body = await c.req.json();

    const idempotencyKey = String(body.idempotencyKey || "").trim();
    const method = String(body.method || "Cash");
    const effectiveDate = body.effectiveDate
      ? String(body.effectiveDate).slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const rowsIn: unknown[] = Array.isArray(body.rows) ? body.rows : [];
    const runKind = String(body.kind || "pay") === "collect" ? "collect" : "pay";

    if (!idempotencyKey) {
      return c.json({ error: "idempotencyKey is required" }, 400);
    }
    if (rowsIn.length === 0) {
      return c.json({ error: "rows[] is required" }, 400);
    }

    const { data: existingRun } = await sb()
      .from("settlement_runs")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existingRun) {
      const { data: runRows } = await sb()
        .from("settlement_run_rows")
        .select("*")
        .eq("run_id", existingRun.id);
      return c.json({ success: true, idempotent: true, run: existingRun, rows: runRows || [] });
    }

    const { data: run, error: runErr } = await sb()
      .from("settlement_runs")
      .insert({
        organization_id: organizationId,
        actor_id: user.userId,
        method,
        effective_date: effectiveDate,
        status: "processing",
        idempotency_key: idempotencyKey,
        metadata: {
          kind: runKind,
          reference: body.reference ? String(body.reference) : null,
        },
      })
      .select("*")
      .single();
    if (runErr) throw new Error(runErr.message);

    const outRows: Record<string, unknown>[] = [];
    let posted = 0;
    let failed = 0;

    for (let i = 0; i < rowsIn.length; i++) {
      const raw = rowsIn[i] as Record<string, unknown>;
      const driverId = String(raw.driverId || "").trim();
      const weekAnchor = String(raw.weekAnchor || raw.periodAnchor || "").slice(0, 10);
      const amount = Number(raw.amount);
      const expectedOutstanding = Number(raw.expectedOutstanding);
      const rowKey = `${idempotencyKey}:row:${i}`;

      let rowStatus = "pending";
      let errorMessage: string | null = null;
      let movementId: string | null = null;

      try {
        if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(weekAnchor)) {
          throw new SettlementCommandError("INVALID_ROW", "driverId and weekAnchor required", 400);
        }
        const periodDb = await loadPeriodDb(driverId, weekAnchor, organizationId);
        if (!periodDb) {
          throw new SettlementCommandError("PERIOD_NOT_FOUND", "Period not found", 404);
        }
        const settlementAmount = Number(periodDb.settlement_amount) || 0;
        if (runKind === "pay") {
          const residual = companyOwesResidual(settlementAmount);
          assertExpectedOutstanding(residual, expectedOutstanding);
          const settlementPaid = Number(periodDb.settlement_paid) || 0;
          enforcePayCap(settlementPaid, settlementPaid + residual, amount);
          const observedVersion = Number(periodDb.row_version) || 1;
          const { movement } = await insertMovementAndDualWrite(c, {
            organizationId,
            actorId: user.userId,
            kind: "pay",
            driverId,
            weekAnchor,
            amount,
            method,
            idempotencyKey: rowKey,
            expectedRowVersion: observedVersion,
          });
          movementId = String(movement.id);
        } else {
          const owed = driverOwesResidual(settlementAmount);
          assertExpectedOutstanding(owed, expectedOutstanding);
          enforceCollectCap(owed, amount, false);
          const observedVersion = Number(periodDb.row_version) || 1;
          const { movement } = await insertMovementAndDualWrite(c, {
            organizationId,
            actorId: user.userId,
            kind: "collect",
            driverId,
            weekAnchor,
            amount,
            method,
            idempotencyKey: rowKey,
            expectedRowVersion: observedVersion,
          });
          movementId = String(movement.id);
        }
        rowStatus = "posted";
        posted++;
      } catch (e) {
        failed++;
        rowStatus = "failed";
        errorMessage = e instanceof Error ? e.message : String(e);
      }

      const { data: rr } = await sb()
        .from("settlement_run_rows")
        .insert({
          run_id: run.id,
          driver_id: driverId || "unknown",
          period_anchor: /^\d{4}-\d{2}-\d{2}$/.test(weekAnchor) ? weekAnchor : effectiveDate,
          amount_minor: toMinor(Number.isFinite(amount) ? amount : 0),
          status: rowStatus,
          error_message: errorMessage,
          movement_id: movementId,
        })
        .select("*")
        .single();
      if (rr) outRows.push(rr as Record<string, unknown>);
    }

    const finalStatus =
      failed === 0 ? "completed" : posted === 0 ? "failed" : "partial";
    await sb()
      .from("settlement_runs")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return c.json({
      success: true,
      runId: run.id,
      run: { ...run, status: finalStatus },
      rows: outRows,
      summary: { posted, failed, total: rowsIn.length },
    });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

// ── GET /runs/:runId ────────────────────────────────────────────────────────
app.get(`${BASE}/runs/:runId`, requirePermission("transactions.view"), async (c) => {
  try {
    const orgOrResp = await requireOrgId(c);
    if (typeof orgOrResp !== "string") return orgOrResp;
    const organizationId = orgOrResp;
    const runId = c.req.param("runId");

    const { data: run, error } = await sb()
      .from("settlement_runs")
      .select("*")
      .eq("id", runId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!run) return c.json({ error: "RUN_NOT_FOUND" }, 404);

    const { data: rows } = await sb()
      .from("settlement_run_rows")
      .select("*")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });

    return c.json({ success: true, run, rows: rows || [] });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

// ── POST /:movementId/approve ───────────────────────────────────────────────
app.post(`${BASE}/:movementId/approve`, requireSettlementPerm("settlements.approve"), async (c) => {
  try {
    const orgOrResp = await requireOrgId(c);
    if (typeof orgOrResp !== "string") return orgOrResp;
    const organizationId = orgOrResp;
    const user = c.get("rbacUser") as RbacUser;
    const movementId = c.req.param("movementId");
    const body = await c.req.json();
    const decision = String(body.decision || "").toLowerCase();
    const note = body.note ? String(body.note) : undefined;

    if (decision !== "approved" && decision !== "rejected") {
      return c.json({ error: "decision must be approved or rejected" }, 400);
    }

    const { data: movement, error } = await sb()
      .from("settlement_movements")
      .select("*")
      .eq("id", movementId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!movement) return c.json({ error: "MOVEMENT_NOT_FOUND" }, 404);

    const driverId = String(movement.driver_id);
    const weekAnchor = String(movement.period_anchor).slice(0, 10);
    // Claim period before posting/voiding so approve cannot race a concurrent pay.
    const periodForLock = await loadPeriodDb(driverId, weekAnchor, organizationId);
    const observedVersion = Number(periodForLock?.row_version) || 1;
    await claimPeriodWriteLock(driverId, weekAnchor, organizationId, observedVersion);

    const { data: updated, error: updErr } = await sb()
      .from("settlement_movements")
      .update({
        approval_state: decision,
        status: decision === "approved" ? "posted" : "void",
        metadata: {
          ...((movement.metadata as Record<string, unknown>) || {}),
          approvalNote: note || null,
          approvedBy: user.userId,
          approvedAt: new Date().toISOString(),
        },
      })
      .eq("id", movementId)
      .select("*")
      .single();
    if (updErr) throw new Error(updErr.message);

    // If approved pending non-cash pay: mark dual-write tx Completed so sync clears it.
    const txId = updated.source_transaction_id
      ? String(updated.source_transaction_id)
      : null;
    if (txId && decision === "approved") {
      const tx = await kv.get(`transaction:${txId}`);
      if (tx && typeof tx === "object") {
        const next = {
          ...(tx as Record<string, unknown>),
          status: "Completed",
          isReconciled: true,
        };
        await kv.set(`transaction:${txId}`, stampOrg(next, c));
        await syncPeriodCashFromTransactions(driverId, weekAnchor);
      }
    }
    if (txId && decision === "rejected") {
      const tx = await kv.get(`transaction:${txId}`);
      if (tx && typeof tx === "object") {
        const next = {
          ...(tx as Record<string, unknown>),
          status: "Rejected",
          isReconciled: false,
        };
        await kv.set(`transaction:${txId}`, stampOrg(next, c));
        await syncPeriodCashFromTransactions(driverId, weekAnchor);
      }
    }

    const period = await getDriverFinancialPeriodDetail(driverId, weekAnchor);
    return c.json({
      success: true,
      movement: mapMovement(updated as Record<string, unknown>),
      period: mapPeriod(period),
    });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

/** Phase 4: one queue read model — server filter/sort/page/aggregate in minor units. */
app.get(`${BASE}/queue`, requirePermission("transactions.view"), async (c) => {
  try {
    // M-4: fail-closed tenant scope. Without an org, the period list queries run
    // unscoped and leak every tenant's settlement rows — refuse instead.
    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json(
        { error: "ORG_REQUIRED", message: "organizationId is required for the settlement queue" },
        400,
      );
    }
    const view = (c.req.query("view") || "collect") as "collect" | "pay" | "reconciled";
    const groupBy = (c.req.query("groupBy") || "week") as "driver" | "week";
    const periodStart = c.req.query("periodStart") || c.req.query("weekFrom") || undefined;
    const periodEnd = c.req.query("periodEnd") || c.req.query("weekTo") || undefined;
    const minAmount = c.req.query("minAmount") ? Number(c.req.query("minAmount")) : undefined;
    const search = (c.req.query("search") || "").trim().toLowerCase();
    const ageBucket = c.req.query("ageBucket") || undefined;
    const serviceLineRaw = c.req.query("serviceLine");
    const serviceLine =
      serviceLineRaw === "rush_delivery" || serviceLineRaw === "rideshare"
        ? serviceLineRaw
        : undefined;
    const page = Math.max(1, Number(c.req.query("page") || 1));
    const pageSize = Math.min(Math.max(Number(c.req.query("pageSize") || 50), 1), 200);
    const sort = c.req.query("sort") || "age_desc";
    // M-3: page from SQL — never load limit:2000 then filter/slice in memory.
    const offset = (page - 1) * pageSize;
    // Search/ageBucket stay light post-filters; over-fetch a small window when needed.
    const needsPostFilter = Boolean(search || ageBucket);
    const sqlLimit = needsPostFilter ? Math.min(pageSize * 3, 300) : pageSize;
    const sqlOffset = needsPostFilter ? 0 : offset;

    const {
      listCompanyOwesPeriods,
      listDriverOwesPeriods,
      listCashHeldPeriods,
      listReconciledSettlementPeriods,
    } = await import("./driver_financial_periods.ts");

    const opts = {
      periodStart,
      periodEnd,
      minAmount,
      limit: sqlLimit,
      offset: sqlOffset,
      sort,
      organizationId: orgId,
      serviceLine,
    };

    type RawRow = {
      driverId: string;
      driverName?: string;
      periodAnchor: string;
      periodEnd: string;
      amountOwedMinor: number;
      amountOwed: number;
      settlementAmount?: number;
      settlementPaid?: number;
      cashCollected?: number;
      cashReturned?: number;
      cashStillHeld?: number;
      tripCount?: number;
      settlementStatus?: string;
      fuelFinalized?: boolean;
      periodFrozen?: boolean;
      moneyUnlocked?: boolean;
      collectKind?: string;
      overpaidAmount?: number;
      cashSourceMismatch?: number;
      metadata?: Record<string, unknown> | null;
      earningsGross?: number;
      driverShare?: number;
      fleetShare?: number;
      driverSharePercent?: number;
      fuelDeduction?: number;
      fuelFleetShare?: number;
      tollChargedToDriver?: number;
      tollCashSpend?: number;
      cashWrittenOff?: number;
      payoutNet?: number;
      tipsPaidToDriver?: number;
      tipsWithheld?: number;
    };

    let raw: RawRow[] = [];
    if (view === "pay") {
      const rows = await listCompanyOwesPeriods(opts);
      raw = rows.map((r) => {
        // settlement_amount is already residual (gross − settlement_paid). Do not subtract paid again.
        const owed = companyOwesResidual(Number(r.settlementAmount) || 0);
        return {
          driverId: r.driverId,
          periodAnchor: r.periodAnchor,
          periodEnd: r.periodEnd,
          amountOwed: owed,
          amountOwedMinor: toMinor(owed),
          settlementAmount: r.settlementAmount,
          settlementPaid: r.settlementPaid,
          cashCollected: r.cashCollected,
          cashStillHeld: r.cashStillHeld,
          tripCount: r.tripCount,
          settlementStatus: r.settlementStatus,
          fuelFinalized: r.fuelFinalized,
          periodFrozen: r.periodFrozen === true,
          moneyUnlocked: r.moneyUnlocked !== false,
          overpaidAmount: r.overpaidAmount,
        };
      });
    } else if (view === "reconciled") {
      const rows = await listReconciledSettlementPeriods(opts);
      raw = rows.map((r) => ({
        driverId: r.driverId,
        periodAnchor: r.periodAnchor,
        periodEnd: r.periodEnd,
        amountOwed: 0,
        amountOwedMinor: 0,
        settlementAmount: r.settlementAmount,
        settlementPaid: r.settlementPaid,
        cashCollected: r.cashCollected,
        cashReturned: (r as { cashReturned?: number }).cashReturned,
        cashStillHeld: r.cashStillHeld,
        tripCount: r.tripCount,
        settlementStatus: r.settlementStatus,
        fuelFinalized: r.fuelFinalized,
        periodFrozen: r.periodFrozen === true,
        moneyUnlocked: r.moneyUnlocked !== false,
        overpaidAmount: r.overpaidAmount,
        cashSourceMismatch: r.cashSourceMismatch,
        // Rich fields for ReconciledTable — avoid a second legacy list query (R-9).
        earningsGross: r.earningsGross,
        driverShare: r.driverShare,
        fleetShare: r.fleetShare,
        driverSharePercent: r.driverSharePercent,
        fuelDeduction: r.fuelDeduction,
        fuelFleetShare: r.fuelFleetShare,
        tollChargedToDriver: r.tollChargedToDriver,
        tollCashSpend: r.tollCashSpend,
        cashWrittenOff: r.cashWrittenOff,
        payoutNet: (r as { payoutNet?: number }).payoutNet,
        tipsPaidToDriver: r.tipsPaidToDriver,
        tipsWithheld: r.tipsWithheld,
        metadata: (r as { metadata?: Record<string, unknown> | null }).metadata ?? null,
      }));
    } else {
      const [owes, held] = await Promise.all([
        listDriverOwesPeriods(opts),
        listCashHeldPeriods(opts),
      ]);
      const byKey = new Map<string, RawRow>();
      for (const r of held) {
        const owed = Math.max(0, Number(r.amountOwed) || Number(r.cashStillHeld) || 0);
        byKey.set(`${r.driverId}|${r.periodAnchor}`, {
          driverId: r.driverId,
          periodAnchor: r.periodAnchor,
          periodEnd: r.periodEnd,
          amountOwed: owed,
          amountOwedMinor: toMinor(owed),
          settlementAmount: r.settlementAmount,
          settlementPaid: r.settlementPaid,
          cashCollected: r.cashCollected,
          cashStillHeld: r.cashStillHeld,
          tripCount: r.tripCount,
          settlementStatus: r.settlementStatus,
          fuelFinalized: r.fuelFinalized,
          periodFrozen: r.periodFrozen === true,
          moneyUnlocked: r.moneyUnlocked !== false,
          collectKind: "cash_held",
          overpaidAmount: r.overpaidAmount,
          cashSourceMismatch: r.cashSourceMismatch,
        });
      }
      for (const r of owes) {
        const owed = Math.max(0, Number(r.amountOwed) || Math.abs(Number(r.settlementAmount) || 0));
        byKey.set(`${r.driverId}|${r.periodAnchor}`, {
          driverId: r.driverId,
          periodAnchor: r.periodAnchor,
          periodEnd: r.periodEnd,
          amountOwed: owed,
          amountOwedMinor: toMinor(owed),
          settlementAmount: r.settlementAmount,
          settlementPaid: r.settlementPaid,
          cashCollected: r.cashCollected,
          cashStillHeld: r.cashStillHeld,
          tripCount: r.tripCount,
          settlementStatus: r.settlementStatus,
          fuelFinalized: r.fuelFinalized,
          periodFrozen: r.periodFrozen === true,
          moneyUnlocked: r.moneyUnlocked !== false,
          collectKind: "driver_owes",
          overpaidAmount: r.overpaidAmount,
          cashSourceMismatch: r.cashSourceMismatch,
        });
      }
      raw = [...byKey.values()];
    }

    // Attach driver names
    try {
      const drivers = await kv.getByPrefix("driver:");
      const nameById = new Map<string, string>();
      for (const d of drivers as any[]) {
        if (d?.id && d?.name) nameById.set(String(d.id), String(d.name));
      }
      for (const r of raw) {
        r.driverName = nameById.get(r.driverId) || r.driverId;
      }
    } catch {
      /* ignore */
    }

    const now = new Date();
    const daysOverdue = (periodEnd: string) => {
      const end = String(periodEnd || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return 0;
      const ms = now.getTime() - new Date(`${end}T12:00:00`).getTime();
      return Math.max(0, Math.floor(ms / 86_400_000));
    };
    const bucketOf = (d: number): "0-30" | "31-60" | "61-90" | "90+" => {
      if (d <= 30) return "0-30";
      if (d <= 60) return "31-60";
      if (d <= 90) return "61-90";
      return "90+";
    };

    let filtered = raw.filter((r) => {
      if (search) {
        const hay = `${r.driverName || ""} ${r.driverId} ${r.periodAnchor}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      if (ageBucket) {
        if (bucketOf(daysOverdue(r.periodEnd)) !== ageBucket) return false;
      }
      return true;
    });

    // SQL already ordered; only re-sort when post-filter mixed two collect sources.
    if (view === "collect" || needsPostFilter) {
      if (sort === "age_desc") {
        filtered.sort((a, b) => daysOverdue(b.periodEnd) - daysOverdue(a.periodEnd));
      } else if (sort === "amount_desc") {
        filtered.sort((a, b) => b.amountOwedMinor - a.amountOwedMinor);
      } else {
        filtered.sort((a, b) => String(b.periodAnchor).localeCompare(String(a.periodAnchor)));
      }
    }

    const byAge: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const byDriver: Record<string, number> = {};
    for (const r of filtered) {
      const b = bucketOf(daysOverdue(r.periodEnd));
      byAge[b] = (byAge[b] || 0) + r.amountOwedMinor;
      byDriver[r.driverId] = (byDriver[r.driverId] || 0) + r.amountOwedMinor;
    }

    let rowsOut: unknown[] = filtered;
    if (groupBy === "driver") {
      const groups = new Map<string, {
        driverId: string;
        driverName?: string;
        amountOwedMinor: number;
        amountOwed: number;
        weekCount: number;
        oldestPeriodEnd: string;
        periodAnchor: string;
        periodEnd: string;
        agingBucket: string;
        children: RawRow[];
      }>();
      for (const r of filtered) {
        const g = groups.get(r.driverId) || {
          driverId: r.driverId,
          driverName: r.driverName,
          amountOwedMinor: 0,
          amountOwed: 0,
          weekCount: 0,
          oldestPeriodEnd: r.periodEnd,
          periodAnchor: r.periodAnchor,
          periodEnd: r.periodEnd,
          agingBucket: bucketOf(daysOverdue(r.periodEnd)),
          children: [] as RawRow[],
        };
        g.amountOwedMinor += r.amountOwedMinor;
        g.amountOwed += r.amountOwed;
        g.weekCount += 1;
        g.children.push(r);
        if (String(r.periodEnd) < String(g.oldestPeriodEnd)) {
          g.oldestPeriodEnd = r.periodEnd;
          g.agingBucket = bucketOf(daysOverdue(r.periodEnd));
        }
        groups.set(r.driverId, g);
      }
      rowsOut = [...groups.values()].sort(
        (a, b) => daysOverdue(b.oldestPeriodEnd) - daysOverdue(a.oldestPeriodEnd),
      );
    }

    // Post-filter / collect-merge / groupBy need a final slice; pure SQL pages do not.
    const mustSlice =
      needsPostFilter || groupBy === "driver" || view === "collect";
    let pageRows: unknown[];
    let total: number;
    let hasMore: boolean;
    if (mustSlice) {
      // Collect: SQL already returned one page from each source — merge then take pageSize.
      // Post-filter/groupBy: window was fetched from offset 0 (or SQL page) — slice for page.
      const start =
        view === "collect" && !needsPostFilter && groupBy !== "driver"
          ? 0
          : (page - 1) * pageSize;
      total = rowsOut.length;
      pageRows = rowsOut.slice(start, start + pageSize);
      hasMore =
        start + pageSize < total ||
        (view === "collect" && raw.length >= sqlLimit) ||
        (needsPostFilter && raw.length >= sqlLimit);
    } else {
      pageRows = rowsOut;
      total = offset + pageRows.length + (raw.length >= sqlLimit ? pageSize : 0);
      hasMore = raw.length >= sqlLimit;
    }
    const totalMinor = filtered.reduce((s, r) => s + r.amountOwedMinor, 0);

    return c.json({
      success: true,
      rows: pageRows,
      totals: {
        amountOwedMinor: totalMinor,
        amountDisplayedMinor: pageRows.reduce(
          (s: number, r: any) => s + (Number(r.amountOwedMinor) || 0),
          0,
        ),
        rowCount: total,
      },
      aggregates: { byAge, byDriver },
      page: {
        total,
        hasMore,
        truncated: false,
        page,
        pageSize,
      },
    });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

/** Phase 4: movements list for Done/Awaiting tabs. */
app.get(`${BASE}/movements`, requirePermission("transactions.view"), async (c) => {
  try {
    const orgId = getOrgId(c);
    if (!orgId) {
      return c.json({ success: true, rows: [], page: { total: 0, hasMore: false } });
    }
    const periodStart = c.req.query("periodStart") || c.req.query("weekFrom");
    const periodEnd = c.req.query("periodEnd") || c.req.query("weekTo");
    const kind = c.req.query("kind");
    const approvalState = c.req.query("approvalState");
    const limit = Math.min(Math.max(Number(c.req.query("pageSize") || 100), 1), 500);

    let q = sb()
      .from("settlement_movements")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (periodStart) q = q.gte("period_anchor", periodStart);
    if (periodEnd) q = q.lte("period_anchor", periodEnd);
    if (kind && kind !== "all") q = q.eq("kind", kind);
    if (approvalState) q = q.eq("approval_state", approvalState);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return c.json({
      success: true,
      rows: (data || []).map((r) => mapMovement(r as Record<string, unknown>)),
      page: { total: (data || []).length, hasMore: (data || []).length >= limit },
    });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

/** N-6: NULL-org period rows are invisible on every queue — surface count for ops. */
app.get(`${BASE}/health`, requirePermission("transactions.view"), async (c) => {
  try {
    const { count: totalPeriods, error: totalErr } = await sb()
      .from("driver_financial_periods")
      .select("id", { count: "exact", head: true });
    if (totalErr) throw new Error(totalErr.message);

    const { count: nullOrgPeriodCount, error: nullErr } = await sb()
      .from("driver_financial_periods")
      .select("id", { count: "exact", head: true })
      .is("organization_id", null);
    if (nullErr) throw new Error(nullErr.message);

    let sampleDriverIds: string[] = [];
    if ((nullOrgPeriodCount || 0) > 0) {
      const { data: samples } = await sb()
        .from("driver_financial_periods")
        .select("driver_id")
        .is("organization_id", null)
        .limit(40);
      const seen = new Set<string>();
      for (const r of samples || []) {
        const id = String((r as { driver_id?: string }).driver_id || "").trim();
        if (id && !seen.has(id)) {
          seen.add(id);
          sampleDriverIds.push(id);
          if (sampleDriverIds.length >= 20) break;
        }
      }
    }

    return c.json({
      success: true,
      nullOrgPeriodCount: nullOrgPeriodCount || 0,
      totalPeriods: totalPeriods || 0,
      sampleDriverIds,
    });
  } catch (e) {
    return commandErrorResponse(c, e);
  }
});

export default app;
