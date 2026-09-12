/**
 * V-01: GET /fuel-entries may return a bare array or { data, total, … }.
 * Always normalize to an array; attach totalCount/sort meta when present.
 */
export type FuelEntriesListMeta = {
  totalCount?: number;
  sortKey?: string;
  sortDir?: string;
};

export function unwrapFuelEntriesPayload<T = unknown>(
  payload: unknown,
  totalHeader?: string | null,
): (T[] & FuelEntriesListMeta) {
  const headerTotal =
    totalHeader != null && Number.isFinite(Number(totalHeader))
      ? Number(totalHeader)
      : undefined;

  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    const envelope = payload as {
      data: T[];
      total?: number;
      sortKey?: string;
      sortDir?: string;
    };
    const rows = envelope.data as T[] & FuelEntriesListMeta;
    const total =
      typeof envelope.total === 'number' && Number.isFinite(envelope.total)
        ? envelope.total
        : headerTotal ?? rows.length;
    rows.totalCount = total;
    if (envelope.sortKey != null) rows.sortKey = String(envelope.sortKey);
    if (envelope.sortDir != null) rows.sortDir = String(envelope.sortDir);
    return rows;
  }

  if (Array.isArray(payload)) {
    const rows = payload as T[] & FuelEntriesListMeta;
    if (headerTotal != null) rows.totalCount = headerTotal;
    return rows;
  }

  return [] as T[] & FuelEntriesListMeta;
}
