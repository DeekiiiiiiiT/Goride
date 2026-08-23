import React, { useEffect, useState } from 'react';
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
import { CustomersListPage } from './pages/customers/CustomersListPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { FinancePage } from './pages/finance/FinancePage';
import { ReviewsPage } from './pages/reviews/ReviewsPage';
import { DashPlayStoreLaunchPage } from './pages/PlayStoreLaunchPage';
import { CouriersListPage } from './pages/couriers/CouriersListPage';
import { CourierDetailPage } from './pages/couriers/CourierDetailPage';
import { ComplianceManager } from './pages/couriers/ComplianceManager';
import { CourierPresenceManager } from './pages/couriers/CourierPresenceManager';
import { DeliveryLedgerPage } from './pages/couriers/DeliveryLedgerPage';
import { LiveOpsPage } from './pages/liveops/LiveOpsPage';
import { MarketsPage } from './pages/markets/MarketsPage';
import { ActivityLogPage } from './pages/activity/ActivityLogPage';
import { dashAdminBasename } from '../lib/ops-origin';
import { PricingHubPage } from './pages/pricing/PricingHubPage';

export type AdminOutletContext = { session: Session };

function AdminLayoutShell({ session }: { session: Session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const userRole = jwtPrimaryRole(session.user);
  const config = filterConfigForRole(userRole);
  const currentPage = pathnameToNavId(location.pathname);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = dashAdminBasename();
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
  const { hasPermission, loading: permsLoading } = usePermissions({ supabase });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

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

  return (
    <div className="dash-admin-portal">
      <Toaster position="top-right" theme="dark" richColors />
      <AdminConfirmProvider>
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
            <Route path="markets" element={<MarketsPage />} />
            <Route path="team" element={<DashTeamPage />} />
            <Route path="users" element={<DashTeamPage />} />
            <Route path="activity" element={<ActivityLogPage />} />
            <Route path="customers" element={<CustomersListPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="pricing" element={<PricingHubPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="support" element={<SupportToolsPage />} />
            <Route path="play-store" element={<DashPlayStoreLaunchPage />} />
            <Route path="settings" element={<PlatformSettingsPage session={session} />} />
          </Route>
        </Routes>
      </AdminConfirmProvider>
    </div>
  );
}
