/**
 * Settle from balance — net a driver-owes week against a fleet-owes week
 * via a linked pair of correction movements (shared offsetId).
 */
import { round2 } from "../../../packages/finance-core/src/money.ts";
import {
  sumCorrectionLines,
  type CorrectionLine,
} from "../../../packages/finance-core/src/fuelShareCorrection.ts";
import { getServiceClient } from "./service_client.ts";
import { persistPeriodRowWithVersion } from "./period_persist.ts";
import { syncPeriodCashFromTransactions } from "./driver_financial_periods.ts";
import {
  assertPeriodNotFrozen,
  assertFinancePeriodNotLocked,
  periodGateFromRow,
  assertFrozenPeriodHashIntact,
} from "./settlement_period_freeze.ts";
import {
  buildMovementRow,
  SettlementCommandError,
  validateSettleFromBalanceAmount,
} from "./settlement_commands.ts";

export { validateSettleFromBalanceAmount };

function sb() {
  return getServiceClient();
}

function fcOf(row: Record<string, unknown>): Record<string, unknown> {
  const meta = (row.metadata && typeof row.metadata === "object"
    ? row.metadata
    : {}) as Record<string, unknown>;
  const fc = (meta.financeCore && typeof meta.financeCore === "object"
    ? meta.financeCore
    : {}) as Record<string, unknown>;
  return fc;
}

export type SettleMovementHalf = {
  id: string;
  amount_minor: number;
  metadata: { offsetId?: string; role?: string } | null;
};

/** Pull shared offsetId + absolute major amount from either half's movement. */
export function resolveStoredSettlePair(
  clearOwes: SettleMovementHalf | null,
  applyCredit: SettleMovementHalf | null,
): { offsetId: string; amount: number } | null {
  const src = clearOwes || applyCredit;
  if (!src) return null;
  const meta = (src.metadata || {}) as { offsetId?: string };
  const offsetId = String(meta.offsetId || "").trim();
  const amount = round2(Math.abs(Number(src.amount_minor) || 0) / 100);
  if (!offsetId || !(amount > 0)) return null;
  return { offsetId, amount };
}

/** True only when both movements and both correction lines exist. */
export function bothSettleHalvesComplete(opts: {
  clearOwesMovement: boolean;
  applyCreditMovement: boolean;
  owingHasLine: boolean;
  creditHasLine: boolean;
}): boolean {
  return (
    opts.clearOwesMovement &&
    opts.applyCreditMovement &&
    opts.owingHasLine &&
    opts.creditHasLine
  );
}

export function periodHasSettleOffsetLine(
  row: Record<string, unknown> | null,
  offsetId: string,
): boolean {
  if (!row || !offsetId) return false;
  const fc = fcOf(row);
  const lines = Array.isArray(fc.correctionLines)
    ? (fc.correctionLines as CorrectionLine[])
    : [];
  return lines.some(
    (l) =>
      l.kind === "settle_from_balance" &&
      String((l as { offsetId?: string }).offsetId || "") === offsetId,
  );
}

async function loadPeriod(
  orgId: string,
  driverId: string,
  week: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("organization_id", orgId)
    .eq("driver_id", driverId)
    .eq("period_anchor", week)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown> | null) ?? null;
}

async function loadMovementHalf(
  orgId: string,
  idempotencyKey: string,
): Promise<SettleMovementHalf | null> {
  const { data, error } = await sb()
    .from("settlement_movements")
    .select("id, amount_minor, metadata")
    .eq("organization_id", orgId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) return null;
  return {
    id: String(data.id),
    amount_minor: Number(data.amount_minor) || 0,
    metadata: (data.metadata || null) as SettleMovementHalf["metadata"],
  };
}

