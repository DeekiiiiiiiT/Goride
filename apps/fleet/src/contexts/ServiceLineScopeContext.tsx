import React, { useMemo } from 'react';
import { useBusinessConfig } from '../components/auth/BusinessConfigContext';
import { useFeatureFlags } from '../components/auth/FeatureFlagContext';
import {
  ServiceLineScopeContext,
  mergeOrgServiceLines,
  scopeForLines,
  useServiceLineScope,
  type ServiceLine,
  type ServiceLineScope,
  type ServiceLineScopeContextValue,
} from '@roam/platform-ops-ui';

export {
  useServiceLineScope,
  type ServiceLine,
  type ServiceLineScope,
  type ServiceLineScopeContextValue,
};

/**
 * Fleet shell provider — derives scope from org BusinessConfig + feature flags,
 * and feeds the shared platform-ops-ui context (so ledger pages see the same scope).
 */
export function ServiceLineScopeProvider({ children }: { children: React.ReactNode }) {
  const { serviceLines: configLines } = useBusinessConfig();
  const { serviceLines: moduleLines } = useFeatureFlags();

  const serviceLines = useMemo(
    () => mergeOrgServiceLines(configLines as ServiceLine[], moduleLines as ServiceLine[]),
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
