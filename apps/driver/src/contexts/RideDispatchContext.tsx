import React, { createContext, useContext, type ReactNode } from 'react';
import { useRideDispatch } from '../hooks/useRideDispatch';
import { DriverBackgroundLocationDisclosure } from '../components/DriverBackgroundLocationDisclosure';

type RideDispatchValue = ReturnType<typeof useRideDispatch>;

const RideDispatchContext = createContext<RideDispatchValue | null>(null);

export function RideDispatchProvider({ children }: { children: ReactNode }) {
  const value = useRideDispatch();
  return (
    <RideDispatchContext.Provider value={value}>
      <DriverBackgroundLocationDisclosure
        open={value.locationDisclosureOpen}
        onAccept={value.confirmLocationDisclosure}
        onDecline={() => value.setLocationDisclosureOpen(false)}
      />
      {children}
    </RideDispatchContext.Provider>
  );
}

export function useRideDispatchContext(): RideDispatchValue {
  const ctx = useContext(RideDispatchContext);
  if (!ctx) {
    throw new Error('useRideDispatchContext must be used within RideDispatchProvider');
  }
  return ctx;
}
