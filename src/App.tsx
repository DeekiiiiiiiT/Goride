import React, { useState, useEffect } from 'react';
// Build stability ping: 2026-03-11 sidebar-fix
import { AuthProvider, useAuth } from './components/auth/AuthContext';
import { BusinessConfigProvider } from './components/auth/BusinessConfigContext';
import { LoginPage } from './components/auth/LoginPage';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './components/dashboard/Dashboard';
import { ImportsPage } from './components/imports/ImportsPage';
import { TripLogsPage } from './components/trips/TripLogsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { DriversPage } from './components/drivers/DriversPage';
import { VehiclesPage } from './components/vehicles/VehiclesPage';
import { FleetPage } from './components/fleet/FleetPage';
import { ReportsPage } from './components/reports/ReportsPage';
import { TransactionsPage } from './components/transactions/TransactionsPage';
import { TollReconciliation } from './pages/TollReconciliation';
import { TagInventory } from './pages/TagInventory';
import { ClaimableLoss } from './pages/ClaimableLoss';
import { UserManagementPage } from './components/users/UserManagementPage';
import { TierConfigPage } from './components/tiers/TierConfigPage';
import { PerformanceDashboard } from './components/performance/PerformanceDashboard';
import { FuelManagement } from './pages/FuelManagement';
import { TollLogsPage } from './pages/TollLogs';
import { TollAnalytics } from './components/toll/TollAnalytics';
import { LedgerBackfillPanel } from './components/admin/LedgerBackfillPanel';

// Driver Portal Components
import { DriverLayout } from './components/driver-portal/DriverLayout';
import { DriverDashboard } from './components/driver-portal/DriverDashboard';
import { DriverEarnings } from './components/driver-portal/DriverEarnings';
import { DriverTrips } from './components/driver-portal/DriverTrips';
import { DriverProfile } from './components/driver-portal/DriverProfile';
import { DriverClaims } from './components/driver-portal/DriverClaims';
import { DriverExpenses } from './components/driver-portal/DriverExpenses';
import { DriverEquipment } from './components/driver-portal/DriverEquipment';

import { useAlertPusher } from './hooks/useAlertPusher';
import { OfflineProvider } from './components/providers/OfflineProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { API_ENDPOINTS } from './services/apiConfig';
import { publicAnonKey } from './utils/supabase/info';

