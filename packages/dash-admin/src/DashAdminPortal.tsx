import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Routes, Route, Outlet, useLocation, useNavigate, useOutletContext, Navigate } from 'react-router-dom';
import {
  supabaseDashAdmin as supabase,
  getJwtRoles,
  hasProductAdminRole,
  jwtPrimaryRole,
  usePermissions,
  flashAdminLoginError,
} from '@roam/auth-client';
import { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import { AdminShell } from '@roam/admin-core';
import { getAttention, type AttentionQueue } from '@roam/dash-admin-client';
import type { AdminNavBadge } from '@roam/admin-core';
import { AdminLoginForm } from './components/AdminLoginForm';
import { AdminMfaGate } from './components/AdminMfaGate';
import { requiresAdminMfaFromRoles } from './utils/adminMfa';
import { AdminConfirmProvider } from './contexts/AdminConfirmContext';
import { DashAdminAccessProvider } from './hooks/useDashAdminAccess';
import {
  applyNavBadges,
  breadcrumbsFor,
  filterConfigForRole,
  navIdToPath,
  pathnameToNavId,
} from './config/dashAdminNav';
import { canOpenPath } from './config/dashAdminCapabilities';
import { AccessDenied } from './components/AccessDenied';
import { CommandPalette } from './components/CommandPalette';
import { HomePage } from './pages/HomePage';
import { OrdersListPage } from './pages/orders/OrdersListPage';
import { MerchantDetailPage } from './pages/merchants/MerchantDetailPage';
import { MerchantsHubPage } from './pages/merchants/MerchantsHubPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { SupportToolsPage } from './pages/SupportToolsPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { CourierDetailPage } from './pages/couriers/CourierDetailPage';
import { DispatchPage } from './pages/dispatch/DispatchPage';
import { CouriersHubPage } from './pages/couriers/CouriersHubPage';
import { CustomersHubPage } from './pages/customers/CustomersHubPage';
import { TeamAccessPage } from './pages/team/TeamAccessPage';
import { AuditHubPage } from './pages/audit/AuditHubPage';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { SettingsOverviewPage } from './pages/settings/SettingsOverviewPage';
import { SettingsSectionPage } from './pages/settings/SettingsSectionPage';
import { SettingsApprovalsPage } from './pages/settings/SettingsApprovalsPage';
import { SettingsHistoryPage } from './pages/settings/SettingsHistoryPage';
import { SettingsKillSwitchesPage } from './pages/settings/SettingsKillSwitchesPage';
import { LegacySettingsRedirect } from './pages/settings/LegacySettingsRedirect';
import { ReportsPage } from './pages/reports/ReportsPage';
import { IdentityPersonaRedirect } from './pages/users/IdentityPersonaRedirect';
import { MarketsHubPage } from './pages/markets/MarketsHubPage';
import { PromotionsHubPage } from './pages/promotions/PromotionsHubPage';
import { CourierCashPage } from './pages/finance/CourierCashPage';
import { InHouseTeamPage } from './pages/inhouse/InHouseTeamPage';
import { InHouseWorkspacePage } from './pages/inhouse/InHouseWorkspacePage';
import { InHouseRestaurantHomePage } from './pages/inhouse/restaurants/InHouseRestaurantHomePage';
import { InHouseMenuBuilderPage } from './pages/inhouse/restaurants/InHouseMenuBuilderPage';
import { useAdminSessionPolicy } from './hooks/useAdminSessionPolicy';

const DASH_ADMIN_BASENAME = '/admin';

const MarketsPage = React.lazy(() =>
  import('./pages/markets/MarketsPage').then((m) => ({ default: m.MarketsPage })),
);
const BoundaryLibraryPage = React.lazy(() =>
  import('./pages/markets/BoundaryLibraryPage').then((m) => ({ default: m.BoundaryLibraryPage })),
);
const CoverageHealthPage = React.lazy(() =>
  import('./pages/markets/CoverageHealthPage').then((m) => ({ default: m.CoverageHealthPage })),
);
const FinancePage = React.lazy(() =>
  import('./pages/finance/FinancePage').then((m) => ({ default: m.FinancePage })),
);
const PricingHubPage = React.lazy(() =>
  import('./pages/pricing/PricingHubPage').then((m) => ({ default: m.PricingHubPage })),
);

function AdminRouteFallback() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
    </div>
  );
}

