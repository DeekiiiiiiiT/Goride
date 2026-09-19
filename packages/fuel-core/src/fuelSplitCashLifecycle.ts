/**
 * Split Cash Guardian — owns incomplete cash reimbursements waiting on Dominion.
 * Makes `splitReconciled && awaitingCashStatement` unrepresentable on write paths.
 */
import { isAwaitingCashStatement, metaOfSplit } from './fuelSplitPayment.ts';

/** Days without statement match before ops escalation. */
export const AWAITING_CASH_STALE_DAYS = 14;

function metaFlagOn(v: unknown): boolean {
  return v === true || v === 'true';
}

function fuelTxDateYmd(t: { date?: string }): string {
  const raw = String(t.date || '').trim();
  if (!raw) return '';
  if (raw.includes('T')) return raw.split('T')[0] || '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return '';
}

/** Minimal classify shape — avoids circular import with fuelReviewQueue. */
export type SplitCashClassifyFields = {
  date?: string;
  status?: string;
  amount?: number;
  metadata?: Record<string, unknown> | null;
};

export type SplitCashState =
  | 'awaiting'
  | 'variance'
  | 'stale'
  | 'resolved'
  | 'voided'
  | 'card_covered'
  | 'not_split_cash';

export type SplitCashResolveAction =
  | 'accept_derived'
  | 'enter_cash'
  | 'void'
  | 'card_covered_full'
  | 'statement_derived';

export type SplitCashResolveActor = {
  actorId?: string | null;
  at?: string;
  reason?: string;
};

/** Clear awaiting + force reconciled — never leave both flags true. */
export function normalizeSplitCashResolvedMeta(
  meta: Record<string, unknown> | null | undefined,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = meta && typeof meta === 'object' ? { ...meta } : {};
  return {
    ...base,
    ...extra,
    splitReconciled: true,
    awaitingCashStatement: false,
    splitVariance: false,
  };
}

/** Guard: if caller stamped reconciled while still awaiting, clear awaiting. */
export function assertSplitCashInvariant(meta: Record<string, unknown>): Record<string, unknown> {
  if (metaFlagOn(meta.splitReconciled) && metaFlagOn(meta.awaitingCashStatement)) {
    return { ...meta, awaitingCashStatement: false };
  }
  return meta;
}

function resolveStamp(
  action: SplitCashResolveAction,
  actor: SplitCashResolveActor = {},
): Record<string, unknown> {
  const at = actor.at || new Date().toISOString();
  const patch: Record<string, unknown> = {
    splitCashResolveAction: action,
    splitCashResolvedAt: at,
  };
  if (actor.actorId) patch.splitCashResolvedBy = actor.actorId;
  if (actor.reason && String(actor.reason).trim()) {
    patch.splitCashResolveReason = String(actor.reason).trim();
  }
  return patch;
}

/** Expense amount stored negative; derived/manual cash are positive magnitudes. */
export function cashExpenseAmount(positiveCash: number): number {
  const n = Math.round(Math.abs(Number(positiveCash) || 0) * 100) / 100;
  return n > 0 ? -n : 0;
}

export type SplitCashTxPatch = {
  amount: number;
  /** Only statuses a cash resolution can produce. */
  status?: 'Pending' | 'Rejected';
  date?: string;
  metadata: Record<string, unknown>;
};

/** Accept statement-derived cash (ops or auto-match). */
export function resolveSplitCashAcceptDerived(
  meta: Record<string, unknown> | null | undefined,
  derivedCashPositive: number,
  actor: SplitCashResolveActor = {},
): SplitCashTxPatch {
  const cash = Math.max(0, Math.round(Math.abs(Number(derivedCashPositive) || 0) * 100) / 100);
  if (cash <= 0) {
    return closeCardCoveredSplitCash(meta, actor);
  }
  return {
    amount: cashExpenseAmount(cash),
    status: 'Pending',
    metadata: normalizeSplitCashResolvedMeta(meta, {
      ...resolveStamp('accept_derived', actor),
      splitDerivedCashAmount: cash,
      splitVariance: false,
    }),
  };
}

