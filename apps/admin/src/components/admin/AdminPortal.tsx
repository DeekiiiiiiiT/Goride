import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from './AdminLayout';
import { AdminDashboard } from './AdminDashboard';
import { CustomerAccounts } from './CustomerAccounts';
import { PlatformTeam } from './PlatformTeam';
import { TeamMembers } from './TeamMembers';
import { ActivityLog } from './ActivityLog';
import { TollDatabaseView } from '../toll/TollDatabaseView';
import { TollInfoPage } from '../toll/TollInfoPage';
import { PlatformSettings } from './PlatformSettings';
import { GlobalPlatformSettingsPage } from '@roam/admin-core/settings';
import { ApiCommandCenter } from './api-center/ApiCommandCenter';
import { DatabaseManagement } from '../database/DatabaseManagement';
import { BusinessTypeCustomers } from '../database/BusinessTypeCustomers';
import { CustomerLedgerView } from '../database/CustomerLedgerView';
import { LedgerColumnSettings } from '../database/LedgerColumnSettings';
import { BusinessType } from '../../types/data';
import { VehicleCatalogManager } from './vehicle-catalog/VehicleCatalogManager';
import { PendingVehicleCatalogManager } from './vehicle-catalog/PendingVehicleCatalogManager';
import { MaintenanceTemplatesManager } from './maintenance-templates/MaintenanceTemplatesManager';
import { DashOverviewCard } from './product-overviews/DashOverviewCard';
import { EnterpriseOverviewCard } from './product-overviews/EnterpriseOverviewCard';
import { FleetOverviewCard } from './product-overviews/FleetOverviewCard';
import { RidesOverviewCard } from './product-overviews/RidesOverviewCard';
import { DriverOverviewCard } from './product-overviews/DriverOverviewCard';
import { HaulOverviewCard } from './product-overviews/HaulOverviewCard';
import { PartsSourcingManager } from './parts-sourcing/PartsSourcingManager';
import { StationDatabaseView } from '../fuel/stations/StationDatabaseView';
import type { ResolutionQueueSubTab } from '../fuel/stations/ResolutionQueueTab';
import { GasStationAnalytics } from '../fuel/stations/GasStationAnalytics';
import { fuelService } from '../../services/fuelService';
import { FuelEntry } from '../../types/fuel';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { LEGACY_PAGE_REDIRECTS, settingsTabFromPageId } from './adminNavConfig';
import { MerchantVerificationManager } from './roam-dash/MerchantVerificationManager';
import { GlobalIdentitySearch } from './platform/GlobalIdentitySearch';
import { MatchingBrainPage } from './matching-brain/MatchingBrainPage';
import { FuelBrainPage } from './fuel-brain/FuelBrainPage';
import { TollBrainPage } from './toll-brain/TollBrainPage';
import { DriverUsersPage } from './product-users/DriverUsersPage';
import { DriverUserDetailPage } from './product-users/DriverUserDetailPage';
import { RiderUsersPage } from './product-users/RiderUsersPage';
import { RiderUserDetailPage } from './product-users/RiderUserDetailPage';
import { applyPortalTheme } from '../../hooks/usePortalTheme';
import { api } from '../../services/api';
import { UnifiedLedgerFeed } from './UnifiedLedgerFeed';

const TollLiveMonitorPage = lazy(() =>
  import('../../pages/TollLiveMonitorPage').then((m) => ({ default: m.TollLiveMonitorPage })),
);
const TollSettingsPage = lazy(() =>
  import('../../pages/TollSettingsPage').then((m) => ({ default: m.TollSettingsPage })),
);

function normalizePortalPage(page: string): string {
  return LEGACY_PAGE_REDIRECTS[page] ?? page;
}

type NavExtras = { userId?: string; customer?: unknown } | null;

/**
 * AdminPortal — Dominion platform shell that routes purely via internal page IDs.
 */
