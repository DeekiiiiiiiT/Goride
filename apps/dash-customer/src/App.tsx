import React, { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthRecoveryGate } from '@roam/auth-client';
import { Loader2 } from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import HomePage from './pages/HomePage';
import SearchPage from './pages/SearchPage';
import SearchResultsPage from './pages/SearchResultsPage';
import AccountPage from './pages/AccountPage';
import StorePage from './pages/StorePage';
import CartPage from './pages/CartPage';
import OrdersPage from './pages/OrdersPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import OrderDeliveredPage from './pages/OrderDeliveredPage';
import OrderConfirmationPage from './pages/OrderConfirmationPage';
import RateOrderPage from './pages/RateOrderPage';
import OrderDetailsPage from './pages/OrderDetailsPage';
import EditProfilePage from './pages/EditProfilePage';
import SavedAddressesPage from './pages/SavedAddressesPage';
import AddAddressPage from './pages/AddAddressPage';
import PromotionsPage from './pages/PromotionsPage';
import RushPassPage from './pages/RushPassPage';
import FavoritesPage from './pages/FavoritesPage';
import NotificationSettingsPage from './pages/NotificationSettingsPage';
import HelpPage from './pages/HelpPage';
import ReportIssuePage from './pages/ReportIssuePage';
import MyIssuesPage from './pages/MyIssuesPage';
import DealsPage from './pages/DealsPage';
import CategoryPage from './pages/CategoryPage';
import RestaurantReviewsPage from './pages/RestaurantReviewsPage';
import OutOfDeliveryPage from './pages/OutOfDeliveryPage';
import ConnectionErrorPage from './pages/ConnectionErrorPage';
import AboutPage from './pages/AboutPage';
import CheckoutPage from './pages/CheckoutPage';
import PaymentMethodsPage from './pages/PaymentMethodsPage';
import AddCardPage from './pages/AddCardPage';
import LoginPage from './pages/LoginPage';
import PaymentCallbackPage from './pages/PaymentCallbackPage';
import { loadDeliveryZones } from './lib/deliveryZones';
import { CartProvider, useCart } from './hooks/useCart';
import { useImmersiveMode } from './hooks/useImmersiveMode';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { FloatingCartBar } from './components/ui/FloatingCartBar';
import { SplashPage } from './pages/onboarding/SplashPage';
import { WelcomePage } from './pages/onboarding/WelcomePage';
import { HowItWorksPage } from './pages/onboarding/HowItWorksPage';
import { VerifyPhonePage } from './pages/onboarding/VerifyPhonePage';
import { DeliveryAddressPage, type AddressSelection } from './pages/onboarding/DeliveryAddressPage';
import { DeliveryDetailsPage } from './pages/onboarding/DeliveryDetailsPage';
import { DashAppHeader } from './components/layout/DashAppHeader';
import { AppNavDrawer } from './components/layout/AppNavDrawer';
import { DashBottomNav, type DashTab } from './components/layout/DashBottomNav';
import { isOnboardingComplete, markOnboardingComplete } from './lib/onboardingStorage';
import { hasDeliveryAddress, persistOnboardingAddress, syncAddressesFromBackend } from './lib/addressStorage';
import { syncProfileFromBackend } from './lib/accountContent';
import { syncFavoritesFromBackend } from './lib/favoritesStorage';
import { clearCustomerLocalData } from './lib/customerLocalData';
import { fetchCustomerOrders } from './lib/customerApi';
import { isLiveOrderStatus } from './lib/ordersContent';
import { supabase } from './lib/supabase';
import {
  consumeDashCustomerOAuthIntent,
  DASH_CUSTOMER_OAUTH_INTENT_KEY,
  DASH_CUSTOMER_OAUTH_INTENT_LOGIN,
  DASH_CUSTOMER_OAUTH_INTENT_SIGNUP,
  ENABLE_PHONE_AUTH,
} from './lib/dashCustomerAuth';

