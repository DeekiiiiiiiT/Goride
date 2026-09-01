import React, { useCallback, useEffect, useState } from 'react';
import { SplashPage } from '@/pages/onboarding/SplashPage';
import { WelcomePage } from '@/pages/onboarding/WelcomePage';
import { HowItWorksPage } from '@/pages/onboarding/HowItWorksPage';
import { SignUpPage } from '@/pages/onboarding/SignUpPage';
import { VerifyAccountPage } from '@/pages/onboarding/VerifyAccountPage';
import { ProfileSetupPage } from '@/pages/onboarding/ProfileSetupPage';
import { FleetInviteCodePage } from '@/pages/onboarding/FleetInviteCodePage';
import { CourierWorkforceArchetypePage } from '@/pages/onboarding/CourierWorkforceArchetypePage';
import { VehicleSetupPage } from '@/pages/onboarding/VehicleSetupPage';
import { DocumentsPage } from '@/pages/onboarding/DocumentsPage';
import { PermissionsPage } from '@/pages/onboarding/PermissionsPage';
import { AccountPendingPage } from '@/pages/onboarding/AccountPendingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { CourierHomePage } from '@/pages/home/CourierHomePage';
import { SessionExpiredSheet } from '@/components/auth/SessionExpiredSheet';
import { isOnboardingComplete, markOnboardingComplete, resetOnboarding, syncOnboardingFromProfile, isProfilePending } from '@/lib/onboardingStorage';
import { clearSignupDraft, saveSignupDraft } from '@/lib/signupDraft';
import { clearCourierLocalState } from '@/lib/courierStorage';
import { cancelCourierSettingsSave } from '@/lib/courierSettingsSync';
import {
  COURIER_OAUTH_INTENT_KEY,
  COURIER_OAUTH_INTENT_LOGIN,
  COURIER_OAUTH_INTENT_SIGNUP,
} from '@/lib/courierAuth';
import { supabase } from '@/lib/supabase';
import { ensureCourierProfile } from '@/lib/ensureCourierProfile';
import { realDispatchProvider } from '@/services/courierDispatch/RealDispatchProvider';

function FleetInviteGate({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const [auth, setAuth] = useState<{ token: string; userId: string } | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token && session.user?.id) {
        setAuth({ token: session.access_token, userId: session.user.id });
      } else {
        onContinue();
      }
    });
  }, [onContinue]);

  if (!auth) return null;

  return (
    <FleetInviteCodePage
      onBack={onBack}
      onContinue={onContinue}
      accessToken={auth.token}
    />
  );
}

type AppPhase =
  | 'splash'
  | 'welcome'
  | 'how-it-works'
  | 'workforce-archetype'
  | 'sign-up'
  | 'verify'
  | 'profile-setup'
  | 'fleet-invite'
  | 'vehicle-setup'
  | 'documents'
  | 'permissions'
  | 'account-pending'
  | 'login'
  | 'app';

export function CourierConsumerApp() {
  const [phase, setPhase] = useState<AppPhase>('splash');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [workforceChoice, setWorkforceChoice] = useState<'independent' | 'join_fleet'>('independent');

  const finishOnboarding = useCallback(() => {
    void ensureCourierProfile({ markComplete: true }).finally(() => {
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
    if (!session) {
      setPhase('welcome');
      return;
    }
    await ensureCourierProfile();
    const synced = await syncOnboardingFromProfile();
    if (synced) {
      setPhase('app');
      return;
    }
    if (await isProfilePending()) {
      setPhase('account-pending');
      return;
    }
    setPhase('account-pending');
  }, []);

  useEffect(() => {
    document.title = 'Roam Rush Courier';
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
        setSessionExpired(false);
        void completeOAuthIfNeeded();
      }
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        realDispatchProvider.goOffline();
        if (phase === 'app') setSessionExpired(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [finishOnboarding, finishLogin, phase]);

  const handleSignOut = useCallback(async () => {
    cancelCourierSettingsSave();
    clearCourierLocalState();
    resetOnboarding();
    clearSignupDraft();
    realDispatchProvider.goOffline();
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('courier signOut:', e);
    }
    setSessionExpired(false);
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
        onComplete={() => setPhase('workforce-archetype')}
        onSkip={() => setPhase('workforce-archetype')}
      />
    );
  }

  if (phase === 'workforce-archetype') {
    return (
      <CourierWorkforceArchetypePage
        onIndependent={() => {
          setWorkforceChoice('independent');
          setPhase('sign-up');
        }}
        onJoinFleet={() => {
          setWorkforceChoice('join_fleet');
          setPhase('sign-up');
        }}
      />
    );
  }

  if (phase === 'sign-up') {
    return (
      <SignUpPage onBack={() => setPhase('workforce-archetype')} onContinue={() => setPhase('verify')} />
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
        onContinue={() => setPhase(workforceChoice === 'join_fleet' ? 'fleet-invite' : 'vehicle-setup')}
      />
    );
  }

  if (phase === 'fleet-invite') {
    return (
      <FleetInviteGate
        onBack={() => setPhase('profile-setup')}
        onContinue={() => setPhase('vehicle-setup')}
      />
    );
  }

  if (phase === 'vehicle-setup') {
    return (
      <VehicleSetupPage
        onBack={() => setPhase('fleet-invite')}
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
        onLogOut={() => void handleSignOut()}
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

  return (
    <>
      <CourierHomePage onSignOut={handleSignOut} />
      {sessionExpired && (
        <SessionExpiredSheet onSignIn={() => void handleSignOut()} />
      )}
    </>
  );
}
