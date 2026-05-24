import React, { useState, useEffect, useCallback } from 'react';
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
import { PartsSourcingManager } from './parts-sourcing/PartsSourcingManager';
import { StationDatabaseView } from '../fuel/stations/StationDatabaseView';
import { GasStationAnalytics } from '../fuel/stations/GasStationAnalytics';
import { fuelService } from '../../services/fuelService';
import { FuelEntry } from '../../types/fuel';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { LEGACY_PAGE_REDIRECTS } from './adminNavConfig';
import { MerchantVerificationManager } from './roam-dash/MerchantVerificationManager';
import { GlobalIdentitySearch } from './platform/GlobalIdentitySearch';
import { DriverUsersPage } from './product-users/DriverUsersPage';
import { DriverUserDetailPage } from './product-users/DriverUserDetailPage';
import { RiderUsersPage } from './product-users/RiderUsersPage';
import { RiderUserDetailPage } from './product-users/RiderUserDetailPage';

function normalizePortalPage(page: string): string {
  return LEGACY_PAGE_REDIRECTS[page] ?? page;
}

type NavExtras = { userId?: string; customer?: unknown } | null;

/**
 * AdminPortal — Dominion platform shell that routes purely via internal page IDs.
 */
export function AdminPortal() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [currentPageRaw, setCurrentPageRaw] = useState(() => normalizePortalPage('dashboard'));
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

  return (
    <AdminLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'dashboard' && <AdminDashboard onNavigate={setCurrentPage} />}

      {currentPage === 'enterprise-overview' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden min-h-[560px]">
          <EnterpriseOverviewCard onNavigate={setCurrentPage} />
        </div>
      )}
      {currentPage === 'fleet-overview' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden min-h-[560px]">
          <FleetOverviewCard onNavigate={setCurrentPage} />
        </div>
      )}
      {currentPage === 'global-identity' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden min-h-[560px] p-2">
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
      {currentPage === 'activity-log' && <ActivityLog />}
      {currentPage === 'fuel-stations' && (
        <div className="min-h-[600px] rounded-xl bg-white shadow-sm overflow-x-auto overflow-y-visible dark:bg-card dark:shadow-none dark:ring-1 dark:ring-border">
          <StationDatabaseView logs={fuelLogs} loading={fuelLoading} />
        </div>
      )}
      {currentPage === 'fuel-analytics' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <GasStationAnalytics logs={fuelLogs} loading={fuelLoading} onRequestRefresh={loadFuelLogs} />
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
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden min-h-[600px]">
          <DashOverviewCard />
        </div>
      )}
      {currentPage === 'roam-rides-overview' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden min-h-[600px]">
          <RidesOverviewCard />
        </div>
      )}
      {currentPage === 'roam-driver-overview' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden min-h-[600px]">
          <DriverOverviewCard />
        </div>
      )}
      {currentPage === 'settings' && <PlatformSettings />}
      {currentPage.startsWith('settings-') && (
        <PlatformSettings activeTab={currentPage.replace('settings-', '')} />
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
