import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { AdminLayout } from './AdminLayout';
import type { BusinessType } from '../../types/data';
import { canWriteWorldMapsFromUser } from './world-maps/WorldMapsPage';

const lazyNamed = (loader: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => loader().then((mod) => ({ default: mod[name] as React.ComponentType<any> })));

const AdminDashboard = lazyNamed(() => import('./AdminDashboard'), 'AdminDashboard');
const CustomerAccounts = lazyNamed(() => import('./CustomerAccounts'), 'CustomerAccounts');
const PlatformTeam = lazyNamed(() => import('./PlatformTeam'), 'PlatformTeam');
const TeamMembers = lazyNamed(() => import('./TeamMembers'), 'TeamMembers');
const ActivityLog = lazyNamed(() => import('./ActivityLog'), 'ActivityLog');
const TollDatabaseView = lazyNamed(() => import('../toll/TollDatabaseView'), 'TollDatabaseView');
const TollInfoPage = lazyNamed(() => import('../toll/TollInfoPage'), 'TollInfoPage');
const PlatformSettings = lazyNamed(() => import('./PlatformSettings'), 'PlatformSettings');
const GlobalPlatformSettingsPage = lazyNamed(() => import('@roam/admin-core/settings'), 'GlobalPlatformSettingsPage');
const ApiCommandCenter = lazyNamed(() => import('./api-center/ApiCommandCenter'), 'ApiCommandCenter');
const DatabaseManagement = lazyNamed(() => import('../database/DatabaseManagement'), 'DatabaseManagement');
const BusinessTypeCustomers = lazyNamed(() => import('../database/BusinessTypeCustomers'), 'BusinessTypeCustomers');
const CustomerLedgerView = lazyNamed(() => import('../database/CustomerLedgerView'), 'CustomerLedgerView');
const LedgerColumnSettings = lazyNamed(() => import('../database/LedgerColumnSettings'), 'LedgerColumnSettings');
const VehicleCatalogManager = lazyNamed(() => import('./vehicle-catalog/VehicleCatalogManager'), 'VehicleCatalogManager');
const PendingVehicleCatalogManager = lazyNamed(() => import('./vehicle-catalog/PendingVehicleCatalogManager'), 'PendingVehicleCatalogManager');
const MaintenanceTemplatesManager = lazyNamed(() => import('./maintenance-templates/MaintenanceTemplatesManager'), 'MaintenanceTemplatesManager');
const DashOverviewCard = lazyNamed(() => import('./product-overviews/DashOverviewCard'), 'DashOverviewCard');
const EnterpriseOverviewCard = lazyNamed(() => import('./product-overviews/EnterpriseOverviewCard'), 'EnterpriseOverviewCard');
const FleetOverviewCard = lazyNamed(() => import('./product-overviews/FleetOverviewCard'), 'FleetOverviewCard');
const RidesOverviewCard = lazyNamed(() => import('./product-overviews/RidesOverviewCard'), 'RidesOverviewCard');
const DriverOverviewCard = lazyNamed(() => import('./product-overviews/DriverOverviewCard'), 'DriverOverviewCard');
const HaulOverviewCard = lazyNamed(() => import('./product-overviews/HaulOverviewCard'), 'HaulOverviewCard');
const PartsSourcingManager = lazyNamed(() => import('./parts-sourcing/PartsSourcingManager'), 'PartsSourcingManager');
const CatalogQualityPage = lazyNamed(() => import('./parts-sourcing/CatalogQualityPage'), 'CatalogQualityPage');
const WorldMapsPage = lazyNamed(() => import('./world-maps/WorldMapsPage'), 'WorldMapsPage');
const PlatformsEnginesPage = lazyNamed(() => import('./parts-sourcing/PlatformsEnginesPage'), 'PlatformsEnginesPage');
const AccountingCatalogManager = lazyNamed(() => import('./accounting/AccountingCatalogManager'), 'AccountingCatalogManager');
const PendingVendorRequestsManager = lazyNamed(() => import('./accounting/PendingVendorRequestsManager'), 'PendingVendorRequestsManager');
const GctEnginePage = lazyNamed(() => import('./gct/GctEnginePage'), 'GctEnginePage');
const GctRatesPage = lazyNamed(() => import('./gct/GctRatesPage'), 'GctRatesPage');
const GctEntitiesPage = lazyNamed(() => import('./gct/GctEntitiesPage'), 'GctEntitiesPage');
const GctLedgerPage = lazyNamed(() => import('./gct/GctLedgerPage'), 'GctLedgerPage');
const GctRemittancePage = lazyNamed(() => import('./gct/GctRemittancePage'), 'GctRemittancePage');
const GctKnowledgeBasePage = lazyNamed(() => import('./gct/GctKnowledgeBasePage'), 'GctKnowledgeBasePage');
import { ErrorBoundary } from '@roam/roam-shared';
import type { ResolutionQueueSubTab } from '../fuel/stations/ResolutionQueueTab';
const StationDatabaseView = lazyNamed(() => import('../fuel/stations/StationDatabaseView'), 'StationDatabaseView');
const PlacesReview = lazyNamed(() => import('@roam/platform-ops-ui'), 'PlacesReview');
const GasStationAnalytics = lazyNamed(() => import('../fuel/stations/GasStationAnalytics'), 'GasStationAnalytics');
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { StaffMfaStep } from '../auth/StaffMfaStep';
import { supabase } from '../../utils/supabase/client';
import { LEGACY_PAGE_REDIRECTS, pageAllowedForRole, settingsTabFromPageId } from './adminNavConfig';
const MerchantVerificationManager = lazyNamed(() => import('./roam-dash/MerchantVerificationManager'), 'MerchantVerificationManager');
const GlobalIdentitySearch = lazyNamed(() => import('./platform/GlobalIdentitySearch'), 'GlobalIdentitySearch');
const MatchingBrainPage = lazyNamed(() => import('./matching-brain/MatchingBrainPage'), 'MatchingBrainPage');
const FuelBrainPage = lazyNamed(() => import('./fuel-brain/FuelBrainPage'), 'FuelBrainPage');
const FuelPricesPage = lazyNamed(() => import('./fuel-prices/FuelPricesPage'), 'FuelPricesPage');
const FuelCostAnalyticsPage = lazyNamed(() => import('./fuel-cost-analytics/FuelCostAnalyticsPage'), 'FuelCostAnalyticsPage');
const EvidenceBridgeAnalytics = lazyNamed(() => import('./fuel-evidence-bridge/EvidenceBridgeAnalytics'), 'EvidenceBridgeAnalytics');
const AdminJaaGasCardsPage = lazyNamed(() => import('./fuel/AdminJaaGasCardsPage'), 'AdminJaaGasCardsPage');
const TollBrainPage = lazyNamed(() => import('./toll-brain/TollBrainPage'), 'TollBrainPage');
const DriverUsersPage = lazyNamed(() => import('./product-users/DriverUsersPage'), 'DriverUsersPage');
const DriverUserDetailPage = lazyNamed(() => import('./product-users/DriverUserDetailPage'), 'DriverUserDetailPage');
const RiderUsersPage = lazyNamed(() => import('./product-users/RiderUsersPage'), 'RiderUsersPage');
const RiderUserDetailPage = lazyNamed(() => import('./product-users/RiderUserDetailPage'), 'RiderUserDetailPage');
import { applyPortalTheme } from '../../hooks/usePortalTheme';
import { api } from '../../services/api';
import { MovedNotice } from './MovedNotice';
const UnifiedLedgerFeed = lazyNamed(() => import('./UnifiedLedgerFeed'), 'UnifiedLedgerFeed');
const AppsDirectory = lazyNamed(() => import('./DominionHomes'), 'AppsDirectory');
const ChangeRequestInbox = lazyNamed(() => import('./DominionHomes'), 'ChangeRequestInbox');
const FuelHome = lazyNamed(() => import('./DominionHomes'), 'FuelHome');
const PlacesHome = lazyNamed(() => import('./DominionHomes'), 'PlacesHome');
const PlatformOpsHome = lazyNamed(() => import('./DominionHomes'), 'PlatformOpsHome');
const TaxVendorsHome = lazyNamed(() => import('./DominionHomes'), 'TaxVendorsHome');
const TollsHome = lazyNamed(() => import('./DominionHomes'), 'TollsHome');
const VehiclesHome = lazyNamed(() => import('./DominionHomes'), 'VehiclesHome');

