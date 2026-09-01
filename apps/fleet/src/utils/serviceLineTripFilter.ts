import type { ServiceLineScope } from '../contexts/ServiceLineScopeContext';

type TripLike = {
  serviceLine?: string | null;
  service_line?: string | null;
  platform?: string | null;
};

export function inferTripServiceLine(trip: TripLike): 'rideshare' | 'rush_delivery' {
  const explicit = trip.serviceLine ?? trip.service_line;
  if (explicit === 'rush_delivery' || explicit === 'rideshare') return explicit;
  if (trip.platform === 'Roam Rush') return 'rush_delivery';
  return 'rideshare';
}

export function filterTripsByServiceLineScope<T extends TripLike>(
  trips: T[],
  scope: ServiceLineScope,
): T[] {
  if (scope === 'all') return trips;
  return trips.filter((t) => inferTripServiceLine(t) === scope);
}

export function tripMatchesServiceLineScope(trip: TripLike, scope: ServiceLineScope): boolean {
  if (scope === 'all') return true;
  return inferTripServiceLine(trip) === scope;
}
