import { Trip } from '../types/data';

/**
 * getEffectiveTripEarnings — Single source of truth for "what did the driver earn from this trip."
 *
 * For InDrive trips that have fee data (`indriveNetIncome`), returns the true profit
 * (net income after InDrive's service fee). For all other platforms, or legacy InDrive
 * trips without fee data, returns `trip.amount`.
 *
 * This centralizes the guard pattern:
 *   (trip.platform === 'InDrive' && trip.indriveNetIncome != null) ? trip.indriveNetIncome : trip.amount
 *
 * Previously duplicated across:
 *   - TripStatsCard.tsx
 *   - TripLogsPage.tsx
 *   - DriverDetail.tsx (2 call sites)
 *   - VehiclesPage.tsx
 *   - DriverAssignmentModal.tsx
 */
export function getEffectiveTripEarnings(trip: Trip | null | undefined): number {
  if (!trip) return 0;

  const platformNorm = String(trip.platform || '').toLowerCase();
  // InDrive true profit: use net income if fee data is present
  if (platformNorm === 'indrive' && trip.indriveNetIncome != null) {
    return trip.indriveNetIncome;
  }

  // All other platforms / legacy InDrive trips without fee data
  return trip.amount || 0;
}

/**
 * Aggregated earnings for driver-facing UI (portal cards, trip list, tier progress).
 * InDrive + fee data: driver's net after InDrive's cut (`indriveNetIncome`).
 * Otherwise: same as historical `netPayout || amount` (cash trips keep gross in `amount`
 * when `netPayout` is intentionally 0 — except InDrive, where we must not substitute gross).
 */
export function getDriverPortalTripEarnings(trip: Trip | null | undefined): number {
  if (!trip) return 0;
  const platformNorm = String(trip.platform || '').toLowerCase();
  if (platformNorm === 'indrive' && trip.indriveNetIncome != null) {
    return trip.indriveNetIncome;
  }

  // Uber: use SSOT decomposition when available so promotions & refunds/expenses
  // (statement-level components) are reflected in driver portal totals.
  if (platformNorm === 'uber') {
    const hasUberSsot =
      trip.uberFareComponents != null ||
      trip.uberTips != null ||
      trip.uberPromotionsAmount != null ||
      trip.uberRefundExpenseAmount != null;

    if (hasUberSsot) {
      const fare = Number(trip.uberFareComponents) || 0;
      const tips = Number(trip.uberTips) || 0;
      const promotions = Number(trip.uberPromotionsAmount) || 0;
      const refundsExpenses = Number(trip.uberRefundExpenseAmount) || 0;
      return fare + tips + promotions - refundsExpenses;
    }
  }

  return trip.netPayout || trip.amount || 0;
}
