import React, { useState, useEffect, useCallback } from 'react';
import { supabase, AuthRecoveryGate } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import MenuPage from './pages/MenuPage';
import EarningsPage from './pages/EarningsPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import OnboardingPage from './pages/OnboardingPage';
import SplashPage from './pages/SplashPage';
import PartnerAuthFlow from './components/PartnerAuthFlow';
import PartnerBottomNav from './components/PartnerBottomNav';
import AccountPendingPage from './pages/AccountPendingPage';
import OnboardingCompletePage from './pages/OnboardingCompletePage';
import UnifiedOnboardingWizard from './components/onboarding/UnifiedOnboardingWizard';
import { useMerchant } from './hooks/useMerchant';
import { PartnerTab } from './lib/partner-utils';
import { shouldShowGoLiveScreen } from './lib/go-live';
import { isUnifiedOnboardingEnabled } from './lib/partner-rollout';
import { DashAdminPortal } from './admin/DashAdminPortal';
import {
  clearPartnerOAuthUrl,
  consumePartnerOAuthIntent,
  PARTNER_OAUTH_INTENT_KEY,
} from './lib/partnerAuth';

const SPLASH_MIN_MS = 1800;
const PENDING_STATUSES = new Set(['pending', 'in_review', 'docs_requested']);

export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin');

  return (
    <AuthRecoveryGate
      title="Reset password"
      subtitle={isAdmin ? 'Roam Dash Admin' : 'Roam Dash Partner'}
      signInHref={isAdmin ? '/admin' : '/'}
    >
      {isAdmin ? <DashAdminPortal /> : <DashMerchantApp />}
    </AuthRecoveryGate>
  );
}

function DashMerchantApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const [currentPage, setCurrentPage] = useState<PartnerTab>('dashboard');
  const [goLiveDismissed, setGoLiveDismissed] = useState(false);
  const [oauthReturnPending, setOauthReturnPending] = useState(
    () => typeof window !== 'undefined' && !!sessionStorage.getItem(PARTNER_OAUTH_INTENT_KEY),
  );
  const unifiedOnboarding = isUnifiedOnboardingEnabled();

  const completeOAuthReturn = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) return false;
    if (!sessionStorage.getItem(PARTNER_OAUTH_INTENT_KEY)) return false;

    consumePartnerOAuthIntent();
    clearPartnerOAuthUrl();
    setOauthReturnPending(false);
    return true;
  }, []);

  useEffect(() => {
    const splashStartedAt = Date.now();

    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      setSession(initialSession);
      await completeOAuthReturn(initialSession);
      setAuthReady(true);

      const elapsed = Date.now() - splashStartedAt;
      const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
      window.setTimeout(() => setSplashComplete(true), remaining);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_IN' && nextSession) {
        await completeOAuthReturn(nextSession);
      }
    });

    return () => subscription.unsubscribe();
  }, [completeOAuthReturn]);

  useEffect(() => {
    if (!oauthReturnPending || !authReady || session) return;

    const timeout = window.setTimeout(() => {
      if (!sessionStorage.getItem(PARTNER_OAUTH_INTENT_KEY)) return;
      consumePartnerOAuthIntent();
      setOauthReturnPending(false);
      toast.error('Google sign-in could not be completed. Please try again.');
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [oauthReturnPending, authReady, session]);

  const { merchant, isLoading: merchantLoading, refetch } = useMerchant(session);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentPage('dashboard');
  };

  const showSplash = !splashComplete || !authReady || (!!session && merchantLoading);

  if (showSplash) {
    return <SplashPage />;
  }

  if (!session) {
    return (
      <PartnerAuthFlow
        onLoginSuccess={async () => {
          const {
            data: { session: nextSession },
          } = await supabase.auth.getSession();
          setSession(nextSession);
          setCurrentPage('dashboard');
        }}
      />
    );
  }

  if (merchant && PENDING_STATUSES.has(merchant.verification_status)) {
    return <AccountPendingPage onSignOut={handleSignOut} />;
  }

  if (!merchant) {
    if (unifiedOnboarding) {
      return (
        <UnifiedOnboardingWizard
          session={session}
          onComplete={() => void refetch()}
        />
      );
    }
    return <OnboardingPage session={session} onComplete={() => void refetch()} />;
  }

  if (
    !goLiveDismissed &&
    shouldShowGoLiveScreen(merchant.verification_status, merchant.id)
  ) {
    return (
      <OnboardingCompletePage
        merchant={merchant}
        onGoLive={() => {
          setGoLiveDismissed(true);
          void refetch();
        }}
      />
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage merchant={merchant} onNavigate={setCurrentPage} />;
      case 'orders':
        return <OrdersPage merchant={merchant} onNavigate={setCurrentPage} />;
      case 'menu':
        return <MenuPage merchant={merchant} onNavigate={setCurrentPage} />;
      case 'analytics':
        return <AnalyticsPage merchant={merchant} onNavigate={setCurrentPage} />;
      case 'earnings':
        return <EarningsPage onNavigate={setCurrentPage} />;
      case 'account':
        return (
          <SettingsPage
            merchant={merchant}
            onNavigate={setCurrentPage}
            onSignOut={handleSignOut}
          />
        );
      default:
        return <DashboardPage merchant={merchant} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="partner-app-shell min-h-dvh bg-background sm:mx-auto sm:max-w-xl md:mx-0 md:max-w-none">
      <div
        className={
          currentPage === 'earnings'
            ? 'flex-1'
            : 'partner-main-with-nav flex-1 md:pb-0'
        }
      >
        {renderPage()}
      </div>
      {currentPage !== 'earnings' && (
        <PartnerBottomNav active={currentPage} onNavigate={setCurrentPage} />
      )}
    </div>
  );
}
