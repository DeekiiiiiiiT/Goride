import type { ServiceLineScope } from '../contexts/ServiceLineScopeContext';
import { inferTripServiceLine } from './serviceLineTripFilter';

type LedgerLike = Record<string, unknown>;

function inferLedgerServiceLine(event: LedgerLike): 'rideshare' | 'rush_delivery' {
  const meta =
    event.metadata && typeof event.metadata === 'object'
      ? (event.metadata as Record<string, unknown>)
      : {};
  const explicit = event.serviceLine ?? event.service_line ?? meta.serviceLine ?? meta.service_line;
  if (explicit === 'rush_delivery' || explicit === 'rideshare') return explicit;
  const platform = String(event.platform ?? meta.platform ?? '');
  if (platform === 'Roam Rush') return 'rush_delivery';
  return 'rideshare';
}

export function filterLedgerEventsByServiceLineScope<T extends LedgerLike>(
  events: T[],
  scope: ServiceLineScope,
): T[] {
  if (scope === 'all') return events;
  return events.filter((e) => inferLedgerServiceLine(e) === scope);
}

export function filterTripsLikeByServiceLineScope<T extends Parameters<typeof inferTripServiceLine>[0]>(
  trips: T[],
  scope: ServiceLineScope,
): T[] {
  if (scope === 'all') return trips;
  return trips.filter((t) => inferTripServiceLine(t) === scope);
}
