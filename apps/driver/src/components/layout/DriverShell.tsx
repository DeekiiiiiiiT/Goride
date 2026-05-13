import React, { useState } from 'react';
import { useDriver } from '../../contexts/DriverContext';
import { useAuth } from '../../contexts/AuthContext';
import { getBottomNavItems, getNavigationItems } from '../../config/navigation';
import { Menu, X, ChevronRight, LogOut, Car, Building2 } from 'lucide-react';
import { ThemeToggleButton } from './ThemeToggleButton';

// Use placeholder dashboard/earnings/trips for now (simpler, fewer dependencies)
import { DriverDashboard } from '../dashboard/DriverDashboard';
import { DriverEarnings } from '../earnings/DriverEarnings';
import { DriverTrips } from '../trips/DriverTrips';
import { DriverProfile } from '../profile/DriverProfile';

// Legacy components for critical features (toll scanning, expenses, equipment)
import { DriverExpenses } from '../legacy/DriverExpenses';
import { DriverEquipment } from '../legacy/DriverEquipment';
import { DriverClaims } from '../legacy/DriverClaims';
import { WeeklyCheckInModal } from '../legacy/WeeklyCheckInModal';
import { DriverFuelStats } from '../legacy/DriverFuelStats';

// Placeholder components for independent drivers (to be built later)
import { MyVehicle } from '../independent/MyVehicle';
import { IndependentExpenses } from '../independent/IndependentExpenses';
import { TaxCenter } from '../independent/TaxCenter';
import { InsuranceCenter } from '../independent/InsuranceCenter';

export function DriverShell() {
  const { mode, isFleetDriver, fleet, permissions, loading } = useDriver();
  const { user, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);

  const bottomNavItems = getBottomNavItems();
  const menuNavItems = getNavigationItems(mode);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent dark:border-emerald-500 rounded-full animate-spin" />
          <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">Loading profile...</p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
  };

  const handleCheckInSubmit = async (data: { odometer: number; method: string; needsReview: boolean }) => {
    setCheckInLoading(true);
    try {
      // TODO: Wire to useWeeklyCheckIn hook
      console.log('Check-in submitted:', data);
      setCheckInOpen(false);
    } finally {
      setCheckInLoading(false);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      // Core pages - use placeholder for now (simpler, will upgrade later)
      case 'dashboard':
        return <DriverDashboard onNavigate={setCurrentPage} />;
      case 'earnings':
        return <DriverEarnings />;
      case 'trips':
        return <DriverTrips />;
      case 'profile':
        return <DriverProfile onNavigate={setCurrentPage} onLogout={handleSignOut} />;
      
      // Fleet-specific pages
      case 'equipment':
        return isFleetDriver ? <DriverEquipment onBack={() => setCurrentPage('dashboard')} /> : null;
      case 'expenses':
        // For fleet drivers, show full expense hub with toll scanning
        // For independent, show placeholder
        return isFleetDriver 
          ? <DriverExpenses onBack={() => setCurrentPage('dashboard')} />
          : <IndependentExpenses />;
      case 'claims':
        return isFleetDriver ? <DriverClaims /> : null;
      case 'fuel':
      case 'fuel-stats':
        return isFleetDriver ? <DriverFuelStats /> : null;
      case 'checkin':
        if (isFleetDriver) {
          setCheckInOpen(true);
          setCurrentPage('dashboard');
        }
        return null;
      
      // Independent-specific pages
      case 'vehicle':
        return !isFleetDriver ? <MyVehicle /> : null;
      case 'tax':
        return !isFleetDriver ? <TaxCenter /> : null;
      case 'insurance':
        return !isFleetDriver ? <InsuranceCenter /> : null;
      
      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-4">
              <Car className="w-8 h-8 text-slate-500 dark:text-slate-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Coming Soon</h2>
            <p className="text-slate-600 dark:text-slate-300 text-sm max-w-xs">
              This feature is under development and will be available soon.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-lg border-b border-slate-200 dark:bg-slate-900/80 dark:border-slate-800">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
              <Car className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Roam Driver</h1>
              {isFleetDriver && fleet && (
                <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <Building2 className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[140px]">{fleet.name}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20">
        <div className="max-w-lg mx-auto px-4 py-4">
          {renderPage()}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-slate-200 z-40 dark:bg-slate-900/95 dark:border-slate-800">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentPage(item.id)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 2} />
                <span className="text-[11px] font-semibold tracking-wide">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm dark:bg-black/60"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-white border-l border-slate-200 flex flex-col dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-900 dark:text-white">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-1">
              {menuNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCurrentPage(item.id);
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-left">{item.label}</span>
                    {isActive && <ChevronRight className="w-4 h-4 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 text-sm font-bold dark:bg-emerald-500/20 dark:text-emerald-300">
                  {user?.email?.[0]?.toUpperCase() || 'D'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate dark:text-white">
                    {user?.user_metadata?.name || user?.email?.split('@')[0] || 'Driver'}
                  </p>
                  <p className="text-xs text-slate-600 truncate dark:text-slate-400">{user?.email}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold ${
                  isFleetDriver
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                }`}>
                  {isFleetDriver ? 'Fleet Driver' : 'Independent'}
                </span>
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors text-sm font-semibold dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Check-In Modal */}
      {isFleetDriver && (
        <WeeklyCheckInModal
          isOpen={checkInOpen}
          onClose={() => setCheckInOpen(false)}
          onSubmit={handleCheckInSubmit}
          isLoading={checkInLoading}
        />
      )}
    </div>
  );
}
