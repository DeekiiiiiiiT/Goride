import React, { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DriverProvider, useDriver } from './contexts/DriverContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { NavigationPreferenceProvider } from './contexts/NavigationPreferenceContext';
import { OfflineProvider } from './components/providers/OfflineProvider';
import { DriverLoginPage } from './components/auth/DriverLoginPage';
import { DriverHybridOnboarding } from './components/onboarding/DriverHybridOnboarding';
import { DriverGoogleSignupWizard } from './components/onboarding/DriverGoogleSignupWizard';
import { DriverShell } from './components/layout/DriverShell';
import { AppErrorBoundary } from './components/layout/AppErrorBoundary';
import { ActiveRideRecoveryProvider, useActiveRideRecovery } from './contexts/ActiveRideRecoveryContext';
import { needsGoogleExtendedSignup } from './utils/googleDriverSignup';
import { BrowserRouter } from 'react-router-dom';
import { DriverAdminPortal } from './admin/DriverAdminPortal';
import { DriverSplashScreen } from './components/layout/DriverSplashScreen';

const SPLASH_MIN_MS = 2000;

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
  return <DriverSplashScreen mode="loading" />;
}

function AuthenticatedDriverRouteInner() {
  const { user } = useAuth();
  const { profile, loading } = useDriver();
  const { recoveryLoaded } = useActiveRideRecovery();

  if (loading || !recoveryLoaded) {
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

function AuthenticatedDriverRoute() {
  return (
    <ActiveRideRecoveryProvider>
      <AuthenticatedDriverRouteInner />
    </ActiveRideRecoveryProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashMinElapsed(true), SPLASH_MIN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading || !splashMinElapsed) {
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
        <NavigationPreferenceProvider>
          <AuthProvider>
            <OfflineProvider>
              <AppErrorBoundary>
                <AppContent />
              </AppErrorBoundary>
            </OfflineProvider>
          </AuthProvider>
        </NavigationPreferenceProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
