import React, { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { isHaulUiBlockedRole } from '@roam/auth-client';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HaulerProvider } from './contexts/HaulerContext';
import { HaulerLoginPage } from './components/auth/HaulerLoginPage';
import { WrongHaulSurfaceGate } from './components/auth/WrongHaulSurfaceGate';
import { HaulerAppGate } from './components/layout/HaulerAppGate';
import { HaulAdminPortal } from './admin/HaulAdminPortal';
import { HaulSplashScreen } from './components/onboarding/HaulSplashScreen';
import { HaulToaster } from './components/ui/HaulToaster';
import {
  HaulOnboardingFlow,
  type AuthIntent,
} from './components/onboarding/HaulOnboardingFlow';
import { hasCompletedOnboarding } from './lib/onboardingStorage';

const SPLASH_MIN_MS = 2000;

function HaulerApp() {
  const { user, loading, signOut } = useAuth();
  const [splashMinElapsed, setSplashMinElapsed] = useState(false);
  const [authIntent, setAuthIntent] = useState<AuthIntent | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding());

  useEffect(() => {
    const timer = window.setTimeout(() => setSplashMinElapsed(true), SPLASH_MIN_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading || !splashMinElapsed) {
    return <HaulSplashScreen />;
  }

  if (!user) {
    if (showOnboarding && authIntent === null) {
      return (
        <HaulOnboardingFlow
          onComplete={(intent) => {
            setAuthIntent(intent);
            setShowOnboarding(false);
          }}
        />
      );
    }

    return (
      <HaulerLoginPage initialView={authIntent === 'signup' ? 'signup' : 'login'} />
    );
  }

  if (isHaulUiBlockedRole(user)) {
    return <WrongHaulSurfaceGate user={user} onSignOut={() => void signOut()} />;
  }

  return (
    <HaulerProvider>
      <HaulerAppGate />
    </HaulerProvider>
  );
}

export default function App() {
  if (window.location.pathname.startsWith('/admin')) {
    return (
      <BrowserRouter basename="/admin">
        <HaulAdminPortal />
      </BrowserRouter>
    );
  }

  return (
    <AuthProvider>
      <HaulToaster />
      <HaulerApp />
    </AuthProvider>
  );
}
