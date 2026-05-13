import React, { useState } from 'react';
import { useDriver } from '../../contexts/DriverContext';
import { useAuth } from '../../contexts/AuthContext';
import { getBottomNavItems, getNavigationItems } from '../../config/navigation';
import { Menu, X, ChevronRight, LogOut, Car, Building2 } from 'lucide-react';
import { DriverDashboard } from '../dashboard/DriverDashboard';
import { DriverEarnings } from '../earnings/DriverEarnings';
import { DriverTrips } from '../trips/DriverTrips';
import { DriverProfile } from '../profile/DriverProfile';
import { FleetEquipment } from '../fleet/FleetEquipment';
import { FleetFuelCard } from '../fleet/FleetFuelCard';
import { FleetReimbursements } from '../fleet/FleetReimbursements';
import { FleetCheckin } from '../fleet/FleetCheckin';
import { MyVehicle } from '../independent/MyVehicle';
import { IndependentExpenses } from '../independent/IndependentExpenses';
import { TaxCenter } from '../independent/TaxCenter';
import { InsuranceCenter } from '../independent/InsuranceCenter';

export function DriverShell() {
  const { mode, isFleetDriver, fleet, permissions, loading } = useDriver();
  const { user, signOut } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);

  const bottomNavItems = getBottomNavItems();
  const menuNavItems = getNavigationItems(mode);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading profile...</p>
        </div>
      </div>
    );
  }

  const handleSignOut = async () => {
    await signOut();
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DriverDashboard onNavigate={setCurrentPage} />;
      case 'earnings':
        return <DriverEarnings />;
      case 'trips':
        return <DriverTrips />;
      case 'profile':
        return <DriverProfile onNavigate={setCurrentPage} onLogout={handleSignOut} />;
      case 'equipment':
        return isFleetDriver ? <FleetEquipment /> : null;
      case 'fuel':
        return isFleetDriver ? <FleetFuelCard /> : null;
      case 'claims':
        return isFleetDriver ? <FleetReimbursements /> : null;
      case 'checkin':
        return isFleetDriver ? <FleetCheckin /> : null;
      case 'vehicle':
        return !isFleetDriver ? <MyVehicle /> : null;
      case 'expenses':
        return !isFleetDriver ? <IndependentExpenses /> : null;
      case 'tax':
        return !isFleetDriver ? <TaxCenter /> : null;
      case 'insurance':
        return !isFleetDriver ? <InsuranceCenter /> : null;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
              <Car className="w-8 h-8 text-slate-500" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Coming Soon</h2>
            <p className="text-slate-400 text-sm max-w-xs">
              This feature is under development and will be available soon.
            </p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Car className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Roam Driver</h1>
              {isFleetDriver && fleet && (
                <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <Building2 className="w-3 h-3" />
                  <span>{fleet.name}</span>
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20">
        <div className="max-w-lg mx-auto px-4 py-4">
          {renderPage()}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 z-40">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'text-emerald-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-slate-900 border-l border-slate-800 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <span className="font-semibold text-white">Menu</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg"
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
                    onClick={() => {
                      setCurrentPage(item.id);
                      setMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {isActive && <ChevronRight className="w-4 h-4 ml-auto" />}
                  </button>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm font-bold">
                  {user?.email?.[0]?.toUpperCase() || 'D'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {user?.user_metadata?.name || user?.email?.split('@')[0] || 'Driver'}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-semibold ${
                  isFleetDriver
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {isFleetDriver ? 'Fleet Driver' : 'Independent'}
                </span>
              </div>

              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
