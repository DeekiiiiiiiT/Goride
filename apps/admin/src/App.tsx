import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthRecoveryGate } from '@roam/auth-client';
import { AuthProvider, useAuth } from './components/auth/AuthContext';
import { AdminLoginPage } from './components/admin/AdminLoginPage';
import { AdminPortal } from './components/admin/AdminPortal';
import { isPassengerOnlyMetadataRole } from '@roam/auth-client';
import { WrongAdminSurfaceGate } from './components/auth/WrongAdminSurfaceGate';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
        Loading...
      </div>
    );
  }

  if (user && !isPlatformUser) {
    const raw = user.user_metadata?.role as string | undefined;
    return (
      <WrongAdminSurfaceGate
        variant={isPassengerOnlyMetadataRole(raw) ? 'passenger' : 'other'}
        onSignOut={signOut}
      />
    );
  }

  if (!user || !isPlatformUser) {
    return <AdminLoginPage />;
  }

  return <AdminPortal />;
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