type StackPage =
  | 'restaurant'
  | 'cart'
  | 'checkout'
  | 'payment-methods'
  | 'add-card'
  | 'order-confirmation'
  | 'order-delivered'
  | 'rate-order'
  | 'order-details'
  | 'edit-profile'
  | 'saved-addresses'
  | 'add-address'
  | 'promotions'
  | 'rush-pass'
  | 'favorites'
  | 'notification-settings'
  | 'help'
  | 'about'
  | 'report-issue'
  | 'my-issues'
  | 'restaurant-reviews'
  | 'out-of-delivery'
  | 'connection-error'
  | 'tracking'
  | 'login'
  | 'payment-callback-wipay'

type AppPhase =
  | 'splash'
  | 'welcome'
  | 'how-it-works'
  | 'login'
  | 'verify-phone'
  | 'delivery-address'
  | 'delivery-details'
  | 'out-of-delivery'
  | 'app';

const IMMERSIVE_STACK_PAGES: StackPage[] = [
  'tracking',
  'checkout',
  'cart',
  'restaurant',
  'order-confirmation',
  'order-delivered',
  'add-address',
  'add-card',
  'payment-methods',
  'rate-order',
  'report-issue',
  'my-issues',
  'edit-profile',
  'out-of-delivery',
  'saved-addresses',
  'payment-callback-wipay',
];

const DashAdminPortal = React.lazy(async () => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const m = await import('@roam/dash-admin');
      return { default: m.DashAdminPortal };
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }
  throw lastErr;
});

function AdminPortalError({ error }: { error: Error }) {
  const isViteChunk =
    /Failed to fetch dynamically imported module/i.test(error.message) &&
    /localhost|127\.0\.0\.1/i.test(error.message);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="max-w-md rounded-xl border border-red-500/30 bg-slate-900 p-6 text-slate-200">
        <h1 className="text-lg font-semibold text-white">Admin failed to load</h1>
        <p className="mt-2 text-sm text-slate-400">
          {isViteChunk
            ? 'The dev server lost track of the admin bundle. This is a local Vite glitch, not a deploy issue.'
            : 'The admin console hit a startup error in your browser.'}
        </p>
        <p className="mt-3 text-xs text-red-300 font-mono break-all">{error.message}</p>
        <p className="mt-4 text-sm text-slate-400">
          Stop the dev server, run <code className="text-amber-300">npx vite --port 5174 --strictPort --force</code>,
          then hard-refresh this page.
        </p>
      </div>
    </div>
  );
}

class AdminPortalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) return <AdminPortalError error={this.state.error} />;
    return this.props.children;
  }
}

function AdminPortalFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
    </div>
  );
}

/** Customer ordering app (roamrush.app). Rush Ops Console: roamrush.app/admin */
export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin');

  return (
    <AuthRecoveryGate
      title="Reset password"
      subtitle={isAdmin ? 'Roam Rush Admin' : 'Roam Rush'}
      signInHref={isAdmin ? '/admin' : '/'}
    >
      {isAdmin ? (
        <BrowserRouter basename="/admin">
          <AdminPortalErrorBoundary>
            <Suspense fallback={<AdminPortalFallback />}>
              <DashAdminPortal />
            </Suspense>
          </AdminPortalErrorBoundary>
        </BrowserRouter>
      ) : (
        <DashCustomerApp />
      )}
    </AuthRecoveryGate>
  );
}

function DashCustomerApp() {
  return (
    <CartProvider>
      <DashCustomerShell />
    </CartProvider>
  );
}

function paymentCallbackStackPage(): StackPage | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  if (path.includes('/payment/callback/wipay')) return 'payment-callback-wipay';
  return null;
}

