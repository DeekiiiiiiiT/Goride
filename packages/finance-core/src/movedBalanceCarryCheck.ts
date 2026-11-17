import { round2 } from './money.ts';
import type { CloseBlocker } from './closeInvariants.ts';
import type { PeriodInvariantDrift, PersistedPeriodRow } from './periodInvariants.ts';
import {
  balanceMovedToOpenWeekAmount,
  carriedBalanceCorrectionAmount,
  correctionLinesForSourceWeek,
  FUEL_SHARE_TOOL_POSTED_ON,
  resolveSealedResidualSettlement,
  sumCorrectionLinesForSourceWeek,
  type CorrectionLine,
} from './fuelShareCorrection.ts';

const CARRY_EPS = 0.01;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type FinanceCoreMovedBalance = {
  balanceMovedTo?: unknown;
  legacyCleanup?: unknown;
  legacyKeptAmount?: unknown;
  correctionLines?: unknown;
};

export type MovedBalanceSourceInput = {
  periodAnchor: string;
  metadata?: Record<string, unknown> | null;
  balanceMovedTo?: string | null;
  liveSettlementAmount?: number | null;
  projectedAt?: string | null;
  preFuelToolSettlement?: number | null;
  earliestRevisionSettlement?: number | null;
  revisionCreatedAt?: string | null;
  driverShare?: number | null;
  fuelDeduction?: number | null;
  cashCollected?: number | null;
  cashReturned?: number | null;
  tollChargedToDriver?: number | null;
  tollCashSpend?: number | null;
  fuelDriverSpend?: number | null;
  cashWrittenOff?: number | null;
  settlementPaid?: number | null;
  tipsPaidToDriver?: number | null;
};

export type MovedBalanceNotCarriedItem = {
  sourceWeek: string;
  missingAmount: number;
  postedTotal: number;
  expectedTotal: number;
};

function financeCoreOf(meta: Record<string, unknown> | null | undefined): FinanceCoreMovedBalance {
  return ((meta?.financeCore as FinanceCoreMovedBalance) || {}) as FinanceCoreMovedBalance;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatShortWeekLabel(ymd: string): string {
  const parts = String(ymd).slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || !Number.isFinite(parts[1])) return String(ymd).slice(0, 10);
  const d = parts[2];
  const m = MONTHS[parts[1] - 1] || String(parts[1]);
  return `${d} ${m}`;
}

