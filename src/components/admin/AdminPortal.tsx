import React, { useState, useEffect, useCallback } from 'react';
import { AdminLayout } from './AdminLayout';
import { AdminDashboard } from './AdminDashboard';
import { CustomerAccounts } from './CustomerAccounts';
import { TollDatabaseView } from '../toll/TollDatabaseView';
import { TollInfoPage } from '../toll/TollInfoPage';
import { PlatformSettings } from './PlatformSettings';
import { StationDatabaseView } from '../fuel/stations/StationDatabaseView';
import { GasStationAnalytics } from '../fuel/stations/GasStationAnalytics';
import { fuelService } from '../../services/fuelService';
import { FuelEntry } from '../../types/fuel';

/**
 * AdminPortal — the top-level wrapper for the Super Admin experience.
 * Routes between admin sections via local state (no React Router needed).
 */
export function AdminPortal() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [fuelLogs, setFuelLogs] = useState<FuelEntry[]>([]);
  const [fuelLoading, setFuelLoading] = useState(false);

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
    </AdminLayout>
  );
}