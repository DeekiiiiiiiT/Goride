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

  // InDrive true profit: use net income if fee data is present
  if (trip.platform === 'InDrive' && trip.indriveNetIncome != null) {
    return trip.indriveNetIncome;
  }

  // All other platforms / legacy InDrive trips without fee data
  return trip.amount || 0;
}
