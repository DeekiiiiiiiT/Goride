import React, { createContext, useContext, useMemo } from 'react';

/**
 * Capability contract (no manager preference):
 * - serviceLines = what the org runs
 * - rideshareVisible / rushVisible = serviceLines.includes(...) only
 * - scope is derived for API callers (dual → 'all'); managers cannot hide a line
 *
 * Defaults keep Dominion silent-attach working without Fleet shell providers.
 * Fleet mounts ServiceLineScopeProvider with org-derived values (same context).
 */
export type ServiceLine = 'rideshare' | 'rush_delivery';
export type ServiceLineScope = 'all' | 'rideshare' | 'rush_delivery';

export interface ServiceLineScopeContextValue {
  scope: ServiceLineScope;
  /** No-op — scope is capability-derived; kept for callers that still pass setScope. */
  setScope: (scope: ServiceLineScope) => void;
  serviceLines: ServiceLine[];
  /** Always false — header Scope switcher removed. */
  showScopeSwitcher: boolean;
  rushVisible: boolean;
  rideshareVisible: boolean;
}

const DEFAULT_VALUE: ServiceLineScopeContextValue = {
  scope: 'rideshare',
  setScope: () => {},
  serviceLines: ['rideshare'],
  showScopeSwitcher: false,
  rushVisible: false,
  rideshareVisible: true,
};

export const ServiceLineScopeContext =
  createContext<ServiceLineScopeContextValue>(DEFAULT_VALUE);

function mergeServiceLines(a: ServiceLine[], b: ServiceLine[]): ServiceLine[] {
  const merged = new Set<ServiceLine>([...a, ...b]);
  return merged.size ? [...merged] : ['rideshare'];
}

export function scopeForLines(lines: ServiceLine[]): ServiceLineScope {
  if (lines.includes('rideshare') && lines.includes('rush_delivery')) return 'all';
  if (lines.includes('rush_delivery')) return 'rush_delivery';
  return 'rideshare';
}

export function mergeOrgServiceLines(a: ServiceLine[], b: ServiceLine[]): ServiceLine[] {
  return mergeServiceLines(a, b);
}

/** Controlled provider — pass org-derived value from Fleet shell, or omit for defaults. */
export function ServiceLineScopeProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value?: Partial<ServiceLineScopeContextValue> & { serviceLines?: ServiceLine[] };
}) {
  const resolved = useMemo<ServiceLineScopeContextValue>(() => {
    if (!value) return DEFAULT_VALUE;
    const serviceLines = value.serviceLines?.length
      ? value.serviceLines
      : DEFAULT_VALUE.serviceLines;
    const scope = value.scope ?? scopeForLines(serviceLines);
    return {
      scope,
      setScope: value.setScope ?? (() => {}),
      serviceLines,
      showScopeSwitcher: value.showScopeSwitcher ?? false,
      rushVisible: value.rushVisible ?? serviceLines.includes('rush_delivery'),
      rideshareVisible: value.rideshareVisible ?? serviceLines.includes('rideshare'),
    };
  }, [value]);

  return (
    <ServiceLineScopeContext.Provider value={resolved}>{children}</ServiceLineScopeContext.Provider>
  );
}

export function useServiceLineScope(): ServiceLineScopeContextValue {
  return useContext(ServiceLineScopeContext);
}
