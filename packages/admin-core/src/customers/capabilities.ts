const SUSPEND_ROLES = new Set([
  'platform_owner',
  'superadmin',
  'platform_support',
  'enterprise_admin',
  'fleet_admin',
  'enterprise_ops',
  'fleet_ops',
]);

const EDIT_ROLES = new Set([
  'platform_owner',
  'superadmin',
  'enterprise_admin',
  'fleet_admin',
]);

/** Plan: enterprise_ops can create customers; full-delete stays platform-only. */
const CREATE_ROLES = new Set([
  ...EDIT_ROLES,
  'enterprise_ops',
  'fleet_ops',
]);

export type AccountCapabilities = {
  canSuspend: boolean;
  canEdit: boolean;
  canCreate: boolean;
  canResetPassword: boolean;
  canFullDelete: boolean;
  /** update-user edit — only on Dominion /admin namespace */
  canEditUser: boolean;
  /** team role change / remove — only on /admin namespace */
  canManageTeam: boolean;
};

export function deriveAccountCapabilities(
  callerRole: string | null,
  apiNamespace: string,
): AccountCapabilities {
  const role = callerRole ?? '';
  const onAdminNamespace = apiNamespace === '/admin';

  const canSuspend = SUSPEND_ROLES.has(role);
  const canEdit = EDIT_ROLES.has(role);
  const canCreate = CREATE_ROLES.has(role);
  const canResetPassword = canSuspend;
  const canFullDelete =
    onAdminNamespace && (role === 'superadmin' || role === 'platform_owner');

  return {
    canSuspend,
    canEdit,
    canCreate,
    canResetPassword,
    canFullDelete,
    canEditUser: canEdit && onAdminNamespace,
    canManageTeam: canEdit && onAdminNamespace,
  };
}
