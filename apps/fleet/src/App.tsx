import React, { useState, useEffect } from 'react';
// Build stability ping: 2026-03-17 transaction-review-wizard
import { AuthProvider, useAuth } from './components/auth/AuthContext';
import { BusinessConfigProvider } from './components/auth/BusinessConfigContext';
import { PlatformConfigProvider } from './components/auth/PlatformConfigContext';
import { LoginPage } from './components/auth/LoginPage';
import { FleetOwnerSignupPage } from './components/auth/signup/FleetOwnerSignupPage';
import { FleetOwnerSignupComplete } from './components/auth/signup/FleetOwnerSignupComplete';
import { isFleetPortalUser } from './utils/fleetOwnerUser';
import { PassengerFleetSurfaceGate } from './components/auth/PassengerFleetSurfaceGate';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './components/dashboard/Dashboard';
import { ImportsPage } from './components/imports/ImportsPage';
import { TripLogsPage } from './components/trips/TripLogsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { DriversPage } from './components/drivers/DriversPage';
import { VehiclesPage } from './components/vehicles/VehiclesPage';
import { FleetMaintenanceHub } from './components/vehicles/FleetMaintenanceHub';
import { FleetPage } from './components/fleet/FleetPage';
import { ReportsPage } from './components/reports/ReportsPage';
import { TransactionsPage } from './components/transactions/TransactionsPage';
import { TollReconciliation } from './pages/TollReconciliation';
import { TagInventory } from './pages/TagInventory';
import { UserManagementPage } from './components/users/UserManagementPage';
import { EarningsPolicyConfiguration } from './components/earnings-policy';
import { FuelManagement } from './pages/FuelManagement';
import { FuelAnalytics } from './components/fuel/analytics/FuelAnalytics';
import { TollLogsPage } from './pages/TollLogs';
import { TollAnalytics } from './components/toll/TollAnalytics';
import { TollRateDriftPage } from './pages/TollRateDriftPage';
import { TollLowBalancePage } from './pages/TollLowBalancePage';
import { VehicleAnalytics } from './components/vehicles/VehicleAnalytics';
import { DriverAnalytics } from './components/drivers/analytics/DriverAnalytics';
import { FleetFinancialsPage } from './components/fleet-financials/FleetFinancialsPage';
import { DriverSettlementsPage } from './components/fleet-financials/DriverSettlementsPage';
import { IndriveWalletCenterPage } from './components/fleet-financials/IndriveWalletCenterPage';
import { BusinessFinancePage } from './components/business-finance/BusinessFinancePage';
import { ExpenseHubPage } from './components/business-finance/expense-hub/ExpenseHubPage';
import type { ExpenseHubSubview } from './components/business-finance/expense-hub/ExpenseHubShell';

import { OfflineProvider } from './components/providers/OfflineProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { API_ENDPOINTS } from './services/apiConfig';
import { withProductLineHeaders } from './config/productLine';

import { fuelService } from './services/fuelService';
import { PermissionGate } from './components/auth/PermissionGate';
import { PAGE_PERMISSION_MAP } from './utils/permissions';

import { isPassengerOnlyMetadataRole } from '@roam/auth-client';
import { PlatformMaintenanceSplash } from './components/PlatformMaintenanceSplash';
import { FeatureFlagProvider } from './components/auth/FeatureFlagContext';
import { WrongProductLineGate } from './components/auth/WrongProductLineGate';
import { FleetProductAdminPortal } from './admin/FleetProductAdminPortal';
import { AdminConfirmProvider } from './admin/contexts/AdminConfirmContext';
import { PRODUCT_LINE, IS_ENTERPRISE_PRODUCT } from './config/productLine';
import { AuthRecoveryGate } from '@roam/auth-client';
// Soft path rules shared with apps/fleet/middleware.js (Vercel Edge cookie gate).
import { requiresSessionGate } from './middleware/sessionGate';
import { PwaProvider } from './components/pwa/PwaProvider';
import { ServiceLineScopeProvider } from './contexts/ServiceLineScopeContext';
import { pathForPageId, resolvePageFromPathname } from './navigation/pageRegistry';
import { CouriersPage } from './components/couriers/CouriersPage';
import { CourierAnalyticsPage } from './components/couriers/CourierAnalyticsPage';
import { CourierSettlementsPage } from './components/couriers/CourierSettlementsPage';
import { SupplyHealthPage } from './components/couriers/SupplyHealthPage';
import { DeliveriesPage } from './components/deliveries/DeliveriesPage';
import { DeliveryAnalyticsPage } from './components/deliveries/DeliveryAnalyticsPage';

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

