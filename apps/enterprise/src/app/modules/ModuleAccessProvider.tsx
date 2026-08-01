import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import {
  DEFAULT_ENTERPRISE_ENABLED_MODULES,
  isModuleEnabled as checkModule,
  type ModuleKey,
} from '@roam/platform-settings';
import { useAuth } from '@/app/auth/AuthProvider';

type ModuleAccessValue = {
  effectiveModules: Record<string, boolean>;
  loading: boolean;
  isModuleEnabled: (key: ModuleKey | string) => boolean;
  refresh: () => Promise<void>;
};

const ModuleAccessContext = createContext<ModuleAccessValue | null>(null);

export function ModuleAccessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [effectiveModules, setEffectiveModules] = useState<Record<string, boolean>>({
    ...DEFAULT_ENTERPRISE_ENABLED_MODULES,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      setEffectiveModules({ ...DEFAULT_ENTERPRISE_ENABLED_MODULES });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/enterprise/me/modules`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Roam-Product-Line': 'enterprise',
        },
      });
      if (!res.ok) {
        // Fail-open to product defaults so ops screens remain reachable
        setEffectiveModules({ ...DEFAULT_ENTERPRISE_ENABLED_MODULES });
        return;
      }
      const data = await res.json();
      setEffectiveModules({
        ...DEFAULT_ENTERPRISE_ENABLED_MODULES,
        ...(data.effectiveModules || {}),
      });
    } catch {
      setEffectiveModules({ ...DEFAULT_ENTERPRISE_ENABLED_MODULES });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isModuleEnabled = useCallback(
    (key: ModuleKey | string) => checkModule(effectiveModules, key),
    [effectiveModules],
  );

  const value = useMemo(
    () => ({ effectiveModules, loading, isModuleEnabled, refresh }),
    [effectiveModules, loading, isModuleEnabled, refresh],
  );

  return (
    <ModuleAccessContext.Provider value={value}>{children}</ModuleAccessContext.Provider>
  );
}

export function useModuleAccess() {
  const ctx = useContext(ModuleAccessContext);
  if (!ctx) throw new Error('useModuleAccess must be used within ModuleAccessProvider');
  return ctx;
}
