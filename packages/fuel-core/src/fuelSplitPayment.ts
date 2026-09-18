/**
 * Split fill (Gas Card + Cash) — shared contract.
 * Two ledger rows linked by fillGroupId; cash is typed, card is derived then
 * reconciled by Dominion statement. Cash owns volume.
 */

export type FuelSplitRole = 'cash' | 'card';

/** Metadata stamped on both split rows (and cash tx metadata). */
export type FuelSplitMetadata = {
  fillGroupId: string;
  splitRole: FuelSplitRole;
  splitPumpTotal: number;
  /** Card row only — driver's claim before statement. */
  splitExpectedCardAmount?: number;
  /** Cash row true; card row false forever. */
  splitVolumeOwner: boolean;
  splitReconciled?: boolean;
  splitVariance?: boolean;
  splitVarianceDelta?: number;
  splitStatementAmount?: number;
  /** Statement liters kept for audit when volume owner is false. */
  splitStatementLiters?: number;
};

/** Floor JMD tolerance for statement vs expected card amount. */
export const SPLIT_RECON_TOLERANCE_FLOOR_JMD = 50;

/** Fraction of pump total used as tolerance (with floor). */
export const SPLIT_RECON_TOLERANCE_PCT = 0.01;

export function splitReconTolerance(pumpTotal: number): number {
  const total = Math.abs(Number(pumpTotal) || 0);
  return Math.max(SPLIT_RECON_TOLERANCE_FLOOR_JMD, total * SPLIT_RECON_TOLERANCE_PCT);
}

/** Derive card claim from pump total and typed cash. */
export function deriveSplitCardAmount(pumpTotal: number, cashAmount: number): number {
  const total = Number(pumpTotal) || 0;
  const cash = Number(cashAmount) || 0;
  return Math.round((total - cash) * 100) / 100;
}

export type SplitCashValidation =
  | { ok: true; cash: number; card: number; pumpTotal: number }
  | { ok: false; error: string };

/** Validate typed cash: 0 < cash < pumpTotal. */
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

export type SplitReconResult =
  | { status: 'reconciled'; delta: number; tolerance: number }
  | { status: 'variance'; delta: number; tolerance: number };

/** Compare statement card amount to driver's expected card claim. */
export function evaluateSplitCardRecon(
  statementAmount: number,
  expectedCardAmount: number,
  pumpTotal: number,
): SplitReconResult {
  const stmt = Math.abs(Number(statementAmount) || 0);
  const expected = Math.abs(Number(expectedCardAmount) || 0);
  const delta = Math.round((stmt - expected) * 100) / 100;
  const tolerance = splitReconTolerance(pumpTotal);
  if (Math.abs(delta) <= tolerance) {
    return { status: 'reconciled', delta, tolerance };
  }
  return { status: 'variance', delta, tolerance };
}

/** Build metadata patches after statement match on the card row. */
export function splitReconMetadataPatch(
  drvMeta: Record<string, unknown>,
  statementAmount: number,
  statementLiters: number | null | undefined,
): Record<string, unknown> {
  const expected = Number(drvMeta.splitExpectedCardAmount) || 0;
  const pumpTotal = Number(drvMeta.splitPumpTotal) || 0;
  const recon = evaluateSplitCardRecon(statementAmount, expected, pumpTotal);
  if (recon.status === 'reconciled') {
    return {
      splitReconciled: true,
      splitVariance: false,
      splitVarianceDelta: recon.delta,
      splitStatementAmount: statementAmount,
      ...(statementLiters != null ? { splitStatementLiters: Number(statementLiters) || 0 } : {}),
    };
  }
  return {
    splitReconciled: false,
    splitVariance: true,
    splitVarianceDelta: recon.delta,
    splitStatementAmount: statementAmount,
    ...(statementLiters != null ? { splitStatementLiters: Number(statementLiters) || 0 } : {}),
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
  };
}

export function buildCardSplitMetadata(args: {
  fillGroupId: string;
  splitPumpTotal: number;
  splitExpectedCardAmount: number;
}): FuelSplitMetadata {
  return {
    fillGroupId: args.fillGroupId,
    splitRole: 'card',
    splitPumpTotal: args.splitPumpTotal,
    splitExpectedCardAmount: args.splitExpectedCardAmount,
    splitVolumeOwner: false,
  };
}
