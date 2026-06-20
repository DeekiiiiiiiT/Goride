import React from 'react';
import type { PermissionKey } from '@roam/auth-client';
import { usePermissions } from '@roam/auth-client';

export type PermissionGateProps = {
  permission: PermissionKey | PermissionKey[];
  requireAll?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Renders children only when the current user has the required permission(s).
 * Uses database-backed permissions via identity/permissions API.
 */
export function PermissionGate({
  permission,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { hasPermission, hasAllPermissions, loading } = usePermissions();

  if (loading) return null;

  const keys = Array.isArray(permission) ? permission : [permission];
  const allowed = requireAll ? hasAllPermissions(keys) : hasPermission(keys);

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