export type AdminOutletContext = {
  session: Session;
  setDetailLabel?: (label: string | null) => void;
  attention?: AttentionQueue[] | null;
};

export function useDetailCrumb(label: string | null | undefined) {
  const { setDetailLabel } = useOutletContext<AdminOutletContext>();
  useEffect(() => {
    setDetailLabel?.(label?.trim() || null);
    return () => setDetailLabel?.(null);
  }, [label, setDetailLabel]);
}

function environmentLabel() {
  const meta = import.meta as { env?: { VITE_APP_ENV?: string; PROD?: boolean } };
  const named = meta.env?.VITE_APP_ENV;
  if (named && named.toLowerCase() !== 'production') return named.toUpperCase();
  if (meta.env?.PROD === false) return 'DEVELOPMENT';
  return null;
}

function badgesFromQueues(queues: AttentionQueue[]): Record<string, AdminNavBadge> {
  const byNav: Record<string, { count: number; tone: 'waiting' | 'breach' }> = {};
  const navFor: Record<string, string> = {
    applications: 'merchants',
    compliance: 'couriers',
    cases: 'support',
    unassigned: 'dispatch',
    disputes: 'finance',
    banks: 'finance',
    cash: 'courier-cash',
    'in-house': 'in-house',
  };
  let home = 0;
  let homeBreach = false;
  for (const queue of queues) {
    home += queue.count;
    if (queue.breached) homeBreach = true;
    const nav = navFor[queue.id];
    if (!nav) continue;
    const current = byNav[nav] ?? { count: 0, tone: 'waiting' as const };
    current.count += queue.count;
    if (queue.breached) current.tone = 'breach';
    byNav[nav] = current;
  }
    if (home > 0) byNav.home = { count: home, tone: homeBreach ? 'breach' : 'waiting' };
  return byNav;
}

/** A buyer has the desk only. Home is not a page they can be stuck on. */
function isInHouseBuyerOnly(roles: string[]) {
  return roles.includes('dash_concierge')
    && !roles.some((role) => role !== 'dash_concierge' && role !== 'authenticated');
}

