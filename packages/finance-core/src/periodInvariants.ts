import { computePeriodSettlement } from './driverPeriodSettlement.ts';
import type { PeriodSettlementResult } from './driverPeriodSettlement.ts';
import { round2 } from './money.ts';
import { computeExpectedCashStillHeld, resolvePeriodTollCashWash } from './periodTollCashWash.ts';

const DRIFT_EPS = 0.01;

export type PersistedPeriodRow = {
  driver_id?: string | null;
  period_anchor?: string | null;
  cash_collected?: number | null;
  cash_returned?: number | null;
  cash_written_off?: number | null;
  cash_still_held?: number | null;
  settlement_amount?: number | null;
  settlement_paid?: number | null;
  payout_net?: number | null;
  driver_share?: number | null;
  fleet_share?: number | null;
  fuel_deduction?: number | null;
  fuel_fleet_share?: number | null;
  toll_charged_to_driver?: number | null;
  toll_cash_spend?: number | null;
  toll_tag_spend?: number | null;
  toll_spend?: number | null;
  earnings_gross?: number | null;
  tips_paid_to_driver?: number | null;
  tips_withheld?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type PeriodInvariantDrift = {
  driverId?: string;
  week?: string;
  kind: string;
  persisted: number;
  expected: number;
};

export function mapPersistedRowToSettlementInput(row: PersistedPeriodRow) {
  const meta = row.metadata;
  const fc = (meta?.financeCore || {}) as Record<string, unknown>;
  const tipsPaidToDriver = round2(
    Math.max(0, Number(row.tips_paid_to_driver) || Number(fc.tipsPaidToDriver) || 0),
  );
  return {
    driverShare: Number(row.driver_share) || 0,
    fuelDeduction: Number(row.fuel_deduction) || 0,
    baseCashOwed: Number(row.cash_collected) || 0,
    baseCashPaid: Number(row.cash_returned) || 0,
    tollCashWash: resolvePeriodTollCashWash({
      tollCashSpend: row.toll_cash_spend,
      metadata: meta,
    }),
    tollPersonal: Math.max(0, Number(row.toll_charged_to_driver) || 0),
    fuelCredits: Number(row.fuel_fleet_share) || 0,
    cashWrittenOff: Number(row.cash_written_off) || 0,
    settlementPaid: Number(row.settlement_paid) || 0,
    tipsPaidToDriver,
  };
}

export function recomputePeriodSettlement(row: PersistedPeriodRow): PeriodSettlementResult {
  return computePeriodSettlement(mapPersistedRowToSettlementInput(row));
}

function pushDrift(
  drifts: PeriodInvariantDrift[],
  row: PersistedPeriodRow,
  kind: string,
  persisted: number,
  expected: number,
) {
  if (Math.abs(persisted - expected) <= DRIFT_EPS) return;
  drifts.push({
    driverId: row.driver_id != null ? String(row.driver_id) : undefined,
    week: row.period_anchor != null ? String(row.period_anchor).slice(0, 10) : undefined,
    kind,
    persisted: round2(persisted),
    expected: round2(expected),
  });
}

/** Field-by-field invariant checks for a persisted period projection row. */
export function checkPeriodInvariants(row: PersistedPeriodRow): PeriodInvariantDrift[] {
  const drifts: PeriodInvariantDrift[] = [];
  const settled = recomputePeriodSettlement(row);

  pushDrift(
    drifts,
    row,
    'cash_still_held',
    Number(row.cash_still_held) || 0,
    computeExpectedCashStillHeld(row),
  );
  pushDrift(drifts, row, 'settlement_amount', Number(row.settlement_amount) || 0, settled.settlement);
  pushDrift(drifts, row, 'payout_net', Number(row.payout_net) || 0, settled.netPayout);

  const tollCash = Number(row.toll_cash_spend) || 0;
  const tollTag = Number(row.toll_tag_spend) || 0;
  const tollSpend = Number(row.toll_spend) || 0;
  if (tollSpend > 0 || tollCash > 0 || tollTag > 0) {
    pushDrift(drifts, row, 'toll_spend_split', tollSpend, round2(tollCash + tollTag));
  }

  const tipsPaid = Number(row.tips_paid_to_driver) || 0;
  const earningsGross = Number(row.earnings_gross) || 0;
  const identityGross = round2(
    (Number(row.driver_share) || 0) + (Number(row.fleet_share) || 0) + tipsPaid,
  );
  if (earningsGross > 0) {
    pushDrift(drifts, row, 'earnings_gross_identity', earningsGross, identityGross);
  }

  return drifts;
}
