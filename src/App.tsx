import React, { useState, useEffect } from 'react';
// Build stability ping: 2026-03-17 transaction-review-wizard
import { AuthProvider, useAuth } from './components/auth/AuthContext';
import { BusinessConfigProvider } from './components/auth/BusinessConfigContext';
import { PlatformConfigProvider } from './components/auth/PlatformConfigContext';
import { LoginPage } from './components/auth/LoginPage';
import { DriverLoginPage } from './components/auth/DriverLoginPage';
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
import { DatabaseLedgerPage } from './components/database/DatabaseLedgerPage';
import { TripLedgerPage } from './components/database/TripLedgerPage';
import { FuelLedgerPage } from './components/database/FuelLedgerPage';
import { TollLedgerPage } from './components/database/TollLedgerPage';

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
import { fuelService } from './services/fuelService';
import { PermissionGate } from './components/auth/PermissionGate';
import { PAGE_PERMISSION_MAP } from './utils/permissions';

import { MaintenancePage } from './components/MaintenancePage';
import { FeatureFlagProvider } from './components/auth/FeatureFlagContext';

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
  const { user, role, resolvedRole, loading, signOut } = useAuth();
  // useAlertPusher(); // DISABLED: Was causing infinite loop feedback with Dashboard alert sync
  
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [driverPage, setDriverPage] = useState('dashboard');
  const [isDriverMenuOpen, setDriverMenuOpen] = useState(false);
  const [driverIdForDetail, setDriverIdForDetail] = useState<string | null>(null);

  // ── Maintenance Mode Check ────────────────────────────────────────────
  // For non-admin paths, check if the platform is in maintenance mode.
  // Platform-tier users see a warning banner; everyone else sees MaintenancePage.
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    active: boolean;
    message: string;
    platformName: string;
    checked: boolean;
  }>({ active: false, message: '', platformName: 'Roam Fleet', checked: false });

  useEffect(() => {
    const isAdminPath = window.location.pathname.startsWith('/admin');
    if (isAdminPath) {
      setMaintenanceStatus(prev => ({ ...prev, checked: true }));
      return;
    }
    fetch(`${API_ENDPOINTS.fleet}/platform-status`)
      .then(res => res.json())
      .then(data => {
        setMaintenanceStatus({
          active: data.maintenanceMode || false,
          message: data.maintenanceMessage || '',
          platformName: data.platformName || 'Roam Fleet',
          checked: true,
        });
      })
      .catch(() => {
        // Fail-open: if we can't reach the status endpoint, allow access
        setMaintenanceStatus(prev => ({ ...prev, checked: true }));
      });
  }, []);

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

  // Phase 5: Prefetch parent companies on app load for instant dropdown population
  useEffect(() => {
    if (user && role === 'admin') {
      queryClient.prefetchQuery({
        queryKey: ['parentCompanies'],
        queryFn: () => fuelService.getParentCompanies(),
        staleTime: 5 * 60 * 1000, // 5 minutes
      }).catch(err => {
        console.log('[Prefetch] Parent companies prefetch failed (non-critical):', err);
      });
    }
  }, [user, role]);

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

  // Handle logout (declared early so all branches can use it)
  const handleLogout = async () => {
    await signOut();
  };

  // ---------------------------------------------------------------------------
  // Super Admin Portal — /admin path detection
  // Completely separate rendering branch. The regular fleet app at "/" is untouched.
  // SESSION ISOLATION: Supabase stores one session in localStorage shared across
  // all paths. If a non-platform user navigates here, we sign them out globally.
  // This is intentional — true per-portal session isolation would require separate
  // Supabase client instances with distinct storage keys (future enhancement).
  // ---------------------------------------------------------------------------
  const isAdminPath = window.location.pathname.startsWith('/admin');
  if (isAdminPath) {
    if (!user) return <AdminLoginPage />;
    // Phase 11: Allow platform_owner, platform_support, platform_analyst
    const platformRoles = ['platform_owner', 'platform_support', 'platform_analyst'];
    if (role !== 'superadmin' && !platformRoles.includes(resolvedRole || '')) {
      signOut();
      return <AdminLoginPage />;
    }
    return <AdminPortal />;
  }

  // ---------------------------------------------------------------------------
  // Driver Portal — /driver path detection
  // Completely separate rendering branch with its own login page.
  // SESSION ISOLATION: Same global sign-out strategy as /admin (see comment above).
  // ---------------------------------------------------------------------------
  const isDriverPath = window.location.pathname.startsWith('/driver');
  if (isDriverPath) {
    if (!user) return <DriverLoginPage />;
    if (role !== 'driver') {
      // Non-driver logged in at /driver — sign them out silently and show login with generic error
      signOut();
      return <DriverLoginPage />;
    }
    // Driver user on /driver path — render driver portal
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

  if (!user) {
    return <LoginPage />;
  }

  // ---------------------------------------------------------------------------
  // Maintenance Mode Gate — block non-platform users when maintenance is active
  // ---------------------------------------------------------------------------
  const isPlatformUser = role === 'superadmin' || ['platform_owner', 'platform_support', 'platform_analyst'].includes(resolvedRole || '');
  if (maintenanceStatus.checked && maintenanceStatus.active && !isPlatformUser) {
    return (
      <MaintenancePage
        message={maintenanceStatus.message}
        platformName={maintenanceStatus.platformName}
      />
    );
  }

  // Phase 4: Pending approval gate — block fleet managers with pending_approval status
  const accountStatus = (user as any)?.user_metadata?.accountStatus;
  if (role === 'admin' && accountStatus === 'pending_approval') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center px-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Account Pending Approval</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Your account has been created but is awaiting approval from a platform administrator. You'll be able to access your fleet dashboard once approved.
          </p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Enterprise gate: WHITELIST — only 'admin' (fleet manager) role allowed on fleet portal.
  // All other roles (driver, superadmin, platform_owner, platform_support, platform_analyst)
  // are silently signed out. Global sign-out is intentional — Supabase shares one session
  // across all paths, so clearing it here means the user must re-login at their correct portal.
  if (role !== 'admin') {
    signOut();
    return <LoginPage />;
  }

  // Fleet Manager View (Default)
  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage} onLogout={handleLogout}>
      <ErrorBoundary name={`MainContent:${currentPage}`} userId={user?.id}>
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'imports' && (
          <PermissionGate permission="nav.imports" onNavigate={setCurrentPage}>
            <ImportsPage />
          </PermissionGate>
        )}
        {currentPage === 'drivers' && (
          <PermissionGate permission="nav.drivers" onNavigate={setCurrentPage}>
            <DriversPage initialDriverId={driverIdForDetail} />
          </PermissionGate>
        )}
        {currentPage === 'vehicles' && (
          <PermissionGate permission="nav.vehicles" onNavigate={setCurrentPage}>
            <VehiclesPage />
          </PermissionGate>
        )}
        {currentPage === 'fleet' && (
          <PermissionGate permission="nav.fleet" onNavigate={setCurrentPage}>
            <FleetPage />
          </PermissionGate>
        )}
        {currentPage === 'trips' && (
          <PermissionGate permission="nav.trips" onNavigate={setCurrentPage}>
            <TripLogsPage />
          </PermissionGate>
        )}
        {currentPage === 'reports' && (
          <PermissionGate permission="nav.reports" onNavigate={setCurrentPage}>
            <ReportsPage />
          </PermissionGate>
        )}
        {currentPage === 'transactions' && (
          <PermissionGate permission="nav.financial_analytics" onNavigate={setCurrentPage}>
            <TransactionsPage mode="analytics" />
          </PermissionGate>
        )}
        {currentPage === 'transaction-list' && (
          <PermissionGate permission="nav.transaction_list" onNavigate={setCurrentPage}>
            <TransactionsPage mode="list" />
          </PermissionGate>
        )}
        {currentPage === 'toll-tags' && (
          <PermissionGate permission="nav.toll_reconciliation" onNavigate={setCurrentPage}>
            <TollReconciliation />
          </PermissionGate>
        )}
        {currentPage === 'tag-inventory' && (
          <PermissionGate permission="nav.toll_tag_inventory" onNavigate={setCurrentPage}>
            <TagInventory onNavigate={setCurrentPage} />
          </PermissionGate>
        )}
        {currentPage === 'claimable-loss' && (
          <PermissionGate permission="nav.toll_claimable_loss" onNavigate={setCurrentPage}>
            <ClaimableLoss />
          </PermissionGate>
        )}
        {currentPage === 'toll-logs' && (
          <PermissionGate permission="nav.toll_logs" onNavigate={setCurrentPage}>
            <TollLogsPage />
          </PermissionGate>
        )}
        {currentPage === 'toll-analytics' && (
          <PermissionGate permission="nav.toll_analytics" onNavigate={setCurrentPage}>
            <TollAnalytics />
          </PermissionGate>
        )}
        {currentPage === 'performance' && (
          <PermissionGate permission="nav.performance" onNavigate={setCurrentPage}>
            <PerformanceDashboard />
          </PermissionGate>
        )}
        {currentPage === 'tier-config' && (
          <PermissionGate permission="nav.tier_config" onNavigate={setCurrentPage}>
            <TierConfigPage />
          </PermissionGate>
        )}
        
        {['fuel-management', 'fuel-overview', 'fuel-reconciliation', 'fuel-cards', 'fuel-logs', 'fuel-reports', 'fuel-configuration', 'fuel-reimbursements', 'fuel-audit', 'fuel-integrity-gap'].includes(currentPage) && (
          <PermissionGate permission={PAGE_PERMISSION_MAP[currentPage] || 'nav.fuel_overview'} onNavigate={setCurrentPage}>
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
          </PermissionGate>
        )}

        {currentPage === 'user-management' && (
          <PermissionGate permission="nav.user_management" onNavigate={setCurrentPage}>
            <UserManagementPage />
          </PermissionGate>
        )}
        {currentPage === 'settings' && (
          <PermissionGate permission="nav.settings" onNavigate={setCurrentPage}>
            <SettingsPage />
          </PermissionGate>
        )}
        {currentPage === 'ledger-backfill' && (
          <PermissionGate permission="nav.ledger_backfill" onNavigate={setCurrentPage}>
            <LedgerBackfillPanel />
          </PermissionGate>
        )}
        {currentPage === 'db-main-ledger' && (
          <PermissionGate permission="nav.database_management" onNavigate={setCurrentPage}>
            <DatabaseLedgerPage ledger="main" />
          </PermissionGate>
        )}
        {currentPage === 'db-trip-ledger' && (
          <PermissionGate permission="nav.database_management" onNavigate={setCurrentPage}>
            <TripLedgerPage />
          </PermissionGate>
        )}
        {currentPage === 'db-fuel-ledger' && (
          <PermissionGate permission="nav.database_management" onNavigate={setCurrentPage}>
            <FuelLedgerPage />
          </PermissionGate>
        )}
        {currentPage === 'db-toll-ledger' && (
          <PermissionGate permission="nav.database_management" onNavigate={setCurrentPage}>
            <TollLedgerPage />
          </PermissionGate>
        )}
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
            <PlatformConfigProvider>
              <FeatureFlagProvider>
                <AppContent />
              </FeatureFlagProvider>
            </PlatformConfigProvider>
          </BusinessConfigProvider>
        </OfflineProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}