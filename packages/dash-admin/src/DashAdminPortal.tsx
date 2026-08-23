import React, { Suspense, useEffect, useState } from 'react';
import { Routes, Route, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  supabaseDashAdmin as supabase,
  hasProductAdminRole,
  jwtPrimaryRole,
  usePermissions,
  flashAdminLoginError,
} from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { AdminShell } from '@roam/admin-core';
import { AdminLoginForm } from './components/AdminLoginForm';
import { AdminConfirmProvider } from './contexts/AdminConfirmContext';
import { DashAdminAccessProvider } from './hooks/useDashAdminAccess';
import {
  DASH_ADMIN_CONFIG,
  filterConfigForRole,
  navIdToPath,
  pathnameToNavId,
} from './config/dashAdminNav';
import { DashAdminDashboard } from './pages/DashAdminDashboard';
import { MerchantManager } from './pages/MerchantManager';
import { MerchantDetailPage } from './pages/merchants/MerchantDetailPage';
import {
  MerchantsIndexRedirect,
  MerchantsOnboardingIndexRedirect,
  MerchantsSectionLayout,
} from './pages/merchants/MerchantsSectionLayout';
import { MerchantsOnboardingLayout } from './pages/merchants/MerchantsOnboardingLayout';
import { BusinessTypesPage } from './pages/merchants/onboarding/BusinessTypesPage';
import { OrdersListPage } from './pages/orders/OrdersListPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { SupportToolsPage } from './pages/SupportToolsPage';
import { PlatformSettingsPage } from './pages/PlatformSettingsPage';
import { DashTeamPage } from './pages/users/DashTeamPage';
import { IdentityDirectoryPage } from './pages/users/IdentityDirectoryPage';
import { IdentityDetailPage } from './pages/users/IdentityDetailPage';
import { CustomersListPage } from './pages/customers/CustomersListPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { CouriersListPage } from './pages/couriers/CouriersListPage';
import { CourierDetailPage } from './pages/couriers/CourierDetailPage';
import { ComplianceManager } from './pages/couriers/ComplianceManager';
import { CourierPresenceManager } from './pages/couriers/CourierPresenceManager';
import { DeliveryLedgerPage } from './pages/couriers/DeliveryLedgerPage';
import { LiveOpsPage } from './pages/liveops/LiveOpsPage';
import { ActivityLogPage } from './pages/activity/ActivityLogPage';
import { ReviewsPage } from './pages/reviews/ReviewsPage';

const DASH_ADMIN_BASENAME = '/admin';

const MarketsPage = React.lazy(() =>
  import('./pages/markets/MarketsPage').then((m) => ({ default: m.MarketsPage })),
);
const FinancePage = React.lazy(() =>
  import('./pages/finance/FinancePage').then((m) => ({ default: m.FinancePage })),
);
const PricingHubPage = React.lazy(() =>
  import('./pages/pricing/PricingHubPage').then((m) => ({ default: m.PricingHubPage })),
);
const DashPlayStoreLaunchPage = React.lazy(() =>
  import('./pages/PlayStoreLaunchPage').then((m) => ({ default: m.DashPlayStoreLaunchPage })),
);

function AdminRouteFallback() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
    </div>
  );
}

export type AdminOutletContext = { session: Session };

function AdminLayoutShell({ session }: { session: Session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const userRole = jwtPrimaryRole(session.user);
  const config = filterConfigForRole(userRole);
  const currentPage = pathnameToNavId(location.pathname);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = DASH_ADMIN_BASENAME;
  };

  const userName = session.user.email?.split('@')[0] || 'Admin';
  const roleLabel = userRole
    ? userRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : 'Admin';

  return (
    <AdminShell
      config={config}
      currentPage={currentPage}
      onNavigate={(page) => navigate(navIdToPath(page))}
      user={{
        name: userName,
        email: session.user.email,
        role: roleLabel,
      }}
      onSignOut={handleSignOut}
    >
      <Outlet context={{ session }} />
    </AdminShell>
  );
}

