import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useDriver } from '../../contexts/DriverContext';
import { useAuth } from '../../contexts/AuthContext';
import { RideDispatchProvider } from '../../contexts/RideDispatchContext';
import { getBottomNavItems, getNavigationItems } from '../../config/navigation';
import {
  Menu,
  X,
  ChevronRight,
  LogOut,
  Car,
  Building2,
  RefreshCw,
  Banknote,
  Bell,
  User,
} from 'lucide-react';
import { ThemeToggleButton } from './ThemeToggleButton';
import { cn } from '@roam/ui';
import { AnnouncementBanner } from './AnnouncementBanner';
import { OfflineStatusIndicator } from '../offline/OfflineStatusIndicator';
import { NotificationCenter } from '../notifications/NotificationCenter';

import { DriverDashboard } from '../legacy/DriverDashboard';
import { DriverEarnings } from '../legacy/DriverEarnings';
import { DriverTrips } from '../legacy/DriverTrips';
import { IndependentEarningsPage } from '../independent/IndependentEarningsPage';
import { IndependentProfilePage } from '../independent/IndependentProfilePage';
import { IndependentTripsPage } from '../independent/IndependentTripsPage';
import { DriverProfile } from '../legacy/DriverProfile';
import { DriverExpenses } from '../legacy/DriverExpenses';
import { DriverEquipment } from '../legacy/DriverEquipment';
import { DriverClaims } from '../legacy/DriverClaims';
import { WeeklyCheckInModal } from '../legacy/WeeklyCheckInModal';
import { DriverFuelStats } from '../legacy/DriverFuelStats';
import { FleetFuelLogPage } from '../legacy/FleetFuelLogPage';
import { DriverPerformancePage } from '../legacy/DriverPerformancePage';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { useWeeklyCheckIn } from '../../hooks/useWeeklyCheckIn';

import { MyVehicle } from '../independent/MyVehicle';
import { IndependentExpenses } from '../independent/IndependentExpenses';
import { TaxCenter } from '../independent/TaxCenter';
import { InsuranceCenter } from '../independent/InsuranceCenter';
import { RideDispatchPage } from '../rides/RideDispatchPage';

