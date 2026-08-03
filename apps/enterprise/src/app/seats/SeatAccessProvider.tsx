import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import {
  MODULE_SEAT_PERMISSION,
  enterpriseSeatHasPermission,
  getEnterpriseSeatPermissions,
  resolveEnterpriseSeatRole,
  type EnterpriseSeatPermission,
  type EnterpriseSeatRole,
} from '@roam/auth-client';
import { useAuth } from '@/app/auth/AuthProvider';

type SeatAccessValue = {
  seatRole: EnterpriseSeatRole;
  can: (permission: EnterpriseSeatPermission) => boolean;
  canAccessModule: (moduleKey: string) => boolean;
  permissions: readonly EnterpriseSeatPermission[];
};

const SeatAccessContext = createContext<SeatAccessValue | null>(null);

export function SeatAccessProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const seatRole = useMemo(() => resolveEnterpriseSeatRole(role), [role]);
  const permissions = useMemo(() => getEnterpriseSeatPermissions(seatRole), [seatRole]);

  const can = useCallback(
    (permission: EnterpriseSeatPermission) =>
      enterpriseSeatHasPermission(seatRole, permission),
    [seatRole],
  );

  const canAccessModule = useCallback(
    (moduleKey: string) => {
      const need = MODULE_SEAT_PERMISSION[moduleKey];
      if (!need) return true;
      return enterpriseSeatHasPermission(seatRole, need);
    },
    [seatRole],
  );

  const value = useMemo(
    () => ({ seatRole, can, canAccessModule, permissions }),
    [seatRole, can, canAccessModule, permissions],
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
