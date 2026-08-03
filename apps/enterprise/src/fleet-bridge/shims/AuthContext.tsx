/**
 * Fleet-compatible AuthContext backed by Enterprise AuthProvider.
 * Fleet screens import `useAuth` from this path via Vite alias.
 */
import React, { createContext, useContext, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useAuth as useEnterpriseAuth } from '@/app/auth/AuthProvider';

type UserRole = 'admin' | 'manager' | 'viewer' | 'driver' | 'superadmin';
type Role =
  | 'platform_owner'
  | 'platform_support'
  | 'platform_analyst'
  | 'fleet_owner'
  | 'fleet_manager'
  | 'fleet_accountant'
  | 'fleet_viewer'
  | 'driver';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  role: UserRole | null;
  resolvedRole: Role | null;
  /** Raw JWT role (includes enterprise_* seat roles). */
  jwtRole: string | null;
  organizationId: string | null;
  loading: boolean;
  needsProvision: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  resolvedRole: null,
  jwtRole: null,
  organizationId: null,
  loading: true,
  needsProvision: false,
  signOut: async () => {},
  refreshSession: async () => {},
});

function mapRole(role: string | null): { raw: UserRole | null; resolved: Role | null } {
  if (!role) return { raw: null, resolved: null };
  if (
    role === 'admin' ||
    role === 'fleet_owner' ||
    role === 'enterprise_owner'
  ) {
    return { raw: 'admin', resolved: 'fleet_owner' };
  }
  if (
    role === 'manager' ||
    role === 'fleet_manager' ||
    role === 'enterprise_dispatcher' ||
    role === 'enterprise_customs'
  ) {
    return { raw: 'manager', resolved: 'fleet_manager' };
  }
  if (role === 'viewer' || role === 'fleet_viewer' || role === 'enterprise_viewer') {
    return { raw: 'viewer', resolved: 'fleet_viewer' };
  }
  if (role === 'fleet_accountant' || role === 'enterprise_finance') {
    return { raw: 'manager', resolved: 'fleet_accountant' };
  }
  if (role === 'superadmin' || role === 'platform_owner' || role === 'enterprise_admin') {
    return { raw: 'superadmin', resolved: 'platform_owner' };
  }
  if (role === 'enterprise_ops') {
    return { raw: 'manager', resolved: 'fleet_manager' };
  }
  return { raw: 'viewer', resolved: 'fleet_viewer' };
}

/** No-op provider — Enterprise already wraps with AuthProvider; this just adapts. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const ent = useEnterpriseAuth();
  const mapped = mapRole(ent.role);
  const value = useMemo<AuthContextType>(
    () => ({
      session: ent.session,
      user: ent.user,
      role: mapped.raw,
      resolvedRole: mapped.resolved,
      jwtRole: ent.role,
      organizationId: ent.organizationId,
      loading: ent.loading,
      needsProvision: false,
      signOut: ent.signOut,
      refreshSession: ent.refreshSession,
    }),
    [ent, mapped.raw, mapped.resolved],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
