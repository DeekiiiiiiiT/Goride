import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from './AdminLayout';
import { AdminDashboard } from './AdminDashboard';
import { CustomerAccounts } from './CustomerAccounts';
import { PlatformTeam } from './PlatformTeam';
import { DriverAccounts } from './DriverAccounts';
import { TeamMembers } from './TeamMembers';
import { ActivityLog } from './ActivityLog';
import { TollDatabaseView } from '../toll/TollDatabaseView';
import { TollInfoPage } from '../toll/TollInfoPage';
import { PlatformSettings } from './PlatformSettings';
import { DatabaseManagement } from '../database/DatabaseManagement';
import { BusinessTypeCustomers } from '../database/BusinessTypeCustomers';
import { CustomerLedgerView } from '../database/CustomerLedgerView';
import { LedgerColumnSettings } from '../database/LedgerColumnSettings';
import { BusinessType } from '../../types/data';
import { VehicleCatalogManager } from './vehicle-catalog/VehicleCatalogManager';
import { MaintenanceTemplatesManager } from './maintenance-templates/MaintenanceTemplatesManager';
import { StationDatabaseView } from '../fuel/stations/StationDatabaseView';
import { GasStationAnalytics } from '../fuel/stations/GasStationAnalytics';
import { fuelService } from '../../services/fuelService';
import { FuelEntry } from '../../types/fuel';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';

/**
 * AdminPortal — the top-level wrapper for the Super Admin experience.
 * Routes between admin sections via local state (no React Router needed).
 */
export function AdminPortal() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [fuelLogs, setFuelLogs] = useState<FuelEntry[]>([]);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [navData, setNavData] = useState<any>(null);
  const [navHistory, setNavHistory] = useState<string[]>([]);

  const handleNavigate = (page: string, data?: any) => {
    setNavHistory(prev => [...prev, currentPage]);
    setNavData(data || null);
    setCurrentPage(page);
  };

  const handleBack = () => {
    const prev = navHistory[navHistory.length - 1];
    if (prev) {
      setNavHistory(h => h.slice(0, -1));
      setCurrentPage(prev);
      setNavData(null);
    }
  };

  const accessToken = session?.access_token;

  // Phase 6.3: Prefetch admin customers on portal load for instant navigation
  useEffect(() => {
    if (accessToken) {
      queryClient.prefetchQuery({
        queryKey: ['adminCustomers'],
        queryFn: async () => {
          const res = await fetch(`${API_ENDPOINTS.admin}/admin/customers`, {
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
    }
  }, [accessToken, queryClient]);

  // Fetch fuel entries when navigating to fuel-related pages
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
      {currentPage === 'dashboard' && (
        <AdminDashboard onNavigate={setCurrentPage} />
      )}
      {currentPage === 'customers' && (
        <CustomerAccounts />
      )}
      {currentPage === 'platform-team' && (
        <PlatformTeam />
      )}
      {currentPage === 'drivers' && (
        <DriverAccounts />
      )}
      {currentPage === 'team-members' && (
        <TeamMembers />
      )}
      {currentPage === 'activity-log' && (
        <ActivityLog />
      )}
      {currentPage === 'fuel-stations' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <StationDatabaseView logs={fuelLogs} loading={fuelLoading} />
        </div>
      )}
      {currentPage === 'fuel-analytics' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <GasStationAnalytics logs={fuelLogs} loading={fuelLoading} onRequestRefresh={loadFuelLogs} />
        </div>
      )}
      {currentPage === 'toll-stations' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <TollDatabaseView />
        </div>
      )}
      {currentPage === 'toll-info' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <TollInfoPage />
        </div>
      )}
      {currentPage === 'motor-vehicles' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <VehicleCatalogManager />
        </div>
      )}
      {currentPage === 'maintenance-templates' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <MaintenanceTemplatesManager />
        </div>
      )}
      {currentPage === 'settings' && (
        <PlatformSettings />
      )}
      {currentPage.startsWith('settings-') && (
        <PlatformSettings activeTab={currentPage.replace('settings-', '')} />
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