import React, { createContext, useContext, useMemo, useState } from 'react';

type HomeTripPickerContextValue = {
  tripPickerActive: boolean;
  setTripPickerActive: (active: boolean) => void;
};

const HomeTripPickerContext = createContext<HomeTripPickerContextValue | null>(null);

export function HomeTripPickerProvider({ children }: { children: React.ReactNode }) {
  const [tripPickerActive, setTripPickerActive] = useState(false);
  const value = useMemo(
    () => ({ tripPickerActive, setTripPickerActive }),
    [tripPickerActive],
  );
  return (
    <HomeTripPickerContext.Provider value={value}>{children}</HomeTripPickerContext.Provider>
  );
}

export function useHomeTripPicker(): HomeTripPickerContextValue {
  const ctx = useContext(HomeTripPickerContext);
  if (!ctx) {
    throw new Error('useHomeTripPicker must be used within HomeTripPickerProvider');
  }
  return ctx;
}

/** Safe when Home may render outside provider (e.g. tests). */
export function useHomeTripPickerOptional(): HomeTripPickerContextValue | null {
  return useContext(HomeTripPickerContext);
}
