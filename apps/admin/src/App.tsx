import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthRecoveryGate, flashAdminLoginError } from '@roam/auth-client';
import { AuthProvider, useAuth } from './components/auth/AuthContext';
import { AdminConfirmProvider } from '@roam/admin-core';
import { AdminLoginPage } from './components/admin/AdminLoginPage';
import { AdminPortal } from './components/admin/AdminPortal';
// Soft path rules shared with apps/admin/middleware.js (Vercel Edge cookie gate).
import { requiresSessionGate } from './middleware/sessionGate';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const { user, isPlatformUser, loading, signOut } = useAuth();
  // Path-based gate (Vite SPA): AuthProvider is authoritative; Edge middleware is soft cookie UX.
  const pathNeedsSession =
    typeof window !== 'undefined' && requiresSessionGate(window.location.pathname);

  // Non-platform account: kick back to login with generic error (no wrong-portal redirects)
  useEffect(() => {
    if (loading || !user || isPlatformUser) return;
    flashAdminLoginError();
    void signOut();
  }, [loading, user, isPlatformUser, signOut]);

  if (loading || (user && !isPlatformUser)) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        Loading...
      </div>
    );
  }

  if (!user || !isPlatformUser) {
    if (pathNeedsSession && typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
    }
    return <AdminLoginPage />;
  }

  return (
    <AdminConfirmProvider>
      <AdminPortal />
    </AdminConfirmProvider>
  );
}

export default function App() {
  return (
    <AuthRecoveryGate
      title="Reset password"
      subtitle="Roam Dominion Super Admin"
      signInHref="/"
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </AuthRecoveryGate>
  );
}
