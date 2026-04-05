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
import { DatabaseLedgerPage } from '../database/DatabaseLedgerPage';
import { TripLedgerPage } from '../database/TripLedgerPage';
import { FuelLedgerPage } from '../database/FuelLedgerPage';
import { TollLedgerPage } from '../database/TollLedgerPage';
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
      {currentPage === 'settings' && (
        <PlatformSettings />
      )}
      {currentPage.startsWith('settings-') && (
        <PlatformSettings activeTab={currentPage.replace('settings-', '')} />
      )}
      {currentPage === 'db-main-ledger' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <DatabaseLedgerPage ledger="main" />
        </div>
      )}
      {currentPage === 'db-trip-ledger' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <TripLedgerPage />
        </div>
      )}
      {currentPage === 'db-fuel-ledger' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <FuelLedgerPage />
        </div>
      )}
      {currentPage === 'db-toll-ledger' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden min-h-[600px]">
          <TollLedgerPage />
        </div>
      )}
    </AdminLayout>
  );
}