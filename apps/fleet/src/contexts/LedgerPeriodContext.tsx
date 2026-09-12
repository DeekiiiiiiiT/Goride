import React, { createContext, useContext, useMemo, useState } from 'react';
import { currentFuelListWindow } from '../utils/fuelWeekPeriod';

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
  const fallback = currentFuelListWindow();
  const [period, setPeriod] = useState<LedgerPeriod>({
    startDate: fallback.startDate,
    endDate: fallback.endDate,
  });
  const value = useMemo(() => ({ period, setPeriod }), [period]);
  return <LedgerPeriodContext.Provider value={value}>{children}</LedgerPeriodContext.Provider>;
}

export function useLedgerPeriod(): LedgerPeriodContextValue {
  const ctx = useContext(LedgerPeriodContext);
  if (!ctx) {
    const fallback = currentFuelListWindow();
    return {
      period: fallback,
      setPeriod: () => {},
    };
  }
  return ctx;
}
