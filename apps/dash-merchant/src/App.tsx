import { useEffect, useState, useCallback, useRef } from 'react';
import { redirectPartnerTabletToCommand } from '@roam/merchant-ops';
import { supabase, ensureValidPartnerSession, migrateLegacyPartnerSession } from './lib/partner-supabase';
import { AuthRecoveryGate } from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import MenuPage from './pages/MenuPage';
import EarningsPage from './pages/EarningsPage';
import SettingsPage from './pages/SettingsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SplashPage from './pages/SplashPage';
import PartnerBootLoadingPage from './pages/PartnerBootLoadingPage';
import PartnerAuthFlow from './components/PartnerAuthFlow';
import PartnerBottomNav from './components/PartnerBottomNav';
import PartnerMobileNavDrawer from './components/layout/PartnerMobileNavDrawer';
import PartnerDesktopShell from './components/layout/PartnerDesktopShell';
import AccountPendingPage from './pages/AccountPendingPage';
import OnboardingCompletePage from './pages/OnboardingCompletePage';
import UnifiedOnboardingWizard from './components/onboarding/UnifiedOnboardingWizard';
import { useMerchant } from './hooks/useMerchant';
import { useAcceptingOrdersToggle } from './hooks/useAcceptingOrdersToggle';
import { PartnerTab } from './lib/partner-utils';
import { resolveSideNavKey } from './lib/partner-nav';
import {
  shouldShowGoLiveScreen,
  shouldBypassGoLiveGate,
  needsOwnerOnboarding,
  dismissGoLiveScreen,
  markRestaurantSetupInProgress,
  hasRestaurantSetupInProgress,
  rememberGoLiveComplete,
} from './lib/go-live';
import { bootstrapPartnerMerchant, PendingTeamInviteError } from './lib/partner-api';
import TeamInviteLandingPage from './pages/TeamInviteLandingPage';
import TeamInviteBanner from './components/account/TeamInviteBanner';
import {
  parseTeamInviteTokenFromPath,
  persistTeamInviteToken,
  readTeamInviteToken,
} from './lib/teamInviteSession';
import PartnerAdminRemovedPage from './pages/PartnerAdminRemovedPage';
import { isPartnerAdminPathBlocked } from './lib/ops-origin';
import { isPwaInstallAllowed } from './pwa/pwaMeta';
import {
  clearPartnerOAuthUrl,
  consumePartnerOAuthIntent,
  PARTNER_OAUTH_INTENT_KEY,
} from './lib/partnerAuth';
import { getCommandOrigin } from '@roam/merchant-ops';
import { resetPartnerScroll } from './lib/reset-partner-scroll';
import QueryErrorState from './components/QueryErrorState';
import { useNetworkStatus } from './hooks/useNetworkStatus';

const SPLASH_MIN_MS = 1800;
const AUTH_READY_MAX_MS = 6_000;
const MERCHANT_WAIT_MAX_MS = 12_000;
const PENDING_STATUSES = new Set(['pending', 'in_review', 'docs_requested']);

