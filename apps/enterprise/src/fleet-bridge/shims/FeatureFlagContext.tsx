/**
 * Fleet FeatureFlagContext → Enterprise ModuleAccessProvider.
 */
import React, { createContext, useContext, useMemo } from 'react';
import { useModuleAccess } from '@/app/modules/ModuleAccessProvider';

type EnabledModules = Record<string, boolean>;

type FeatureFlagContextType = {
  enabledModules: EnabledModules;
  isModuleEnabled: (module: keyof EnabledModules | string) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const FeatureFlagContext = createContext<FeatureFlagContextType>({
  enabledModules: {},
  isModuleEnabled: () => true,
  loading: false,
  refresh: async () => {},
});

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const { effectiveModules, isModuleEnabled, loading, refresh } = useModuleAccess();
  const value = useMemo(
    () => ({
      enabledModules: effectiveModules,
      isModuleEnabled: (m: string) => isModuleEnabled(m),
      loading,
      refresh,
    }),
    [effectiveModules, isModuleEnabled, loading, refresh],
  );
  return (
    <FeatureFlagContext.Provider value={value}>{children}</FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagContext);
}
