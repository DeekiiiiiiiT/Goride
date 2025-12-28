import React, { useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './components/dashboard/Dashboard';
import { ImportsPage } from './components/imports/ImportsPage';
import { TripLogsPage } from './components/trips/TripLogsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { DriversPage } from './components/drivers/DriversPage';
import { VehiclesPage } from './components/vehicles/VehiclesPage';
import { ReportsPage } from './components/reports/ReportsPage';
import { TransactionsPage } from './components/transactions/TransactionsPage';
import { TollTags } from './pages/TollTags';

// Driver Portal Components
import { DriverAuth } from './components/driver-portal/DriverAuth';
import { DriverLayout } from './components/driver-portal/DriverLayout';
import { DriverDashboard } from './components/driver-portal/DriverDashboard';
import { DriverEarnings } from './components/driver-portal/DriverEarnings';
import { DriverTrips } from './components/driver-portal/DriverTrips';
import { DriverProfile } from './components/driver-portal/DriverProfile';

type UserRole = 'admin' | 'driver' | null;

export default function App() {
  const [userRole, setUserRole] = useState<UserRole>(() => {
    // Persist login across reloads
    const saved = localStorage.getItem('goride_user_role');
    return (saved === 'admin' || saved === 'driver') ? saved : null;
  });
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  // Separate state for driver navigation
  const [driverPage, setDriverPage] = useState('dashboard');

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

  const handleLogin = (role: 'admin' | 'driver') => {
    localStorage.setItem('goride_user_role', role);
    setUserRole(role);
    setCurrentPage('dashboard'); // Reset to dashboard on login
    setDriverPage('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('goride_user_role');
    setUserRole(null);
  };

  if (!userRole) {
    return <DriverAuth onLogin={handleLogin} />;
  }

  if (userRole === 'driver') {
    return (
      <DriverLayout 
        currentPage={driverPage} 
        onNavigate={setDriverPage} 
        onLogout={handleLogout}
      >
        {driverPage === 'dashboard' && <DriverDashboard />}
        {driverPage === 'earnings' && <DriverEarnings />}
        {driverPage === 'trips' && <DriverTrips />}
        {driverPage === 'profile' && <DriverProfile onLogout={handleLogout} />}
      </DriverLayout>
    );
  }

  // Admin View (Existing)
  return (
    <AppLayout currentPage={currentPage} onNavigate={setCurrentPage}>
      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'imports' && <ImportsPage />}
      {currentPage === 'drivers' && <DriversPage />}
      {currentPage === 'vehicles' && <VehiclesPage />}
      {currentPage === 'trips' && <TripLogsPage />}
      {currentPage === 'reports' && <ReportsPage />}
      {currentPage === 'transactions' && <TransactionsPage mode="analytics" />}
      {currentPage === 'transaction-list' && <TransactionsPage mode="list" />}
      {currentPage === 'toll-tags' && <TollTags />}
      {currentPage === 'settings' && <SettingsPage />}
    </AppLayout>
  );
}