export function DashAdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaBlocked, setMfaBlocked] = useState(false);
  const { hasPermission, loading: permsLoading } = usePermissions({ supabase });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setMfaBlocked(false);
      return;
    }
    const role = jwtPrimaryRole(session.user);
    const privileged = ['platform_owner', 'dash_admin', 'courier_admin', 'identity_admin', 'superadmin'].includes(role);
    if (!privileged) return;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setMfaBlocked(data?.currentLevel !== 'aal2');
    }).catch(() => setMfaBlocked(false));
  }, [session]);

  const hasJwtAccess =
    !!session &&
    (hasProductAdminRole(session.user, 'dash') || hasProductAdminRole(session.user, 'courier'));
  const hasDbAccess = !!session && !permsLoading && hasPermission('dash.portal.access');
  const accessResolved = !session || hasJwtAccess || !permsLoading;
  const hasAccess = hasJwtAccess || hasDbAccess;

  useEffect(() => {
    if (loading || !session || !accessResolved || hasAccess) return;
    flashAdminLoginError();
    void supabase.auth.signOut();
  }, [loading, session, accessResolved, hasAccess]);

  if (loading || (session && !hasAccess)) {
    return (
      <div className="dash-admin-portal min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Toaster position="top-right" theme="dark" />
        <AdminLoginForm />
      </>
    );
  }

  if (mfaBlocked) {
    return (
      <div className="dash-admin-portal min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md text-center space-y-3">
          <h2 className="text-lg font-semibold text-white">Multi-factor authentication required</h2>
          <p className="text-sm text-slate-400">
            Admin accounts at your privilege level must enroll MFA before using the Ops Console.
          </p>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-admin-portal">
      <Toaster position="top-right" theme="dark" richColors />
      <AdminConfirmProvider>
        <DashAdminAccessProvider session={session}>
        <Routes>
          <Route element={<AdminLayoutShell session={session} />}>
            <Route index element={<DashAdminDashboard />} />
            <Route path="merchants" element={<MerchantsSectionLayout />}>
              <Route index element={<MerchantsIndexRedirect />} />
              <Route path="onboarding" element={<MerchantsOnboardingLayout />}>
                <Route index element={<MerchantsOnboardingIndexRedirect />} />
                <Route path="applications" element={<MerchantManager />} />
                <Route path="business-types" element={<BusinessTypesPage />} />
              </Route>
              <Route path=":id" element={<MerchantDetailPage />} />
            </Route>
            <Route path="live-ops" element={<LiveOpsPage />} />
            <Route path="orders" element={<OrdersListPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="couriers" element={<CouriersListPage />} />
            <Route path="couriers/compliance" element={<ComplianceManager />} />
            <Route path="couriers/presence" element={<CourierPresenceManager />} />
            <Route path="couriers/ledger" element={<DeliveryLedgerPage />} />
            <Route path="couriers/:userId" element={<CourierDetailPage />} />
            <Route
              path="markets"
              element={
                <Suspense fallback={<AdminRouteFallback />}>
                  <MarketsPage />
                </Suspense>
              }
            />
            <Route path="users" element={<IdentityDirectoryPage />} />
            <Route path="users/operators" element={<DashTeamPage />} />
            <Route path="users/audit" element={<ActivityLogPage />} />
            <Route path="users/:userId" element={<IdentityDetailPage />} />
            <Route path="team" element={<DashTeamPage />} />
            <Route path="activity" element={<ActivityLogPage />} />
            <Route path="customers" element={<CustomersListPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route
              path="finance"
              element={
                <Suspense fallback={<AdminRouteFallback />}>
                  <FinancePage />
                </Suspense>
              }
            />
            <Route
              path="pricing"
              element={
                <Suspense fallback={<AdminRouteFallback />}>
                  <PricingHubPage />
                </Suspense>
              }
            />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="support" element={<SupportToolsPage />} />
            <Route
              path="play-store"
              element={
                <Suspense fallback={<AdminRouteFallback />}>
                  <DashPlayStoreLaunchPage />
                </Suspense>
              }
            />
            <Route path="settings" element={<PlatformSettingsPage session={session} />} />
          </Route>
        </Routes>
        </DashAdminAccessProvider>
      </AdminConfirmProvider>
    </div>
  );
}
