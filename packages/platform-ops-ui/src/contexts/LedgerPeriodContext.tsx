import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function mondayOf(now: Date): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysSinceMonday = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);
  return monday;
}

/** The Monday–Sunday week that contains `now` (this statement week). */
export function thisStatementWeek(now = new Date()): { startDate: string; endDate: string } {
  const thisMonday = mondayOf(now);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  return { startDate: ymd(thisMonday), endDate: ymd(thisSunday) };
}

/** The Monday–Sunday week that finished before this week. */
export function lastCompleteStatementWeek(now = new Date()): { startDate: string; endDate: string } {
  const thisMonday = mondayOf(now);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);
  return { startDate: ymd(lastMonday), endDate: ymd(lastSunday) };
}

/** Inclusive Monday→Sunday window covering the last `weekCount` statement weeks (newest week = this week). */
export function lastNStatementWeeks(
  weekCount = 12,
  now = new Date(),
): { startDate: string; endDate: string } {
  const n = Math.max(1, Math.floor(weekCount));
  const thisMonday = mondayOf(now);
  const thisSunday = new Date(thisMonday);
  thisSunday.setDate(thisMonday.getDate() + 6);
  const fromMonday = new Date(thisMonday);
  fromMonday.setDate(thisMonday.getDate() - (n - 1) * 7);
  return { startDate: ymd(fromMonday), endDate: ymd(thisSunday) };
}

function readPeriodFromUrl(): { startDate: string; endDate: string } | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const from = sp.get('from') || '';
    const to = sp.get('to') || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return { startDate: from, endDate: to };
    }
  } catch { /* ignore */ }
  return null;
}

function writePeriodToUrl(next: { startDate: string; endDate: string }) {
  try {
    const url = new URL(window.location.href);
    if (next.startDate && next.endDate) {
      url.searchParams.set('from', next.startDate);
      url.searchParams.set('to', next.endDate);
    } else {
      url.searchParams.delete('from');
      url.searchParams.delete('to');
    }
    window.history.replaceState({}, '', url.toString());
  } catch { /* ignore */ }
}

export type LedgerPeriod = {
  /** yyyy-MM-dd, or '' for all-time (R-08) */
  startDate: string;
  /** yyyy-MM-dd, or '' for all-time (R-08) */
  endDate: string;
};

type LedgerPeriodContextValue = {
  period: LedgerPeriod;
  setPeriod: (next: LedgerPeriod) => void;
};

const LedgerPeriodContext = createContext<LedgerPeriodContextValue | null>(null);

export function LedgerPeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriodState] = useState<LedgerPeriod>(() => readPeriodFromUrl() ?? thisStatementWeek());
  useEffect(() => {
    writePeriodToUrl(period);
  }, [period]);
  const setPeriod = (next: LedgerPeriod) => {
    setPeriodState(next);
    writePeriodToUrl(next);
  };
  const value = useMemo(() => ({ period, setPeriod }), [period]);
  return <LedgerPeriodContext.Provider value={value}>{children}</LedgerPeriodContext.Provider>;
}

/** Falls back to this Monday–Sunday statement week when no provider is mounted. */
export function useLedgerPeriod(): LedgerPeriodContextValue {
  const ctx = useContext(LedgerPeriodContext);
  if (!ctx) {
    const fallback = thisStatementWeek();
    return {
      period: fallback,
      setPeriod: () => {},
    };
  }
  return ctx;
}
