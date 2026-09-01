import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useBusinessConfig, type ServiceLine } from '../components/auth/BusinessConfigContext';
import { useFeatureFlags } from '../components/auth/FeatureFlagContext';
import { useAuth } from '../components/auth/AuthContext';

export type ServiceLineScope = 'all' | 'rideshare' | 'rush_delivery';

const STORAGE_PREFIX = 'roam_fleet_service_line_scope';

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

function storageKey(orgId: string | null, userId: string | null): string {
  if (orgId && userId) return `${STORAGE_PREFIX}:${orgId}:${userId}`;
  return STORAGE_PREFIX;
}

function readStoredScope(key: string): ServiceLineScope | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'all' || stored === 'rideshare' || stored === 'rush_delivery') return stored;
  } catch {
    /* ignore */
  }
  return null;
}

function mergeServiceLines(a: ServiceLine[], b: ServiceLine[]): ServiceLine[] {
  const merged = new Set<ServiceLine>([...a, ...b]);
  return merged.size ? [...merged] : ['rideshare'];
}

function defaultScopeForLines(lines: ServiceLine[]): ServiceLineScope {
  if (lines.includes('rideshare') && lines.includes('rush_delivery')) return 'all';
  if (lines.includes('rush_delivery')) return 'rush_delivery';
  return 'rideshare';
}

export function ServiceLineScopeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { serviceLines: configLines, isLoading: configLoading } = useBusinessConfig();
  const { serviceLines: moduleLines, loading: modulesLoading } = useFeatureFlags();
  const orgId =
    (user?.app_metadata?.organizationId as string | undefined) ??
    (user?.user_metadata?.organizationId as string | undefined) ??
    user?.id ??
    null;
  const serviceLines = useMemo(
    () => mergeServiceLines(configLines, moduleLines),
    [configLines, moduleLines],
  );
  const isLoading = configLoading || modulesLoading;

  const showScopeSwitcher =
    serviceLines.includes('rideshare') && serviceLines.includes('rush_delivery');

  const scopeStorageKey = useMemo(
    () => storageKey(orgId, user?.id ?? null),
    [orgId, user?.id],
  );

  const [scope, setScopeState] = useState<ServiceLineScope>(() => {
    const stored = readStoredScope(scopeStorageKey);
    if (stored) return stored;
    return defaultScopeForLines(serviceLines);
  });

  useEffect(() => {
    if (isLoading) return;
    const stored = readStoredScope(scopeStorageKey);
    if (!stored) {
      setScopeState(defaultScopeForLines(serviceLines));
    }
  }, [isLoading, serviceLines, scopeStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(scopeStorageKey, scope);
    } catch {
      /* ignore */
    }
  }, [scope, scopeStorageKey]);

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