function AdminLayoutShell({ session }: { session: Session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const roles = getJwtRoles(session.user);
  const userRole = jwtPrimaryRole(session.user);
  const [searchOpen, setSearchOpen] = useState(false);
  const [queues, setQueues] = useState<AttentionQueue[] | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [detailLabel, setDetailLabelState] = useState<string | null>(null);
  const setDetailLabel = useCallback((label: string | null) => setDetailLabelState(label), []);
  const allowed = canOpenPath(roles, location.pathname);
  const sendBuyerToDesk = isInHouseBuyerOnly(roles)
    && (location.pathname === '/' || location.pathname === '/dashboard');
  const baseConfig = filterConfigForRole(roles);
  const config = applyNavBadges(baseConfig, badgesFromQueues(queues ?? []));
  const currentPage = pathnameToNavId(location.pathname);
  const pages = baseConfig.groups.flatMap((group) => group.items.map((item) => ({
    id: item.id,
    label: item.label,
    path: navIdToPath(item.id),
  })));

  useEffect(() => {
    let stop = false;
    const load = () => {
      void getAttention(session.access_token)
        .then((res) => { if (!stop) setQueues(res.queues ?? []); })
        .catch(() => { if (!stop) setQueues(null); });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [session.access_token]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      onCrumb={(to) => navigate(to)}
      breadcrumbs={breadcrumbsFor(location.pathname, location.search, detailLabel)}
      onOpenSearch={() => setSearchOpen(true)}
      notificationCount={(queues ?? []).reduce((sum, queue) => sum + queue.count, 0)}
      onOpenNotifications={() => setBellOpen((open) => !open)}
      notificationsOpen={bellOpen}
      notifications={queues == null ? <p className="text-sm text-slate-400">The attention feed is not available yet.</p> : queues.length === 0 ? <p className="text-sm text-emerald-300">All clear</p> : (
        <div className="space-y-1">
          {queues.map((queue) => (
            <button key={queue.id} type="button" className="block w-full rounded-lg px-2 py-2 text-left text-sm text-amber-200 hover:bg-slate-800" onClick={() => { navigate(queue.href); setBellOpen(false); }}>
              {queue.count} {queue.label}{queue.breached ? ' · past the limit' : ''}
            </button>
          ))}
        </div>
      )}
      environmentLabel={environmentLabel()}
      user={{
        name: userName,
        email: session.user.email,
        role: roleLabel,
      }}
      onSignOut={handleSignOut}
    >
      {sendBuyerToDesk
        ? <Navigate to="/in-house" replace />
        : allowed
          ? <Outlet context={{ session, setDetailLabel, attention: queues }} />
          : <AccessDenied />}
      <CommandPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        pages={pages}
        accessToken={session.access_token}
        onGo={(path) => navigate(path)}
      />
    </AdminShell>
  );
}

function DashAdminHome() {
  const { session } = useOutletContext<AdminOutletContext>();
  const roles = getJwtRoles(session.user);
  if (isInHouseBuyerOnly(roles)) {
    return <Navigate to="/in-house" replace />;
  }
  return <HomePage />;
}

function RedirectKeep({ to }: { to: string }) {
  const location = useLocation();
  const dest = new URL(to, 'http://local');
  const incoming = new URLSearchParams(location.search);
  incoming.forEach((value, key) => {
    if (!dest.searchParams.has(key)) dest.searchParams.set(key, value);
  });
  const search = dest.searchParams.toString();
  return <Navigate to={`${dest.pathname}${search ? `?${search}` : ''}${location.hash}`} replace />;
}

/** Old `/settings?tab=` URLs → new paths; otherwise the left-rail layout. */
function SettingsLegacyOrLayout() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const atSettingsRoot = location.pathname.replace(/\/$/, '').endsWith('/settings');
  if (atSettingsRoot && (search.has('tab') || search.has('scope'))) {
    return <LegacySettingsRedirect />;
  }
  return <SettingsLayout />;
}

export function DashAdminPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaBlocked, setMfaBlocked] = useState(false);
  const { hasPermission, loading: permsLoading } = usePermissions({ supabase });
  useAdminSessionPolicy();

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
    const meta = session.user.app_metadata as { roles?: string[]; role?: string };
    const roles = Array.isArray(meta.roles) ? meta.roles : [meta.role ?? jwtPrimaryRole(session.user)].filter(Boolean);
    if (!requiresAdminMfaFromRoles(roles)) return;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setMfaBlocked(data?.currentLevel !== 'aal2');
    }).catch(() => setMfaBlocked(true));
  }, [session]);

  const hasJwtAccess =
    !!session &&
    (hasProductAdminRole(session.user, 'dash') ||
      hasProductAdminRole(session.user, 'courier') ||
      getJwtRoles(session.user).includes('dash_concierge'));
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
      <AdminMfaGate
        onComplete={() => setMfaBlocked(false)}
        onSignOut={() => void supabase.auth.signOut()}
      />
    );
  }

  return (
    <div className="dash-admin-portal">
      <Toaster position="top-right" theme="dark" richColors />
      <AdminConfirmProvider>
        <DashAdminAccessProvider session={session}>
        <Routes>
          <Route element={<AdminLayoutShell session={session} />}>
            <Route index element={<DashAdminHome />} />
            <Route path="dashboard" element={<RedirectKeep to="/" />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="merchants/onboarding/applications" element={<RedirectKeep to="/merchants?tab=applications" />} />
            <Route path="merchants/onboarding/business-types" element={<RedirectKeep to="/merchants?tab=business-types" />} />
            <Route path="merchants/onboarding" element={<RedirectKeep to="/merchants?tab=applications" />} />
            <Route path="merchants/:id" element={<MerchantDetailPage />} />
            <Route path="merchants" element={<MerchantsHubPage />} />
            <Route path="dispatch" element={<DispatchPage />} />
            <Route path="live-ops" element={<RedirectKeep to="/dispatch" />} />
            <Route path="in-house/task/:id" element={<InHouseWorkspacePage />} />
            <Route path="in-house/restaurants/:id/menu" element={<InHouseMenuBuilderPage />} />
            <Route path="in-house/restaurants/:id" element={<InHouseRestaurantHomePage />} />
            <Route path="in-house/exceptions" element={<RedirectKeep to="/in-house?tab=orders" />} />
            <Route path="in-house/stores" element={<RedirectKeep to="/in-house?tab=restaurants" />} />
            <Route path="in-house/menu" element={<RedirectKeep to="/in-house?tab=restaurants" />} />
            <Route path="in-house/cards" element={<RedirectKeep to="/in-house?tab=cards" />} />
            <Route path="in-house/reports" element={<RedirectKeep to="/in-house?tab=reports" />} />
            <Route path="in-house" element={<InHouseTeamPage />} />
            <Route path="orders/:id" element={<OrderDetailPage />} />
            <Route path="orders" element={<OrdersListPage />} />
            <Route path="couriers/compliance" element={<RedirectKeep to="/couriers?tab=compliance" />} />
            <Route path="couriers/presence" element={<RedirectKeep to="/dispatch?tab=map" />} />
            <Route path="couriers/ledger" element={<RedirectKeep to="/orders?view=all&type=courier" />} />
            <Route path="couriers/:userId" element={<CourierDetailPage />} />
            <Route path="couriers" element={<CouriersHubPage />} />
            <Route path="markets/boundaries" element={<RedirectKeep to="/markets?tab=boundaries" />} />
            <Route path="markets/coverage-health" element={<RedirectKeep to="/markets?tab=health" />} />
            <Route
              path="markets"
              element={
                <MarketsHubPage
                  markets={<Suspense fallback={<AdminRouteFallback />}><MarketsPage embedded /></Suspense>}
                  boundaries={<Suspense fallback={<AdminRouteFallback />}><BoundaryLibraryPage embedded /></Suspense>}
                  health={<Suspense fallback={<AdminRouteFallback />}><CoverageHealthPage embedded /></Suspense>}
                />
              }
            />
            <Route path="users/operators" element={<RedirectKeep to="/team?tab=operators" />} />
            <Route path="users/audit" element={<RedirectKeep to="/audit" />} />
            <Route path="users/merchant-staff" element={<RedirectKeep to="/team?tab=merchant-staff" />} />
            <Route path="users/compliance" element={<RedirectKeep to="/couriers?tab=compliance" />} />
            <Route path="users/:userId" element={<IdentityPersonaRedirect />} />
            <Route path="users" element={<RedirectKeep to="/team?tab=all-users" />} />
            <Route path="team" element={<TeamAccessPage />} />
            <Route path="activity" element={<RedirectKeep to="/audit" />} />
            <Route path="audit" element={<AuditHubPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="customers" element={<CustomersHubPage />} />
            <Route path="finance" element={<Suspense fallback={<AdminRouteFallback />}><FinancePage /></Suspense>} />
            <Route path="courier-cash" element={<CourierCashPage />} />
            <Route path="promotions" element={<PromotionsHubPage />} />
            <Route path="pricing" element={<Suspense fallback={<AdminRouteFallback />}><PricingHubPage /></Suspense>} />
            <Route path="remittance" element={<RedirectKeep to="/courier-cash" />} />
            <Route path="reviews" element={<RedirectKeep to="/support?tab=reviews" />} />
            <Route path="support" element={<SupportToolsPage />} />
            <Route path="play-store" element={<RedirectKeep to="/settings/platform/app-versions" />} />
            <Route path="settings" element={<SettingsLegacyOrLayout />}>
              <Route index element={<SettingsOverviewPage />} />
              <Route path="approvals" element={<SettingsApprovalsPage />} />
              <Route path="history" element={<SettingsHistoryPage />} />
              <Route path="kill-switches" element={<SettingsKillSwitchesPage />} />
              <Route path=":area/:section" element={<SettingsSectionPage />} />
            </Route>
          </Route>
        </Routes>
        </DashAdminAccessProvider>
      </AdminConfirmProvider>
    </div>
  );
}
