import React from 'react';
import { Loader2, ShieldAlert, LogIn } from 'lucide-react';
import type { AdminAuthGateProps } from '../types/admin';

/**
 * Default loading component shown while auth state is being determined.
 */
function DefaultLoading() {
  return (
    <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-400">
      <Loader2 className="w-8 h-8 animate-spin" />
    </div>
  );
}

/**
 * Default unauthorized component shown when user doesn't have required role.
 */
function DefaultUnauthorized() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-200 p-8">
      <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
        <ShieldAlert className="w-8 h-8 text-red-400" />
      </div>
      <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
      <p className="text-slate-400 text-center max-w-md">
        You don't have permission to access this admin portal.
        Please contact your administrator if you believe this is an error.
      </p>
    </div>
  );
}

/**
 * Default login prompt shown when user is not authenticated.
 */
function DefaultLoginPrompt() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-200 p-8">
      <div className="w-16 h-16 rounded-full bg-amber-500/15 flex items-center justify-center mb-4">
        <LogIn className="w-8 h-8 text-amber-400" />
      </div>
      <h1 className="text-xl font-semibold mb-2">Sign In Required</h1>
      <p className="text-slate-400 text-center max-w-md">
        Please sign in to access this admin portal.
      </p>
    </div>
  );
}

/**
 * Auth gate component that controls access to admin portal.
 * Shows appropriate UI based on auth state and user role.
 */
export function AdminAuthGate({
  allowedRoles,
  userRole,
  loading = false,
  children,
  loadingComponent,
  unauthorizedComponent,
  loginComponent,
  isAuthenticated = false,
}: AdminAuthGateProps) {
  // Still loading auth state
  if (loading) {
    return <>{loadingComponent ?? <DefaultLoading />}</>;
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <>{loginComponent ?? <DefaultLoginPrompt />}</>;
  }

  // Check role access
  const hasAccess = userRole && allowedRoles.includes(userRole);
  
  if (!hasAccess) {
    return <>{unauthorizedComponent ?? <DefaultUnauthorized />}</>;
  }

  // Authorized - render children
  return <>{children}</>;
}