/** Operator-entered cash amount with required reason. */
export function resolveSplitCashManual(
  meta: Record<string, unknown> | null | undefined,
  cashPositive: number,
  actor: SplitCashResolveActor,
): SplitCashTxPatch {
  const reason = String(actor.reason || '').trim();
  if (reason.length < 8) {
    throw new Error('split_cash_reason_required');
  }
  const cash = Math.round(Math.abs(Number(cashPositive) || 0) * 100) / 100;
  if (cash <= 0) {
    return resolveSplitCashVoid(meta, { ...actor, reason });
  }
  return {
    amount: cashExpenseAmount(cash),
    status: 'Pending',
    metadata: normalizeSplitCashResolvedMeta(meta, {
      ...resolveStamp('enter_cash', actor),
      splitDerivedCashAmount: cash,
      splitManualCashAmount: cash,
    }),
  };
}

/** Explicitly void the reimbursement — never leave $0 Pending awaiting. */
export function resolveSplitCashVoid(
  meta: Record<string, unknown> | null | undefined,
  actor: SplitCashResolveActor,
): SplitCashTxPatch {
  const reason = String(actor.reason || '').trim();
  if (reason.length < 8) {
    throw new Error('split_cash_reason_required');
  }
  return {
    amount: 0,
    status: 'Rejected',
    metadata: normalizeSplitCashResolvedMeta(meta, {
      ...resolveStamp('void', actor),
      splitCashVoided: true,
    }),
  };
}

/** Card covered the full pump — close without queue noise. */
export function closeCardCoveredSplitCash(
  meta: Record<string, unknown> | null | undefined,
  actor: SplitCashResolveActor = {},
): SplitCashTxPatch {
  return {
    amount: 0,
    status: 'Rejected',
    metadata: normalizeSplitCashResolvedMeta(meta, {
      ...resolveStamp('card_covered_full', {
        ...actor,
        reason: actor.reason || 'card_covered_full',
      }),
      splitDerivedCashAmount: 0,
      splitCashVoided: true,
      splitCardCoveredFull: true,
    }),
  };
}

/** Statement match auto-resolve (server). */
export function resolveSplitCashFromStatement(
  meta: Record<string, unknown> | null | undefined,
  derivedCashPositive: number,
  actor: SplitCashResolveActor = {},
): SplitCashTxPatch {
  const cash = Math.max(0, Math.round(Math.abs(Number(derivedCashPositive) || 0) * 100) / 100);
  if (cash <= 0) {
    return closeCardCoveredSplitCash(meta, actor);
  }
  return {
    amount: cashExpenseAmount(cash),
    status: 'Pending',
    metadata: normalizeSplitCashResolvedMeta(meta, {
      ...resolveStamp('statement_derived', actor),
      splitDerivedCashAmount: cash,
    }),
  };
}

export type CashRehomeStamp = {
  originalFillDate: string;
  fromWeekKey: string;
  toWeekKey: string;
  toDateYmd: string;
  at?: string;
};

export function stampCashRehomed(
  meta: Record<string, unknown>,
  stamp: CashRehomeStamp,
): Record<string, unknown> {
  return {
    ...meta,
    originalFillDate: stamp.originalFillDate,
    cashRehomedFromWeek: stamp.fromWeekKey,
    cashRehomedToWeek: stamp.toWeekKey,
    cashRehomedAt: stamp.at || new Date().toISOString(),
    cashRehomedToDate: stamp.toDateYmd,
  };
}

/** Audit-only stamp on card siblings — does not invent money or clear variance alone. */
export function stampSplitVarianceSiblingAudit(
  meta: Record<string, unknown> | null | undefined,
  action: SplitCashResolveAction,
  actor: SplitCashResolveActor = {},
): Record<string, unknown> {
  const base = meta && typeof meta === 'object' ? { ...meta } : {};
  return {
    ...base,
    splitVarianceResolutionId: action,
    splitVarianceAcknowledgedAt: actor.at || new Date().toISOString(),
    ...(actor.actorId ? { splitVarianceAcknowledgedBy: actor.actorId } : {}),
  };
}

function isSplitCashRow(t: SplitCashClassifyFields): boolean {
  const m = metaOfSplit(t.metadata);
  return (
    typeof m.fillGroupId === 'string' &&
    m.fillGroupId.length > 0 &&
    (m.splitRole === 'cash' || m.splitVolumeOwner === true || isAwaitingCashStatement(t.metadata))
  );
}

export function isAwaitingCashTx(t: SplitCashClassifyFields): boolean {
  return isSplitCashRow(t) && isAwaitingCashStatement(t.metadata);
}

export function isCardCoveredClosedTx(t: SplitCashClassifyFields): boolean {
  return metaFlagOn(t.metadata?.splitCardCoveredFull);
}

