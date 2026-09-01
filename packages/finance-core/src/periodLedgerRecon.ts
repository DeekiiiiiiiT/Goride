import { round2 } from './money.ts';
import type { PersistedPeriodRow } from './periodInvariants.ts';

const DRIFT_EPS = 0.01;

export type LedgerEventSumRow = {
  event_type: string;
  amount_minor: number;
};

export type LedgerReconDrift = {
  driverId?: string;
  week?: string;
  kind: string;
  persisted: number;
  expected: number;
};

function pushLedgerDrift(
  drifts: LedgerReconDrift[],
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

function minorToMajor(minor: number): number {
  return round2((Number(minor) || 0) / 100);
}

/** Sum active ledger events by event_type (amount_minor → major, abs for expense types). */
export function sumLedgerEventsByType(events: LedgerEventSumRow[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const ev of events || []) {
    const et = String(ev.event_type || '');
    if (!et) continue;
    const major = minorToMajor(Number(ev.amount_minor) || 0);
    sums[et] = round2((sums[et] || 0) + major);
  }
  return sums;
}

/**
 * Compare period projection columns to posted financial_events aggregates (C-5).
 * Only checks event-backed domains that post to financial_events today.
 */
export function checkPeriodVsLedgerEvents(
  row: PersistedPeriodRow,
  events: LedgerEventSumRow[],
): LedgerReconDrift[] {
  const drifts: LedgerReconDrift[] = [];
  const sums = sumLedgerEventsByType(events);

  const fuelDeductionLedger = Math.abs(sums.fuel_deduction || 0);
  const fuelFleetLedger = Math.abs(sums.fuel_fleet_share || 0);
  const fuelDriverLedger = Math.abs(sums.fuel_driver_spend || 0);
  const fuelGasLedger = Math.abs(sums.fuel_gas_card_spend || 0);

  if (fuelDeductionLedger > 0 || (Number(row.fuel_deduction) || 0) > 0) {
    pushLedgerDrift(drifts, row, 'ledger_fuel_deduction', Number(row.fuel_deduction) || 0, fuelDeductionLedger);
  }
  if (fuelFleetLedger > 0 || (Number(row.fuel_fleet_share) || 0) > 0) {
    pushLedgerDrift(drifts, row, 'ledger_fuel_fleet_share', Number(row.fuel_fleet_share) || 0, fuelFleetLedger);
  }
  if (fuelDriverLedger > 0 || (Number(row.fuel_driver_spend) || 0) > 0) {
    pushLedgerDrift(
      drifts,
      row,
      'ledger_fuel_driver_spend',
      Number((row as { fuel_driver_spend?: number }).fuel_driver_spend) || 0,
      fuelDriverLedger,
    );
  }
  if (fuelGasLedger > 0 || (Number((row as { fuel_gas_card_spend?: number }).fuel_gas_card_spend) || 0) > 0) {
    pushLedgerDrift(
      drifts,
      row,
      'ledger_fuel_gas_card_spend',
      Number((row as { fuel_gas_card_spend?: number }).fuel_gas_card_spend) || 0,
      fuelGasLedger,
    );
  }

  const tollReimbursedLedger = Math.abs(sums.toll_reimbursed || 0) +
    Math.abs(sums.trip_refund || 0) +
    Math.abs(sums.unlinked_trip || 0) +
    Math.abs(sums.dispute_refund || 0);
  const tollReimbursedPersisted = Number((row as { toll_reimbursed?: number }).toll_reimbursed) || 0;
  if (tollReimbursedLedger > 0 || tollReimbursedPersisted > 0) {
    pushLedgerDrift(drifts, row, 'ledger_toll_reimbursed', tollReimbursedPersisted, tollReimbursedLedger);
  }

  const tollChargedLedger = Math.abs(sums.toll_charged_to_driver || 0);
  const tollChargedPersisted = Number((row as { toll_charged_to_driver?: number }).toll_charged_to_driver) || 0;
  if (tollChargedLedger > 0 || tollChargedPersisted > 0) {
    pushLedgerDrift(drifts, row, 'ledger_toll_charged_to_driver', tollChargedPersisted, tollChargedLedger);
  }

  return drifts;
}