export function DriverShell({ forcePassengerRides = false }: { forcePassengerRides?: boolean }) {
  const { mode, isFleetDriver, isIndependentDriver, fleet, loading } = useDriver();
  const { user, signOut } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const { needsCheckIn, isLoading: checkInHookLoading, submitCheckIn } = useWeeklyCheckIn(driverRecord?.id);

  const [currentPage, setCurrentPage] = useState(forcePassengerRides ? 'passenger-rides' : 'dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const bottomNavItems = getBottomNavItems();
  const menuNavItems = getNavigationItems(mode);

  const checkInModalOpen = isFleetDriver && (needsCheckIn || checkInOpen);
  const checkInForced = isFleetDriver && needsCheckIn;
  const mintHomeLayout = isIndependentDriver && currentPage === 'dashboard';
  const mintEarningsLayout = isIndependentDriver && currentPage === 'earnings';
  const mintTripsLayout = isIndependentDriver && currentPage === 'trips';
  const mintProfileLayout = isIndependentDriver && currentPage === 'profile';
  const mintUtilityLayout =
    isIndependentDriver &&
    (currentPage === 'vehicle' ||
      currentPage === 'expenses' ||
      currentPage === 'tax' ||
      currentPage === 'insurance');
  const mintDriverLayout =
    mintHomeLayout ||
    mintEarningsLayout ||
    mintTripsLayout ||
    mintProfileLayout ||
    mintUtilityLayout;

  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.user_metadata?.picture as string | undefined) ||
    null;
  const profileInitial =
    user?.user_metadata?.name?.[0]?.toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    'D';

  useEffect(() => {
    if (currentPage !== 'checkin' || !isFleetDriver) return;
    setCheckInOpen(true);
    setCurrentPage('dashboard');
  }, [currentPage, isFleetDriver]);

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

  const handleWeeklyCheckInSubmit = async (
    odometer: number,
    photo: File | null,
    method: 'ai_verified' | 'manual_override',
    reviewStatus: 'auto_approved' | 'pending_review',
    aiReading: number | null,
    manualReadingReason?: string,
  ) => {
    setCheckInSubmitting(true);
    try {
      const vehicleId =
        driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle || 'unknown';
      await submitCheckIn(odometer, photo, vehicleId, method, reviewStatus, aiReading, manualReadingReason);
      setCheckInOpen(false);
    } finally {
      setCheckInSubmitting(false);
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DriverDashboard onNavigate={setCurrentPage} />;
      case 'passenger-rides':
        return <RideDispatchPage />;
      case 'earnings':
        return isIndependentDriver ? <IndependentEarningsPage /> : <DriverEarnings />;
      case 'trips':
        return isIndependentDriver ? <IndependentTripsPage /> : <DriverTrips />;
      case 'profile':
        return isIndependentDriver ? (
          <IndependentProfilePage onNavigate={setCurrentPage} />
        ) : (
          <DriverProfile onNavigate={setCurrentPage} onLogout={handleSignOut} />
        );

      case 'equipment':
        return isFleetDriver ? <DriverEquipment onBack={() => setCurrentPage('dashboard')} /> : null;
      case 'expenses':
        return isFleetDriver ? (
          <DriverExpenses onBack={() => setCurrentPage('dashboard')} />
        ) : (
          <IndependentExpenses />
        );
      case 'claims':
        return isFleetDriver ? <DriverClaims /> : null;
      case 'fuel':
        return isFleetDriver ? <FleetFuelLogPage onBack={() => setCurrentPage('dashboard')} /> : null;
      case 'performance':
        return isFleetDriver ? <DriverPerformancePage onBack={() => setCurrentPage('dashboard')} /> : null;
      case 'fuel-stats':
        return isFleetDriver ? <DriverFuelStats /> : null;
      case 'checkin':
        return null;

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

  const shell = (
    <div
      className={cn(
        'flex min-h-dvh flex-col overflow-x-hidden',
        mintDriverLayout
          ? 'bg-[#f7f9fb] dark:bg-slate-950'
          : 'bg-gradient-to-br from-slate-100 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900',
      )}
    >
      <AnnouncementBanner />

      <header
        className={cn(
          'sticky top-0 z-40 border-b safe-t backdrop-blur-lg',
          mintDriverLayout
            ? 'border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900'
            : 'border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/80',
        )}
      >
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between gap-3 safe-x sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
          <div className="flex min-w-0 items-center gap-3">
            {!mintTripsLayout && !mintProfileLayout && (
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            )}
            {mintTripsLayout || mintProfileLayout ? (
              <>
                <button
                  type="button"
                  onClick={() => setCurrentPage('profile')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-blue-100 shadow-sm dark:border-slate-800 dark:bg-blue-950/40"
                  aria-label="Profile"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-blue-800 dark:text-blue-300">{profileInitial}</span>
                  )}
                </button>
                <h1 className="text-xl font-bold tracking-tight text-[#004ac6] dark:text-blue-400">Roam</h1>
              </>
            ) : mintEarningsLayout || mintUtilityLayout ? (
              <h1 className="text-xl font-bold tracking-tight text-[#004ac6] dark:text-blue-400">Roam</h1>
            ) : mintHomeLayout ? (
              <h1 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Roam Driver</h1>
            ) : (
              <>
                <ThemeToggleButton />
                <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white sm:hidden">
                  Roam Driver
                </h1>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {mintTripsLayout || mintProfileLayout ? (
              <button
                type="button"
                onClick={() => toast.message('Notifications coming soon')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[#004ac6] transition-colors hover:bg-slate-100 active:scale-95 dark:text-blue-400 dark:hover:bg-slate-800"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
              </button>
            ) : mintDriverLayout ? (
              <>
                {mintEarningsLayout && (
                  <button
                    type="button"
                    onClick={() =>
                      window.dispatchEvent(new Event('roam-driver-earnings-refresh'))
                    }
                    className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800"
                    aria-label="Refresh earnings"
                  >
                    <RefreshCw className="h-5 w-5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentPage('profile')}
                  className={cn(
                    'h-10 w-10 overflow-hidden rounded-full border-2 object-cover',
                    mintEarningsLayout
                      ? 'border-emerald-500 dark:border-emerald-400'
                      : 'border-slate-200 dark:border-slate-700',
                  )}
                  aria-label="Profile"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-emerald-100 text-sm font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      {profileInitial}
                    </span>
                  )}
                </button>
              </>
            ) : (
              <>
                {isFleetDriver && (
                  <>
                    <OfflineStatusIndicator />
                    <NotificationCenter />
                  </>
                )}
                <div className="min-w-0 text-right hidden sm:block">
                  <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Roam Driver</h1>
                  {isFleetDriver && fleet && (
                    <div className="flex items-center justify-end gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[120px] sm:max-w-[200px] md:max-w-md">{fleet.name}</span>
                    </div>
                  )}
                </div>
                <div className="w-8 h-8 shrink-0 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                  <Car className="w-4 h-4 text-white" />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-x-hidden overflow-y-auto pb-[var(--driver-bottom-nav-total)]">
        <div
          className={cn(
            'mx-auto w-full min-w-0 max-w-lg safe-x sm:max-w-2xl md:max-w-3xl lg:max-w-4xl',
            mintDriverLayout ? 'py-6' : 'py-4',
          )}
        >
          {renderPage()}
        </div>
      </main>

      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-40 border-t safe-b backdrop-blur-lg',
          mintDriverLayout
            ? 'border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900'
            : 'border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900/95',
        )}
      >
        <div className="mx-auto flex h-[4.5rem] max-w-lg items-center justify-between safe-x sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
          {bottomNavItems.map((item) => {
            const Icon =
              item.id === 'earnings' && mintDriverLayout
                ? Banknote
                : item.id === 'profile' && mintProfileLayout && currentPage === 'profile'
                  ? User
                  : item.icon;
            const isActive = currentPage === item.id;
            const activeColor =
              isActive && mintTripsLayout && item.id === 'trips'
                ? 'text-[#004ac6] dark:text-blue-400'
                : isActive && mintProfileLayout && item.id === 'profile'
                  ? 'text-[#004ac6] dark:text-blue-400'
                  : isActive && mintEarningsLayout && item.id === 'earnings'
                    ? 'text-[#004ac6] dark:text-blue-400'
                    : isActive
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentPage(item.id)}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2 transition-colors hover:text-slate-800 dark:hover:text-slate-200',
                  activeColor,
                )}
              >
                <div
                  className={cn(
                    'p-3 transition-colors',
                    isActive &&
                      mintDriverLayout &&
                      (item.id === 'trips' && mintTripsLayout
                        ? 'rounded-2xl bg-blue-100 px-6 dark:bg-blue-950/40'
                        : item.id === 'profile' && mintProfileLayout
                          ? 'rounded-2xl bg-blue-100 px-6 dark:bg-blue-950/40'
                          : item.id === 'earnings' && mintEarningsLayout
                            ? 'rounded-2xl bg-blue-500/10 px-6'
                            : item.id === 'dashboard'
                              ? 'rounded-2xl bg-emerald-500/10 px-6'
                              : ''),
                  )}
                >
                  <Icon
                    className={cn(
                      'w-6 h-6',
                      isActive && mintProfileLayout && item.id === 'profile' && 'fill-current',
                    )}
                    strokeWidth={isActive ? 2.25 : 2}
                  />
                </div>
                <span className="text-[11px] font-bold tracking-wide">{item.label}</span>
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
          <div className="absolute left-0 top-0 bottom-0 flex w-[min(100vw-2rem,20rem)] flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 sm:w-80">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 pt-[max(1rem,env(safe-area-inset-top,0px))] dark:border-slate-800">
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
                <span
                  className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-bold ${
                    isFleetDriver
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                  }`}
                >
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

      {isFleetDriver && (
        <WeeklyCheckInModal
          isOpen={checkInModalOpen}
          onClose={() => {
            if (!needsCheckIn) setCheckInOpen(false);
          }}
          onSubmit={handleWeeklyCheckInSubmit}
          isLoading={checkInSubmitting || checkInHookLoading}
          isForced={checkInForced}
        />
      )}
    </div>
  );

  return isIndependentDriver ? <RideDispatchProvider>{shell}</RideDispatchProvider> : shell;
}
