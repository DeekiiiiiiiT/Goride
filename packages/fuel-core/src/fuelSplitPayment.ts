/**
 * Split fill (Gas Card + Cash) — shared contract.
 * Two ledger rows linked by fillGroupId. Driver confirms pump total + liters only;
 * cash amount is derived after Dominion statement: cash = pump − card.
 * Cash owns volume. Cash reimbursement waits on statement.
 */

export type FuelSplitRole = 'cash' | 'card';

/** Metadata stamped on both split rows (and cash tx metadata). */
export type FuelSplitMetadata = {
  fillGroupId: string;
  splitRole: FuelSplitRole;
  splitPumpTotal: number;
  /** @deprecated Legacy driver card claim — new fills omit this. */
  splitExpectedCardAmount?: number;
  /** Cash row true; card row false forever. */
  splitVolumeOwner: boolean;
  /** Cash tx/entry waits for statement before reimbursement amount is known. */
  awaitingCashStatement?: boolean;
  splitReconciled?: boolean;
  splitVariance?: boolean;
  splitVarianceDelta?: number;
  splitStatementAmount?: number;
  /** Derived cash after statement (pump − card). */
  splitDerivedCashAmount?: number;
  /** Statement liters kept for audit when volume owner is false. */
  splitStatementLiters?: number;
};

/** Floor JMD tolerance for statement vs pump (negative-cash guard). */
export const SPLIT_RECON_TOLERANCE_FLOOR_JMD = 50;

/** Fraction of pump total used as tolerance (with floor). */
export const SPLIT_RECON_TOLERANCE_PCT = 0.01;

/** Must stay in sync with inlined Math.max(50, pumpTotal * 0.01) in
 * packages/roam-shared/.../jaaFuelStatementMatcher.ts and
 * supabase/functions/_fleet-server/fuel_jaa_match.ts */
export function splitReconTolerance(pumpTotal: number): number {
  const total = Math.abs(Number(pumpTotal) || 0);
  return Math.max(SPLIT_RECON_TOLERANCE_FLOOR_JMD, total * SPLIT_RECON_TOLERANCE_PCT);
}

/** Cash portion after statement: pump total − card statement amount. */
export function deriveSplitCashAmount(pumpTotal: number, statementCardAmount: number): number {
  const total = Number(pumpTotal) || 0;
  const card = Math.abs(Number(statementCardAmount) || 0);
  return Math.round((total - card) * 100) / 100;
}

/** @deprecated Prefer deriveSplitCashAmount — kept for legacy claim UI/tests. */
export function deriveSplitCardAmount(pumpTotal: number, cashAmount: number): number {
  const total = Number(pumpTotal) || 0;
  const cash = Number(cashAmount) || 0;
  return Math.round((total - cash) * 100) / 100;
}

export type SplitPumpValidation =
  | { ok: true; pumpTotal: number; liters: number }
  | { ok: false; error: string };

/** Validate pump confirm fields only (OCR confirm / OCR-miss typing). */
export function validateSplitPumpAmounts(
  pumpTotalRaw: number | string,
  litersRaw: number | string,
): SplitPumpValidation {
  const pumpTotal = typeof pumpTotalRaw === 'string' ? parseFloat(pumpTotalRaw) : Number(pumpTotalRaw);
  const liters = typeof litersRaw === 'string' ? parseFloat(litersRaw) : Number(litersRaw);
  if (!Number.isFinite(pumpTotal) || pumpTotal <= 0) {
    return { ok: false, error: 'Pump total must be greater than zero' };
  }
  if (!Number.isFinite(liters) || liters <= 0) {
    return { ok: false, error: 'Liters must be greater than zero' };
  }
  return { ok: true, pumpTotal, liters };
}

/** @deprecated Legacy typed-cash validation — new fills use validateSplitPumpAmounts. */
export type SplitCashValidation =
  | { ok: true; cash: number; card: number; pumpTotal: number }
  | { ok: false; error: string };

/** @deprecated Legacy — driver no longer types cash. */
export function validateSplitCashAmounts(
  pumpTotalRaw: number | string,
  cashRaw: number | string,
): SplitCashValidation {
  const pumpTotal = typeof pumpTotalRaw === 'string' ? parseFloat(pumpTotalRaw) : Number(pumpTotalRaw);
  const cash = typeof cashRaw === 'string' ? parseFloat(cashRaw) : Number(cashRaw);
  if (!Number.isFinite(pumpTotal) || pumpTotal <= 0) {
    return { ok: false, error: 'Pump total must be greater than zero' };
  }
  if (!Number.isFinite(cash) || cash <= 0) {
    return { ok: false, error: 'Cash amount must be greater than zero' };
  }
  if (cash >= pumpTotal) {
    return { ok: false, error: 'Cash must be less than the pump total (card covers the rest)' };
  }
  const card = deriveSplitCardAmount(pumpTotal, cash);
  if (card <= 0) {
    return { ok: false, error: 'Gas card portion must be greater than zero' };
  }
  return { ok: true, cash, card, pumpTotal };
}

export function metaOfSplit(meta: Record<string, unknown> | null | undefined): Partial<FuelSplitMetadata> {
  if (!meta || typeof meta !== 'object') return {};
  return meta as Partial<FuelSplitMetadata>;
}

