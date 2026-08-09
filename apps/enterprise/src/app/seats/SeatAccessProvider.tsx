import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  enterpriseSeatHasPermission,
  getEnterpriseSeatPermissions,
  parseSectionOverrides,
  resolveEnterpriseSeatRole,
  seatCanAccessModule,
  type EnterpriseSeatPermission,
  type EnterpriseSeatRole,
  type EnterpriseSectionOverrides,
} from '@roam/auth-client';
import { useAuth } from '@/app/auth/AuthProvider';

type SeatAccessValue = {
  seatRole: EnterpriseSeatRole;
  sectionOverrides: EnterpriseSectionOverrides;
  can: (permission: EnterpriseSeatPermission) => boolean;
  canAccessModule: (moduleKey: string) => boolean;
  permissions: readonly EnterpriseSeatPermission[];
};

const SeatAccessContext = createContext<SeatAccessValue | null>(null);

export function SeatAccessProvider({ children }: { children: ReactNode }) {
  const { role, user } = useAuth();
  const seatRole = useMemo(() => resolveEnterpriseSeatRole(role), [role]);
  const sectionOverrides = useMemo(
    () =>
      parseSectionOverrides(
        user?.app_metadata?.sectionOverrides ?? user?.user_metadata?.sectionOverrides,
      ),
    [user],
  );
  const permissions = useMemo(
    () => getEnterpriseSeatPermissions(seatRole, sectionOverrides),
    [seatRole, sectionOverrides],
  );

  const can = useCallback(
    (permission: EnterpriseSeatPermission) =>
      enterpriseSeatHasPermission(seatRole, permission, sectionOverrides),
    [seatRole, sectionOverrides],
  );

  const canAccessModule = useCallback(
    (moduleKey: string) => seatCanAccessModule(seatRole, moduleKey, sectionOverrides),
    [seatRole, sectionOverrides],
  );

  const value = useMemo(
    () => ({ seatRole, sectionOverrides, can, canAccessModule, permissions }),
    [seatRole, sectionOverrides, can, canAccessModule, permissions],
  );

  return (
    <SeatAccessContext.Provider value={value}>{children}</SeatAccessContext.Provider>
  );
}

export function useSeatAccess() {
  const ctx = useContext(SeatAccessContext);
  if (!ctx) throw new Error('useSeatAccess must be used within SeatAccessProvider');
  return ctx;
}
