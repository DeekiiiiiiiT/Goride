// Components
export { AdminShell } from './components/AdminShell';
export { AdminSidebar } from './components/AdminSidebar';
export { AdminAuthGate } from './components/AdminAuthGate';
export { PermissionGate } from './components/PermissionGate';
export { AppPermissionsTable } from './components/AppPermissionsTable';
export type { AppPermissionPolicyPatch } from './components/AppPermissionsTable';
export {
  canWriteAppPermissionPolicy,
  RIDER_APP_PERMISSION_WRITE_ROLES,
  DRIVER_APP_PERMISSION_WRITE_ROLES,
} from './appPermissionPolicyAuth';

// Hooks
export { useAdminNav } from './hooks/useAdminNav';
export { useAdminAuth } from './hooks/useAdminAuth';

// Types
export type {
  AdminNavItem,
  AdminSection,
  AdminPage,
  AdminProduct,
  AdminConfig,
  AdminTheme,
  AdminShellProps,
  AdminSidebarProps,
  AdminAuthGateProps,
  AdminNavState,
  AdminNavActions,
} from './types/admin';

export type {
  ProductAdminRole,
  AdminRole,
  ProductKey,
} from './types/permissions';

// Permissions
export {
  PLATFORM_ROLES,
  PRODUCT_ADMIN_ACCESS,
  PRODUCT_ROLE_META,
  hasProductAdminAccess,
  isPlatformRole,
  getAccessibleProducts,
} from './types/permissions';

// Utils
export { cn } from './utils/cn';

// Settings
export * from './settings';
