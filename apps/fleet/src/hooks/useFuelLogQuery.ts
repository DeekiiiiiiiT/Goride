import { useCallback, useEffect, useState } from 'react';

/**
 * URL-synced query state for the Fuel Logs surface.
 * Single source of truth for tab, search, vehicle, integrity — shareable/bookmarkable.
 */

export type FuelLogView = 'transactions' | 'cycles';

export type FuelLogQuery = {
  view: FuelLogView;
  vehicleId?: string;
  driverId?: string;
  search?: string;
  integrity?: string;
  source?: string;
  type?: string;
  anchor?: string;
  status?: string;
  /** Cross-nav: filter transactions to one Full Tank cycle. */
  cycleId?: string;
  sortField?: 'date' | 'amount' | 'liters' | 'odometer';
  sortDir?: 'asc' | 'desc';
};

const DEFAULT_QUERY: FuelLogQuery = {
  view: 'transactions',
  sortField: 'date',
  sortDir: 'desc',
};

function isView(v: string | null): v is FuelLogView {
  return v === 'transactions' || v === 'cycles';
}

function isSortField(v: string | null): v is NonNullable<FuelLogQuery['sortField']> {
  return v === 'date' || v === 'amount' || v === 'liters' || v === 'odometer';
}

/** Parse a FuelLogQuery from URLSearchParams (or a query string). */
export function parseFuelLogQuery(input: URLSearchParams | string): FuelLogQuery {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const view = params.get('tab') || params.get('view');
  const sortField = params.get('sort');
  const sortDir = params.get('dir');
  return {
    view: isView(view) ? view : 'transactions',
    vehicleId: params.get('vehicleId') || undefined,
    driverId: params.get('driverId') || undefined,
    search: params.get('q') || undefined,
    integrity: params.get('integrity') || undefined,
    source: params.get('source') || undefined,
    type: params.get('type') || undefined,
    anchor: params.get('anchor') || undefined,
    status: params.get('status') || undefined,
    cycleId: params.get('cycleId') || undefined,
    sortField: isSortField(sortField) ? sortField : 'date',
    sortDir: sortDir === 'asc' ? 'asc' : 'desc',
  };
}

/** Serialize a FuelLogQuery to a stable URLSearchParams (omits defaults/empties). */
export function serializeFuelLogQuery(query: FuelLogQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.view && query.view !== 'transactions') params.set('tab', query.view);
  if (query.vehicleId && query.vehicleId !== 'all') params.set('vehicleId', query.vehicleId);
  if (query.driverId && query.driverId !== 'all') params.set('driverId', query.driverId);
  if (query.search?.trim()) params.set('q', query.search.trim());
  if (query.integrity && query.integrity !== 'all') params.set('integrity', query.integrity);
  if (query.source && query.source !== 'all') params.set('source', query.source);
  if (query.type && query.type !== 'all') params.set('type', query.type);
  if (query.anchor && query.anchor !== 'all') params.set('anchor', query.anchor);
  if (query.status && query.status !== 'all') params.set('status', query.status);
  if (query.cycleId?.trim()) params.set('cycleId', query.cycleId.trim());
  if (query.sortField && query.sortField !== 'date') params.set('sort', query.sortField);
  if (query.sortDir && query.sortDir !== 'desc') params.set('dir', query.sortDir);
  return params;
}

function readQueryFromWindow(): FuelLogQuery {
  if (typeof window === 'undefined') return DEFAULT_QUERY;
  return parseFuelLogQuery(new URLSearchParams(window.location.search));
}

function writeQueryToWindow(query: FuelLogQuery) {
  if (typeof window === 'undefined') return;
  const next = serializeFuelLogQuery(query);
  const qs = next.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', url);
}

/**
 * Hook: read + update the fuel log query in the browser URL (history.replaceState).
 * Falls back to defaults during SSR / non-browser contexts.
 */
export function useFuelLogQuery(): {
  query: FuelLogQuery;
  setQuery: (patch: Partial<FuelLogQuery>) => void;
  replaceQuery: (next: FuelLogQuery) => void;
} {
  const [query, setQueryState] = useState<FuelLogQuery>(readQueryFromWindow);

  useEffect(() => {
    const onPop = () => setQueryState(readQueryFromWindow());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const setQuery = useCallback((patch: Partial<FuelLogQuery>) => {
    setQueryState((prev) => {
      const next = { ...prev, ...patch };
      writeQueryToWindow(next);
      return next;
    });
  }, []);

  const replaceQuery = useCallback((next: FuelLogQuery) => {
    writeQueryToWindow(next);
    setQueryState(next);
  }, []);

  return { query, setQuery, replaceQuery };
}
