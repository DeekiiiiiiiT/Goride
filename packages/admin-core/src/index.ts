// Components
export { AdminShell } from './components/AdminShell';
export { AdminSidebar } from './components/AdminSidebar';
export { AdminAuthGate } from './components/AdminAuthGate';
export { PermissionGate } from './components/PermissionGate';
export { AppPermissionsTable } from './components/AppPermissionsTable';
export { AdminConfirmDialog } from './components/AdminConfirmDialog';
export { AdminFormDialog } from './components/AdminFormDialog';
export type {
  AdminConfirmDialogProps,
  AdminConfirmVariant,
} from './components/AdminConfirmDialog';
export type { AdminFormDialogProps, AdminFormField } from './components/AdminFormDialog';
export {
  AdminConfirmProvider,
  useAdminConfirm,
} from './contexts/AdminConfirmContext';
export type {
  AdminConfirmOptions,
  AdminPromptOptions,
} from './contexts/AdminConfirmContext';
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
  AdminNavGroup,
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

// Ledger (unified platform)
export {
  formatPlatformLedgerWhen,
  PLATFORM_LEDGER_STATUS_OPTIONS,
  PLATFORM_LEDGER_PAYMENT_OPTIONS,
  PLATFORM_LEDGER_LINE_KIND_OPTIONS,
} from './ledger/platformTripLedgerShared';

// Settings
export * from './settings';
