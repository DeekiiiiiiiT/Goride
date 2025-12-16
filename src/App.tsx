import React, { useState } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './components/dashboard/Dashboard';
import { ImportsPage } from './components/imports/ImportsPage';
import { TripLogsPage } from './components/trips/TripLogsPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { DriversPage } from './components/drivers/DriversPage';
import { VehiclesPage } from './components/vehicles/VehiclesPage';
import { FinancialsPage } from './components/financials/FinancialsPage';
import { ReportsPage } from './components/reports/ReportsPage';
import { TransactionsPage } from './components/transactions/TransactionsPage';

// Driver Portal Components
import { DriverAuth } from './components/driver-portal/DriverAuth';
import { DriverLayout } from './components/driver-portal/DriverLayout';
import { DriverDashboard } from './components/driver-portal/DriverDashboard';
import { DriverEarnings } from './components/driver-portal/DriverEarnings';
import { DriverTrips } from './components/driver-portal/DriverTrips';
import { DriverProfile } from './components/driver-portal/DriverProfile';

type UserRole = 'admin' | 'driver' | null;

export default function App() {
  const [userRole, setUserRole] = useState<UserRole>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  // Separate state for driver navigation
  const [driverPage, setDriverPage] = useState('dashboard');

  const handleLogin = (role: 'admin' | 'driver') => {
    setUserRole(role);
    setCurrentPage('dashboard'); // Reset to dashboard on login
    setDriverPage('dashboard');
  };

  const handleLogout = () => {
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
      {currentPage === 'financials' && <FinancialsPage />}
      {currentPage === 'reports' && <ReportsPage />}
      {currentPage === 'transactions' && <TransactionsPage />}
      {currentPage === 'settings' && <SettingsPage />}
    </AppLayout>
  );
}