async function appendSettleCorrection(opts: {
  orgId: string;
  driverId: string;
  week: string;
  peerWeek: string;
  amount: number;
  role: "clear_owes" | "apply_credit";
  offsetId: string;
  actorId: string | null;
  idempotencyKey: string;
  reason: string;
}): Promise<void> {
  const row = await loadPeriod(opts.orgId, opts.driverId, opts.week);
  if (!row) {
    throw new SettlementCommandError(
      "PERIOD_NOT_FOUND",
      `No financial period for week of ${opts.week}.`,
      404,
    );
  }
  assertPeriodNotFrozen(periodGateFromRow(row));
  await assertFrozenPeriodHashIntact(row as Parameters<typeof assertFrozenPeriodHashIntact>[0]);

  const meta = {
    ...((row.metadata && typeof row.metadata === "object"
      ? row.metadata
      : {}) as Record<string, unknown>),
  };
  const fc = { ...fcOf(row) };
  const existing = Array.isArray(fc.correctionLines)
    ? ([...(fc.correctionLines as CorrectionLine[])] as CorrectionLine[])
    : [];
  const lineKey = `settle_from_balance:${opts.offsetId}`;
  const already = existing.some(
    (l) =>
      l.kind === "settle_from_balance" &&
      String((l as { offsetId?: string }).offsetId || "") === opts.offsetId,
  );
  if (!already) {
    existing.push({
      sourceWeek: opts.peerWeek,
      amount: opts.amount,
      sentence: opts.reason,
      kind: "settle_from_balance",
      offsetId: opts.offsetId,
    });
  }
  fc.correctionLines = existing;
  fc.postedAdjustments = sumCorrectionLines(existing);
  meta.financeCore = fc;

  const { data: prior } = await sb()
    .from("settlement_movements")
    .select("id")
    .eq("organization_id", opts.orgId)
    .eq("idempotency_key", opts.idempotencyKey)
    .maybeSingle();
  if (!prior) {
    const movement = buildMovementRow({
      organizationId: opts.orgId,
      driverId: opts.driverId,
      periodAnchor: opts.week,
      kind: "correction",
      amountMinor: Math.round(opts.amount * 100),
      reason: opts.reason,
      actorId: opts.actorId,
      idempotencyKey: opts.idempotencyKey,
      metadata: {
        offsetId: opts.offsetId,
        peerWeek: opts.peerWeek,
        role: opts.role,
        lineKey,
      },
    });
    const { error: insErr } = await sb().from("settlement_movements").insert(movement);
    if (insErr && !/duplicate|unique/i.test(insErr.message || "")) {
      throw new Error(insErr.message);
    }
  }

  await persistPeriodRowWithVersion(opts.driverId, opts.week, {
    metadata: meta,
    updated_at: new Date().toISOString(),
  });
  await syncPeriodCashFromTransactions(opts.driverId, opts.week);
}

