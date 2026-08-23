import React, { createContext, useContext } from 'react';
import { usePermissions, supabaseDashAdmin as supabase } from '@roam/auth-client';
import {
  canDeleteDashAdmin,
  canForceApproveMerchant,
  canWriteDashAdmin,
} from '../utils/dashAdminRoles';
import type { AdminOutletContext } from '../DashAdminPortal';

type DashAdminAccess = {
  canWrite: boolean;
  canDelete: boolean;
  canForceApprove: boolean;
  hasPermission: (key: string) => boolean;
  canIdentityAction: (key: string) => boolean;
};

const DashAdminAccessContext = createContext<DashAdminAccess | null>(null);

export function DashAdminAccessProvider({
  session,
  children,
}: {
  session: AdminOutletContext['session'];
  children: React.ReactNode;
}) {
  const { hasPermission, permissions } = usePermissions({ supabase });
  const value: DashAdminAccess = {
    hasPermission,
    canIdentityAction: (key: string) => hasPermission(key) || hasPermission('system.config'),
    canWrite: canWriteDashAdmin(session.user, permissions),
    canDelete: canDeleteDashAdmin(session.user, permissions),
    canForceApprove: canForceApproveMerchant(session.user, permissions),
  };
  return (
    <DashAdminAccessContext.Provider value={value}>{children}</DashAdminAccessContext.Provider>
  );
}

export function useDashAdminAccess(): DashAdminAccess {
  const ctx = useContext(DashAdminAccessContext);
  if (!ctx) {
    return {
      canWrite: false,
      canDelete: false,
      canForceApprove: false,
      hasPermission: () => false,
      canIdentityAction: () => false,
    };
  }
  return ctx;
}
