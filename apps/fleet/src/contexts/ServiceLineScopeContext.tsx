import React, { createContext, useContext, useMemo } from 'react';
import { useBusinessConfig, type ServiceLine } from '../components/auth/BusinessConfigContext';
import { useFeatureFlags } from '../components/auth/FeatureFlagContext';

/**
 * Capability contract (no manager preference):
 * - serviceLines = what the org runs (organizations.service_lines)
 * - rideshareVisible / rushVisible = serviceLines.includes(...) only
 * - scope is derived for API callers (dual → 'all'); managers cannot hide a line
 */
export type ServiceLineScope = 'all' | 'rideshare' | 'rush_delivery';

interface ServiceLineScopeContextValue {
  scope: ServiceLineScope;
  /** No-op — scope is capability-derived; kept for callers that still pass setScope. */
  setScope: (scope: ServiceLineScope) => void;
  serviceLines: ServiceLine[];
  /** Always false — header Scope switcher removed. */
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

function mergeServiceLines(a: ServiceLine[], b: ServiceLine[]): ServiceLine[] {
  const merged = new Set<ServiceLine>([...a, ...b]);
  return merged.size ? [...merged] : ['rideshare'];
}

function scopeForLines(lines: ServiceLine[]): ServiceLineScope {
  if (lines.includes('rideshare') && lines.includes('rush_delivery')) return 'all';
  if (lines.includes('rush_delivery')) return 'rush_delivery';
  return 'rideshare';
}

export function ServiceLineScopeProvider({ children }: { children: React.ReactNode }) {
  const { serviceLines: configLines } = useBusinessConfig();
  const { serviceLines: moduleLines } = useFeatureFlags();

  const serviceLines = useMemo(
    () => mergeServiceLines(configLines, moduleLines),
    [configLines, moduleLines],
  );

  const scope = useMemo(() => scopeForLines(serviceLines), [serviceLines]);
  const rushVisible = serviceLines.includes('rush_delivery');
  const rideshareVisible = serviceLines.includes('rideshare');

  const value = useMemo(
    () => ({
      scope,
      setScope: () => {},
      serviceLines,
      showScopeSwitcher: false,
      rushVisible,
      rideshareVisible,
    }),
    [scope, serviceLines, rushVisible, rideshareVisible],
  );

  return (
    <ServiceLineScopeContext.Provider value={value}>{children}</ServiceLineScopeContext.Provider>
  );
}

export function useServiceLineScope() {
  return useContext(ServiceLineScopeContext);
}
