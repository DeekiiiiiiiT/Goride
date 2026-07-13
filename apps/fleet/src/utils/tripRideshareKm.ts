/**
 * Single source of truth for rideshare trip km used by recon + deadhead attribution.
 * Locked rule: On Trip + Enroute + Open + Unavailable (full stack).
 * Keep fuel_logic.ts getTotalTripRideshareKm in sync with this helper.
 */
export type TripRideshareKmInput = {
  distance?: number | null;
  normalizedEnrouteDistance?: number | null;
  normalizedOpenDistance?: number | null;
  normalizedUnavailableDistance?: number | null;
};

export function getTotalTripRideshareKm(trip: TripRideshareKmInput): number {
  const onTrip = Number(trip.distance) || 0;
  const enroute = Number(trip.normalizedEnrouteDistance) || 0;
  const open = Number(trip.normalizedOpenDistance) || 0;
  const unavailable = Number(trip.normalizedUnavailableDistance) || 0;
  return onTrip + enroute + open + unavailable;
}

export function sumTripRideshareKm(trips: TripRideshareKmInput[]): number {
  return trips.reduce((sum, t) => sum + getTotalTripRideshareKm(t), 0);
}
