import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useBusinessConfig } from '../components/auth/BusinessConfigContext';

export type ServiceLineScope = 'all' | 'rideshare' | 'rush_delivery';

const STORAGE_KEY = 'roam_fleet_service_line_scope';

interface ServiceLineScopeContextValue {
  scope: ServiceLineScope;
  setScope: (scope: ServiceLineScope) => void;
  /** True when org runs both rideshare and rush delivery — show header switcher. */
  showScopeSwitcher: boolean;
  /** Rush nav/pages visible for current scope. */
  rushVisible: boolean;
  /** Rideshare nav/pages visible for current scope. */
  rideshareVisible: boolean;
}

const ServiceLineScopeContext = createContext<ServiceLineScopeContextValue>({
  scope: 'rideshare',
  setScope: () => {},
  showScopeSwitcher: false,
  rushVisible: false,
  rideshareVisible: true,
});

function readStoredScope(): ServiceLineScope | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'all' || stored === 'rideshare' || stored === 'rush_delivery') return stored;
  } catch {
    /* ignore */
  }
  return null;
}

function defaultScopeForLines(lines: Array<'rideshare' | 'rush_delivery'>): ServiceLineScope {
  if (lines.includes('rideshare') && lines.includes('rush_delivery')) return 'all';
  if (lines.includes('rush_delivery')) return 'rush_delivery';
  return 'rideshare';
}

export function ServiceLineScopeProvider({ children }: { children: React.ReactNode }) {
  const { serviceLines, isLoading } = useBusinessConfig();
  const showScopeSwitcher =
    serviceLines.includes('rideshare') && serviceLines.includes('rush_delivery');

  const [scope, setScopeState] = useState<ServiceLineScope>(() => {
    const stored = readStoredScope();
    if (stored) return stored;
    return defaultScopeForLines(serviceLines);
  });

  useEffect(() => {
    if (isLoading) return;
    const stored = readStoredScope();
    if (!stored) {
      setScopeState(defaultScopeForLines(serviceLines));
    }
  }, [isLoading, serviceLines]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, scope);
    } catch {
      /* ignore */
    }
  }, [scope]);

  const setScope = useCallback((next: ServiceLineScope) => {
    setScopeState(next);
  }, []);

  const rushVisible = useMemo(() => {
    if (!serviceLines.includes('rush_delivery')) return false;
    if (!showScopeSwitcher) return true;
    return scope === 'all' || scope === 'rush_delivery';
  }, [serviceLines, showScopeSwitcher, scope]);

  const rideshareVisible = useMemo(() => {
    if (!serviceLines.includes('rideshare')) return false;
    if (!showScopeSwitcher) return true;
    return scope === 'all' || scope === 'rideshare';
  }, [serviceLines, showScopeSwitcher, scope]);

  const value = useMemo(
    () => ({ scope, setScope, showScopeSwitcher, rushVisible, rideshareVisible }),
    [scope, setScope, showScopeSwitcher, rushVisible, rideshareVisible],
  );

  return (
    <ServiceLineScopeContext.Provider value={value}>{children}</ServiceLineScopeContext.Provider>
  );
}

export function useServiceLineScope() {
  return useContext(ServiceLineScopeContext);
}