export function isSplitFillMeta(meta: Record<string, unknown> | null | undefined): boolean {
  const m = metaOfSplit(meta);
  return typeof m.fillGroupId === 'string' && m.fillGroupId.length > 0;
}

export function isSplitVolumeOwner(meta: Record<string, unknown> | null | undefined): boolean {
  const m = metaOfSplit(meta);
  return m.splitVolumeOwner === true;
}

/** Card sibling that must never receive statement liters into ops totals. */
export function isSplitNonVolumeOwner(meta: Record<string, unknown> | null | undefined): boolean {
  const m = metaOfSplit(meta);
  return isSplitFillMeta(meta) && m.splitVolumeOwner === false;
}

export function isAwaitingCashStatement(meta: Record<string, unknown> | null | undefined): boolean {
  const v = metaOfSplit(meta).awaitingCashStatement as unknown;
  return v === true || v === 'true';
}

export type SplitReconResult =
  | { status: 'reconciled'; delta: number; tolerance: number; derivedCash: number }
  | { status: 'variance'; delta: number; tolerance: number; derivedCash: number };

/**
 * Statement vs pump: OK when card ≤ pump + tolerance (cash ≥ 0).
 * Variance when statement would make negative cash.
 * Legacy: if splitExpectedCardAmount present, also compare stmt vs claim.
 */
export function evaluateSplitStatementRecon(
  statementAmount: number,
  pumpTotal: number,
  legacyExpectedCardAmount?: number | null,
): SplitReconResult {
  const stmt = Math.abs(Number(statementAmount) || 0);
  const pump = Math.abs(Number(pumpTotal) || 0);
  const tolerance = splitReconTolerance(pump);
  const derivedCash = deriveSplitCashAmount(pump, stmt);
  // How far statement exceeds pump (positive = over-charge vs pump)
  const overPump = Math.round((stmt - pump) * 100) / 100;

  if (stmt <= 0) {
    return { status: 'variance', delta: overPump, tolerance, derivedCash };
  }

  // Statement within pump + tolerance → cash non-negative (or tiny rounding)
  if (stmt <= pump + tolerance && derivedCash >= -tolerance) {
    // Legacy dual-read: if old claim exists and disagrees with stmt beyond tolerance, still variance
    if (legacyExpectedCardAmount != null && Number.isFinite(Number(legacyExpectedCardAmount))) {
      const expected = Math.abs(Number(legacyExpectedCardAmount) || 0);
      const claimDelta = Math.round((stmt - expected) * 100) / 100;
      if (Math.abs(claimDelta) > tolerance) {
        return { status: 'variance', delta: claimDelta, tolerance, derivedCash };
      }
    }
    return {
      status: 'reconciled',
      delta: overPump > 0 ? overPump : 0,
      tolerance,
      derivedCash: Math.max(0, derivedCash),
    };
  }

  return { status: 'variance', delta: overPump, tolerance, derivedCash };
}

/** @deprecated Use evaluateSplitStatementRecon. */
export function evaluateSplitCardRecon(
  statementAmount: number,
  expectedCardAmount: number,
  pumpTotal: number,
): SplitReconResult {
  return evaluateSplitStatementRecon(statementAmount, pumpTotal, expectedCardAmount);
}

/** Build metadata patches after statement match on the card row. */
export function splitReconMetadataPatch(
  drvMeta: Record<string, unknown>,
  statementAmount: number,
  statementLiters: number | null | undefined,
): Record<string, unknown> {
  const pumpTotal = Number(drvMeta.splitPumpTotal) || 0;
  const legacyExpected =
    drvMeta.splitExpectedCardAmount != null ? Number(drvMeta.splitExpectedCardAmount) : null;
  const recon = evaluateSplitStatementRecon(statementAmount, pumpTotal, legacyExpected);
  const litersPatch =
    statementLiters != null ? { splitStatementLiters: Number(statementLiters) || 0 } : {};

  if (recon.status === 'reconciled') {
    return {
      splitReconciled: true,
      splitVariance: false,
      splitVarianceDelta: recon.delta,
      splitStatementAmount: statementAmount,
      splitDerivedCashAmount: recon.derivedCash,
      awaitingCashStatement: false,
      ...litersPatch,
    };
  }
  return {
    splitReconciled: false,
    splitVariance: true,
    splitVarianceDelta: recon.delta,
    splitStatementAmount: statementAmount,
    splitDerivedCashAmount: recon.derivedCash,
    // Keep awaiting until ops resolves negative-cash variance
    awaitingCashStatement: true,
    ...litersPatch,
  };
}

export function buildCashSplitMetadata(args: {
  fillGroupId: string;
  splitPumpTotal: number;
}): FuelSplitMetadata {
  return {
    fillGroupId: args.fillGroupId,
    splitRole: 'cash',
    splitPumpTotal: args.splitPumpTotal,
    splitVolumeOwner: true,
    awaitingCashStatement: true,
  };
}

export function buildCardSplitMetadata(args: {
  fillGroupId: string;
  splitPumpTotal: number;
}): FuelSplitMetadata {
  return {
    fillGroupId: args.fillGroupId,
    splitRole: 'card',
    splitPumpTotal: args.splitPumpTotal,
    splitVolumeOwner: false,
  };
}
