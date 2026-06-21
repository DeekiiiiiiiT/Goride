import React, { useCallback, useEffect, useState } from 'react';
import { SplashPage } from '@/pages/onboarding/SplashPage';
import { WelcomePage } from '@/pages/onboarding/WelcomePage';
import { HowItWorksPage } from '@/pages/onboarding/HowItWorksPage';
import { SignUpPage } from '@/pages/onboarding/SignUpPage';
import { VerifyAccountPage } from '@/pages/onboarding/VerifyAccountPage';
import { ProfileSetupPage } from '@/pages/onboarding/ProfileSetupPage';
import { VehicleSetupPage } from '@/pages/onboarding/VehicleSetupPage';
import { DocumentsPage } from '@/pages/onboarding/DocumentsPage';
import { PermissionsPage } from '@/pages/onboarding/PermissionsPage';
import { AccountPendingPage } from '@/pages/onboarding/AccountPendingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { CourierHomePage } from '@/pages/home/CourierHomePage';
import { isOnboardingComplete, markOnboardingComplete, resetOnboarding, syncOnboardingFromProfile, isProfilePending } from '@/lib/onboardingStorage';
import { clearSignupDraft, saveSignupDraft } from '@/lib/signupDraft';
import {
  COURIER_OAUTH_INTENT_KEY,
  COURIER_OAUTH_INTENT_LOGIN,
  COURIER_OAUTH_INTENT_SIGNUP,
} from '@/lib/courierAuth';
import { supabase } from '@/lib/supabase';
import { ensureCourierProfile } from '@/lib/ensureCourierProfile';

type AppPhase =
  | 'splash'
  | 'welcome'
  | 'how-it-works'
  | 'sign-up'
  | 'verify'
  | 'profile-setup'
  | 'vehicle-setup'
  | 'documents'
  | 'permissions'
  | 'account-pending'
  | 'login'
  | 'app';

export function CourierConsumerApp() {
  const [phase, setPhase] = useState<AppPhase>('splash');

  const finishOnboarding = useCallback(() => {
    void ensureCourierProfile().finally(() => {
      markOnboardingComplete();
      clearSignupDraft();
      setPhase('app');
    });
  }, []);

  const finishLogin = useCallback(async () => {
    await ensureCourierProfile();
    const synced = await syncOnboardingFromProfile();
    if (!synced && (await isProfilePending())) {
      setPhase('account-pending');
      return;
    }
    if (isOnboardingComplete()) {
      setPhase('app');
      return;
    }
    setPhase('profile-setup');
  }, []);

  const handleSplashComplete = useCallback(async () => {
    if (!isOnboardingComplete()) {
      setPhase('welcome');
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session && (await isProfilePending())) {
      setPhase('account-pending');
      return;
    }
    setPhase('app');
  }, []);

  useEffect(() => {
    document.title = 'Roam Dash Courier';
  }, []);

  useEffect(() => {
    const completeOAuthIfNeeded = async () => {
      const intent = sessionStorage.getItem(COURIER_OAUTH_INTENT_KEY);
      if (!intent) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      sessionStorage.removeItem(COURIER_OAUTH_INTENT_KEY);

      if (session.user.email) {
        saveSignupDraft({ email: session.user.email });
      }

      if (intent === COURIER_OAUTH_INTENT_LOGIN) {
        void finishLogin();
        return;
      }

      if (intent === COURIER_OAUTH_INTENT_SIGNUP) {
        void ensureCourierProfile();
        setPhase('profile-setup');
      }
    };

    void completeOAuthIfNeeded();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        void completeOAuthIfNeeded();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [finishOnboarding, finishLogin]);

  const handleSignOut = useCallback(() => {
    resetOnboarding();
    clearSignupDraft();
    setPhase('welcome');
  }, []);

  if (phase === 'splash') {
    return <SplashPage onComplete={handleSplashComplete} />;
  }

  if (phase === 'welcome') {
    return (
      <WelcomePage
        onGetStarted={() => setPhase('how-it-works')}
        onSignIn={() => setPhase('login')}
      />
    );
  }

  if (phase === 'how-it-works') {
    return (
      <HowItWorksPage
        onComplete={() => setPhase('sign-up')}
        onSkip={() => setPhase('sign-up')}
      />
    );
  }

  if (phase === 'sign-up') {
    return (
      <SignUpPage onBack={() => setPhase('how-it-works')} onContinue={() => setPhase('verify')} />
    );
  }

  if (phase === 'verify') {
    return (
      <VerifyAccountPage
        onBack={() => setPhase('sign-up')}
        onVerify={() => setPhase('profile-setup')}
      />
    );
  }

  if (phase === 'profile-setup') {
    return (
      <ProfileSetupPage
        onBack={() => setPhase('verify')}
        onContinue={() => setPhase('vehicle-setup')}
      />
    );
  }

  if (phase === 'vehicle-setup') {
    return (
      <VehicleSetupPage
        onBack={() => setPhase('profile-setup')}
        onContinue={() => setPhase('documents')}
      />
    );
  }

  if (phase === 'documents') {
    return (
      <DocumentsPage
        onBack={() => setPhase('vehicle-setup')}
        onContinue={() => setPhase('permissions')}
      />
    );
  }

  if (phase === 'permissions') {
    return (
      <PermissionsPage
        onBack={() => setPhase('documents')}
        onContinue={() => setPhase('account-pending')}
      />
    );
  }

  if (phase === 'account-pending') {
    return (
      <AccountPendingPage
        onLogOut={() => setPhase('welcome')}
        onContactSupport={() => window.open('mailto:support@roam.app', '_blank')}
        onApproved={finishOnboarding}
      />
    );
  }

  if (phase === 'login') {
    return (
      <LoginPage
        onBack={() => setPhase('welcome')}
        onSignIn={() => void finishLogin()}
        onSignUp={() => setPhase('sign-up')}
      />
    );
  }

  return <CourierHomePage onSignOut={handleSignOut} />;
}
