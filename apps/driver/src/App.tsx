import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DriverProvider } from './contexts/DriverContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { DriverLoginPage } from './components/auth/DriverLoginPage';
import { DriverShell } from './components/layout/DriverShell';

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
  const { user, isDriver, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent dark:border-emerald-500 rounded-full animate-spin" />
          <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !isDriver) {
    return <DriverLoginPage />;
  }

  return (
    <DriverProvider>
      <DriverShell />
    </DriverProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