const MOVED_NOTICES: Record<string, { title: string; appName: string; href: string }> = {
  'driver-users': { title: 'Driver users', appName: 'Roam Driver admin', href: 'https://roamdriver.co/admin/users' },
  'driver-user-detail': { title: 'Driver user', appName: 'Roam Driver admin', href: 'https://roamdriver.co/admin/users' },
  'roam-driver-overview': { title: 'Roam Driver', appName: 'Roam Driver admin', href: 'https://roamdriver.co/admin' },
  'rides-users': { title: 'Riders', appName: 'Roam Rides admin', href: 'https://roam-s.co/admin/users' },
  'rider-user-detail': { title: 'Rider', appName: 'Roam Rides admin', href: 'https://roam-s.co/admin/users' },
  'roam-rides-overview': { title: 'Roam Rides', appName: 'Roam Rides admin', href: 'https://roam-s.co/admin' },
  'dash-merchants': { title: 'Merchants', appName: 'Roam Rush admin', href: 'https://roamrush.app/admin' },
  'roam-dash-overview': { title: 'Roam Rush', appName: 'Roam Rush admin', href: 'https://roamrush.app/admin' },
  'enterprise-team-members': { title: 'Enterprise team', appName: 'Roam Enterprise admin', href: 'https://roamenterprise.co/admin' },
  'enterprise-customers': { title: 'Enterprise customers', appName: 'Roam Enterprise admin', href: 'https://roamenterprise.co/admin' },
  'enterprise-overview': { title: 'Roam Enterprise', appName: 'Roam Enterprise admin', href: 'https://roamenterprise.co/admin' },
  'fleet-customers': { title: 'Fleet customers', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
  'fleet-team-members': { title: 'Fleet team', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
  'fleet-overview': { title: 'Roam Fleet', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
  'toll-live-monitor': { title: 'Live tolls', appName: 'Roam Rides admin', href: 'https://roam-s.co/admin/live-tolls' },
  'roam-haul-overview': { title: 'Roam Haul', appName: 'Roam Haul admin', href: 'https://roamhaul.co/admin' },
  'db-management': { title: 'Customer books', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
  'db-settings': { title: 'Customer books', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
  'fuel-analytics': { title: 'Station analytics', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
  'fuel-cost-analytics': { title: 'Fuel cost', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
  'fuel-evidence-bridge': { title: 'Evidence bridge', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
  'unified-ledger': { title: 'Combined ledger', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' },
};

const TollLiveMonitorPage = lazy(() =>
  import('../../pages/TollLiveMonitorPage').then((m) => ({ default: m.TollLiveMonitorPage })),
);
const TollSettingsPage = lazy(() =>
  import('../../pages/TollSettingsPage').then((m) => ({ default: m.TollSettingsPage })),
);

function normalizePortalPage(page: string): string {
  return LEGACY_PAGE_REDIRECTS[page] ?? page;
}

type NavExtras = {
  userId?: string;
  customer?: { id: string; name: string; email: string; businessType: BusinessType };
} | null;

/**
 * AdminPortal — Dominion platform shell that routes purely via internal page IDs.
 */
export function AdminPortal() {
  const { session, user, role, signOut } = useAuth();
  const [mfaNeeded, setMfaNeeded] = useState(true);
  const [fillSummary, setFillSummary] = useState<{ stationId: string; fillCount: number; lastFillAt: string | null }[]>([]);
  const [currentPageRaw, setCurrentPageRaw] = useState(() => {
    if (typeof window !== 'undefined') {
      const page = new URLSearchParams(window.location.search).get('page');
      if (page) return normalizePortalPage(page);
    }
    return normalizePortalPage('dashboard');
  });
  const stationDbDefaultTab = useMemo(() => {
    if (typeof window === 'undefined') return 'spatial-audit';
    const params = new URLSearchParams(window.location.search);
    // Old Silent Attach nav / bookmarks → Resolution Queue → Silent Attach
    if (params.get('page') === 'fuel-silent-attach') return 'resolution-queue';
    return params.get('tab') === 'resolution-queue' ? 'resolution-queue' : 'spatial-audit';
  }, []);
  const resolutionSubTab = useMemo<ResolutionQueueSubTab>(() => {
    if (typeof window === 'undefined') return 'unresolved-stops';
    const params = new URLSearchParams(window.location.search);
    if (params.get('page') === 'fuel-silent-attach' || params.get('sub') === 'silent-attach') {
      return 'silent-attach';
    }
    return params.get('sub') === 'spatial-review' ? 'spatial-review' : 'unresolved-stops';
  }, []);
  const [navData, setNavData] = useState<NavExtras>(null);
  const [navHistory, setNavHistory] = useState<string[]>([]);

  const writePageUrl = useCallback((page: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.history.pushState({ page }, '', `${url.pathname}${url.search}`);
  }, []);

  const setCurrentPage = useCallback((page: string) => {
    const next = normalizePortalPage(page);
    setNavData(null);
    setCurrentPageRaw(next);
    writePageUrl(next);
  }, [writePageUrl]);

  const currentPage = currentPageRaw;

  const handleNavigate = (page: string, data?: unknown) => {
    setNavHistory((prev) => [...prev, currentPage]);
    if (data && typeof data === 'object') {
      const d = data as {
        userId?: string;
        customer?: NonNullable<NavExtras>['customer'];
      };
      if (d.customer !== undefined) {
        setNavData({ customer: d.customer, userId: d.userId });
      } else if (d.userId) {
        setNavData({ userId: d.userId });
      } else {
        setNavData(null);
      }
    } else {
      setNavData(null);
    }
    const next = normalizePortalPage(page);
    setCurrentPageRaw(next);
    writePageUrl(next);
  };

  const handleBack = () => {
    const prev = navHistory[navHistory.length - 1];
    if (prev) {
      setNavHistory((h) => h.slice(0, -1));
      const next = normalizePortalPage(prev);
      setCurrentPageRaw(next);
      writePageUrl(next);
      setNavData(null);
    }
  };

  const accessToken = session?.access_token;

  useEffect(() => {
    if (mfaNeeded || !accessToken || currentPage !== 'fuel-stations') return;
    let cancel = false;
    void fetch(`${API_ENDPOINTS.admin}/admin/station-fill-summary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (res) => {
        if (!res.ok || cancel) return;
        const data = await res.json();
        if (!cancel) setFillSummary(Array.isArray(data.stations) ? data.stations : []);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [accessToken, currentPage, mfaNeeded]);

  useEffect(() => {
    if (!session) {
      setMfaNeeded(true);
      return;
    }
    let cancelled = false;
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (cancelled) return;
      setMfaNeeded(data?.currentLevel !== 'aal2');
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    const onPop = () => {
      const page = new URLSearchParams(window.location.search).get('page') || 'dashboard';
      setNavData(null);
      setCurrentPageRaw(normalizePortalPage(page));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    api.getPreferences()
      .then((prefs) => {
        if (prefs?.darkMode !== undefined) {
          applyPortalTheme(prefs.darkMode);
        }
      })
      .catch(() => {});
  }, []);

  if (mfaNeeded) {
    return (
      <StaffMfaStep
        onCancel={() => void signOut()}
        onVerified={() => setMfaNeeded(false)}
      />
    );
  }

  const moved = MOVED_NOTICES[currentPage]
    ?? (currentPage.startsWith('fleet-settings-')
      ? { title: 'Fleet settings', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' }
      : null)
    ?? (currentPage.startsWith('enterprise-settings-')
      ? { title: 'Enterprise settings', appName: 'Roam Enterprise admin', href: 'https://roamenterprise.co/admin' }
      : null)
    ?? (currentPage.startsWith('db-biz-') || currentPage.startsWith('db-customer-')
      ? { title: 'Customer books', appName: 'Roam Fleet admin', href: 'https://roamfleet.co/admin' }
      : null);

  if (!pageAllowedForRole(role, currentPage)) {
    return (
      <AdminLayout currentPage={currentPage} onNavigate={setCurrentPage}>
        <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900/40">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Not allowed</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Your role cannot open this page.
          </p>
        </div>
      </AdminLayout>
    );
  }

  if (moved) {
    return (
      <AdminLayout currentPage={currentPage} onNavigate={setCurrentPage}>
        <MovedNotice title={moved.title} appName={moved.appName} href={moved.href} />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>
      {currentPage === 'dashboard' && <AdminDashboard onNavigate={setCurrentPage} />}
      {currentPage === 'vehicles-home' && <VehiclesHome onNavigate={setCurrentPage} />}
      {currentPage === 'places-home' && <PlacesHome onNavigate={setCurrentPage} />}
      {currentPage === 'fuel-home' && <FuelHome onNavigate={setCurrentPage} />}
      {currentPage === 'tolls-home' && <TollsHome onNavigate={setCurrentPage} />}
      {currentPage === 'tax-vendors-home' && <TaxVendorsHome onNavigate={setCurrentPage} />}
      {currentPage === 'apps-directory' && <AppsDirectory />}
      {currentPage === 'change-requests' && <ChangeRequestInbox onNavigate={setCurrentPage} />}
      {currentPage === 'platform-ops' && <PlatformOpsHome onNavigate={setCurrentPage} />}

      {currentPage === 'enterprise-overview' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] dark:border-slate-800 dark:bg-slate-900/40">
          <EnterpriseOverviewCard onNavigate={setCurrentPage} />
        </div>
      )}
      {currentPage === 'fleet-overview' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] dark:border-slate-800 dark:bg-slate-900/40">
          <FleetOverviewCard onNavigate={setCurrentPage} />
        </div>
      )}
      {currentPage === 'global-identity' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden min-h-[560px] p-2">
          <GlobalIdentitySearch />
        </div>
      )}
      {currentPage === 'enterprise-customers' && <CustomerAccounts productLine="enterprise" />}
      {(currentPage === 'fleet-customers') && (
        <CustomerAccounts productLine="fleet" />
      )}
      {currentPage === 'enterprise-team-members' && <TeamMembers productLine="enterprise" />}
      {currentPage === 'fleet-team-members' && (
        <TeamMembers productLine="fleet" />
      )}
      {currentPage === 'dash-merchants' && <MerchantVerificationManager />}

      {currentPage === 'driver-users' && (
        <DriverUsersPage onOpenUser={(id: string) => handleNavigate('driver-user-detail', { userId: id })} />
      )}
      {currentPage === 'driver-user-detail' && navData?.userId && (
        <DriverUserDetailPage userId={navData.userId} onBack={handleBack} />
      )}

      {currentPage === 'rides-users' && (
        <RiderUsersPage onOpenUser={(id: string) => handleNavigate('rider-user-detail', { userId: id })} />
      )}
      {currentPage === 'rider-user-detail' && navData?.userId && (
        <RiderUserDetailPage userId={navData.userId} onBack={handleBack} />
      )}

      {currentPage === 'platform-team' && <PlatformTeam />}
      {currentPage === 'matching-brain' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] dark:border-slate-800 dark:bg-slate-900/40">
          <MatchingBrainPage />
        </div>
      )}
      {currentPage === 'fuel-jaa-cards' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] dark:border-slate-800 dark:bg-slate-900/40">
          <AdminJaaGasCardsPage scope="platform" />
        </div>
      )}
      {currentPage === 'fuel-brain' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <FuelBrainPage />
        </div>
      )}
      {currentPage === 'fuel-prices' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <FuelPricesPage />
        </div>
      )}
      {currentPage === 'activity-log' && <ActivityLog />}
      {currentPage === 'fuel-stations' && (
        <div className="min-h-[600px] rounded-xl bg-white shadow-sm overflow-x-auto overflow-y-visible dark:bg-card dark:shadow-none dark:ring-1 dark:ring-border">
          <StationDatabaseView
            logs={[]}
            fillSummary={fillSummary}
            defaultTab={stationDbDefaultTab}
            defaultResolutionSubTab={resolutionSubTab}
          />
        </div>
      )}
      {currentPage === 'plug-places' && (
        <div className="min-h-[600px] rounded-xl bg-white shadow-sm dark:bg-card">
          <PlacesReview
            apiBase={API_ENDPOINTS.explorer}
            getToken={async () => (await supabase.auth.getSession()).data.session?.access_token ?? null}
          />
        </div>
      )}
      {currentPage === 'fuel-analytics' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <GasStationAnalytics logs={[]} loading={false} onRequestRefresh={() => undefined} />
        </div>
      )}
      {currentPage === 'fuel-cost-analytics' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <FuelCostAnalyticsPage />
        </div>
      )}
      {currentPage === 'fuel-evidence-bridge' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] p-6 dark:bg-card">
          <EvidenceBridgeAnalytics />
        </div>
      )}
      {currentPage === 'toll-brain' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <TollBrainPage />
        </div>
      )}
      {currentPage === 'toll-stations' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <TollDatabaseView />
        </div>
      )}
      {currentPage === 'toll-info' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <TollInfoPage />
        </div>
      )}
      {currentPage === 'toll-settings' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card p-4">
          <Suspense fallback={<div className="p-8 text-slate-500">Loading toll settings…</div>}>
            <TollSettingsPage onNavigate={setCurrentPage} />
          </Suspense>
        </div>
      )}
      {currentPage === 'toll-live-monitor' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card p-4">
          <Suspense fallback={<div className="p-8 text-slate-500">Loading toll monitor…</div>}>
            <TollLiveMonitorPage onNavigate={setCurrentPage} />
          </Suspense>
        </div>
      )}
      {currentPage === 'motor-vehicles' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <VehicleCatalogManager />
        </div>
      )}
      {currentPage === 'pending-motor-vehicles' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <PendingVehicleCatalogManager />
        </div>
      )}
      {currentPage === 'maintenance-templates' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <MaintenanceTemplatesManager />
        </div>
      )}
      {currentPage === 'parts-catalog' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <PartsSourcingManager mode="catalog" />
        </div>
      )}
      {currentPage === 'suppliers-prices' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <PartsSourcingManager mode="supply" />
        </div>
      )}
      {currentPage === 'platforms-engines' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <PlatformsEnginesPage />
        </div>
      )}
      {currentPage === 'catalog-quality' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <CatalogQualityPage />
        </div>
      )}
      {currentPage.startsWith('world-') && accessToken && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <WorldMapsPage
            page={currentPage}
            accessToken={accessToken}
            canWrite={canWriteWorldMapsFromUser(user)}
          />
        </div>
      )}
      {currentPage === 'gct-engine' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <ErrorBoundary>
            <GctEnginePage />
          </ErrorBoundary>
        </div>
      )}
      {currentPage === 'gct-rates' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <ErrorBoundary>
            <GctRatesPage />
          </ErrorBoundary>
        </div>
      )}
      {currentPage === 'gct-entities' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <ErrorBoundary>
            <GctEntitiesPage />
          </ErrorBoundary>
        </div>
      )}
      {currentPage === 'gct-ledger' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <ErrorBoundary>
            <GctLedgerPage />
          </ErrorBoundary>
        </div>
      )}
      {currentPage === 'gct-remittance' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <ErrorBoundary>
            <GctRemittancePage />
          </ErrorBoundary>
        </div>
      )}
      {currentPage === 'gct-knowledge' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden h-[calc(100vh-7.5rem)] dark:bg-card">
          <ErrorBoundary>
            <GctKnowledgeBasePage />
          </ErrorBoundary>
        </div>
      )}
      {(currentPage === 'vendor-database' || currentPage === 'expense-categories') && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <ErrorBoundary>
            <AccountingCatalogManager
              defaultTab={currentPage === 'expense-categories' ? 'categories' : 'vendors'}
            />
          </ErrorBoundary>
        </div>
      )}
      {currentPage === 'pending-vendor-requests' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <PendingVendorRequestsManager />
        </div>
      )}
      {currentPage === 'roam-dash-overview' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden min-h-[600px]">
          <DashOverviewCard />
        </div>
      )}
      {currentPage === 'roam-rides-overview' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden min-h-[600px]">
          <RidesOverviewCard />
        </div>
      )}
      {currentPage === 'roam-driver-overview' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden min-h-[600px]">
          <DriverOverviewCard />
        </div>
      )}
      {currentPage === 'roam-haul-overview' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden min-h-[600px]">
          <HaulOverviewCard />
        </div>
      )}
      {currentPage.startsWith('global-settings-') && (
        <GlobalPlatformSettingsPage
          apiBaseUrl={API_ENDPOINTS.admin}
          accessToken={session?.access_token}
          userEmail={user?.email}
          userRole={role ?? ''}
          activeTab={settingsTabFromPageId(currentPage) ?? 'general'}
        />
      )}
      {currentPage.startsWith('fleet-settings-') && (
        <PlatformSettings
          segment="fleet"
          activeTab={settingsTabFromPageId(currentPage) ?? 'general'}
        />
      )}
      {currentPage.startsWith('enterprise-settings-') && (
        <PlatformSettings
          segment="enterprise"
          activeTab={settingsTabFromPageId(currentPage) ?? 'general'}
        />
      )}
      {(currentPage === 'api-center' || currentPage.startsWith('api-center-')) && (
        <ApiCommandCenter
          activeTab={currentPage === 'api-center' ? 'overview' : currentPage.replace('api-center-', '')}
          onNavigate={setCurrentPage}
        />
      )}
      {currentPage === 'db-management' && (
        <DatabaseManagement onNavigate={handleNavigate} />
      )}
      {currentPage === 'unified-ledger' && (
        <UnifiedLedgerFeed onBack={() => setCurrentPage('db-management')} />
      )}
      {currentPage === 'db-settings' && (
        <LedgerColumnSettings onBack={handleBack} />
      )}
      {currentPage.startsWith('db-biz-') && (
        <BusinessTypeCustomers
          businessType={currentPage.replace('db-biz-', '') as BusinessType}
          onNavigate={handleNavigate}
          onBack={handleBack}
        />
      )}
      {currentPage.startsWith('db-customer-') && (
        <CustomerLedgerView
          customerId={currentPage.replace('db-customer-', '')}
          customerData={navData?.customer}
          onBack={handleBack}
        />
      )}
      </Suspense>
    </AdminLayout>
  );
}
