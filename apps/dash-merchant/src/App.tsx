import { useEffect, useState, useCallback, useRef } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { supabase, AuthRecoveryGate } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import CounterOrdersPage from './pages/staff-ops/CounterOrdersPage';
import KitchenQueuePage from './pages/staff-ops/KitchenQueuePage';
import StationKioskFlow from './components/staff-ops/station/StationKioskFlow';
import { resolveStationKioskRoute } from './lib/station-kiosk-routing';
import { getActingMember } from './lib/station-shift-session';
import { resolveStaffOpsRoute } from './lib/staff-ops-routing';
import MenuPage from './pages/MenuPage';
import EarningsPage from './pages/EarningsPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SplashPage from './pages/SplashPage';
import PartnerAuthFlow from './components/PartnerAuthFlow';
import PartnerBottomNav from './components/PartnerBottomNav';
import PartnerMobileNavDrawer from './components/layout/PartnerMobileNavDrawer';
import AccountPendingPage from './pages/AccountPendingPage';
import OnboardingCompletePage from './pages/OnboardingCompletePage';
import UnifiedOnboardingWizard from './components/onboarding/UnifiedOnboardingWizard';
import { useMerchant } from './hooks/useMerchant';
import { PartnerTab } from './lib/partner-utils';
import {
  shouldShowGoLiveScreen,
  shouldBypassGoLiveGate,
  needsOwnerOnboarding,
  dismissGoLiveScreen,
  markRestaurantSetupInProgress,
  hasRestaurantSetupInProgress,
} from './lib/go-live';
import { bootstrapPartnerMerchant, PendingTeamInviteError } from './lib/partner-api';
import TeamInviteLandingPage from './pages/TeamInviteLandingPage';
import TeamInviteBanner from './components/account/TeamInviteBanner';
import {
  parseTeamInviteTokenFromPath,
  persistTeamInviteToken,
  readTeamInviteToken,
} from './lib/teamInviteSession';
import { DashAdminPortal } from './admin/DashAdminPortal';
import {
  clearPartnerOAuthUrl,
  consumePartnerOAuthIntent,
  PARTNER_OAUTH_INTENT_KEY,
} from './lib/partnerAuth';
import { resetPartnerScroll } from './lib/reset-partner-scroll';

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
      {isAdmin ? (
        <BrowserRouter basename="/admin">
          <DashAdminPortal />
        </BrowserRouter>
      ) : (
        <DashMerchantApp />
      )}
    </AuthRecoveryGate>
  );
}

function DashMerchantApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const [currentPage, setCurrentPage] = useState<PartnerTab>('dashboard');
  const [routingEpoch, setRoutingEpoch] = useState(0);
  const [setupMenuMode, setSetupMenuMode] = useState(false);
  const [viewingGoLiveProgress, setViewingGoLiveProgress] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const [oauthReturnPending, setOauthReturnPending] = useState(
    () => typeof window !== 'undefined' && !!sessionStorage.getItem(PARTNER_OAUTH_INTENT_KEY),
  );

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

  const [inviteTokenOverride, setInviteTokenOverride] = useState<string | null>(
    () => parseTeamInviteTokenFromPath(),
  );

  const { merchant, membership, pendingTeamInvite, isLoading: merchantLoading, refetch } =
    useMerchant(session);

  useEffect(() => {
    if (!session?.user) return;
    // Never auto-create a restaurant draft while staff is accepting a team invite.
    if (parseTeamInviteTokenFromPath() || readTeamInviteToken()) return;
    void bootstrapPartnerMerchant()
      .then(() => refetch())
      .catch((err) => {
        if (err instanceof PendingTeamInviteError) {
          persistTeamInviteToken(err.inviteToken);
          setInviteTokenOverride(err.inviteToken);
          return;
        }
        console.error('[partner] bootstrap failed:', err);
      });
  }, [session?.user?.id, refetch]);

  useEffect(() => {
    if (!merchant?.id) return;
    if (hasRestaurantSetupInProgress(merchant.id)) {
      setSetupMenuMode(true);
    }
  }, [merchant?.id]);

  useEffect(() => {
    resetPartnerScroll(mainContentRef.current);
  }, [currentPage]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentPage('dashboard');
  };

  const isOwner = membership?.is_owner === true;
  const invitePathToken = parseTeamInviteTokenFromPath();
  const storedInviteToken = readTeamInviteToken();
  const activeInviteToken =
    invitePathToken ||
    inviteTokenOverride ||
    storedInviteToken ||
    pendingTeamInvite?.token;
  const inTeamInviteFlow = !!activeInviteToken || !!pendingTeamInvite;

  const shouldShowInviteLanding =
    !!invitePathToken ||
    (!!session && !merchantLoading && !merchant && inTeamInviteFlow);

  const showSplash = !splashComplete || !authReady || (!!session && merchantLoading);

  if (shouldShowInviteLanding) {
    return (
      <TeamInviteLandingPage
        session={session}
        inviteToken={activeInviteToken}
        onAccepted={() => {
          setInviteTokenOverride(null);
          void refetch();
        }}
      />
    );
  }

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

  if (isOwner && merchant && needsOwnerOnboarding(merchant)) {
    return (
      <UnifiedOnboardingWizard
        session={session}
        serverMerchant={merchant}
        onComplete={() => void refetch()}
      />
    );
  }

  if (!merchant && !inTeamInviteFlow) {
    return (
      <UnifiedOnboardingWizard
        session={session}
        onComplete={() => void refetch()}
      />
    );
  }

  if (isOwner && PENDING_STATUSES.has(merchant.verification_status)) {
    return <AccountPendingPage onSignOut={handleSignOut} />;
  }

  const showGoLiveGate =
    isOwner &&
    shouldShowGoLiveScreen(merchant) &&
    (!shouldBypassGoLiveGate(merchant.id) || viewingGoLiveProgress);

  if (showGoLiveGate) {
    return (
      <OnboardingCompletePage
        merchant={merchant}
        setupInProgress={setupMenuMode}
        onGoLive={() => {
          setSetupMenuMode(false);
          setViewingGoLiveProgress(false);
          setRoutingEpoch((n) => n + 1);
          void refetch();
        }}
        onContinueToDashboard={() => {
          dismissGoLiveScreen(merchant.id);
          setSetupMenuMode(false);
          setViewingGoLiveProgress(false);
          setRoutingEpoch((n) => n + 1);
          void refetch();
        }}
        onOpenSetup={() => {
          markRestaurantSetupInProgress(merchant.id);
          setSetupMenuMode(true);
          setViewingGoLiveProgress(false);
          setCurrentPage('menu');
        }}
        refreshKey={routingEpoch}
      />
    );
  }

  const allowedTabs: PartnerTab[] = (() => {
    if (!membership || membership.is_owner || membership.role === 'admin') {
      return ['dashboard', 'orders', 'menu', 'analytics', 'account', 'earnings'];
    }
    const tabs: PartnerTab[] = ['account'];
    if (membership.permissions.includes('orders')) tabs.unshift('dashboard', 'orders');
    if (membership.permissions.includes('menu')) tabs.push('menu');
    if (membership.permissions.includes('analytics')) tabs.push('analytics');
    if (membership.permissions.includes('payouts')) tabs.push('earnings');
    return tabs;
  })();

  const handlePartnerNavigate = (page: PartnerTab) => {
    setCurrentPage(page);
    setMobileNavOpen(false);
    requestAnimationFrame(() => {
      resetPartnerScroll(mainContentRef.current);
    });
  };

  const openMobileNav = () => setMobileNavOpen(true);

  const renderPage = () => {
    if (currentPage === 'earnings' && !allowedTabs.includes('earnings')) {
      return <DashboardPage merchant={merchant} onNavigate={handlePartnerNavigate} />;
    }
    if (currentPage === 'menu' && !allowedTabs.includes('menu')) {
      return <DashboardPage merchant={merchant} onNavigate={handlePartnerNavigate} />;
    }
    if (currentPage === 'analytics' && !allowedTabs.includes('analytics')) {
      return <DashboardPage merchant={merchant} onNavigate={handlePartnerNavigate} />;
    }
    switch (currentPage) {
      case 'dashboard':
        return (
          <DashboardPage
            merchant={merchant}
            onNavigate={handlePartnerNavigate}
            onOpenMobileNav={openMobileNav}
          />
        );
      case 'orders': {
        const kioskRoute = merchant
          ? resolveStationKioskRoute(merchant.id, membership ?? undefined)
          : null;

        if (kioskRoute === 'kiosk' && merchant) {
          return (
            <div className="min-h-screen bg-background pb-[var(--app-bottom-nav-total)]">
              <StationKioskFlow
                merchantId={merchant.id}
                storeName={merchant.name || 'Store'}
                onShiftStarted={() => setRoutingEpoch((n) => n + 1)}
              />
            </div>
          );
        }

        const actingMember = merchant ? getActingMember(merchant.id) : null;
        const displayStaffName =
          actingMember?.name ??
          (session.user.user_metadata?.name as string | undefined);
        const handleEndShift = () => setRoutingEpoch((n) => n + 1);

        if (kioskRoute === 'counter' && merchant) {
          return (
            <CounterOrdersPage
              merchant={merchant}
              staffName={displayStaffName}
              onNavigate={handlePartnerNavigate}
              onOpenMobileNav={openMobileNav}
              onEndShift={actingMember ? handleEndShift : undefined}
            />
          );
        }
        if (kioskRoute === 'kitchen' && merchant) {
          return (
            <KitchenQueuePage
              merchant={merchant}
              staffName={actingMember?.name}
              onNavigate={handlePartnerNavigate}
              onOpenMobileNav={openMobileNav}
              onEndShift={actingMember ? handleEndShift : undefined}
            />
          );
        }

        const staffRoute = merchant
          ? resolveStaffOpsRoute(merchant.id, membership ?? undefined)
          : null;
        if (staffRoute === 'counter') {
          return (
            <CounterOrdersPage
              merchant={merchant}
              staffName={displayStaffName}
              onNavigate={handlePartnerNavigate}
              onOpenMobileNav={openMobileNav}
            />
          );
        }
        if (staffRoute === 'kitchen') {
          return (
            <KitchenQueuePage
              merchant={merchant}
              onNavigate={handlePartnerNavigate}
              onOpenMobileNav={openMobileNav}
            />
          );
        }
        return (
          <OrdersPage
            merchant={merchant}
            onNavigate={handlePartnerNavigate}
            onOpenMobileNav={openMobileNav}
          />
        );
      }
      case 'menu':
        return (
          <MenuPage
            merchant={merchant}
            onNavigate={handlePartnerNavigate}
            onOpenMobileNav={openMobileNav}
            setupBanner={
              setupMenuMode
                ? {
                    onViewProgress: () => {
                      setViewingGoLiveProgress(true);
                      setRoutingEpoch((n) => n + 1);
                    },
                  }
                : undefined
            }
          />
        );
      case 'analytics':
        return (
          <AnalyticsPage
            merchant={merchant}
            onNavigate={handlePartnerNavigate}
            onOpenMobileNav={openMobileNav}
          />
        );
      case 'earnings':
        return <EarningsPage onNavigate={handlePartnerNavigate} onOpenMobileNav={openMobileNav} />;
      case 'account':
        return (
          <SettingsPage
            merchant={merchant}
            isOwner={isOwner}
            onNavigate={handlePartnerNavigate}
            onSignOut={handleSignOut}
            onOpenMobileNav={openMobileNav}
          />
        );
      default:
        return <DashboardPage merchant={merchant} onNavigate={handlePartnerNavigate} />;
    }
  };

  return (
    <div className="partner-app-shell min-h-dvh bg-background sm:mx-auto sm:max-w-xl lg:mx-0 lg:max-w-none">
      <PartnerMobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        merchant={merchant}
        active={currentPage}
        allowedTabs={allowedTabs}
        bottomNavVisible={currentPage !== 'earnings'}
        onNavigate={handlePartnerNavigate}
      />
      <div
        ref={mainContentRef}
        className={
          currentPage === 'earnings'
            ? 'flex-1'
            : 'partner-main-with-nav flex-1 lg:pb-0'
        }
      >
        {pendingTeamInvite && (
          <TeamInviteBanner invite={pendingTeamInvite} onResolved={() => void refetch()} />
        )}
        {renderPage()}
      </div>
      {currentPage !== 'earnings' && (
        <PartnerBottomNav
          active={currentPage}
          onNavigate={handlePartnerNavigate}
          allowedTabs={allowedTabs.filter((t) => t !== 'earnings')}
        />
      )}
    </div>
  );
}
