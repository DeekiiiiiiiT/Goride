import React, { useState } from 'react';
import { AuthProvider, useAuth } from './components/auth/AuthContext';
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

// Driver Portal Components
import { DriverLayout } from './components/driver-portal/DriverLayout';
import { DriverDashboard } from './components/driver-portal/DriverDashboard';
import { DriverEarnings } from './components/driver-portal/DriverEarnings';
import { DriverTrips } from './components/driver-portal/DriverTrips';
import { DriverProfile } from './components/driver-portal/DriverProfile';
import { DriverClaims } from './components/driver-portal/DriverClaims';
import { DriverExpenses } from './components/driver-portal/DriverExpenses';
import { DriverEquipment } from './components/driver-portal/DriverEquipment';

function AppContent() {
  const { user, role, loading, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [driverPage, setDriverPage] = useState('dashboard');
  const [driverIdForDetail, setDriverIdForDetail] = useState<string | null>(null);

  // ... (rest of the state logic)

  // OAuth Callback Handler
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    // Check if we are in a popup
    if (code && window.opener) {
        // Send code to main window
        window.opener.postMessage({ type: 'uber-auth-code', code }, '*');
        window.close();
        return; // Stop execution
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
                  <p className="text-sm text-slate-500 mb-6">
                    This usually means the "Scopes" in your Uber Dashboard don't match what the app requested (profile, history).
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

  if (!user) {
    return <LoginPage />;
  }

  // Handle logout
  const handleLogout = async () => {
    await signOut();
  };

  if (role === 'driver') {
    return (
      <DriverLayout 
        currentPage={driverPage} 
        onNavigate={setDriverPage} 
        onLogout={handleLogout}
      >
        {driverPage === 'dashboard' && <DriverDashboard />}
        {driverPage === 'earnings' && <DriverEarnings />}
        {driverPage === 'expenses' && <DriverExpenses />}
        {driverPage === 'trips' && <DriverTrips />}
        {driverPage === 'claims' && <DriverClaims />}
        {driverPage === 'equipment' && <DriverEquipment onBack={() => setDriverPage('profile')} />}
        {driverPage === 'profile' && <DriverProfile onLogout={handleLogout} onNavigate={setDriverPage} />}
      </DriverLayout>
    );
  }

  // Admin View (Default)
  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage} onLogout={handleLogout}>
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
      {currentPage === 'tier-config' && <TierConfigPage />}
      {currentPage === 'performance' && <PerformanceDashboard />}
      
      {['fuel-management', 'fuel-overview', 'fuel-reconciliation', 'fuel-cards', 'fuel-logs', 'fuel-reports', 'fuel-configuration', 'fuel-reimbursements'].includes(currentPage) && (
        <FuelManagement 
            defaultTab={
                currentPage === 'fuel-reconciliation' ? 'reconciliation' :
                currentPage === 'fuel-reimbursements' ? 'reimbursements' :
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
    </AppLayout>
  );
}

import { OfflineProvider } from './components/providers/OfflineProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      cacheTime: 1000 * 60 * 30, // 30 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineProvider>
          <AppContent />
        </OfflineProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