// Super Admin Portal Components
import { AdminLoginPage } from './components/admin/AdminLoginPage';
import { AdminUnauthorized } from './components/admin/AdminUnauthorized';
import { AdminPortal } from './components/admin/AdminPortal';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const { user, role, loading, signOut } = useAuth();
  // useAlertPusher(); // DISABLED: Was causing infinite loop feedback with Dashboard alert sync
  
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [driverPage, setDriverPage] = useState('dashboard');
  const [isDriverMenuOpen, setDriverMenuOpen] = useState(false);
  const [driverIdForDetail, setDriverIdForDetail] = useState<string | null>(null);

  // ── Fix 4: Keep-alive ping ────────────────────────────────────────────
  // Sends a lightweight /health request every 45 seconds to keep at least
  // one warm edge-function instance alive, preventing cold-start stampedes.
  useEffect(() => {
    const PING_INTERVAL_MS = 45_000;
    const healthUrl = `${API_ENDPOINTS.fleet}/health`;
    const headers = { Authorization: `Bearer ${publicAnonKey}` };

    // Fire one immediately on mount so the instance warms up right away
    fetch(healthUrl, { headers }).catch(() => {});

    const id = setInterval(() => {
      fetch(healthUrl, { headers }).catch(() => {});
    }, PING_INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  // OAuth Callback Handler
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    // Check if we are in a popup
    if (code && window.opener) {
        // Send code to main window
        window.opener.postMessage({ type: 'uber-auth-code', code }, '*');
        window.close();
        return; 
    }
  }, []);

  // Show a blank loading screen if we are authenticating in a popup
  const params = new URLSearchParams(window.location.search);
  const authCode = params.get('code');
  const authError = params.get('error');

  if (window.opener && (authCode || authError)) {
      if (authError) {
          return (
              <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-slate-900 p-8 text-center">
                  <div className="bg-red-100 text-red-600 p-4 rounded-full mb-4">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                  </div>
                  <h2 className="text-xl font-bold mb-2">Connection Failed</h2>
                  <p className="text-slate-600 mb-6 max-w-sm mx-auto">
                      Uber returned an error: <br/>
                      <code className="bg-slate-200 px-2 py-1 rounded text-sm mt-2 inline-block">{authError}</code>
                  </p>
                  <button 
                      onClick={() => window.close()}
                      className="bg-slate-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-slate-800 transition-colors"
                  >
                      Close Window
                  </button>
              </div>
          );
      }
      return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500">Authenticating with Uber...</div>;
  }

  if (loading) {
      return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500">Loading application...</div>;
  }

  // ---------------------------------------------------------------------------
  // Super Admin Portal — /admin path detection
  // Completely separate rendering branch. The regular fleet app at "/" is untouched.
  // ---------------------------------------------------------------------------
  const isAdminPath = window.location.pathname.startsWith('/admin');
  if (isAdminPath) {
    if (!user) return <AdminLoginPage />;
    if (role !== 'superadmin') return <AdminUnauthorized />;
    return <AdminPortal />;
  }

  if (!user) {
    return <LoginPage />;
  }

  // Handle logout
  const handleLogout = async () => {
    await signOut();
  };

  if (role === 'driver') {
    return (
      <ErrorBoundary name="DriverPortal" userId={user?.id}>
        <DriverLayout 
          currentPage={driverPage} 
          onNavigate={setDriverPage} 
          onLogout={handleLogout}
          isMenuOpen={isDriverMenuOpen}
          onMenuOpenChange={setDriverMenuOpen}
        >
          {driverPage === 'dashboard' && <DriverDashboard />}
          {driverPage === 'earnings' && <DriverEarnings />}
          {driverPage === 'expenses' && <DriverExpenses defaultOpen={true} onBack={() => { setDriverPage('dashboard'); setDriverMenuOpen(true); }} />}
          {driverPage === 'trips' && <DriverTrips />}
          {driverPage === 'claims' && <DriverClaims />}
          {driverPage === 'equipment' && <DriverEquipment onBack={() => setDriverPage('profile')} />}
          {driverPage === 'profile' && <DriverProfile onLogout={handleLogout} onNavigate={setDriverPage} />}
        </DriverLayout>
      </ErrorBoundary>
    );
  }

  // Admin View (Default)
  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage} onLogout={handleLogout}>
      <ErrorBoundary name={`MainContent:${currentPage}`} userId={user?.id}>
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'imports' && <ImportsPage />}
        {currentPage === 'drivers' && <DriversPage initialDriverId={driverIdForDetail} />}
        {currentPage === 'vehicles' && <VehiclesPage />}
        {currentPage === 'fleet' && <FleetPage />}
        {currentPage === 'trips' && <TripLogsPage />}
        {currentPage === 'reports' && <ReportsPage />}
        {currentPage === 'transactions' && <TransactionsPage mode="analytics" />}
        {currentPage === 'transaction-list' && <TransactionsPage mode="list" />}
        {currentPage === 'toll-tags' && <TollReconciliation />}
        {currentPage === 'tag-inventory' && <TagInventory />}
        {currentPage === 'claimable-loss' && <ClaimableLoss />}
        {currentPage === 'toll-logs' && <TollLogsPage />}
        {currentPage === 'toll-analytics' && <TollAnalytics />}
        {currentPage === 'performance' && <PerformanceDashboard />}
        {currentPage === 'tier-config' && <TierConfigPage />}
        
        {['fuel-management', 'fuel-overview', 'fuel-reconciliation', 'fuel-cards', 'fuel-logs', 'fuel-reports', 'fuel-configuration', 'fuel-reimbursements', 'fuel-audit', 'fuel-integrity-gap'].includes(currentPage) && (
          <FuelManagement 
              defaultTab={
                  currentPage === 'fuel-reconciliation' ? 'reconciliation' :
                  currentPage === 'fuel-reimbursements' ? 'reimbursements' :
                  currentPage === 'fuel-audit' ? 'audit' :
                  currentPage === 'fuel-integrity-gap' ? 'integrity-gap' :
                  currentPage === 'fuel-cards' ? 'cards' :
                  currentPage === 'fuel-logs' ? 'logs' :
                  currentPage === 'fuel-reports' ? 'reports' :
                  currentPage === 'fuel-configuration' ? 'configuration' :
                  'dashboard'
              }
              onTabChange={(t) => {
                  setCurrentPage(t === 'dashboard' ? 'fuel-overview' : `fuel-${t}`);
                  setDriverIdForDetail(null);
              }}
              onViewDriverLedger={(driverId) => {
                  setDriverIdForDetail(driverId);
                  setCurrentPage('drivers');
              }}
          />
        )}

        {currentPage === 'user-management' && <UserManagementPage />}
        {currentPage === 'settings' && <SettingsPage />}
        {currentPage === 'ledger-backfill' && <LedgerBackfillPanel />}
      </ErrorBoundary>
    </AppLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineProvider>
          <BusinessConfigProvider>
            <AppContent />
          </BusinessConfigProvider>
        </OfflineProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}