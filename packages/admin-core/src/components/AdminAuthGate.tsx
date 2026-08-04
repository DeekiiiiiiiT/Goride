import React, { useEffect } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import type { AdminAuthGateProps } from '../types/admin';
import { flashAdminLoginError } from '@roam/auth-client';

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
 * Auth gate for admin portals.
 * Wrong-role authenticated users see a spinner while the parent signs them out —
 * never Access Denied or cross-app redirects. Parent must call signOut on deny.
 */
export function AdminAuthGate({
  allowedRoles,
  userRole,
  loading = false,
  children,
  loadingComponent,
  unauthorizedComponent: _unauthorizedComponent,
  loginComponent,
  isAuthenticated = false,
}: AdminAuthGateProps) {
  const hasAccess = !!(userRole && allowedRoles.includes(userRole));

  useEffect(() => {
    if (loading || !isAuthenticated || hasAccess) return;
    flashAdminLoginError();
  }, [loading, isAuthenticated, hasAccess]);

  if (loading || (isAuthenticated && !hasAccess)) {
    return <>{loadingComponent ?? <DefaultLoading />}</>;
  }

  if (!isAuthenticated) {
    return <>{loginComponent ?? <DefaultLoginPrompt />}</>;
  }

  return <>{children}</>;
}
