export {
  supabase,
  supabaseDriverApp,
  supabaseDriverAdmin,
  supabaseHaulApp,
  supabaseHaulAdmin,
  supabaseCourierApp,
  supabaseCourierAdmin,
  supabaseRidesAdmin,
  supabaseDashAdmin,
  supabaseFleetAdmin,
} from './supabase';
export { supabaseRecovery, isPasswordRecoveryUrl } from './supabaseRecovery';
export { PasswordRecoveryPage } from './components/PasswordRecoveryPage';
export type { PasswordRecoveryPageProps } from './components/PasswordRecoveryPage';
export { AuthRecoveryGate } from './components/AuthRecoveryGate';
export type { AuthRecoveryGateProps } from './components/AuthRecoveryGate';
export {
  AUTH_RECOVERY_REDIRECTS,
  recoveryRedirectForSurface,
  recoveryRedirectForCurrentOrigin,
  recoveryRedirectForProduct,
} from './authRecoveryRedirects';
export type { AuthRecoverySurface, RecoveryProductKey } from './authRecoveryRedirects';
export { requestPasswordReset } from './requestPasswordReset';
export { useForgotPassword } from './hooks/useForgotPassword';
export type { UseForgotPasswordOptions } from './hooks/useForgotPassword';
export {
  rememberRecoverySignInHref,
  consumeRecoverySignInHref,
} from './recoverySignInStorage';
export * from './permissions';
export * from './platformPermissions';
export * from './roleHierarchy';
export * from './hooks/usePermissions';
export * from './oauthRoleGuard';
export * from './oauthProfile';
export * from './jwtRole';
export * from './productAdminRoles';
