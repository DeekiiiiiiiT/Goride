import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { generatePeriodWeekOptions } from '../../../utils/periodWeekOptions';

export type DriverPeriodRange = { from: Date; to: Date };

interface DriverPeriodContextValue {
  period: DriverPeriodRange;
  setPeriod: (range: DriverPeriodRange) => void;
}

const DriverPeriodContext = createContext<DriverPeriodContextValue | null>(null);

/** Match Financials default: span of the last 12 Monday-start pay weeks. */
export function defaultDriverPeriod(): DriverPeriodRange {
  const weeks = generatePeriodWeekOptions(12);
  const newest = weeks[0];
  const oldest = weeks[weeks.length - 1] || newest;
  return {
    from: new Date(`${oldest.startDate}T12:00:00`),
    to: new Date(`${newest.endDate}T12:00:00`),
  };
}

function parseYmd(ymd: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Read `?from=yyyy-MM-dd&to=yyyy-MM-dd` from the current URL (path-based app, no react-router). */
export function readPeriodFromLocationSearch(search?: string): DriverPeriodRange | null {
  if (typeof window === 'undefined' && search == null) return null;
  const params = new URLSearchParams(search ?? window.location.search);
  const from = parseYmd(params.get('from') || '');
  const to = parseYmd(params.get('to') || '');
  if (!from || !to || from > to) return null;
  return { from, to };
}

function writePeriodToUrl(range: DriverPeriodRange) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  // Only stamp query params on driver detail URLs
  if (!url.pathname.startsWith('/drivers/')) return;
  url.searchParams.set('from', format(range.from, 'yyyy-MM-dd'));
  url.searchParams.set('to', format(range.to, 'yyyy-MM-dd'));
  const next = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === cur) return;
  window.history.replaceState(window.history.state, '', next);
}

function initialPeriod(): DriverPeriodRange {
  return readPeriodFromLocationSearch() ?? defaultDriverPeriod();
}

export function DriverPeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriodState] = useState<DriverPeriodRange>(initialPeriod);

  const setPeriod = useCallback((range: DriverPeriodRange) => {
    setPeriodState(range);
    writePeriodToUrl(range);
  }, []);

  // Ensure deep-linked detail always has from/to in the URL for sharing
  React.useEffect(() => {
    writePeriodToUrl(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stamp once on mount from initial state
  }, []);

  const value = useMemo(() => ({ period, setPeriod }), [period, setPeriod]);

  return (
    <DriverPeriodContext.Provider value={value}>{children}</DriverPeriodContext.Provider>
  );
}

export function useDriverPeriod(): DriverPeriodContextValue {
  const ctx = useContext(DriverPeriodContext);
  if (!ctx) {
    throw new Error('useDriverPeriod must be used within DriverPeriodProvider');
  }
  return ctx;
}
