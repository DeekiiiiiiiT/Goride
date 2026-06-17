import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  getNavigationProviderLabel,
  readNavigationProvider,
  writeNavigationProvider,
  type NavigationProvider,
} from '../utils/navigationPreference';

type NavigationPreferenceContextValue = {
  provider: NavigationProvider;
  label: string;
  setProvider: (provider: NavigationProvider) => void;
};

const NavigationPreferenceContext = createContext<NavigationPreferenceContextValue | null>(null);

export function NavigationPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [provider, setProviderState] = useState<NavigationProvider>(readNavigationProvider);

  const setProvider = useCallback((next: NavigationProvider) => {
    writeNavigationProvider(next);
    setProviderState(next);
  }, []);

  const value = useMemo(
    () => ({
      provider,
      label: getNavigationProviderLabel(provider),
      setProvider,
    }),
    [provider, setProvider],
  );

  return (
    <NavigationPreferenceContext.Provider value={value}>
      {children}
    </NavigationPreferenceContext.Provider>
  );
}

export function useNavigationPreference() {
  const ctx = useContext(NavigationPreferenceContext);
  if (!ctx) {
    throw new Error('useNavigationPreference must be used within NavigationPreferenceProvider');
  }
  return ctx;
}
