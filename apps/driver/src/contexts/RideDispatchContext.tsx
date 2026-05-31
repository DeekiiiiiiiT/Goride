import React, { createContext, useContext, type ReactNode } from 'react';
import { useRideDispatch } from '../hooks/useRideDispatch';

type RideDispatchValue = ReturnType<typeof useRideDispatch>;

const RideDispatchContext = createContext<RideDispatchValue | null>(null);

export function RideDispatchProvider({ children }: { children: ReactNode }) {
  const value = useRideDispatch();
  return (
    <RideDispatchContext.Provider value={value}>{children}</RideDispatchContext.Provider>
  );
}

export function useRideDispatchContext(): RideDispatchValue {
  const ctx = useContext(RideDispatchContext);
  if (!ctx) {
    throw new Error('useRideDispatchContext must be used within RideDispatchProvider');
  }
  return ctx;
}
