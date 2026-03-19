/**
 * PermissionGate — Blocks access to content if the user lacks a required permission.
 *
 * Usage:
 *   <PermissionGate permission="nav.settings">
 *     <SettingsPage />
 *   </PermissionGate>
 *
 * Created: Phase 4 of the RBAC rollout (see /solution.md).
 */

import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { ShieldOff } from 'lucide-react';
import type { Permission } from '../../utils/permissions';

interface PermissionGateProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** If provided, called when user clicks "Go to Dashboard" */
  onNavigate?: (page: string) => void;
}

function DefaultAccessDenied({ onNavigate }: { onNavigate?: (page: string) => void }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto p-8 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-4">
          <ShieldOff className="h-7 w-7 text-red-500 dark:text-red-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Access Denied
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          You don't have permission to view this page. Contact your fleet administrator to request access.
        </p>
        {onNavigate && (
          <button
            onClick={() => onNavigate('dashboard')}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            Go to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}

export function PermissionGate({ permission, children, fallback, onNavigate }: PermissionGateProps) {
  const { can } = usePermissions();

  if (can(permission)) {
    return <>{children}</>;
  }

  return <>{fallback ?? <DefaultAccessDenied onNavigate={onNavigate} />}</>;
}
