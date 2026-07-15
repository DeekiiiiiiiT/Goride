/**
 * Weekly cash-risk vs bank-settled SSOT for Settlement / Cash Wallet.
 * Matches PERIOD modal Uber cash magnitude; never treats bank transfer as cash owed.
 */

import type { DriverMetrics, Trip } from '../types/data';
import { normalizePlatform } from './normalizePlatform';
import {
  computeUberCsvBankMagnitudeFromMetrics,
  filterUberCashEligibleMetrics,
  resolveUberPeriodCashCollected,
} from './resolveUberPeriodCash';
import { getTripPhysicalCashCollected } from './tripPhysicalCash';

export interface WeeklyCashRiskBreakdown {
  /** Uber statement cash (same magnitude path as PERIOD) — 0 when unavailable. */
  uberCash: number;
  /** Non-Uber physical cash from trips (InDrive / Roam / private). */
  nonUberTripCash: number;
  /** Uber trip physical cash used only when statement Uber cash is unavailable. */
  uberTripCashFallback: number;
  floatIssued: number;
  tollCharges: number;
  /** Platform bank payout for the week — informational, not part of cashRisk. */
  bankSettled: number;
  /** True when Uber cash came from ledger or statement metrics (not trip fallback). */
  uberFromStatement: boolean;
}

export interface WeeklyCashRiskResult {
  /** Physical cash the driver still owes the company for the week (before Cash Paid). */
  cashCollected: number;
  cashRisk: number;
  bankSettled: number;
  breakdown: WeeklyCashRiskBreakdown;
}

export function buildWeeklyCashRisk(input: {
  weekStart: Date;
  weekEnd: Date;
  trips: Trip[];
  csvMetrics: DriverMetrics[];
  floatIssued: number;
  tollCharges: number;
  /**
   * From ledger `payout_bank` (PERIOD "Transferred to Bank"). Preferred over
   * DriverMetrics.bankTransferred so historical weeks work without re-import.
   */
  ledgerBankSettled?: number;
  /**
   * From ledger `payout_cash` (PERIOD "Cash Collected"). Preferred over
   * DriverMetrics / payments_transaction column sum — prevents ~$64k vs ~$49k drift.
   */
  ledgerUberCash?: number;
}): WeeklyCashRiskResult {
  const { weekStart, weekEnd, trips, csvMetrics, floatIssued, tollCharges } = input;

  const uberResolved = resolveUberPeriodCashCollected({
    csvMetrics,
    rangeFrom: weekStart,
    rangeTo: weekEnd,
    trips,
    isAllPlatforms: true,
  });

  const eligible = filterUberCashEligibleMetrics(csvMetrics, weekStart, weekEnd);
  const metricsBank = computeUberCsvBankMagnitudeFromMetrics(eligible);
  let tripBank = 0;
  let nonUberTripCash = 0;
  let uberTripCashFallback = 0;
  for (const t of trips) {
    tripBank += Math.abs(Number((t as { bankTransferred?: number }).bankTransferred) || 0);
    const cash = getTripPhysicalCashCollected(t);
    if (cash < 0.005) continue;
    if (normalizePlatform(t.platform) === 'Uber') {
      uberTripCashFallback += cash;
    } else {
      nonUberTripCash += cash;
    }
  }

  // Prefer ledger (same as PERIOD), then persisted metrics, then trip rollups.
  const ledgerBank = Math.abs(Number(input.ledgerBankSettled) || 0);
  const bankSettled =
    ledgerBank > 0.005 ? ledgerBank : metricsBank > 0.005 ? metricsBank : tripBank;

  const ledgerUber = Math.abs(Number(input.ledgerUberCash) || 0);
  const metricsUber =
    uberResolved.magnitude != null && uberResolved.magnitude > 0.005
      ? uberResolved.magnitude
      : 0;
  const uberFromLedger = ledgerUber > 0.005;
  const uberFromMetrics = !uberFromLedger && metricsUber > 0.005;
  const uberFromStatement = uberFromLedger || uberFromMetrics;
  const uberCash = uberFromLedger ? ledgerUber : metricsUber;

  // When statement Uber cash is missing, keep Uber trip cash so wallet isn't blank.
  const cashCollected =
    (uberFromStatement ? uberCash : uberTripCashFallback) + nonUberTripCash;

  const cashRisk = cashCollected + (floatIssued || 0) + (tollCharges || 0);

  return {
    cashCollected,
    cashRisk,
    bankSettled,
    breakdown: {
      uberCash: uberFromStatement ? uberCash : 0,
      nonUberTripCash,
      uberTripCashFallback: uberFromStatement ? 0 : uberTripCashFallback,
      floatIssued: floatIssued || 0,
      tollCharges: tollCharges || 0,
      bankSettled,
      uberFromStatement,
    },
  };
}
