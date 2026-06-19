import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';

export type NavPickerTarget = {
  address: string;
  lat?: number | null;
  lng?: number | null;
  label?: string;
};

type HaulTripUiContextValue = {
  navTarget: NavPickerTarget | null;
  openNavigationPicker: (target: NavPickerTarget) => void;
  closeNavigationPicker: () => void;
  reportRide: RideRequestRow | null;
  openReportIssue: (ride: RideRequestRow) => void;
  closeReportIssue: () => void;
};

const HaulTripUiContext = createContext<HaulTripUiContextValue | null>(null);

export function HaulTripUiProvider({ children }: { children: React.ReactNode }) {
  const [navTarget, setNavTarget] = useState<NavPickerTarget | null>(null);
  const [reportRide, setReportRide] = useState<RideRequestRow | null>(null);

  const openNavigationPicker = useCallback((target: NavPickerTarget) => setNavTarget(target), []);
  const closeNavigationPicker = useCallback(() => setNavTarget(null), []);
  const openReportIssue = useCallback((ride: RideRequestRow) => setReportRide(ride), []);
  const closeReportIssue = useCallback(() => setReportRide(null), []);

  const value = useMemo(
    () => ({
      navTarget,
      openNavigationPicker,
      closeNavigationPicker,
      reportRide,
      openReportIssue,
      closeReportIssue,
    }),
    [navTarget, openNavigationPicker, closeNavigationPicker, reportRide, openReportIssue, closeReportIssue],
  );

  return <HaulTripUiContext.Provider value={value}>{children}</HaulTripUiContext.Provider>;
}

export function useHaulTripUi(): HaulTripUiContextValue {
  const ctx = useContext(HaulTripUiContext);
  if (!ctx) {
    throw new Error('useHaulTripUi must be used within HaulTripUiProvider');
  }
  return ctx;
}

export function useHaulTripUiOptional(): HaulTripUiContextValue | null {
  return useContext(HaulTripUiContext);
}