export function AdminPortal() {
  const { session, user } = useAuth();
  const queryClient = useQueryClient();
  const [currentPageRaw, setCurrentPageRaw] = useState(() => {
    if (typeof window !== 'undefined') {
      const page = new URLSearchParams(window.location.search).get('page');
      if (page) return normalizePortalPage(page);
    }
    return normalizePortalPage('dashboard');
  });
  const stationDbDefaultTab = useMemo(() => {
    if (typeof window === 'undefined') return 'spatial-audit';
    const tab = new URLSearchParams(window.location.search).get('tab');
    return tab === 'resolution-queue' ? 'resolution-queue' : 'spatial-audit';
  }, []);
  const resolutionSubTab = useMemo<ResolutionQueueSubTab>(() => {
    if (typeof window === 'undefined') return 'unresolved-stops';
    const sub = new URLSearchParams(window.location.search).get('sub');
    return sub === 'spatial-review' ? 'spatial-review' : 'unresolved-stops';
  }, []);
  const [fuelLogs, setFuelLogs] = useState<FuelEntry[]>([]);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [navData, setNavData] = useState<NavExtras>(null);
  const [navHistory, setNavHistory] = useState<string[]>([]);

  const setCurrentPage = useCallback((page: string) => {
    setNavData(null);
    setCurrentPageRaw(normalizePortalPage(page));
  }, []);

  const currentPage = currentPageRaw;

  const handleNavigate = (page: string, data?: unknown) => {
    setNavHistory((prev) => [...prev, currentPage]);
    if (data && typeof data === 'object') {
      const d = data as { userId?: string; customer?: unknown };
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
    setCurrentPageRaw(normalizePortalPage(page));
  };

  const handleBack = () => {
    const prev = navHistory[navHistory.length - 1];
    if (prev) {
      setNavHistory((h) => h.slice(0, -1));
      setCurrentPageRaw(normalizePortalPage(prev));
      setNavData(null);
    }
  };

  const accessToken = session?.access_token;

  useEffect(() => {
    if (!accessToken) return;
    (['enterprise', 'fleet'] as const).forEach((productLine) => {
      void queryClient.prefetchQuery({
        queryKey: ['adminCustomers', productLine],
        queryFn: async () => {
          const qs = new URLSearchParams({ productLine });
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/customers?${qs.toString()}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
          }
          const data = await res.json();
          return data.customers || [];
        },
        staleTime: 2 * 60 * 1000,
      });
    });
  }, [accessToken, queryClient]);

  const loadFuelLogs = useCallback(async () => {
    setFuelLoading(true);
    try {
      const entries = await fuelService.getFuelEntries();
      setFuelLogs(entries);
    } catch (e) {
      console.error('[AdminPortal] Failed to load fuel entries:', e);
    } finally {
      setFuelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentPage === 'fuel-analytics' || currentPage === 'fuel-stations') {
      loadFuelLogs();
    }
  }, [currentPage, loadFuelLogs]);

  useEffect(() => {
    api.getPreferences()
      .then((prefs) => {
        if (prefs?.darkMode !== undefined) {
          applyPortalTheme(prefs.darkMode);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <AdminLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'dashboard' && <AdminDashboard onNavigate={setCurrentPage} />}

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
        <DriverUsersPage onOpenUser={(id) => handleNavigate('driver-user-detail', { userId: id })} />
      )}
      {currentPage === 'driver-user-detail' && navData?.userId && (
        <DriverUserDetailPage userId={navData.userId} onBack={handleBack} />
      )}

      {currentPage === 'rides-users' && (
        <RiderUsersPage onOpenUser={(id) => handleNavigate('rider-user-detail', { userId: id })} />
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
      {currentPage === 'fuel-brain' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden min-h-[560px] p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <FuelBrainPage />
        </div>
      )}
      {currentPage === 'activity-log' && <ActivityLog />}
      {currentPage === 'fuel-stations' && (
        <div className="min-h-[600px] rounded-xl bg-white shadow-sm overflow-x-auto overflow-y-visible dark:bg-card dark:shadow-none dark:ring-1 dark:ring-border">
          <StationDatabaseView
            logs={fuelLogs}
            loading={fuelLoading}
            defaultTab={stationDbDefaultTab}
            defaultResolutionSubTab={resolutionSubTab}
          />
        </div>
      )}
      {currentPage === 'fuel-analytics' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <GasStationAnalytics logs={fuelLogs} loading={fuelLoading} onRequestRefresh={loadFuelLogs} />
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
            <TollSettingsPage />
          </Suspense>
        </div>
      )}
      {currentPage === 'toll-live-monitor' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card p-4">
          <Suspense fallback={<div className="p-8 text-slate-500">Loading toll monitor…</div>}>
            <TollLiveMonitorPage />
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
      {currentPage === 'parts-sourcing' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px] dark:bg-card">
          <PartsSourcingManager />
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
          userRole={(user?.user_metadata?.role as string | undefined) ?? 'superadmin'}
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
    </AdminLayout>
  );
}
