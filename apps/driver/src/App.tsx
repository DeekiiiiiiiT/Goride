import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DriverProvider, useDriver } from './contexts/DriverContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { OfflineProvider } from './components/providers/OfflineProvider';
import { DriverLoginPage } from './components/auth/DriverLoginPage';
import { DriverHybridOnboarding } from './components/onboarding/DriverHybridOnboarding';
import { DriverGoogleSignupWizard } from './components/onboarding/DriverGoogleSignupWizard';
import { DriverShell } from './components/layout/DriverShell';
import { AppErrorBoundary } from './components/layout/AppErrorBoundary';
import { needsGoogleExtendedSignup } from './utils/googleDriverSignup';
import { BrowserRouter } from 'react-router-dom';
import { DriverAdminPortal } from './admin/DriverAdminPortal';

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

function AuthLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent dark:border-emerald-500" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading...</p>
      </div>
    </div>
  );
}

function AuthenticatedDriverRoute() {
  const { user } = useAuth();
  const { profile, loading } = useDriver();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (needsGoogleExtendedSignup(user, profile)) {
    return <DriverGoogleSignupWizard />;
  }

  if (profile === null) {
    return <DriverHybridOnboarding />;
  }

  if (!profile.onboardingComplete) {
    return <DriverHybridOnboarding />;
  }

  return <DriverShell />;
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <DriverLoginPage />;
  }

  return (
    <DriverProvider>
      <AuthenticatedDriverRoute />
    </DriverProvider>
  );
}

export default function App() {
  // Check if we're on the admin path
  if (window.location.pathname.startsWith('/admin')) {
    return (
      <BrowserRouter basename="/admin">
        <DriverAdminPortal />
      </BrowserRouter>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <OfflineProvider>
            <AppErrorBoundary>
              <AppContent />
            </AppErrorBoundary>
          </OfflineProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
