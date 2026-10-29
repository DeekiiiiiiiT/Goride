import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { AdminLayout } from './AdminLayout';
import { canWriteWorldMapsFromUser } from './world-maps/WorldMapsPage';

const lazyNamed = (loader: () => Promise<Record<string, unknown>>, name: string) =>
  lazy(() => loader().then((mod) => ({ default: mod[name] as React.ComponentType<any> })));

const AdminDashboard = lazyNamed(() => import('./AdminDashboard'), 'AdminDashboard');
const PlatformTeam = lazyNamed(() => import('./PlatformTeam'), 'PlatformTeam');
const ActivityLog = lazyNamed(() => import('./ActivityLog'), 'ActivityLog');
const TollDatabaseView = lazyNamed(() => import('../toll/TollDatabaseView'), 'TollDatabaseView');
const TollInfoPage = lazyNamed(() => import('../toll/TollInfoPage'), 'TollInfoPage');
const GlobalPlatformSettingsPage = lazyNamed(() => import('@roam/admin-core/settings'), 'GlobalPlatformSettingsPage');
const ApiCommandCenter = lazyNamed(() => import('./api-center/ApiCommandCenter'), 'ApiCommandCenter');
const VehicleCatalogManager = lazyNamed(() => import('./vehicle-catalog/VehicleCatalogManager'), 'VehicleCatalogManager');
const PendingVehicleCatalogManager = lazyNamed(() => import('./vehicle-catalog/PendingVehicleCatalogManager'), 'PendingVehicleCatalogManager');
const MaintenanceTemplatesManager = lazyNamed(() => import('./maintenance-templates/MaintenanceTemplatesManager'), 'MaintenanceTemplatesManager');
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
const StationDatabasePage = lazyNamed(() => import('./station-database/StationDatabasePage'), 'StationDatabasePage');
const PlacesPage = lazyNamed(() => import('./places/PlacesPage'), 'PlacesPage');
const FuelPlacesReview = lazyNamed(() => import('./places/PlacesPage'), 'FuelPlacesReview');
const StationAnalyticsPage = lazyNamed(() => import('./station-analytics/StationAnalyticsPage'), 'StationAnalyticsPage');
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { StaffMfaStep } from '../auth/StaffMfaStep';
import { supabase } from '../../utils/supabase/client';
import { LEGACY_PAGE_REDIRECTS, MOVED_PAGES, pageAllowedForRole, settingsTabFromPageId } from './adminNavConfig';
const GlobalIdentitySearch = lazyNamed(() => import('./platform/GlobalIdentitySearch'), 'GlobalIdentitySearch');
const MatchingBrainPage = lazyNamed(() => import('./matching-brain/MatchingBrainPage'), 'MatchingBrainPage');
const FuelBrainPage = lazyNamed(() => import('./fuel-brain/FuelBrainPage'), 'FuelBrainPage');
const RefineriesPage = lazyNamed(() => import('./refineries/RefineriesPage'), 'RefineriesPage');
const PriceEnginePage = lazyNamed(() => import('./fuel-prices/PriceEnginePage'), 'PriceEnginePage');
const AdminJaaGasCardsPage = lazyNamed(() => import('./fuel/AdminJaaGasCardsPage'), 'AdminJaaGasCardsPage');
const TollBrainPage = lazyNamed(() => import('./toll-brain/TollBrainPage'), 'TollBrainPage');
import { applyPortalTheme } from '../../hooks/usePortalTheme';
import { api } from '../../services/api';
import { DominionLoading, DominionMoved, DominionNoAccess } from './DominionStates';
import { DominionMasterList } from './DominionMasterList';
// Keep the shared master-list shell in the admin import graph for reachability.
void DominionMasterList;
const AppsDirectory = lazyNamed(() => import('./AppsDirectory'), 'AppsDirectory');
const ChangeRequestInbox = lazyNamed(() => import('./ChangeRequestInbox'), 'ChangeRequestInbox');
const FuelHome = lazyNamed(() => import('./DominionHomes'), 'FuelHome');
const PlacesHome = lazyNamed(() => import('./DominionHomes'), 'PlacesHome');
const PlatformOpsHome = lazyNamed(() => import('./PlatformOpsHome'), 'PlatformOpsHome');
const TaxVendorsHome = lazyNamed(() => import('./DominionHomes'), 'TaxVendorsHome');
const TollsHome = lazyNamed(() => import('./DominionHomes'), 'TollsHome');
const VehiclesHome = lazyNamed(() => import('./DominionHomes'), 'VehiclesHome');

const TollSettingsPage = lazy(() =>
  import('../../pages/TollSettingsPage').then((m) => ({ default: m.TollSettingsPage })),
);

function normalizePortalPage(page: string): string {
  return LEGACY_PAGE_REDIRECTS[page] ?? page;
}

/**
 * AdminPortal — Dominion platform shell that routes purely via internal page IDs.
 */
