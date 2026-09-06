/**
 * Cash Wallet desk totals + prefills shared by Cash Wallet tab and settlement modals.
 * Extracted from DriverDetail (Round 4 Phase 3) — behavior unchanged.
 */
import { useMemo } from 'react';
import { format } from 'date-fns';
import { buildWalletCallOutstandingByMonday } from '../utils/walletCallOutstanding';

export function useDriverWalletDeskTotals(
  walletCashWeeks: any[],
  walletPayoutPeriodRows: any[],
) {
  /** Live Log Cash period list (never a stale Weekly Settlements snapshot). */
  const logCashPeriods = useMemo(
    () =>
      walletCashWeeks.map((w) => ({
        start: w.start,
        end: w.end,
        amountOwed: w.amountOwed,
        amountPaid: w.amountPaid,
        balance: w.balance,
        status: w.status,
      })),
    [walletCashWeeks],
  );

  /** Settlement call-script map (Monday → tell-the-driver amount). Display only. */
  const callOutstandingByMonday = useMemo(
    () => buildWalletCallOutstandingByMonday(walletPayoutPeriodRows),
    [walletPayoutPeriodRows],
  );

  /** Collection desk totals — who owes whom + verified cash logged (open weeks). */
  const walletCollectionTotals = useMemo(() => {
    let passengerCash = 0;
    let cashReturned = 0;
    for (const w of walletCashWeeks) {
      cashReturned += w.amountPaid || 0;
      if ((w.amountOwed || 0) <= 0.005) continue;
      passengerCash += w.amountOwed || 0;
    }
    const collectionGap = Math.max(0, Math.round((passengerCash - cashReturned) * 100) / 100);
    let driverOwes = 0;
    let fleetOwes = 0;
    let cashWithDriver = 0;
    for (const w of walletCashWeeks) {
      if ((w.amountOwed || 0) <= 0.005) continue;
      const key = format(w.start, 'yyyy-MM-dd');
      const call = callOutstandingByMonday[key];
      if (!call) continue;
      if (call.callDirection === 'driver_owes') driverOwes += call.callAmount;
      else if (call.callDirection === 'fleet_owes') fleetOwes += call.callAmount;
      else cashWithDriver += call.callAmount;
    }
    return {
      passengerCash: Math.round(passengerCash * 100) / 100,
      cashReturned: Math.round(cashReturned * 100) / 100,
      collectionGap,
      driverOwes: Math.round(driverOwes * 100) / 100,
      fleetOwes: Math.round(fleetOwes * 100) / 100,
      cashWithDriver: Math.round(cashWithDriver * 100) / 100,
      /** Phone-friendly total: finalized debts + unfinalized still-held */
      callOutstanding: Math.round((driverOwes + cashWithDriver) * 100) / 100,
    };
  }, [walletCashWeeks, callOutstandingByMonday]);

  /** Prefer newest week with cash still owed (Settlement call amount), not passenger−returned. */
  const openWalletPeriodPrefill = useMemo(() => {
    for (const w of walletCashWeeks) {
      const key = format(w.start, 'yyyy-MM-dd');
      const call = callOutstandingByMonday[key];
      const owed =
        call && call.callDirection !== 'fleet_owes'
          ? call.callAmount
          : Math.max(0, (w.amountOwed || 0) - (w.amountPaid || 0));
      if (owed > 0.005) {
        return {
          start: w.start,
          end: w.end,
          amount: Math.round(owed * 100) / 100,
        };
      }
    }
    return null;
  }, [walletCashWeeks, callOutstandingByMonday]);

  /** Newest week where fleet owes the driver (Pay Driver desk). */
  const openFleetOwesPrefill = useMemo(() => {
    for (const w of walletCashWeeks) {
      const key = format(w.start, 'yyyy-MM-dd');
      const call = callOutstandingByMonday[key];
      if (call?.callDirection === 'fleet_owes' && call.callAmount > 0.005) {
        return {
          start: w.start,
          end: w.end,
          amount: Math.round(call.callAmount * 100) / 100,
        };
      }
    }
    return null;
  }, [walletCashWeeks, callOutstandingByMonday]);

  return {
    logCashPeriods,
    callOutstandingByMonday,
    walletCollectionTotals,
    openWalletPeriodPrefill,
    openFleetOwesPrefill,
  };
}
