import React, { useEffect, useState } from 'react';
import { Routes, Route, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  supabaseDashAdmin as supabase,
  hasProductAdminRole,
  jwtPrimaryRole,
  usePermissions,
} from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { AdminShell } from '@roam/admin-core';
import { AdminLoginForm } from './components/AdminLoginForm';
import { AdminConfirmProvider } from './contexts/AdminConfirmContext';
import {
  DASH_ADMIN_CONFIG,
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

export type AdminOutletContext = { session: Session };

function AdminLayoutShell({ session }: { session: Session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const userRole = jwtPrimaryRole(session.user);
  const currentPage = pathnameToNavId(location.pathname);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/admin';
  };

  const userName = session.user.email?.split('@')[0] || 'Admin';
  const roleLabel = userRole
    ? userRole.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    : 'Admin';

  return (
    <AdminShell
      config={DASH_ADMIN_CONFIG}
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

function AccessDenied({ role }: { role: string }) {
  return (
    <div className="dash-admin-portal min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 p-8">
      <h1 className="text-xl font-semibold mb-2 text-white">Access Denied</h1>
      <p className="text-slate-400 text-center max-w-md mb-6">
        You don&apos;t have permission to access the Dash Admin Portal. Role:{' '}
        <span className="font-mono text-amber-300/90">{role || '(none)'}</span>
      </p>
      <a href="/" className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium border border-slate-700">
        Back to App
      </a>
    </div>
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

  if (loading) {
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

  const userRole = jwtPrimaryRole(session.user);
  const hasJwtAccess = hasProductAdminRole(session.user, 'dash');
  const hasDbAccess = hasPermission('dash.portal.access');
  const hasAccess = hasJwtAccess || (!permsLoading && hasDbAccess);

  if (!hasAccess && !permsLoading) {
    return <AccessDenied role={userRole || ''} />;
  }

  if (permsLoading && !hasJwtAccess) {
    return (
      <div className="dash-admin-portal min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
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
            <Route path="orders" element={<OrdersListPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="users" element={<DashTeamPage />} />
            <Route path="customers" element={<CustomersListPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="finance" element={<FinancePage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="support" element={<SupportToolsPage />} />
            <Route path="settings" element={<PlatformSettingsPage session={session} />} />
          </Route>
        </Routes>
      </AdminConfirmProvider>
    </div>
  );
}