function DashCustomerShell() {
  const { itemCount, subtotal, clearCart } = useCart();
  const queryClient = useQueryClient();
  const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus();
  const [phase, setPhase] = useState<AppPhase>(() => (paymentCallbackStackPage() ? 'app' : 'splash'));
  const [loginSignUp, setLoginSignUp] = useState(true);
  const [pendingAddress, setPendingAddress] = useState<AddressSelection | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashTab>('home');
  const [stackPage, setStackPage] = useState<StackPage | null>(() => paymentCallbackStackPage());
  const [pageData, setPageData] = useState<Record<string, unknown> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'browse' | 'results' | 'deals' | 'category'>('browse');
  const [categoryId, setCategoryId] = useState('pizza');
  const [oauthReturnPending, setOauthReturnPending] = useState(
    () => typeof window !== 'undefined' && !!sessionStorage.getItem(DASH_CUSTOMER_OAUTH_INTENT_KEY),
  );
  const [outOfZoneReturnTo, setOutOfZoneReturnTo] = useState<string>('delivery-address');
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: ordersPayload } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: fetchCustomerOrders,
    enabled: Boolean(session),
    retry: false,
  });
  const ordersBadge = useMemo(
    () => (ordersPayload?.orders ?? []).some((order) => isLiveOrderStatus(String(order.status ?? ''))),
    [ordersPayload],
  );

  useEffect(() => {
    if (wasOffline && isOnline) {
      toast.success('Back online');
      clearWasOffline();
    }
  }, [wasOffline, isOnline, clearWasOffline]);

  useEffect(() => {
    document.title = 'Roam Rush';
    void loadDeliveryZones();
  }, []);

  const clearOAuthUrl = useCallback(() => {
    const { hash, search, pathname } = window.location;
    if (hash.includes('access_token') || search.includes('code=')) {
      window.history.replaceState({}, '', pathname);
    }
  }, []);

  const enterApp = useCallback(() => {
    markOnboardingComplete();
    setPhase('app');
  }, []);

  const goOutOfDelivery = useCallback((returnTo: string) => {
    setOutOfZoneReturnTo(returnTo);
    setPageData({ returnTo });
    if (phase === 'app') {
      setStackPage('out-of-delivery');
    } else {
      setPhase('out-of-delivery');
    }
  }, [phase]);

  const handleOutOfZoneFromOnboarding = useCallback(() => {
    goOutOfDelivery('delivery-address');
  }, [goOutOfDelivery]);

  const goToAddressSetup = useCallback(() => {
    if (hasDeliveryAddress()) {
      enterApp();
      return;
    }
    setPhase('delivery-address');
  }, [enterApp]);

  const completeOAuthReturn = useCallback(
    async (activeSession: Session | null) => {
      if (!activeSession?.user) return false;

      const intent = sessionStorage.getItem(DASH_CUSTOMER_OAUTH_INTENT_KEY);
      if (!intent) return false;

      consumeDashCustomerOAuthIntent();
      clearOAuthUrl();
      setOauthReturnPending(false);

      if (intent === DASH_CUSTOMER_OAUTH_INTENT_LOGIN) {
        goToAddressSetup();
        return true;
      }

      if (intent === DASH_CUSTOMER_OAUTH_INTENT_SIGNUP) {
        // Soft launch: email/Google only (SMS later when Digicel/Flow is live)
        if (ENABLE_PHONE_AUTH) {
          setPhase('verify-phone');
        } else {
          goToAddressSetup();
        }
        return true;
      }

      return false;
    },
    [clearOAuthUrl, goToAddressSetup],
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      setSession(initialSession);
      await completeOAuthReturn(initialSession);
      if (initialSession) {
        void Promise.all([
          syncProfileFromBackend(),
          syncAddressesFromBackend(),
          syncFavoritesFromBackend(),
        ]);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      setSession(nextSession);
      if (event === 'SIGNED_IN' && nextSession) {
        await completeOAuthReturn(nextSession);
        void Promise.all([
          syncProfileFromBackend(),
          syncAddressesFromBackend(),
          syncFavoritesFromBackend(),
        ]);
      }
      if (event === 'SIGNED_OUT') {
        await clearCustomerLocalData();
        clearCart();
        queryClient.clear();
      }
    });

    return () => subscription.unsubscribe();
  }, [completeOAuthReturn, clearCart, queryClient]);

  useEffect(() => {
    if (!oauthReturnPending || loading || session) return;

    let cancelled = false;
    const startedAt = Date.now();
    const maxWaitMs = 20000;
    let timer: number | undefined;

    const pollForSession = async () => {
      if (cancelled) return;
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      if (activeSession) {
        await completeOAuthReturn(activeSession);
        return;
      }
      if (Date.now() - startedAt >= maxWaitMs) {
        if (!sessionStorage.getItem(DASH_CUSTOMER_OAUTH_INTENT_KEY)) return;
        consumeDashCustomerOAuthIntent();
        setOauthReturnPending(false);
        toast.error('Google sign-in could not be completed. Please try again.');
        setPhase('login');
        return;
      }
      timer = window.setTimeout(() => void pollForSession(), 2000);
    };

    void pollForSession();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [oauthReturnPending, loading, session, completeOAuthReturn]);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.includes('/payment/callback/wipay')) {
      setStackPage('payment-callback-wipay');
    }

    const merchantId = new URLSearchParams(window.location.search).get('merchant')?.trim();
    if (merchantId) {
      setPhase('app');
      setStackPage('restaurant');
      setPageData({ merchantId });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const navigate = useCallback((page: string, data?: Record<string, unknown>) => {
    if (page === 'home' || page === 'search' || page === 'orders' || page === 'account') {
      setStackPage(null);
      setActiveTab(page as DashTab);
      if (page === 'search') {
        setSearchMode('browse');
        setSearchQuery('');
      }
      window.scrollTo(0, 0);
      return;
    }

    setStackPage(page as StackPage);
    setPageData(data ?? null);
    window.scrollTo(0, 0);
  }, []);

  const handleSplashComplete = useCallback(() => {
    if (sessionStorage.getItem(DASH_CUSTOMER_OAUTH_INTENT_KEY)) {
      if (session) {
        void completeOAuthReturn(session);
      } else {
        consumeDashCustomerOAuthIntent();
        setOauthReturnPending(false);
        toast.error('Google sign-in could not be completed. Please try again.');
        setPhase('login');
      }
      return;
    }

    if (session) {
      goToAddressSetup();
      return;
    }

    setPhase(isOnboardingComplete() ? 'app' : 'welcome');
  }, [completeOAuthReturn, goToAddressSetup, session]);

  const handleWelcomeSignIn = useCallback(() => {
    setLoginSignUp(false);
    setPhase('login');
  }, []);

  const handleHowItWorksComplete = useCallback(() => {
    setLoginSignUp(true);
    setPhase('login');
  }, []);

  const handleSignUpSuccess = useCallback(() => {
    if (ENABLE_PHONE_AUTH) {
      setPhase('verify-phone');
      return;
    }
    goToAddressSetup();
  }, [goToAddressSetup]);

  const handleSignInSuccess = useCallback(() => {
    goToAddressSetup();
  }, [goToAddressSetup]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setSearchMode('results');
    setActiveTab('search');
    setStackPage(null);
  }, []);

  const handleOpenDeals = useCallback(() => {
    setStackPage(null);
    setActiveTab('search');
    setSearchMode('deals');
    window.scrollTo(0, 0);
  }, []);

  const handleOpenCategory = useCallback((id: string) => {
    setStackPage(null);
    setActiveTab('search');
    setCategoryId(id);
    setSearchMode('category');
    window.scrollTo(0, 0);
  }, []);

  const handleSearchBrowse = useCallback(() => {
    setSearchMode('browse');
    setSearchQuery('');
    window.scrollTo(0, 0);
  }, []);

  const handleTabChange = useCallback((tab: DashTab) => {
    setActiveTab(tab);
    setStackPage(null);
    if (tab === 'search') {
      setSearchMode('browse');
    }
    if (tab === 'orders' && !session) {
      setStackPage('login');
    }
    window.scrollTo(0, 0);
  }, [session]);

  useImmersiveMode(
    phase !== 'app' || (!!stackPage && IMMERSIVE_STACK_PAGES.includes(stackPage))
  );

  if (phase === 'splash') {
    if (oauthReturnPending || loading) {
      return (
        <div className="app-fullscreen-screen bg-surface-container-lowest flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-container" />
        </div>
      );
    }
    return <SplashPage onComplete={handleSplashComplete} />;
  }

  if (phase === 'welcome') {
    return (
      <WelcomePage
        onGetStarted={() => setPhase('how-it-works')}
        onSignIn={handleWelcomeSignIn}
      />
    );
  }

  if (phase === 'how-it-works') {
    return (
      <HowItWorksPage
        onComplete={handleHowItWorksComplete}
        onSkip={handleHowItWorksComplete}
      />
    );
  }

  if (phase === 'login') {
    return (
      <LoginPage
        fullScreen
        initialSignUp={loginSignUp}
        onNavigate={navigate}
        onBack={() => setPhase('welcome')}
        onSignInSuccess={handleSignInSuccess}
        onSignUpSuccess={handleSignUpSuccess}
      />
    );
  }

  if (phase === 'verify-phone' && ENABLE_PHONE_AUTH) {
    return (
      <VerifyPhonePage
        onBack={() => setPhase('login')}
        onVerify={() => setPhase('delivery-address')}
      />
    );
  }

  if (phase === 'out-of-delivery') {
    return (
      <OutOfDeliveryPage
        returnTo={outOfZoneReturnTo}
        onReturn={() => setPhase('delivery-address')}
        onNavigate={navigate}
      />
    );
  }

  if (phase === 'delivery-address') {
    return (
      <DeliveryAddressPage
        onBack={() => setPhase(session ? 'app' : 'login')}
        onOutOfZone={handleOutOfZoneFromOnboarding}
        onConfirm={(address) => {
          setPendingAddress(address);
          setPhase('delivery-details');
        }}
      />
    );
  }

  if (phase === 'delivery-details' && pendingAddress) {
    return (
      <DeliveryDetailsPage
        address={pendingAddress}
        onBack={() => setPhase('delivery-address')}
        onOutOfZone={handleOutOfZoneFromOnboarding}
        onSave={(details) => {
          void persistOnboardingAddress(details).finally(() => enterApp());
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="app-fullscreen-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-container" />
      </div>
    );
  }

  const showShell = !stackPage || stackPage === 'login';
  const showBottomNav = !stackPage;
  const showHeader =
    showShell &&
    stackPage !== 'login' &&
    activeTab !== 'home' &&
    activeTab !== 'search' &&
    activeTab !== 'account' &&
    !(activeTab === 'search' && searchMode === 'category');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomePage
            onNavigate={navigate}
            onSearchFocus={() => handleTabChange('search')}
            onSeeAll={handleOpenCategory}
            showQuickReorder={!!session}
            onProfileClick={() => handleTabChange('account')}
          />
        );
      case 'search':
        if (searchMode === 'deals') {
          return <DealsPage onNavigate={navigate} />;
        }
        if (searchMode === 'category') {
          return (
            <CategoryPage
              categoryId={categoryId}
              onNavigate={navigate}
              onBack={handleSearchBrowse}
            />
          );
        }
        if (searchMode === 'results' && searchQuery) {
          return (
            <SearchResultsPage
              query={searchQuery}
              onNavigate={navigate}
              onClear={() => {
                setSearchMode('browse');
                setSearchQuery('');
              }}
              onQueryChange={(q) => {
                setSearchQuery(q);
                if (!q.trim()) setSearchMode('browse');
              }}
            />
          );
        }
        return (
          <SearchPage
            onSearch={handleSearch}
            onOpenDeals={handleOpenDeals}
            onOpenCategory={handleOpenCategory}
            initialQuery={searchQuery}
          />
        );
      case 'orders':
        if (!session) return <LoginPage onNavigate={navigate} onSignInSuccess={() => navigate('orders')} />;
        return <OrdersPage onNavigate={navigate} />;
      case 'account':
        return <AccountPage session={session} onNavigate={navigate} />;
      default:
        return (
          <HomePage
            onNavigate={navigate}
            onSearchFocus={() => handleTabChange('search')}
            onSeeAll={handleOpenCategory}
          />
        );
    }
  };

  const renderStackPage = () => {
    switch (stackPage) {
      case 'restaurant':
        return (
          <StorePage
            merchantId={pageData?.merchantId as string | undefined}
            itemId={pageData?.itemId as string | undefined}
            verticalType={pageData?.verticalType as string | undefined}
            onNavigate={navigate}
          />
        );
      case 'cart':
        return <CartPage onNavigate={navigate} session={session} />;
      case 'checkout':
        return <CheckoutPage onNavigate={navigate} session={session} />;
      case 'payment-methods':
        return (
          <PaymentMethodsPage
            onNavigate={navigate}
            returnTo={(pageData?.returnTo as string | undefined) ?? 'account'}
            mode={(pageData?.mode as 'manage' | 'select' | undefined) ?? 'manage'}
          />
        );
      case 'add-card':
        return (
          <AddCardPage
            onNavigate={navigate}
            returnTo={pageData?.returnTo as string | undefined}
          />
        );
      case 'order-confirmation':
        return (
          <OrderConfirmationPage
            onNavigate={navigate}
            orderId={pageData?.orderId as string | undefined}
            orderNumber={pageData?.orderNumber as string | undefined}
            total={pageData?.total as number | undefined}
            eta={pageData?.eta as string | undefined}
            items={pageData?.items as Array<{ name: string; quantity: number; note?: string }> | undefined}
          />
        );
      case 'tracking':
        return (
          <OrderTrackingPage
            orderId={pageData?.orderId as string | undefined}
            onNavigate={navigate}
          />
        );
      case 'order-delivered':
        return (
          <OrderDeliveredPage
            onNavigate={navigate}
            orderId={pageData?.orderId as string | undefined}
            orderNumber={pageData?.orderNumber as string | undefined}
            tip={pageData?.tip as number | undefined}
            merchantId={pageData?.merchantId as string | undefined}
            merchantName={pageData?.merchantName as string | undefined}
            deliveredAt={pageData?.deliveredAt as string | undefined}
            proofPhotoUrl={pageData?.proofPhotoUrl as string | undefined}
          />
        );
      case 'rate-order':
        return (
          <RateOrderPage
            onNavigate={navigate}
            orderId={pageData?.orderId as string | undefined}
            merchantName={pageData?.merchantName as string | undefined}
            deliveredAt={pageData?.deliveredAt as string | undefined}
            initialRating={pageData?.rating as number | undefined}
            initialFeedbackChips={pageData?.feedbackChips as string[] | undefined}
          />
        );
      case 'order-details':
        return (
          <OrderDetailsPage
            onNavigate={navigate}
            orderId={pageData?.orderId as string | undefined}
          />
        );
      case 'edit-profile':
        return <EditProfilePage onNavigate={navigate} />;
      case 'saved-addresses':
        return (
          <SavedAddressesPage
            onNavigate={navigate}
            returnTo={(pageData?.returnTo as string | undefined) ?? 'account'}
          />
        );
      case 'add-address':
        return (
          <AddAddressPage
            onNavigate={navigate}
            addressId={pageData?.addressId as string | undefined}
            returnTo={(pageData?.returnTo as string | undefined) ?? 'saved-addresses'}
          />
        );
      case 'promotions':
        return (
          <PromotionsPage
            onNavigate={navigate}
            returnTo={(pageData?.returnTo as string | undefined) ?? 'account'}
          />
        );
      case 'rush-pass':
        if (!session) return <LoginPage onNavigate={navigate} onSignInSuccess={() => navigate('rush-pass')} />;
        return <RushPassPage onNavigate={navigate} />;
      case 'favorites':
        return (
          <FavoritesPage
            onNavigate={navigate}
            returnTo={(pageData?.returnTo as string | undefined) ?? 'account'}
          />
        );
      case 'notification-settings':
        return <NotificationSettingsPage onNavigate={navigate} />;
      case 'help':
        return <HelpPage onNavigate={navigate} />;
      case 'about':
        return <AboutPage onNavigate={navigate} />;
      case 'report-issue':
        return (
          <ReportIssuePage
            onNavigate={navigate}
            orderId={pageData?.orderId as string | undefined}
            issueType={pageData?.issueType as string | undefined}
            returnTo={pageData?.returnTo as string | undefined}
          />
        );
      case 'my-issues':
        return <MyIssuesPage onNavigate={navigate} />;
      case 'restaurant-reviews':
        return (
          <RestaurantReviewsPage
            onNavigate={navigate}
            merchantId={pageData?.merchantId as string | undefined}
          />
        );
      case 'out-of-delivery':
        return (
          <OutOfDeliveryPage
            onNavigate={navigate}
            returnTo={(pageData?.returnTo as string | undefined) ?? 'saved-addresses'}
            onReturn={() => {
              const returnTo = (pageData?.returnTo as string | undefined) ?? 'saved-addresses';
              if (returnTo === 'delivery-address') {
                setPhase('delivery-address');
                setStackPage(null);
              } else {
                navigate(returnTo);
              }
            }}
          />
        );
      case 'connection-error':
        return (
          <ConnectionErrorPage
            onNavigate={navigate}
            hasActiveOrder={false}
            onRetry={() => {
              if (navigator.onLine) window.location.reload();
            }}
          />
        );
      case 'login':
        return <LoginPage onNavigate={navigate} onSignInSuccess={() => navigate('home')} fullScreen />;
      case 'payment-callback-wipay':
        return <PaymentCallbackPage onNavigate={navigate} session={session} provider="wipay" />;
      default:
        return null;
    }
  };

  const showCartBar =
    itemCount > 0 &&
    stackPage !== 'cart' &&
    stackPage !== 'checkout' &&
    (!stackPage || stackPage === 'restaurant') &&
    !['grocery', 'convenience', 'retail'].includes(sessionStorage.getItem('roam_cart_vertical') ?? '');

  const isImmersiveStack = !!stackPage && IMMERSIVE_STACK_PAGES.includes(stackPage);
  const showOfflineOverlay = phase === 'app' && !isOnline && stackPage !== 'tracking';

  if (showOfflineOverlay) {
    return (
      <ConnectionErrorPage
        onNavigate={navigate}
        hasActiveOrder={false}
        onRetry={() => {
          if (navigator.onLine) window.location.reload();
        }}
      />
    );
  }

  return (
    <div className="app-shell bg-surface text-on-surface">
      <div className="app-shell-frame">
        {showHeader && (
          <DashAppHeader
            onMenuClick={() => setMenuOpen(true)}
            onProfileClick={() => handleTabChange('account')}
            showProfileImage={!!session}
          />
        )}
        <AppNavDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onTabChange={handleTabChange}
          onNavigate={(page) => navigate(page)}
        />

        <main
          className={`flex-1 min-h-0 ${isImmersiveStack ? 'overflow-y-auto overscroll-contain' : ''} ${showBottomNav ? 'pb-nav' : ''}`}
        >
          {stackPage ? renderStackPage() : renderTabContent()}
        </main>
      </div>

      {showCartBar && (
        <FloatingCartBar
          itemCount={itemCount}
          total={subtotal}
          onClick={() => navigate('cart')}
          hasBottomNav={showBottomNav}
          variant={stackPage === 'restaurant' ? 'store' : 'default'}
        />
      )}

      {showBottomNav && (
        <DashBottomNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          ordersBadge={ordersBadge}
        />
      )}
    </div>
  );
}
