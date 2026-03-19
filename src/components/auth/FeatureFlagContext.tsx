import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { API_ENDPOINTS } from '../../services/apiConfig';

interface EnabledModules {
  fuelManagement: boolean;
  tollManagement: boolean;
  driverPortal: boolean;
  fleetEquipment: boolean;
  claimableLoss: boolean;
  performanceAnalytics: boolean;
}

const ALL_ENABLED: EnabledModules = {
  fuelManagement: true,
  tollManagement: true,
  driverPortal: true,
  fleetEquipment: true,
  claimableLoss: true,
  performanceAnalytics: true,
};

interface FeatureFlagContextValue {
  enabledModules: EnabledModules;
  isModuleEnabled: (module: keyof EnabledModules) => boolean;
  loading: boolean;
  refresh: () => void;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  enabledModules: ALL_ENABLED,
  isModuleEnabled: () => true,
  loading: true,
  refresh: () => {},
});

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const [enabledModules, setEnabledModules] = useState<EnabledModules>(ALL_ENABLED);
  const [loading, setLoading] = useState(true);

  const fetchFlags = useCallback(async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.fleet}/platform-feature-flags`);
      if (res.ok) {
        const data = await res.json();
        setEnabledModules({ ...ALL_ENABLED, ...(data.enabledModules || {}) });
      }
    } catch (e) {
      // Fail-open: keep all modules enabled
      console.log('[FeatureFlags] Failed to fetch, failing open:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();
    // Refresh every 5 minutes
    const interval = setInterval(fetchFlags, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchFlags]);

  const isModuleEnabled = useCallback(
    (module: keyof EnabledModules) => enabledModules[module] !== false,
    [enabledModules]
  );

  return (
    <FeatureFlagContext.Provider value={{ enabledModules, isModuleEnabled, loading, refresh: fetchFlags }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagContext);
}
