import { useMemo } from 'react';
import { useServiceLineScope, type ServiceLineScope } from '../contexts/ServiceLineScopeContext';

/** API-facing service line filter derived from the global scope switcher. */
export type ServiceLineApiParam = 'rideshare' | 'rush_delivery' | 'all';

/**
 * Maps UI scope to query params. Returns `undefined` when scope is `all` (no filter).
 */
export function scopeToApiParam(scope: ServiceLineScope): ServiceLineApiParam | undefined {
  if (scope === 'all') return undefined;
  return scope;
}

export function useServiceLineScopeParam(): {
  scope: ServiceLineScope;
  serviceLineParam: ServiceLineApiParam | undefined;
} {
  const { scope } = useServiceLineScope();
  const serviceLineParam = useMemo(() => scopeToApiParam(scope), [scope]);
  return { scope, serviceLineParam };
}