function inferClientProductLine(meta: Record<string, unknown> | undefined): 'fleet' | 'enterprise' {
  const pl = meta?.productLine;
  if (pl === 'fleet' || pl === 'enterprise') return pl;
  if (meta?.businessType === 'rideshare' || meta?.businessType === 'delivery') return 'fleet';
  if (Array.isArray(meta?.serviceLines) && meta.serviceLines.length > 0) return 'fleet';
  return 'enterprise';
}

function AppContent() {
  const { user, role, resolvedRole, loading, needsProvision, signOut } = useAuth();
  
  const [currentPage, setCurrentPage] = useState(() =>
    typeof window !== 'undefined' ? resolvePageFromPathname(window.location.pathname) : 'dashboard',
  );
  const [driverIdForDetail, setDriverIdForDetail] = useState<string | null>(null);
  const [businessFinanceTab, setBusinessFinanceTab] = useState<'overview' | 'workbench' | 'expenses'>('overview');
  /** Period handoff when leaving BF hub for Bank / Wallet */
  const [financePeriodHint, setFinancePeriodHint] = useState<{ startYmd: string; endYmd: string } | null>(
    null,
  );
  /** Vehicle deep link into Expense Hub (register or recurring) */
  const [expenseHubVehicleId, setExpenseHubVehicleId] = useState<string | null>(null);
  const [expenseHubSubview, setExpenseHubSubview] = useState<ExpenseHubSubview | null>(null);
  /** Deep link from Tag Inventory → Toll Reconciliation */
  const [tollReconFocus, setTollReconFocus] = useState<{
    vehicleId?: string;
    driverId?: string;
    vehicleLabel?: string;
  } | null>(null);

  type NavigateOpts =
    | { startYmd: string; endYmd: string }
    | { vehicleId?: string; driverId?: string; vehicleLabel?: string };

  const handleNavigate = (page: string, opts?: NavigateOpts) => {
    const periodHint =
      opts && 'startYmd' in opts && typeof opts.startYmd === 'string'
        ? { startYmd: opts.startYmd, endYmd: opts.endYmd }
        : undefined;
    const tollFocus =
      opts && ('vehicleId' in opts || 'driverId' in opts || 'vehicleLabel' in opts) && !('startYmd' in opts)
        ? {
            vehicleId: opts.vehicleId,
            driverId: opts.driverId,
            vehicleLabel: opts.vehicleLabel,
          }
        : undefined;

    if (periodHint) {
      setFinancePeriodHint(periodHint);
    } else if (page === 'business-finance') {
      setFinancePeriodHint(null);
    }

    if (page === 'toll-tags') {
      setTollReconFocus(tollFocus || null);
    } else {
      setTollReconFocus(null);
    }
    if (page === 'transactions') {
      // Legacy Financial Analytics → Workbench (one set of books)
      setBusinessFinanceTab('workbench');
      setCurrentPage('business-finance');
      return;
    }
    if (page === 'business-finance') {
      setBusinessFinanceTab('overview');
      setExpenseHubVehicleId(null);
      setExpenseHubSubview(null);
    }
    if (page === 'expense-hub') {
      setExpenseHubVehicleId(null);
      setExpenseHubSubview(null);
      setFinancePeriodHint(null);
    }
    // Legacy Accounting nav → Expense Hub Recurring expenses tab
    if (page === 'expense-accounting') {
      setExpenseHubVehicleId(null);
      setExpenseHubSubview('recurring');
      setFinancePeriodHint(null);
      setCurrentPage('expense-hub');
      return;
    }
    // Legacy Fuel Overview / Fuel Management hub → Fuel Analytics
    if (page === 'fuel-overview' || page === 'fuel-management') {
      setCurrentPage('fuel-analytics');
      return;
    }
    // Station catalogue is Roam platform reference data (Dominion Super Admin only).
    // Fleet apps consume stations; they must not own or edit the shared DB.
    if (page === 'fuel-stations') {
      setCurrentPage('fuel-analytics');
      return;
    }
    setCurrentPage(page);
    if (typeof window !== 'undefined') {
      const nextPath = pathForPageId(page);
      if (window.location.pathname !== nextPath) {
        window.history.pushState({ page }, '', nextPath);
      }
    }
  };

  /** Vehicle page → Expense Hub Recurring expenses for hub-managed vehicles */
  const openExpenseHubForVehicle = (vehicleId: string) => {
    setExpenseHubVehicleId(vehicleId);
    setExpenseHubSubview('recurring');
    setFinancePeriodHint(null);
    setCurrentPage('expense-hub');
  };

  // Sync browser back/forward with in-app page state
  useEffect(() => {
    const onPopState = () => {
      setCurrentPage(resolvePageFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Old Tier Config / legacy bookmarks → Earnings Policy Configuration
  useEffect(() => {
    if (currentPage === 'tier-config' || currentPage === 'tier-config-legacy') {
      setCurrentPage('earnings-policy');
    }
  }, [currentPage]);

  // Retired Fuel Overview → Fuel Analytics
  useEffect(() => {
    if (currentPage === 'fuel-overview' || currentPage === 'fuel-management') {
      setCurrentPage('fuel-analytics');
    }
  }, [currentPage]);

  // Station catalogue stays Dominion-only — block stale fleet bookmarks / deep links
  useEffect(() => {
    if (currentPage === 'fuel-stations') {
      setCurrentPage('fuel-analytics');
    }
  }, [currentPage]);

  // Legacy page id if somehow set without handleNavigate
  useEffect(() => {
    if (currentPage === 'transactions') {
      setBusinessFinanceTab('workbench');
      setCurrentPage('business-finance');
    }
  }, [currentPage]);

  // Legacy Accounting bookmark → Expense Hub Recurring expenses
  useEffect(() => {
    if (currentPage === 'expense-accounting') {
      setExpenseHubSubview('recurring');
      setCurrentPage('expense-hub');
    }
  }, [currentPage]);

  // ── Maintenance Mode Check ────────────────────────────────────────────
  // Check if the platform is in maintenance mode.
  // Platform-tier users see a warning banner; everyone else sees MaintenancePage.
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    active: boolean;
    message: string;
    platformName: string;
    checked: boolean;
  }>({ active: false, message: '', platformName: 'Roam Fleet', checked: false });

  useEffect(() => {
    fetch(`${API_ENDPOINTS.fleet}/platform-status`, { headers: withProductLineHeaders() })
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

  // ---------------------------------------------------------------------------
  // Rendering Branches
  // ---------------------------------------------------------------------------

  if (loading) {
      return <div className="flex items-center justify-center h-screen bg-slate-50 text-slate-500">Loading application...</div>;
  }

  if (user && isPassengerOnlyMetadataRole(user.user_metadata?.role as string | undefined)) {
    return <PassengerFleetSurfaceGate user={user} onSignOut={signOut} />;
  }

  const signupPath =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/signup' || window.location.pathname.startsWith('/signup/'));
  const fromRoamdriver =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('from') === 'roamdriver';
  const signupLineParam =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('line')
      : null;
  const initialSignupLine =
    signupLineParam === 'rush_delivery' || signupLineParam === 'rideshare'
      ? signupLineParam
      : undefined;

  if (signupPath) {
    if (!user) {
      return <FleetOwnerSignupPage fromRoamdriver={fromRoamdriver} initialLine={initialSignupLine} />;
    }
    if (needsProvision) {
      return (
        <FleetOwnerSignupComplete
          fromRoamdriver={fromRoamdriver}
          initialLine={initialSignupLine}
        />
      );
    }
    if (isFleetPortalUser(user) && !needsProvision) {
      window.location.replace('/');
      return (
        <div className="flex h-screen items-center justify-center text-slate-500">Loading dashboard…</div>
      );
    }
  }

  // Main Fleet Portal — Authentication Gate
  // Soft path gate (shared with Edge middleware.js); AuthProvider remains authoritative.
  if (!user || !isFleetPortalUser(user)) {
    if (
      typeof window !== 'undefined' &&
      requiresSessionGate(window.location.pathname) &&
      window.location.pathname !== '/'
    ) {
      window.history.replaceState(null, '', '/');
    }
    return <LoginPage />;
  }

  if (needsProvision) {
    return (
      <FleetOwnerSignupComplete
        fromRoamdriver={fromRoamdriver}
        initialLine={initialSignupLine}
      />
    );
  }

  const ownerProductLine = inferClientProductLine(user.user_metadata as Record<string, unknown>);
  if (ownerProductLine !== PRODUCT_LINE) {
    return (
      <WrongProductLineGate
        expectedProductLine={ownerProductLine}
        onSignOut={signOut}
      />
    );
  }

  // Maintenance Mode Gate — block non-platform users when maintenance is active
  const isPlatformUser = role === 'superadmin' || ['platform_owner', 'platform_support', 'platform_analyst'].includes(resolvedRole || '');
  if (maintenanceStatus.checked && maintenanceStatus.active && !isPlatformUser) {
    return (
      <PlatformMaintenanceSplash
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
            onClick={signOut}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Fleet Manager View (Default)
  return (
    <AppLayout currentPage={currentPage} onNavigate={handleNavigate} onLogout={signOut}>
      <ErrorBoundary
        key={currentPage}
        name={`MainContent:${currentPage}`}
        userId={user?.id}
        onRecoverNavigate={() => {
          setCurrentPage('dashboard');
          setDriverIdForDetail(null);
        }}
      >
        {currentPage === 'dashboard' && <Dashboard />}
        {currentPage === 'imports' && (
          <PermissionGate permission="nav.imports" onNavigate={setCurrentPage}>
            <ImportsPage onNavigate={setCurrentPage} />
          </PermissionGate>
        )}
        {currentPage === 'drivers' && (
          <PermissionGate permission="nav.drivers" onNavigate={setCurrentPage}>
            <DriversPage initialDriverId={driverIdForDetail} />
          </PermissionGate>
        )}
        {currentPage === 'driver-analytics' && (
          <PermissionGate permission="nav.drivers" onNavigate={setCurrentPage}>
            <DriverAnalytics
              onNavigate={setCurrentPage}
              onSelectDriver={(driverId) => {
                setDriverIdForDetail(driverId);
                setCurrentPage('drivers');
              }}
            />
          </PermissionGate>
        )}
        {currentPage === 'vehicles' && (
          <PermissionGate permission="nav.vehicles" onNavigate={setCurrentPage}>
            <VehiclesPage onNavigateToExpenseHub={openExpenseHubForVehicle} />
          </PermissionGate>
        )}
        {currentPage === 'vehicle-analytics' && (
          <PermissionGate permission="nav.vehicle_analytics" onNavigate={setCurrentPage}>
            <VehicleAnalytics onNavigate={setCurrentPage} />
          </PermissionGate>
        )}
        {currentPage === 'maintenance-hub' && (
          <PermissionGate permission="nav.maintenance" onNavigate={setCurrentPage}>
            <FleetMaintenanceHub onNavigate={setCurrentPage} />
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
        {currentPage === 'business-finance' && (
          <PermissionGate permission="nav.financial_analytics" onNavigate={setCurrentPage}>
            <BusinessFinancePage
              key={`${businessFinanceTab}:${expenseHubVehicleId || ''}`}
              initialTab={businessFinanceTab}
              expensesInitialVehicleId={expenseHubVehicleId ?? undefined}
              onNavigate={(page, periodHint) => {
                handleNavigate(page, periodHint);
                setDriverIdForDetail(null);
              }}
              onOpenDriver={(driverId) => {
                setDriverIdForDetail(driverId);
                setCurrentPage('drivers');
              }}
            />
          </PermissionGate>
        )}
        {currentPage === 'expense-hub' && (
          <PermissionGate permission="nav.financial_analytics" onNavigate={setCurrentPage}>
            <ExpenseHubPage
              key={`${expenseHubVehicleId || 'expense-hub'}:${expenseHubSubview || 'default'}`}
              initialVehicleId={expenseHubVehicleId ?? undefined}
              initialSubview={
                expenseHubSubview || (expenseHubVehicleId ? 'register' : 'overview')
              }
              onNavigate={(page, periodHint) => {
                handleNavigate(page, periodHint);
                setDriverIdForDetail(null);
              }}
            />
          </PermissionGate>
        )}
        {currentPage === 'transaction-list' && (
          <PermissionGate permission="nav.transaction_list" onNavigate={setCurrentPage}>
            <TransactionsPage mode="list" onBackToBusinessFinance={() => handleNavigate('business-finance')} />
          </PermissionGate>
        )}
        {currentPage === 'toll-tags' && (
          <PermissionGate permission="nav.toll_reconciliation" onNavigate={setCurrentPage}>
            <TollReconciliation
              focusVehicleId={tollReconFocus?.vehicleId}
              focusDriverId={tollReconFocus?.driverId}
              focusVehicleLabel={tollReconFocus?.vehicleLabel}
            />
          </PermissionGate>
        )}
        {currentPage === 'tag-inventory' && (
          <PermissionGate permission="nav.toll_tag_inventory" onNavigate={setCurrentPage}>
            <TagInventory onNavigate={handleNavigate} />
          </PermissionGate>
        )}
        {currentPage === 'toll-logs' && (
          <PermissionGate permission="nav.toll_logs" onNavigate={setCurrentPage}>
            <TollLogsPage />
          </PermissionGate>
        )}
        {currentPage === 'toll-analytics' && (
          <PermissionGate permission="nav.toll_analytics" onNavigate={setCurrentPage}>
            <TollAnalytics onNavigate={setCurrentPage} />
          </PermissionGate>
        )}
        {currentPage === 'toll-rate-drift' && (
          <PermissionGate permission="nav.toll_analytics" onNavigate={setCurrentPage}>
            <TollRateDriftPage />
          </PermissionGate>
        )}
        {currentPage === 'toll-low-balance' && (
          <PermissionGate permission="nav.toll_tag_inventory" onNavigate={setCurrentPage}>
            <TollLowBalancePage onNavigate={handleNavigate} />
          </PermissionGate>
        )}
        {currentPage === 'earnings-policy' && (
          <PermissionGate permission="nav.tier_config" onNavigate={setCurrentPage}>
            <EarningsPolicyConfiguration />
          </PermissionGate>
        )}
        {currentPage === 'fleet-financials' && (
          <PermissionGate permission="nav.financial_analytics" onNavigate={setCurrentPage}>
            <FleetFinancialsPage
              initialWeekFrom={financePeriodHint?.startYmd}
              initialWeekTo={financePeriodHint?.endYmd}
              onBackToBusinessFinance={() => handleNavigate('business-finance')}
              onPeriodHintConsumed={() => setFinancePeriodHint(null)}
            />
          </PermissionGate>
        )}
        {(currentPage === 'driver-settlements' || currentPage === 'driver-payouts') && (
          <PermissionGate permission="nav.financial_analytics" onNavigate={setCurrentPage}>
            <DriverSettlementsPage
              onBackToBusinessFinance={() => handleNavigate('business-finance')}
              onOpenDriver={(driverId) => {
                setDriverIdForDetail(driverId);
                setCurrentPage('drivers');
              }}
            />
          </PermissionGate>
        )}
        {currentPage === 'indrive-wallet' && (
          <PermissionGate permission="nav.financial_analytics" onNavigate={setCurrentPage}>
            <IndriveWalletCenterPage
              initialDateFrom={financePeriodHint?.startYmd}
              initialDateTo={financePeriodHint?.endYmd}
              onBackToBusinessFinance={() => handleNavigate('business-finance')}
              onPeriodHintConsumed={() => setFinancePeriodHint(null)}
            />
          </PermissionGate>
        )}
        
        {currentPage === 'fuel-analytics' && (
          <PermissionGate permission="nav.fuel_reports" onNavigate={setCurrentPage}>
            <FuelAnalytics onNavigate={setCurrentPage} />
          </PermissionGate>
        )}

        {['fuel-reconciliation', 'fuel-cards', 'fuel-logs', 'fuel-configuration', 'fuel-reimbursements'].includes(currentPage) && (
          <PermissionGate permission={PAGE_PERMISSION_MAP[currentPage] || 'nav.fuel_overview'} onNavigate={setCurrentPage}>
            <FuelManagement 
                defaultTab={
                    currentPage === 'fuel-reconciliation' ? 'reconciliation' :
                    currentPage === 'fuel-reimbursements' ? 'reimbursements' :
                    currentPage === 'fuel-cards' ? 'cards' :
                    currentPage === 'fuel-logs' ? 'logs' :
                    currentPage === 'fuel-configuration' ? 'configuration' :
                    'logs'
                }
                onTabChange={(t) => {
                    setCurrentPage(`fuel-${t}`);
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
        {currentPage === 'couriers' && (
          <PermissionGate permission="nav.couriers" onNavigate={setCurrentPage}>
            <CouriersPage />
          </PermissionGate>
        )}
        {currentPage === 'courier-analytics' && (
          <PermissionGate permission="nav.courier_analytics" onNavigate={setCurrentPage}>
            <CourierAnalyticsPage />
          </PermissionGate>
        )}
        {currentPage === 'deliveries' && (
          <PermissionGate permission="nav.deliveries" onNavigate={setCurrentPage}>
            <DeliveriesPage />
          </PermissionGate>
        )}
        {currentPage === 'delivery-analytics' && (
          <PermissionGate permission="nav.delivery_analytics" onNavigate={setCurrentPage}>
            <DeliveryAnalyticsPage />
          </PermissionGate>
        )}
        {currentPage === 'courier-settlements' && (
          <PermissionGate permission="nav.courier_settlements" onNavigate={setCurrentPage}>
            <CourierSettlementsPage />
          </PermissionGate>
        )}
        {currentPage === 'supply-health' && (
          <PermissionGate permission="nav.supply_health" onNavigate={setCurrentPage}>
            <SupplyHealthPage />
          </PermissionGate>
        )}
      </ErrorBoundary>
    </AppLayout>
  );
}

export default function App() {
  const isAdmin =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

  return (
    <PwaProvider>
      <AuthRecoveryGate
        title="Reset password"
        subtitle={isAdmin ? 'Roam Fleet Admin' : IS_ENTERPRISE_PRODUCT ? 'Roam Enterprise' : 'Roam Fleet'}
        signInHref={isAdmin ? '/admin' : '/'}
      >
        {isAdmin ? (
          <QueryClientProvider client={queryClient}>
            <AdminConfirmProvider>
              <FleetProductAdminPortal />
            </AdminConfirmProvider>
          </QueryClientProvider>
        ) : (
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <OfflineProvider>
                <BusinessConfigProvider>
                  <PlatformConfigProvider>
                    <FeatureFlagProvider>
                      <ServiceLineScopeProvider>
                        <AppContent />
                      </ServiceLineScopeProvider>
                    </FeatureFlagProvider>
                  </PlatformConfigProvider>
                </BusinessConfigProvider>
              </OfflineProvider>
            </AuthProvider>
          </QueryClientProvider>
        )}
      </AuthRecoveryGate>
    </PwaProvider>
  );
}