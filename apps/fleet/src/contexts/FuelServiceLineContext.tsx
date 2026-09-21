import React, { createContext, useContext, useMemo, useState } from 'react';
import { useFuelServiceLineParam } from '../hooks/useFuelServiceLineParam';
import {
  fuelLineTabToApi,
  type FuelLineTab,
  type FuelServiceLineFilter,
} from '../utils/fuelServiceLineFilter';

type FuelServiceLineContextValue = {
  line: FuelLineTab;
  setLine: (line: FuelLineTab) => void;
  showTabs: boolean;
  /** API / entry filter derived from tab (+ optional unattributed chip). */
  apiFilter: FuelServiceLineFilter;
  unattributedOnly: boolean;
  setUnattributedOnly: (v: boolean) => void;
};

const FuelServiceLineContext = createContext<FuelServiceLineContextValue | null>(null);

export function FuelServiceLineProvider({ children }: { children: React.ReactNode }) {
  const { line, setLine, showTabs } = useFuelServiceLineParam();
  const [unattributedOnly, setUnattributedOnly] = useState(false);

  const value = useMemo((): FuelServiceLineContextValue => {
    const apiFilter: FuelServiceLineFilter = unattributedOnly
      ? 'unattributed'
      : fuelLineTabToApi(line);
    return {
      line,
      setLine: (next) => {
        setUnattributedOnly(false);
        setLine(next);
      },
      showTabs,
      apiFilter,
      unattributedOnly,
      setUnattributedOnly,
    };
  }, [line, setLine, showTabs, unattributedOnly]);

  return (
    <FuelServiceLineContext.Provider value={value}>{children}</FuelServiceLineContext.Provider>
  );
}

export function useFuelServiceLine(): FuelServiceLineContextValue {
  const ctx = useContext(FuelServiceLineContext);
  if (!ctx) {
    return {
      line: 'all',
      setLine: () => {},
      showTabs: false,
      apiFilter: 'all',
      unattributedOnly: false,
      setUnattributedOnly: () => {},
    };
  }
  return ctx;
}
