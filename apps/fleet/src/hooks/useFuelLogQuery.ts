import { useCallback, useMemo } from 'react';

/**
 * URL-synced query state for the Fuel Logs surface.
 * Keeps the visible view (tab, period, vehicle, search) shareable/bookmarkable.
 */

export type FuelLogView = 'transactions' | 'cycles' | 'exceptions';

export type FuelLogQuery = {
  view: FuelLogView;
  startDate?: string;
  endDate?: string;
  vehicleId?: string;
  driverId?: string;
  search?: string;
};

const DEFAULT_QUERY: FuelLogQuery = { view: 'transactions' };

function isView(v: string | null): v is FuelLogView {
  return v === 'transactions' || v === 'cycles' || v === 'exceptions';
}

/** Parse a FuelLogQuery from URLSearchParams (or a query string). */
export function parseFuelLogQuery(input: URLSearchParams | string): FuelLogQuery {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const view = params.get('view');
  return {
    view: isView(view) ? view : 'transactions',
    startDate: params.get('startDate') || undefined,
    endDate: params.get('endDate') || undefined,
    vehicleId: params.get('vehicleId') || undefined,
    driverId: params.get('driverId') || undefined,
    search: params.get('q') || undefined,
  };
}

/** Serialize a FuelLogQuery to a stable URLSearchParams (omits defaults/empties). */
export function serializeFuelLogQuery(query: FuelLogQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.view && query.view !== 'transactions') params.set('view', query.view);
  if (query.startDate) params.set('startDate', query.startDate);
  if (query.endDate) params.set('endDate', query.endDate);
  if (query.vehicleId) params.set('vehicleId', query.vehicleId);
  if (query.driverId) params.set('driverId', query.driverId);
  if (query.search?.trim()) params.set('q', query.search.trim());
  return params;
}

/**
 * Hook: read + update the fuel log query in the browser URL (history.replaceState).
 * Falls back to defaults during SSR / non-browser contexts.
 */
export function useFuelLogQuery(): {
  query: FuelLogQuery;
  setQuery: (patch: Partial<FuelLogQuery>) => void;
} {
  const query = useMemo<FuelLogQuery>(() => {
    if (typeof window === 'undefined') return DEFAULT_QUERY;
    return parseFuelLogQuery(new URLSearchParams(window.location.search));
  }, []);

  const setQuery = useCallback(
    (patch: Partial<FuelLogQuery>) => {
      if (typeof window === 'undefined') return;
      const current = parseFuelLogQuery(new URLSearchParams(window.location.search));
      const next = serializeFuelLogQuery({ ...current, ...patch });
      const qs = next.toString();
      const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
      window.history.replaceState(null, '', url);
    },
    [],
  );

  return { query, setQuery };
}
