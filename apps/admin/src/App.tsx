import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './components/auth/AuthContext';
import { AdminLoginPage } from './components/admin/AdminLoginPage';
import { AdminPortal } from './components/admin/AdminPortal';

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
  const { user, isPlatformUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-slate-500">
        Loading...
      </div>
    );
  }

  if (!user || !isPlatformUser) {
    return <AdminLoginPage />;
  }

  return <AdminPortal />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  );
}