export function formatJmdMajor(amount: number): string {
  const body = Math.abs(Number(amount) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `J$${body}`;
}

/** Plain words for step 7 and close preview. */
export function movedBalanceNotCarriedMessage(sourceWeek: string, missingAmount: number): string {
  const label = formatShortWeekLabel(sourceWeek);
  return `Week of ${label}: ${formatJmdMajor(missingAmount)} of his balance never reached this week`;
}

export function preFuelToolSettlementFromProjected(
  liveSettlement: number,
  projectedAt: string | null | undefined,
): number | null {
  const projectedDay = String(projectedAt || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(projectedDay)) return null;
  if (projectedDay >= FUEL_SHARE_TOOL_POSTED_ON) return null;
  return round2(liveSettlement);
}

export function movedBalanceSourceInputFromPeriodRow(
  row: PersistedPeriodRow & { projected_at?: string | null },
): MovedBalanceSourceInput | null {
  const fc = financeCoreOf(row.metadata || null);
  const moved = String(fc.balanceMovedTo || '').slice(0, 10);
  if (!moved) return null;
  const live = num(row.settlement_amount);
  return {
    periodAnchor: String(row.period_anchor || '').slice(0, 10),
    metadata: row.metadata || null,
    balanceMovedTo: moved,
    liveSettlementAmount: live,
    projectedAt: row.projected_at != null ? String(row.projected_at) : null,
    preFuelToolSettlement: preFuelToolSettlementFromProjected(
      live,
      row.projected_at != null ? String(row.projected_at) : null,
    ),
    driverShare: row.driver_share,
    fuelDeduction: row.fuel_deduction,
    cashCollected: row.cash_collected,
    cashReturned: row.cash_returned,
    tollChargedToDriver: row.toll_charged_to_driver,
    tollCashSpend: row.toll_cash_spend,
    fuelDriverSpend: row.fuel_driver_spend,
    cashWrittenOff: row.cash_written_off,
    settlementPaid: row.settlement_paid,
    tipsPaidToDriver: row.tips_paid_to_driver,
  };
}

/** Skip fully written-off legacy weeks with nothing kept onto the landing week. */
export function shouldSkipMovedBalanceSource(fc: FinanceCoreMovedBalance): boolean {
  if (String(fc.legacyCleanup || '') !== 'written_off') return false;
  const keep = Math.abs(num(fc.legacyKeptAmount));
  return keep <= CARRY_EPS;
}

export function residualBaseForCarryCheck(fc: FinanceCoreMovedBalance, sealed: number): number {
  const cleanup = String(fc.legacyCleanup || '');
  if (cleanup === 'carried' || cleanup === 'written_off') {
    const keep = num(fc.legacyKeptAmount);
    if (Math.abs(keep) > CARRY_EPS) return round2(keep);
  }
  return sealed;
}

export function fuelShareDeltaForSourceWeek(
  sourceWeek: string,
  landingLines: CorrectionLine[] | null | undefined,
  source: MovedBalanceSourceInput,
  sealedResidual: number,
): number {
  const fuelLine = correctionLinesForSourceWeek(landingLines, sourceWeek).find(
    (line) => line.kind === 'fuel_share',
  );
  if (fuelLine) return round2(num(fuelLine.amount));
  // No fuel_share line = no fuel fix for this week. The 25 Oct tool posted a line for every week it
  // fixed; recomputing here applies today's formula to an old (often legacy half) balance and invents
  // a gap (live 17 Nov: Dec 29 −16,229.74, Jan 12 −2,580 false blockers).
  void source;
  void sealedResidual;
  return 0;
}

export type CheckMovedBalanceCarriedInput = {
  landingWeek: string;
  landingCorrectionLines: CorrectionLine[] | null | undefined;
  sources: MovedBalanceSourceInput[];
};

export function checkMovedBalanceCarried(input: CheckMovedBalanceCarriedInput): MovedBalanceNotCarriedItem[] {
  const landing = String(input.landingWeek).slice(0, 10);
  const items: MovedBalanceNotCarriedItem[] = [];
  for (const source of input.sources) {
    const sourceWeek = String(source.periodAnchor).slice(0, 10);
    const fc = financeCoreOf(source.metadata);
    if (shouldSkipMovedBalanceSource(fc)) continue;

    const sealed = resolveSealedResidualSettlement({
      metadata: source.metadata,
      liveSettlementAmount: source.liveSettlementAmount,
      balanceMovedTo: source.balanceMovedTo ?? landing,
      earliestRevisionSettlement: source.earliestRevisionSettlement,
      revisionCreatedAt: source.revisionCreatedAt,
      preFuelToolSettlement: source.preFuelToolSettlement,
      projectedAt: source.projectedAt,
    });
    if (!Number.isFinite(sealed)) continue;

    const residualBase = residualBaseForCarryCheck(fc, sealed);

    const fuelDelta = fuelShareDeltaForSourceWeek(
      sourceWeek,
      input.landingCorrectionLines,
      source,
      residualBase,
    );
    const existingForWeek = correctionLinesForSourceWeek(input.landingCorrectionLines, sourceWeek);
    const missing = carriedBalanceCorrectionAmount(residualBase, fuelDelta, existingForWeek);
    if (Math.abs(missing) <= CARRY_EPS) continue;

    const expectedTotal = balanceMovedToOpenWeekAmount(residualBase, fuelDelta);
    const postedTotal = sumCorrectionLinesForSourceWeek(input.landingCorrectionLines, sourceWeek);
    items.push({
      sourceWeek,
      missingAmount: missing,
      postedTotal,
      expectedTotal,
    });
  }
  return items;
}

export function movedBalanceItemsToCloseBlockers(
  items: MovedBalanceNotCarriedItem[],
  ctx: { driverId?: string; week: string },
): CloseBlocker[] {
  return items.map((item) => ({
    code: 'MOVED_BALANCE_NOT_CARRIED',
    severity: 'block' as const,
    driverId: ctx.driverId,
    week: String(ctx.week).slice(0, 10),
    sourceId: item.sourceWeek,
    persisted: round2(item.postedTotal),
    expected: round2(item.expectedTotal),
    delta: round2(item.missingAmount),
    message: movedBalanceNotCarriedMessage(item.sourceWeek, item.missingAmount),
  }));
}

export function checkMovedBalanceCarryDrifts(
  landingRow: PersistedPeriodRow,
  sources: MovedBalanceSourceInput[],
): PeriodInvariantDrift[] {
  const landingWeek = String(landingRow.period_anchor || '').slice(0, 10);
  const fc = financeCoreOf(landingRow.metadata || null);
  const landingLines = Array.isArray(fc.correctionLines)
    ? (fc.correctionLines as CorrectionLine[])
    : [];
  const items = checkMovedBalanceCarried({
    landingWeek,
    landingCorrectionLines: landingLines,
    sources,
  });
  return items.map((item) => ({
    driverId: landingRow.driver_id != null ? String(landingRow.driver_id) : undefined,
    week: landingWeek,
    kind: 'MOVED_BALANCE_NOT_CARRIED',
    persisted: round2(item.postedTotal),
    expected: round2(item.expectedTotal),
  }));
}