export function AdminPortal() {
  const { session, user, role, signOut } = useAuth();
  const [mfaNeeded, setMfaNeeded] = useState(true);
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
  const writePageUrl = useCallback((page: string) => {
    const allowed: Record<string, string[]> = {
      'fuel-analytics': ['grade', 'week', 'pcode', 'brand'],
      'fuel-prices': ['refinery', 'week', 'range', 'year'],
      'fuel-stations': ['q', 'status', 'pcode', 'brand', 'pin', 'source', 'issue', 'sort', 'dir', 'p', 'tab', 'sub'],
    };
    const url = new URL(window.location.href);
    const keep = new Set(allowed[page] || []);
    const next = new URLSearchParams();
    next.set('page', page);
    for (const key of keep) {
      const value = url.searchParams.get(key);
      if (value) next.set(key, value);
    }
    window.history.pushState({ page }, '', `${url.pathname}?${next.toString()}`);
  }, []);

  const setCurrentPage = useCallback((page: string) => {
    const next = normalizePortalPage(page);
    setCurrentPageRaw(next);
    writePageUrl(next);
  }, [writePageUrl]);

  const currentPage = currentPageRaw;

  const accessToken = session?.access_token;

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

  const moved = MOVED_PAGES[currentPage];
  if (moved) {
    return (
      <AdminLayout currentPage={currentPage} onNavigate={setCurrentPage}>
        <DominionMoved title={moved.title} appName={moved.appName} href={moved.href} />
      </AdminLayout>
    );
  }

  if (!pageAllowedForRole(role, currentPage)) {
    return (
      <AdminLayout currentPage={currentPage} onNavigate={setCurrentPage}>
        {role === 'platform_owner' ? (
          <div className="rounded-xl border border-[#e2e8f0] bg-white p-8">
            <h1 className="text-lg font-semibold text-[#0f172a]">This page is not in Dominion</h1>
            <p className="mt-2 text-sm text-[#64748b]">Customer lists live in each product’s own admin.</p>
          </div>
        ) : (
          <DominionNoAccess />
        )}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      <Suspense fallback={<DominionLoading />}>
      {currentPage === 'dashboard' && <AdminDashboard onNavigate={setCurrentPage} />}
      {currentPage === 'vehicles-home' && <VehiclesHome onNavigate={setCurrentPage} />}
      {currentPage === 'places-home' && <PlacesHome onNavigate={setCurrentPage} />}
      {currentPage === 'fuel-home' && <FuelHome onNavigate={setCurrentPage} />}
      {currentPage === 'tolls-home' && <TollsHome onNavigate={setCurrentPage} />}
      {currentPage === 'tax-vendors-home' && <TaxVendorsHome onNavigate={setCurrentPage} />}
      {currentPage === 'apps-directory' && <AppsDirectory />}
      {currentPage === 'change-requests' && <ChangeRequestInbox onNavigate={setCurrentPage} />}
      {currentPage === 'platform-ops' && <PlatformOpsHome onNavigate={setCurrentPage} />}

      {currentPage === 'global-identity' && (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 overflow-hidden min-h-[560px] p-2">
          <GlobalIdentitySearch />
        </div>
      )}
      {currentPage === 'platform-team' && <PlatformTeam />}
      {currentPage === 'matching-brain' && <MatchingBrainPage onNavigate={setCurrentPage} />}
      {currentPage === 'fuel-jaa-cards' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] dark:border-slate-800 dark:bg-slate-900/40">
          <AdminJaaGasCardsPage scope="platform" />
        </div>
      )}
      {currentPage === 'fuel-brain' && <FuelBrainPage onNavigate={setCurrentPage} />}
      {currentPage === 'fuel-prices' && (
        <div className="min-h-[560px] bg-slate-50 -m-4 lg:-m-8 dark:bg-[#0b1220]">
          <RefineriesPage />
        </div>
      )}
      {currentPage === 'fuel-price-engine' && (
        <div className="min-h-[560px] overflow-x-auto bg-[#f4f3fa] -m-4 lg:-m-8">
          <PriceEnginePage />
        </div>
      )}
      {currentPage === 'activity-log' && <ActivityLog />}
      {currentPage === 'fuel-stations' && (
        <StationDatabasePage
          canWrite={role === 'platform_owner'}
          defaultTab={stationDbDefaultTab}
          defaultResolutionSubTab={resolutionSubTab}
          fuelReview={<FuelPlacesReview />}
          onNavigate={setCurrentPage}
        />
      )}
      {currentPage === 'plug-places' && <PlacesPage mode="review" chip="plug" />}
      {currentPage === 'places-register' && <PlacesPage mode="register" />}
      {currentPage === 'places-categories' && <PlacesPage mode="categories" />}
      {currentPage === 'places-review' && <PlacesPage mode="review" />}
      {currentPage === 'fuel-analytics' && <StationAnalyticsPage onNavigate={setCurrentPage} />}
      {currentPage === 'toll-brain' && <TollBrainPage onNavigate={setCurrentPage} />}
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
        <ErrorBoundary>
          <GctEnginePage />
        </ErrorBoundary>
      )}
      {currentPage === 'gct-rates' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <ErrorBoundary>
            <GctRatesPage />
          </ErrorBoundary>
        </div>
      )}
      {currentPage === 'gct-entities' && (
        <ErrorBoundary>
          <GctEntitiesPage />
        </ErrorBoundary>
      )}
      {currentPage === 'gct-ledger' && (
        <ErrorBoundary>
          <GctLedgerPage />
        </ErrorBoundary>
      )}
      {currentPage === 'gct-remittance' && (
        <ErrorBoundary>
          <GctRemittancePage />
        </ErrorBoundary>
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
      {currentPage.startsWith('global-settings-') && (
        <GlobalPlatformSettingsPage
          apiBaseUrl={API_ENDPOINTS.admin}
          accessToken={session?.access_token}
          userEmail={user?.email}
          userRole={role ?? ''}
          activeTab={settingsTabFromPageId(currentPage) ?? 'general'}
          onNavigate={setCurrentPage}
        />
      )}
      {(currentPage === 'api-center' || currentPage.startsWith('api-center-')) && (
        <ApiCommandCenter
          activeTab={currentPage === 'api-center' ? 'overview' : currentPage.replace('api-center-', '')}
          onNavigate={setCurrentPage}
        />
      )}
      </Suspense>
    </AdminLayout>
  );
}