export default function App() {
  useEffect(() => {
    if (!isPwaInstallAllowed() && 'serviceWorker' in navigator) {
      document.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) void reg.unregister();
      });
    }
  }, []);

  if (isPartnerAdminPathBlocked()) {
    return <PartnerAdminRemovedPage />;
  }

  return (
    <AuthRecoveryGate
      title="Reset password"
      subtitle="Roam Rush Partner"
      signInHref="/"
    >
      <DashMerchantApp />
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
  const [pendingOrdersView, setPendingOrdersView] = useState<'history' | 'live' | null>(null);
  const [ordersHistoryActive, setOrdersHistoryActive] = useState(false);
  const [pendingAccountSection, setPendingAccountSection] = useState<'help' | 'hub' | null>(null);
  const [accountHelpActive, setAccountHelpActive] = useState(false);
  const supportReturnPageRef = useRef<PartnerTab>('dashboard');
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
    redirectPartnerTabletToCommand();
  }, []);

  useEffect(() => {
    migrateLegacyPartnerSession();
    const splashStartedAt = Date.now();
    let splashTimer: number | undefined;
    const authFailSafe = window.setTimeout(() => {
      setAuthReady(true);
      setSplashComplete(true);
    }, AUTH_READY_MAX_MS);

    void supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        window.clearTimeout(authFailSafe);
        setSession(initialSession);
        setAuthReady(true);

        if (initialSession) {
          // Validate outside the auth lock — async work inside onAuthStateChange can deadlock getSession.
          void ensureValidPartnerSession().then((validated) => {
            setSession(validated);
            if (validated) void completeOAuthReturn(validated);
          });
        }

        const elapsed = Date.now() - splashStartedAt;
        splashTimer = window.setTimeout(
          () => setSplashComplete(true),
          Math.max(0, SPLASH_MIN_MS - elapsed),
        );
      })
      .catch(() => {
        window.clearTimeout(authFailSafe);
        setAuthReady(true);
        setSplashComplete(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        return;
      }
      if (nextSession) setSession(nextSession);
      if (event === 'SIGNED_IN' && nextSession) {
        void completeOAuthReturn(nextSession);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(authFailSafe);
      if (splashTimer) window.clearTimeout(splashTimer);
    };
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

  const [bootstrapSettled, setBootstrapSettled] = useState(false);
  const [merchantWaitExpired, setMerchantWaitExpired] = useState(false);
  const bootstrappedUserRef = useRef<string | null>(null);

  const { merchant, membership, pendingTeamInvite, isLoading: merchantLoading, error: merchantError, ownerSuspended, refetch } =
    useMerchant(session);
  const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus();
  // Must run every render — calling this after splash/auth early-returns crashes React (ROAM-DASH-MERCHANT-5).
  const {
    isAcceptingOrders,
    toggleAcceptingOrders,
    isPending: togglePending,
  } = useAcceptingOrdersToggle(merchant);

  // If they are (or were) accepting orders, permanently settle the approval gate
  // so pausing later cannot bounce them back to "You're approved!".
  useEffect(() => {
    if (merchant?.is_accepting_orders) {
      rememberGoLiveComplete(merchant.id);
    }
  }, [merchant?.id, merchant?.is_accepting_orders]);

  useEffect(() => {
    if (wasOffline && isOnline) {
      toast.success('Back online');
      clearWasOffline();
    }
  }, [wasOffline, isOnline, clearWasOffline]);

  useEffect(() => {
    if (!session?.user) {
      setBootstrapSettled(false);
      bootstrappedUserRef.current = null;
      return;
    }
    if (parseTeamInviteTokenFromPath() || readTeamInviteToken()) {
      setBootstrapSettled(true);
      bootstrappedUserRef.current = session.user.id;
      return;
    }
    if (bootstrappedUserRef.current === session.user.id) return;

    setBootstrapSettled(false);

    void bootstrapPartnerMerchant()
      .then(() => refetch())
      .catch((err) => {
        if (err instanceof PendingTeamInviteError) {
          persistTeamInviteToken(err.inviteToken);
          setInviteTokenOverride(err.inviteToken);
          return;
        }
        console.error('[partner] bootstrap failed:', err);
      })
      .finally(() => {
        bootstrappedUserRef.current = session.user.id;
        setBootstrapSettled(true);
      });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || merchant || merchantError) {
      setMerchantWaitExpired(false);
      return;
    }
    const timer = window.setTimeout(() => setMerchantWaitExpired(true), MERCHANT_WAIT_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [session?.user?.id, merchant, merchantError]);

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

  const showSplash = !splashComplete || !authReady;

  const waitingForMerchant =
    !!session &&
    !merchant &&
    !merchantError &&
    !merchantWaitExpired &&
    (merchantLoading || !bootstrapSettled);

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

  if (ownerSuspended) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-inset-lg">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="text-title-lg font-semibold text-on-surface">Account suspended</h1>
          <p className="text-body-md text-on-surface-variant">
            Your Partner owner account has been suspended. Your store listing is unchanged, but you
            cannot use Partner until an admin restores access. Contact Roam support if you need help.
          </p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-label-md font-semibold text-primary underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (waitingForMerchant) {
    return <PartnerBootLoadingPage />;
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
        commandOrigin={getCommandOrigin()}
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

  if (bootstrapSettled && (merchantError || merchantWaitExpired) && !merchant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-inset-lg">
        <div className="flex max-w-md flex-col items-center gap-4">
          <QueryErrorState
            title="Could not load your restaurant"
            message="Your sign-in session expired. Sign out and sign back in to continue."
            onRetry={() => void refetch()}
          />
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-label-md font-semibold text-primary underline-offset-2 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!merchant && !inTeamInviteFlow && bootstrapSettled) {
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
    if (page === 'orders') {
      setPendingOrdersView('live');
    }
    if (page === 'account') {
      setPendingAccountSection('hub');
      setAccountHelpActive(false);
    }
    setOrdersHistoryActive(false);
    setCurrentPage(page);
    setMobileNavOpen(false);
    requestAnimationFrame(() => {
      resetPartnerScroll(mainContentRef.current);
    });
  };

  const openHistoryNav = () => {
    setPendingOrdersView('history');
    setCurrentPage('orders');
    setMobileNavOpen(false);
    requestAnimationFrame(() => {
      resetPartnerScroll(mainContentRef.current);
    });
  };

  const openSupportNav = () => {
    supportReturnPageRef.current =
      currentPage === 'account' ? 'dashboard' : currentPage;
    setPendingAccountSection('help');
    setCurrentPage('account');
    setOrdersHistoryActive(false);
    setMobileNavOpen(false);
    requestAnimationFrame(() => {
      resetPartnerScroll(mainContentRef.current);
    });
  };

  const openMobileNav = () => setMobileNavOpen(true);

  const activeNavKey =
    currentPage === 'orders' && ordersHistoryActive
      ? 'history'
      : currentPage === 'account' && accountHelpActive
        ? 'support'
        : resolveSideNavKey(currentPage);

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
      case 'orders':
        return (
          <OrdersPage
            merchant={merchant}
            onNavigate={handlePartnerNavigate}
            onOpenMobileNav={openMobileNav}
            pendingView={pendingOrdersView}
            onPendingViewHandled={() => setPendingOrdersView(null)}
            onHistoryViewChange={setOrdersHistoryActive}
          />
        );
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
        return (
          <EarningsPage
            onNavigate={handlePartnerNavigate}
            onOpenMobileNav={openMobileNav}
          />
        );
      case 'account':
        return (
          <SettingsPage
            merchant={merchant}
            isOwner={isOwner}
            onNavigate={handlePartnerNavigate}
            onSignOut={handleSignOut}
            onOpenMobileNav={openMobileNav}
            pendingSection={pendingAccountSection}
            onPendingSectionHandled={() => setPendingAccountSection(null)}
            onSectionChange={(section) => setAccountHelpActive(section === 'help')}
            onExitSupport={() => handlePartnerNavigate(supportReturnPageRef.current)}
          />
        );
      default:
        return <DashboardPage merchant={merchant} onNavigate={handlePartnerNavigate} />;
    }
  };

  return (
    <div className="partner-app-shell min-h-dvh bg-background sm:mx-auto sm:max-w-xl lg:mx-0 lg:max-w-none">
      {!isOnline && (
        <div
          role="status"
          className="sticky top-0 z-[60] bg-error px-margin-mobile py-2 text-center text-label-md font-semibold text-on-error"
        >
          No internet connection — live order updates paused
        </div>
      )}
      <PartnerMobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        merchant={merchant}
        active={currentPage}
        allowedTabs={allowedTabs}
        bottomNavVisible={currentPage !== 'earnings'}
        onNavigate={handlePartnerNavigate}
        onHistory={openHistoryNav}
        onSupport={openSupportNav}
      />
      <PartnerDesktopShell
        merchant={merchant}
        activeNavKey={activeNavKey}
        onNavigate={handlePartnerNavigate}
        onHistory={openHistoryNav}
        onSupport={openSupportNav}
        onGoOffline={() => toggleAcceptingOrders(false)}
        onSettings={() => handlePartnerNavigate('account')}
        onNotifications={() => handlePartnerNavigate('orders')}
        isAcceptingOrders={isAcceptingOrders}
        onToggleAcceptingOrders={toggleAcceptingOrders}
        togglePending={togglePending}
        allowedTabs={allowedTabs}
        showRestaurantInfo
        headerVariant="merchant"
      >
        <div
          ref={mainContentRef}
          className={
            currentPage === 'earnings'
              ? 'flex min-h-0 flex-1 flex-col'
              : 'partner-main-with-nav flex min-h-0 flex-1 flex-col lg:pb-0'
          }
        >
          {pendingTeamInvite && (
            <TeamInviteBanner invite={pendingTeamInvite} onResolved={() => void refetch()} />
          )}
          {renderPage()}
        </div>
      </PartnerDesktopShell>
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
