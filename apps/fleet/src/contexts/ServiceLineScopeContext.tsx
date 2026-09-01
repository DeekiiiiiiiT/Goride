import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useBusinessConfig, type ServiceLine } from '../components/auth/BusinessConfigContext';
import { useFeatureFlags } from '../components/auth/FeatureFlagContext';

export type ServiceLineScope = 'all' | 'rideshare' | 'rush_delivery';

const STORAGE_KEY = 'roam_fleet_service_line_scope';

interface ServiceLineScopeContextValue {
  scope: ServiceLineScope;
  setScope: (scope: ServiceLineScope) => void;
  serviceLines: ServiceLine[];
  showScopeSwitcher: boolean;
  rushVisible: boolean;
  rideshareVisible: boolean;
}

const ServiceLineScopeContext = createContext<ServiceLineScopeContextValue>({
  scope: 'rideshare',
  setScope: () => {},
  serviceLines: ['rideshare'],
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

function mergeServiceLines(
  a: ServiceLine[],
  b: ServiceLine[],
): ServiceLine[] {
  const merged = new Set<ServiceLine>([...a, ...b]);
  return merged.size ? [...merged] : ['rideshare'];
}

function defaultScopeForLines(lines: ServiceLine[]): ServiceLineScope {
  if (lines.includes('rideshare') && lines.includes('rush_delivery')) return 'all';
  if (lines.includes('rush_delivery')) return 'rush_delivery';
  return 'rideshare';
}

export function ServiceLineScopeProvider({ children }: { children: React.ReactNode }) {
  const { serviceLines: configLines, isLoading: configLoading } = useBusinessConfig();
  const { serviceLines: moduleLines, loading: modulesLoading } = useFeatureFlags();
  const serviceLines = useMemo(
    () => mergeServiceLines(configLines, moduleLines),
    [configLines, moduleLines],
  );
  const isLoading = configLoading || modulesLoading;

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
    () => ({ scope, setScope, serviceLines, showScopeSwitcher, rushVisible, rideshareVisible }),
    [scope, setScope, serviceLines, showScopeSwitcher, rushVisible, rideshareVisible],
  );

  return (
    <ServiceLineScopeContext.Provider value={value}>{children}</ServiceLineScopeContext.Provider>
  );
}

export function useServiceLineScope() {
  return useContext(ServiceLineScopeContext);
}