export async function settleFromBalance(opts: {
  organizationId: string;
  actorId: string | null;
  driverId: string;
  owingWeekStart: string;
  creditWeekStart: string;
  amount: number;
  idempotencyKey: string;
  note?: string;
}): Promise<{
  offsetId: string;
  amount: number;
  owingWeekStart: string;
  creditWeekStart: string;
  idempotent: boolean;
}> {
  const owingWeek = String(opts.owingWeekStart || "").slice(0, 10);
  const creditWeek = String(opts.creditWeekStart || "").slice(0, 10);
  const driverId = String(opts.driverId || "").trim();
  const idempotencyKey = String(opts.idempotencyKey || "").trim();

  if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(owingWeek) || !/^\d{4}-\d{2}-\d{2}$/.test(creditWeek)) {
    throw new SettlementCommandError(
      "INVALID_INPUT",
      "driverId, owingWeekStart, and creditWeekStart are required.",
      400,
    );
  }
  if (owingWeek === creditWeek) {
    throw new SettlementCommandError(
      "SAME_WEEK",
      "Owing week and credit week must be different.",
      400,
    );
  }
  if (!idempotencyKey) {
    throw new SettlementCommandError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "idempotencyKey is required.",
      400,
    );
  }

  const clearKey = `${idempotencyKey}:clear_owes`;
  const creditKey = `${idempotencyKey}:apply_credit`;
  const [clearMov, creditMov] = await Promise.all([
    loadMovementHalf(opts.organizationId, clearKey),
    loadMovementHalf(opts.organizationId, creditKey),
  ]);

  // Repair / complete path: at least one half already landed.
  if (clearMov || creditMov) {
    const stored = resolveStoredSettlePair(clearMov, creditMov);
    if (!stored) {
      throw new SettlementCommandError(
        "SETTLE_PAIR_CORRUPT",
        "A partial settle-from-balance exists but is missing offsetId or amount.",
        409,
      );
    }
    const { offsetId, amount } = stored;
    const noteSuffix = opts.note ? ` ${String(opts.note).trim()}` : "";
    const clearReason = `Netted against week of ${creditWeek}.${noteSuffix}`.trim();
    const creditReason = `Netted against week of ${owingWeek}.${noteSuffix}`.trim();

    const [owingRow, creditRow] = await Promise.all([
      loadPeriod(opts.organizationId, driverId, owingWeek),
      loadPeriod(opts.organizationId, driverId, creditWeek),
    ]);
    let owingHasLine = periodHasSettleOffsetLine(owingRow, offsetId);
    let creditHasLine = periodHasSettleOffsetLine(creditRow, offsetId);

    const alreadyComplete = bothSettleHalvesComplete({
      clearOwesMovement: !!clearMov,
      applyCreditMovement: !!creditMov,
      owingHasLine,
      creditHasLine,
    });
    if (alreadyComplete) {
      return {
        offsetId,
        amount,
        owingWeekStart: owingWeek,
        creditWeekStart: creditWeek,
        idempotent: true,
      };
    }

    await assertFinancePeriodNotLocked(opts.organizationId, owingWeek);
    await assertFinancePeriodNotLocked(opts.organizationId, creditWeek);

    // Write whichever half is missing (appendSettleCorrection is safe per offsetId).
    if (!clearMov || !owingHasLine) {
      await appendSettleCorrection({
        orgId: opts.organizationId,
        driverId,
        week: owingWeek,
        peerWeek: creditWeek,
        amount,
        role: "clear_owes",
        offsetId,
        actorId: opts.actorId,
        idempotencyKey: clearKey,
        reason: clearReason,
      });
    }
    if (!creditMov || !creditHasLine) {
      await appendSettleCorrection({
        orgId: opts.organizationId,
        driverId,
        week: creditWeek,
        peerWeek: owingWeek,
        amount: -amount,
        role: "apply_credit",
        offsetId,
        actorId: opts.actorId,
        idempotencyKey: creditKey,
        reason: creditReason,
      });
    }

    const [clearAfter, creditAfter, owingAfter, creditPeriodAfter] = await Promise.all([
      loadMovementHalf(opts.organizationId, clearKey),
      loadMovementHalf(opts.organizationId, creditKey),
      loadPeriod(opts.organizationId, driverId, owingWeek),
      loadPeriod(opts.organizationId, driverId, creditWeek),
    ]);
    owingHasLine = periodHasSettleOffsetLine(owingAfter, offsetId);
    creditHasLine = periodHasSettleOffsetLine(creditPeriodAfter, offsetId);
    if (
      !bothSettleHalvesComplete({
        clearOwesMovement: !!clearAfter,
        applyCreditMovement: !!creditAfter,
        owingHasLine,
        creditHasLine,
      })
    ) {
      throw new SettlementCommandError(
        "SETTLE_PAIR_INCOMPLETE",
        "Settle from balance could not finish both weeks. Retry with the same key.",
        409,
      );
    }

    return {
      offsetId,
      amount,
      owingWeekStart: owingWeek,
      creditWeekStart: creditWeek,
      idempotent: false,
    };
  }

  await assertFinancePeriodNotLocked(opts.organizationId, owingWeek);
  await assertFinancePeriodNotLocked(opts.organizationId, creditWeek);

  const owingRow = await loadPeriod(opts.organizationId, driverId, owingWeek);
  const creditRow = await loadPeriod(opts.organizationId, driverId, creditWeek);
  if (!owingRow) {
    throw new SettlementCommandError(
      "PERIOD_NOT_FOUND",
      `No financial period for owing week of ${owingWeek}.`,
      404,
    );
  }
  if (!creditRow) {
    throw new SettlementCommandError(
      "PERIOD_NOT_FOUND",
      `No financial period for credit week of ${creditWeek}.`,
      404,
    );
  }
  assertPeriodNotFrozen(periodGateFromRow(owingRow));
  assertPeriodNotFrozen(periodGateFromRow(creditRow));

  const validated = validateSettleFromBalanceAmount({
    amount: opts.amount,
    owingSettlement: Number(owingRow.settlement_amount) || 0,
    creditSettlement: Number(creditRow.settlement_amount) || 0,
  });
  if (!validated.ok) {
    throw new SettlementCommandError(validated.code, validated.message, 409);
  }

  const offsetId = crypto.randomUUID();
  const noteSuffix = opts.note ? ` ${String(opts.note).trim()}` : "";
  const clearReason = `Netted against week of ${creditWeek}.${noteSuffix}`.trim();
  const creditReason = `Netted against week of ${owingWeek}.${noteSuffix}`.trim();

  // Owing week first (+X clears driver owes), then credit week (−X).
  await appendSettleCorrection({
    orgId: opts.organizationId,
    driverId,
    week: owingWeek,
    peerWeek: creditWeek,
    amount: validated.amount,
    role: "clear_owes",
    offsetId,
    actorId: opts.actorId,
    idempotencyKey: clearKey,
    reason: clearReason,
  });
  await appendSettleCorrection({
    orgId: opts.organizationId,
    driverId,
    week: creditWeek,
    peerWeek: owingWeek,
    amount: -validated.amount,
    role: "apply_credit",
    offsetId,
    actorId: opts.actorId,
    idempotencyKey: creditKey,
    reason: creditReason,
  });

  return {
    offsetId,
    amount: validated.amount,
    owingWeekStart: owingWeek,
    creditWeekStart: creditWeek,
    idempotent: false,
  };
}
