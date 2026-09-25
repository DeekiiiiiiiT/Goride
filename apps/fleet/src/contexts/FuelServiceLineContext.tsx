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
  /** Unlinked approved card charges lens (statement rows with no ops counterpart). */
  unlinkedCardChargesOnly: boolean;
  setUnlinkedCardChargesOnly: (v: boolean) => void;
};

const FuelServiceLineContext = createContext<FuelServiceLineContextValue | null>(null);

export function FuelServiceLineProvider({ children }: { children: React.ReactNode }) {
  const { line, setLine, showTabs } = useFuelServiceLineParam();
  const [unattributedOnly, setUnattributedOnlyState] = useState(false);
  const [unlinkedCardChargesOnly, setUnlinkedCardChargesOnlyState] = useState(false);

  const setUnattributedOnly = (v: boolean) => {
    setUnattributedOnlyState(v);
    if (v) setUnlinkedCardChargesOnlyState(false);
  };
  const setUnlinkedCardChargesOnly = (v: boolean) => {
    setUnlinkedCardChargesOnlyState(v);
    if (v) setUnattributedOnlyState(false);
  };

  const value = useMemo((): FuelServiceLineContextValue => {
    // Unlinked chip is a table lens — keep apiFilter on the line tab (not a service-line filter).
    const apiFilter: FuelServiceLineFilter = unattributedOnly
      ? 'unattributed'
      : fuelLineTabToApi(line);
    return {
      line,
      setLine: (next) => {
        setUnattributedOnlyState(false);
        setUnlinkedCardChargesOnlyState(false);
        setLine(next);
      },
      showTabs,
      apiFilter,
      unattributedOnly,
      setUnattributedOnly,
      unlinkedCardChargesOnly,
      setUnlinkedCardChargesOnly,
    };
  }, [line, setLine, showTabs, unattributedOnly, unlinkedCardChargesOnly]);

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
      unlinkedCardChargesOnly: false,
      setUnlinkedCardChargesOnly: () => {},
    };
  }
  return ctx;
}
