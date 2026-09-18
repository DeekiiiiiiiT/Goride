import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import {
  allModulesOff,
  mergeFleetEffectiveModules,
  DEFAULT_FLEET_ENABLED_MODULES,
  DEFAULT_ENTERPRISE_ENABLED_MODULES,
  type ModuleKey,
} from '@roam/platform-settings';
import { withProductLineHeaders } from '../../config/productLine';
import { fetchEnterpriseModules } from '../../services/enterpriseModulesClient';
import {
  readCachedEnabledModules,
  readCachedServiceLines,
  writeCachedEnabledModules,
  writeCachedServiceLines,
} from '../../utils/orgShellCache';
import { useAuth } from './AuthContext';

/** Legacy fleet module keys used by AppSidebar gating. */
export type FleetLegacyModuleKey =
  | 'fuelManagement'
  | 'tollManagement'
  | 'driverPortal'
  | 'fleetEquipment'
  | 'claimableLoss'
  | 'performanceAnalytics'
  | 'businessFinance';

const LEGACY_FLEET_DEFAULTS: Record<FleetLegacyModuleKey, boolean> = {
  ...DEFAULT_FLEET_ENABLED_MODULES,
  businessFinance: true,
};

interface FeatureFlagContextValue {
  enabledModules: Record<string, boolean>;
  serviceLines: Array<'rideshare' | 'rush_delivery'>;
  isModuleEnabled: (module: FleetLegacyModuleKey | ModuleKey | string) => boolean;
  loading: boolean;
  refresh: () => void;
}

/** Optimistic first paint — never boot with allModulesOff (hides Fleet/Delivery nav). */
function initialEnabledModules(): Record<string, boolean> {
  const cached = readCachedEnabledModules();
  return mergeWithLegacyFleetDefaults({
    ...DEFAULT_ENTERPRISE_ENABLED_MODULES,
    ...(cached || {}),
  });
}

function initialServiceLines(): Array<'rideshare' | 'rush_delivery'> {
  return readCachedServiceLines() ?? ['rideshare'];
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  enabledModules: { ...LEGACY_FLEET_DEFAULTS },
  serviceLines: ['rideshare'],
  isModuleEnabled: () => true,
  loading: true,
  refresh: () => {},
});

function mergeWithLegacyFleetDefaults(effective: Record<string, boolean>): Record<string, boolean> {
  const withRush = mergeFleetEffectiveModules(effective);
  const out: Record<string, boolean> = { ...LEGACY_FLEET_DEFAULTS };
  for (const [key, value] of Object.entries(withRush)) {
    out[key] = value;
  }
  // Preserve existing fleet UX: core ops modules stay on unless explicitly false
  for (const key of Object.keys(LEGACY_FLEET_DEFAULTS) as FleetLegacyModuleKey[]) {
    if (withRush[key] === undefined) {
      out[key] = LEGACY_FLEET_DEFAULTS[key];
    }
  }
  return out;
}

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(initialEnabledModules);
  const [serviceLines, setServiceLines] = useState<Array<'rideshare' | 'rush_delivery'>>(initialServiceLines);
  const [loading, setLoading] = useState(true);
  const lastKnownRef = useRef<Record<string, boolean> | null>(readCachedEnabledModules());
  const orgOverridesRef = useRef<Record<string, boolean>>({});
  const userId = user?.id ?? null;

  const fetchPreLoginShell = useCallback(async () => {
    try {
      const res = await fetch(`${API_ENDPOINTS.fleetCore}/platform-feature-flags`, {
        headers: withProductLineHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const shell = mergeWithLegacyFleetDefaults({
          ...allModulesOff(),
          ...(data.enabledModules || {}),
        });
        setEnabledModules(shell);
      }
    } catch (e) {
      console.log('[FeatureFlags] Pre-login shell fetch failed, keeping defaults:', e);
    }
  }, []);

  const fetchOrgModules = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      await fetchPreLoginShell();
      setLoading(false);
      return;
    }

    const initial = !lastKnownRef.current;
    if (initial) setLoading(true);

    try {
      const data = await fetchEnterpriseModules(token);
      if (!data) {
        if (lastKnownRef.current) {
          setEnabledModules(lastKnownRef.current);
        } else {
          await fetchPreLoginShell();
        }
        return;
      }

      const lines = Array.isArray(data.serviceLines)
        ? data.serviceLines.filter((s: string) => s === 'rideshare' || s === 'rush_delivery')
        : ['rideshare'];
      if (lines.length) {
        const nextLines = lines as Array<'rideshare' | 'rush_delivery'>;
        setServiceLines(nextLines);
        writeCachedServiceLines(nextLines);
      }

      const orgOverrides = (data.orgOverrides || {}) as Record<string, boolean>;
      orgOverridesRef.current = orgOverrides;

      const next = mergeWithLegacyFleetDefaults({
        ...allModulesOff(),
        ...(data.effectiveModules || {}),
      });
      lastKnownRef.current = next;
      setEnabledModules(next);
      writeCachedEnabledModules(next);
    } catch (e) {
      console.log('[FeatureFlags] Org modules fetch failed:', e);
      if (lastKnownRef.current) {
        setEnabledModules(lastKnownRef.current);
      } else {
        await fetchPreLoginShell();
      }
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, fetchPreLoginShell]);

  useEffect(() => {
    void fetchOrgModules();
    const interval = setInterval(() => void fetchOrgModules(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchOrgModules, userId]);

  const isModuleEnabled = useCallback(
    (module: FleetLegacyModuleKey | ModuleKey | string) => {
      // Opt-in flags (must be explicitly true)
      if (module === 'driver_activity' || module === 'fuelSplitPayment' || module.startsWith('rush_')) {
        return enabledModules[module] === true;
      }
      return enabledModules[module] !== false;
    },
    [enabledModules],
  );

  return (
    <FeatureFlagContext.Provider
      value={{ enabledModules, serviceLines, isModuleEnabled, loading, refresh: () => void fetchOrgModules() }}
    >
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagContext);
}

export function useOrgServiceLines() {
  return useFeatureFlags().serviceLines;
}
