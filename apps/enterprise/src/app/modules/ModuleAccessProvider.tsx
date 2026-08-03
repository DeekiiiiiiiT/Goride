import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { API_ENDPOINTS } from '@roam/api-client';
import {
  allModulesOff,
  isModuleEnabled as checkModule,
  type ModuleKey,
} from '@roam/platform-settings';
import { useAuth } from '@/app/auth/AuthProvider';

type ModuleAccessValue = {
  effectiveModules: Record<string, boolean>;
  loading: boolean;
  modulesError: string | null;
  isModuleEnabled: (key: ModuleKey | string) => boolean;
  refresh: () => Promise<void>;
};

const ModuleAccessContext = createContext<ModuleAccessValue | null>(null);

export function ModuleAccessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  // Fail-closed until a successful fetch — do not default to "all on"
  const [effectiveModules, setEffectiveModules] = useState<Record<string, boolean>>(() =>
    allModulesOff(),
  );
  const [loading, setLoading] = useState(true);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const lastKnownRef = useRef<Record<string, boolean> | null>(null);

  const refresh = useCallback(async () => {
    const token = session?.access_token;
    if (!token) {
      const off = allModulesOff();
      setEffectiveModules(off);
      lastKnownRef.current = null;
      setModulesError(null);
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
        // Keep last-known if we had a successful load; else fail-closed (all off)
        if (lastKnownRef.current) {
          setEffectiveModules(lastKnownRef.current);
          setModulesError('Could not refresh modules — showing last known access.');
        } else {
          setEffectiveModules(allModulesOff());
          setModulesError('Could not load modules. Retry or contact support.');
        }
        return;
      }
      const data = await res.json();
      const next = {
        ...allModulesOff(),
        ...(data.effectiveModules || {}),
      };
      // resolveEffectiveModules returns explicit booleans; merge onto all-off base
      lastKnownRef.current = next;
      setEffectiveModules(next);
      setModulesError(null);
    } catch {
      if (lastKnownRef.current) {
        setEffectiveModules(lastKnownRef.current);
        setModulesError('Could not refresh modules — showing last known access.');
      } else {
        setEffectiveModules(allModulesOff());
        setModulesError('Could not load modules. Retry or contact support.');
      }
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
    () => ({ effectiveModules, loading, modulesError, isModuleEnabled, refresh }),
    [effectiveModules, loading, modulesError, isModuleEnabled, refresh],
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
