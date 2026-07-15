/**
 * Call-script / Cash Wallet amounts — Settlement SSOT, display only.
 * Breakdown lines so ops can add/subtract why cash is still owed.
 */

import { format } from 'date-fns';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { getPeriodSettlementComponents } from './driverSettlementMath';

export type WalletCashBreakdown = {
  passengerCash: number;
  personalToll: number;
  cashReturned: number;
  fuelCredit: number;
  cashTollCredit: number;
  stillHeld: number;
  /** 0 when earnings not finalized. */
  netPayoutApplied: number;
};

export type WalletCallOutstanding = {
  weekKey: string;
  finalized: boolean;
  stillHeld: number;
  settlement: number | null;
  callAmount: number;
  callDirection: 'driver_owes' | 'fleet_owes' | 'cash_with_driver';
  callLabel: string;
  breakdown: WalletCashBreakdown;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function readCashInputs(row: PayoutPeriodRow) {
  const br = row.cashPaidBreakdown;
  const passengerCash = round2(
    row.passengerCash != null && row.passengerCash > 0.005
      ? row.passengerCash
      : row.cashOwed || 0,
  );
  const cashReturned = round2(Math.max(0, row.cashPaid || 0));
  const washAlreadyInPaid = Math.max(0, br?.tollCredits ?? 0);
  const explicitWash = Math.max(0, row.cashTollWash ?? 0);
  const cashTollCredit = round2(Math.max(0, explicitWash - washAlreadyInPaid));
  const personalToll = round2(Math.max(0, row.personalTollCharge ?? 0));
  const fuelCredit = round2(Math.max(0, row.fuelCredits || 0));
  return { passengerCash, cashReturned, cashTollCredit, personalToll, fuelCredit };
}

export function walletCallOutstandingFromPeriod(
  row: PayoutPeriodRow,
): WalletCallOutstanding {
  const weekKey = format(row.periodStart, 'yyyy-MM-dd');
  const { adjCashBalance, settlement, netPayoutApplied } = getPeriodSettlementComponents(row);
  const stillHeld = round2(adjCashBalance);
  const inputs = readCashInputs(row);
  const breakdown: WalletCashBreakdown = {
    ...inputs,
    stillHeld,
    netPayoutApplied: round2(netPayoutApplied),
  };

  if (row.isFinalized) {
    const s = round2(settlement);
    if (s < -0.005) {
      return {
        weekKey,
        finalized: true,
        stillHeld,
        settlement: s,
        callAmount: round2(-s),
        callDirection: 'driver_owes',
        callLabel: 'Driver owes fleet',
        breakdown,
      };
    }
    if (s > 0.005) {
      return {
        weekKey,
        finalized: true,
        stillHeld,
        settlement: s,
        callAmount: s,
        callDirection: 'fleet_owes',
        callLabel: 'Fleet owes driver',
        breakdown,
      };
    }
    return {
      weekKey,
      finalized: true,
      stillHeld,
      settlement: s,
      callAmount: 0,
      callDirection: 'driver_owes',
      callLabel: 'Settled — nothing outstanding',
      breakdown,
    };
  }

  return {
    weekKey,
    finalized: false,
    stillHeld,
    settlement: null,
    callAmount: Math.max(0, stillHeld),
    callDirection: 'cash_with_driver',
    callLabel: 'Cash still with driver',
    breakdown,
  };
}

export function buildWalletCallOutstandingByMonday(
  periodRows: PayoutPeriodRow[],
): Record<string, WalletCallOutstanding> {
  const map: Record<string, WalletCallOutstanding> = {};
  for (const row of periodRows) {
    const o = walletCallOutstandingFromPeriod(row);
    map[o.weekKey] = o;
  }
  return map;
}
