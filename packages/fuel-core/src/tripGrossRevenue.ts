import type { FuelCalcTrip } from './fuelTypes.ts';

/**
 * Gross revenue for PA / earnings quota — Uber fare components preferential;
 * InDrive uses max(amount, indriveNetIncome).
 */
export function getTripGrossRevenue(trip: FuelCalcTrip | null | undefined): number {
  if (!trip) return 0;
  const platformNorm = String(trip.platform || '').trim().toLowerCase();
  const amount = Number(trip.amount) || 0;

  const isUber = platformNorm === 'uber' || platformNorm.startsWith('uber ');
  if (isUber) {
    const uberFare = Number(trip.uberFareComponents) || 0;
    if (uberFare > 0) return uberFare;
    const tips = Number(trip.uberTips) || 0;
    const priorAdj = Number(trip.uberPriorPeriodAdjustment) || 0;
    return Math.max(0, amount - tips - priorAdj);
  }

  if (platformNorm === 'indrive') {
    let gross = amount;
    if (trip.indriveNetIncome != null) {
      const net = Number(trip.indriveNetIncome) || 0;
      if (net > gross) gross = net;
    }
    return gross;
  }

  return amount;
}