export function isVoidedSplitCashTx(t: SplitCashClassifyFields): boolean {
  if (metaFlagOn(t.metadata?.splitCashVoided)) return true;
  if (String(t.status || '') === 'Rejected' && isSplitCashRow(t) && !isAwaitingCashStatement(t.metadata)) {
    return metaFlagOn(t.metadata?.splitReconciled);
  }
  return false;
}

/** Parse YYYY-MM-DD → UTC midnight ms. */
function ymdToUtcMs(ymd: string): number | null {
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function daysAwaitingCash(t: SplitCashClassifyFields, now: Date = new Date()): number | null {
  if (!isAwaitingCashTx(t)) return null;
  const ymd = fuelTxDateYmd(t);
  const start = ymdToUtcMs(ymd);
  if (start == null) return null;
  const nowYmd = now.toISOString().slice(0, 10);
  const end = ymdToUtcMs(nowYmd);
  if (end == null) return null;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

export function isStaleAwaitingCash(
  t: SplitCashClassifyFields,
  now: Date = new Date(),
  thresholdDays: number = AWAITING_CASH_STALE_DAYS,
): boolean {
  const days = daysAwaitingCash(t, now);
  return days != null && days >= thresholdDays;
}

export function classifySplitCashState(
  t: SplitCashClassifyFields,
  now: Date = new Date(),
): SplitCashState {
  if (!isSplitCashRow(t)) return 'not_split_cash';
  if (isCardCoveredClosedTx(t)) return 'card_covered';
  if (isVoidedSplitCashTx(t) && !isAwaitingCashStatement(t.metadata)) return 'voided';
  if (isAwaitingCashStatement(t.metadata)) {
    if (metaFlagOn(t.metadata?.splitVariance) && !metaFlagOn(t.metadata?.splitReconciled)) {
      return 'variance';
    }
    if (isStaleAwaitingCash(t, now)) return 'stale';
    return 'awaiting';
  }
  if (metaFlagOn(t.metadata?.splitVariance) && !metaFlagOn(t.metadata?.splitReconciled)) {
    return 'variance';
  }
  return 'resolved';
}

/** Implied pump $/L for price-band cross-check. */
export function impliedSplitPumpPerLiter(pumpTotal: number, pumpLiters: number): number | null {
  const total = Math.abs(Number(pumpTotal) || 0);
  const liters = Number(pumpLiters) || 0;
  if (!(total > 0) || !(liters > 0)) return null;
  return Math.round((total / liters) * 100) / 100;
}

export type SplitPumpPriceOutlierPatch = {
  splitPumpPriceOutlier: boolean;
  splitPumpImpliedPerLiter?: number;
  splitPumpRetailEstimate?: number;
  splitPumpPriceOutlierPct?: number;
};

export function splitPumpPriceOutlierPatch(args: {
  pumpTotal: number;
  pumpLiters: number;
  retailEstimateJmd: number | null | undefined;
  outlierPct?: number;
}): SplitPumpPriceOutlierPatch {
  const implied = impliedSplitPumpPerLiter(args.pumpTotal, args.pumpLiters);
  const retail = Number(args.retailEstimateJmd);
  if (implied == null || !(retail > 0)) {
    return { splitPumpPriceOutlier: false };
  }
  const pct = args.outlierPct ?? 0.18;
  const outlier = (implied - retail) / retail >= pct;
  return {
    splitPumpPriceOutlier: outlier,
    splitPumpImpliedPerLiter: implied,
    splitPumpRetailEstimate: retail,
    splitPumpPriceOutlierPct: pct,
  };
}

/** Ops-facing line when cash was re-homed into a later week. */
export function describeSplitCashRehome(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const toWeek = String(meta.cashRehomedToWeek || '').slice(0, 10);
  if (!toWeek) return null;
  const fill = String(meta.originalFillDate || '').slice(0, 10);
  const fromWeek = String(meta.cashRehomedFromWeek || '').slice(0, 10);
  if (fill && fromWeek) {
    return `Moved from fill ${fill} (week ${fromWeek})`;
  }
  if (fill) return `Moved from fill ${fill}`;
  return `Moved from earlier week into ${toWeek}`;
}

/** Ops-facing callout when re-home could not land money. */
export function describeSplitCashRehomeBlocked(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || typeof meta !== 'object') return null;
  if (!metaFlagOn(meta.splitCashRehomeBlocked)) return null;
  const reason = String(meta.splitCashRehomeBlockedReason || 'no_open_period');
  if (reason === 'missing_identity') {
    return 'Cannot post this cash — fill is missing driver or organization. Assign the driver, then re-import the statement.';
  }
  return 'No open week to post this cash — reopen or create a later fuel period.';
}

export type SplitCashRehomeBlockedReason = 'missing_identity' | 'no_open_period';

export type SplitCashPeriodLandingDecision =
  | {
      action: 'write_in_place';
      fillWeekKey: string;
      originalFillDate: string;
    }
  | {
      action: 'rehome';
      fillWeekKey: string;
      originalFillDate: string;
      toWeekKey: string;
      toDateYmd: string;
    }
  | {
      action: 'blocked_no_open_target';
      fillWeekKey: string;
      originalFillDate: string;
      blockedReason: SplitCashRehomeBlockedReason;
    };

/**
 * Pure C1 landing decision — Deno planner fetches seal state then calls this.
 * Missing identity fails closed (never write_in_place).
 */
export function classifySplitCashPeriodLanding(opts: {
  orgId: string;
  driverId: string;
  fillWeekKey: string;
  originalFillDate: string;
  fillWeekSealed: boolean;
  openTargetWeek: string | null;
}): SplitCashPeriodLandingDecision {
  const fillWeekKey = String(opts.fillWeekKey || '').slice(0, 10);
  const originalFillDate = String(opts.originalFillDate || '').slice(0, 10) || fillWeekKey;

  if (!opts.orgId || !opts.driverId || !fillWeekKey) {
    return {
      action: 'blocked_no_open_target',
      fillWeekKey: fillWeekKey || originalFillDate,
      originalFillDate,
      blockedReason: 'missing_identity',
    };
  }

  if (!opts.fillWeekSealed) {
    return {
      action: 'write_in_place',
      fillWeekKey,
      originalFillDate,
    };
  }

  const toWeekKey = opts.openTargetWeek ? String(opts.openTargetWeek).slice(0, 10) : '';
  if (!toWeekKey) {
    return {
      action: 'blocked_no_open_target',
      fillWeekKey,
      originalFillDate,
      blockedReason: 'no_open_period',
    };
  }

  return {
    action: 'rehome',
    fillWeekKey,
    originalFillDate,
    toWeekKey,
    toDateYmd: toWeekKey,
  };
}

/** Driver-entry meta fields mirrored onto the cash sibling at match time. */
export type SplitCashMatchDriverMeta = {
  splitVariance?: unknown;
  splitReconciled?: unknown;
  splitDerivedCashAmount?: unknown;
  splitVarianceDelta?: unknown;
  splitStatementAmount?: unknown;
  splitPumpTotal?: unknown;
  splitExpectedCardAmount?: unknown;
  splitPumpPriceOutlier?: unknown;
  splitPumpImpliedPerLiter?: unknown;
  splitPumpRetailEstimate?: unknown;
};

function priceOutlierCarry(drvMeta: SplitCashMatchDriverMeta): Record<string, unknown> {
  if (drvMeta.splitPumpPriceOutlier !== true && drvMeta.splitPumpPriceOutlier !== 'true') {
    return {};
  }
  return {
    splitPumpPriceOutlier: drvMeta.splitPumpPriceOutlier,
    ...(drvMeta.splitPumpImpliedPerLiter != null
      ? { splitPumpImpliedPerLiter: drvMeta.splitPumpImpliedPerLiter }
      : {}),
    ...(drvMeta.splitPumpRetailEstimate != null
      ? { splitPumpRetailEstimate: drvMeta.splitPumpRetailEstimate }
      : {}),
  };
}

export type SplitCashMatchTxInput = {
  id: string;
  date?: string;
  status?: string;
  amount?: number;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type ApplySplitCashMatchResult =
  | {
      outcome: 'skipped_not_reconciled';
      tx: SplitCashMatchTxInput;
      fuelEntryAmount?: never;
      fuelEntryMeta?: never;
    }
  | {
      outcome: 'blocked';
      blockedReason: SplitCashRehomeBlockedReason;
      fillWeekKey: string;
      tx: SplitCashMatchTxInput;
      /** Never mutate sealed-week money — amount/date unchanged. */
      amountMutated: false;
    }
  | {
      outcome: 'write_in_place' | 'rehome' | 'card_covered';
      tx: SplitCashMatchTxInput;
      rehomeToWeek?: string;
      fuelEntryAmount: number;
      fuelEntryMeta: Record<string, unknown>;
    };

/**
 * Pure persistFuelMatchPair cash-sibling apply — I/O stays at the edge.
 * A sealed week never receives a money write when landing is blocked.
 */
export function applySplitCashMatchToTx(args: {
  tx: SplitCashMatchTxInput;
  plan: SplitCashPeriodLandingDecision;
  derivedCashPositive: number;
  drvMeta: SplitCashMatchDriverMeta;
  reconciled: boolean;
}): ApplySplitCashMatchResult {
  const { tx, plan, drvMeta, reconciled } = args;
  const tm =
    tx.metadata && typeof tx.metadata === 'object' ? { ...tx.metadata } : ({} as Record<string, unknown>);
  const derivedCash = Math.abs(Number(args.derivedCashPositive) || 0);
  const outlier = priceOutlierCarry(drvMeta);

  if (!reconciled) {
    const nextMeta = assertSplitCashInvariant({
      ...tm,
      splitReconciled: false,
      splitVariance: true,
      splitVarianceDelta: drvMeta.splitVarianceDelta,
      splitStatementAmount: drvMeta.splitStatementAmount,
      splitDerivedCashAmount: drvMeta.splitDerivedCashAmount,
      splitPumpTotal: drvMeta.splitPumpTotal,
      splitExpectedCardAmount: drvMeta.splitExpectedCardAmount,
      awaitingCashStatement: true,
      ...outlier,
    });
    return {
      outcome: 'skipped_not_reconciled',
      tx: { ...tx, metadata: nextMeta },
    };
  }

  if (plan.action === 'blocked_no_open_target') {
    const blockedReason = plan.blockedReason || 'no_open_period';
    const blockedMeta = assertSplitCashInvariant({
      ...tm,
      splitReconciled: false,
      splitVariance: true,
      splitVarianceDelta: drvMeta.splitVarianceDelta,
      splitStatementAmount: drvMeta.splitStatementAmount,
      splitDerivedCashAmount: derivedCash,
      splitPumpTotal: drvMeta.splitPumpTotal,
      awaitingCashStatement: true,
      splitCashRehomeBlocked: true,
      splitCashRehomeBlockedWeek: plan.fillWeekKey,
      splitCashRehomeBlockedReason: blockedReason,
      ...outlier,
    });
    return {
      outcome: 'blocked',
      blockedReason,
      fillWeekKey: plan.fillWeekKey,
      amountMutated: false,
      tx: {
        ...tx,
        // Explicit: sealed fill amount/date must not change
        amount: tx.amount,
        date: tx.date,
        metadata: blockedMeta,
      },
    };
  }

  const patch = resolveSplitCashFromStatement(tm, derivedCash);
  let nextMeta = assertSplitCashInvariant({
    ...patch.metadata,
    splitStatementAmount: drvMeta.splitStatementAmount,
    splitPumpTotal: drvMeta.splitPumpTotal,
    splitExpectedCardAmount: drvMeta.splitExpectedCardAmount,
    ...outlier,
  });
  let nextDate = tx.date;
  let rehomeToWeek: string | undefined;
  let outcome: 'write_in_place' | 'rehome' | 'card_covered' = 'write_in_place';

  if (plan.action === 'rehome') {
    nextMeta = stampCashRehomed(nextMeta, {
      originalFillDate: plan.originalFillDate,
      fromWeekKey: plan.fillWeekKey,
      toWeekKey: plan.toWeekKey,
      toDateYmd: plan.toDateYmd,
    });
    nextDate = plan.toDateYmd;
    rehomeToWeek = plan.toWeekKey;
    outcome = 'rehome';
  }

  if (patch.metadata.splitCardCoveredFull === true) {
    outcome = 'card_covered';
  }

  const fuelEntryMeta = assertSplitCashInvariant({
    ...tm,
    awaitingCashStatement: false,
    splitReconciled: true,
    splitVariance: false,
    splitDerivedCashAmount: derivedCash,
    splitStatementAmount: drvMeta.splitStatementAmount,
    splitPumpTotal: drvMeta.splitPumpTotal,
    ...outlier,
    ...(outcome === 'card_covered'
      ? { splitCardCoveredFull: true, splitCashVoided: true }
      : {}),
  });

  return {
    outcome,
    rehomeToWeek,
    fuelEntryAmount: derivedCash,
    fuelEntryMeta,
    tx: {
      ...tx,
      amount: patch.amount,
      status: patch.status || tx.status,
      date: nextDate,
      metadata: nextMeta,
    },
  };
}
