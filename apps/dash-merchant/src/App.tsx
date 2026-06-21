import React, { useState, useEffect } from 'react';
import { supabase, AuthRecoveryGate } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
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
import { SignUpFormData } from './signup/types';
import { useMerchant } from './hooks/useMerchant';
import { PartnerTab } from './lib/partner-utils';
import { shouldShowGoLiveScreen } from './lib/go-live';
import { DashAdminPortal } from './admin/DashAdminPortal';

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
  const [pendingSignUp, setPendingSignUp] = useState<SignUpFormData | null>(null);
  const [goLiveDismissed, setGoLiveDismissed] = useState(false);

  useEffect(() => {
    const splashStartedAt = Date.now();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthReady(true);

      const elapsed = Date.now() - splashStartedAt;
      const remaining = Math.max(0, SPLASH_MIN_MS - elapsed);
      window.setTimeout(() => setSplashComplete(true), remaining);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const { merchant, isLoading: merchantLoading, refetch } = useMerchant(session);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setPendingSignUp(null);
    setCurrentPage('dashboard');
  };

  const showSplash = !splashComplete || !authReady || (!!session && merchantLoading && !pendingSignUp);

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
        onSignUpComplete={async (data) => {
          setPendingSignUp(data);
          const {
            data: { session: nextSession },
          } = await supabase.auth.getSession();
          setSession(nextSession);
        }}
      />
    );
  }

  if (pendingSignUp || (merchant && PENDING_STATUSES.has(merchant.verification_status))) {
    return (
      <AccountPendingPage
        onSignOut={handleSignOut}
        bankDetailsComplete={pendingSignUp ? !!pendingSignUp.bankName : true}
      />
    );
  }

  if (!merchant) {
    // Post-login merchant creation (OnboardingPage) is separate from pre-login PartnerSignUpFlow.
    return <OnboardingPage session={session} onComplete={() => window.location.reload()} />;
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
    <div className="min-h-dvh bg-background">
      <div
        className={
          currentPage === 'dashboard' ||
          currentPage === 'earnings' ||
          currentPage === 'account' ||
          currentPage === 'orders' ||
          currentPage === 'menu'
            ? ''
            : 'pb-24'
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
