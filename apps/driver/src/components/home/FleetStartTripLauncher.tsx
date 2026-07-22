import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { TripTimer, PENDING_FARE_STORAGE_KEY } from '../trips/TripTimer';
import { TripFareDialog, type TripFareInitialData } from '../trips/TripFareDialog';
import { PendingCatalogRequestsDrawer } from '../vehicles/PendingCatalogRequestsDrawer';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import {
  createManualTrip,
  ManualTripInput,
  resolveTripIdentity,
  withTripVehicle,
} from '../../utils/tripFactory';
import { api } from '../../services/api';
import { showCatalogGateToastIfApplicable } from '../../utils/catalogGateErrors';

const TIMER_STORAGE_KEY = 'current_trip_session';

/** True when a live TripTimer session is persisted (crash / app-close recovery). */
function hasActiveTimerSession(): boolean {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return false;
    const session = JSON.parse(raw) as { isActive?: boolean; status?: string; startTime?: number };
    if (!session.startTime) return false;
    const ageHours = (Date.now() - session.startTime) / (1000 * 60 * 60);
    if (ageHours > 12) return false;
    return session.isActive === true || (!!session.status && session.status !== 'IDLE');
  } catch {
    return false;
  }
}

function readPendingFareTrip(): TripFareInitialData | null {
  try {
    const raw = localStorage.getItem(PENDING_FARE_STORAGE_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as TripFareInitialData;
    if (!pending?.date || !pending?.time) return null;
    return pending;
  } catch {
    return null;
  }
}

function clearPendingFareTrip() {
  try {
    localStorage.removeItem(PENDING_FARE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Fleet "Start Trip" on the mint home.
 * Small pill button → full-screen sheet hosting the live TripTimer only
 * (no after-the-fact manual entry — drivers must record trips live).
 * Completion flows into TripFareDialog → createManualTrip → api.saveTrips.
 * Auto-reopens when a persisted timer session or pending fare draft exists.
 */
export function FleetStartTripLauncher() {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [fareDialogOpen, setFareDialogOpen] = useState(false);
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
  const [tripInitialData, setTripInitialData] = useState<TripFareInitialData | undefined>(undefined);
  const [activeSession, setActiveSession] = useState(false);

  // Recovery: reopen live timer sheet and/or unsaved fare draft after restart.
  useEffect(() => {
    if (hasActiveTimerSession()) {
      setActiveSession(true);
      setSheetOpen(true);
    }
    const pending = readPendingFareTrip();
    if (pending) {
      setTripInitialData(pending);
      setFareDialogOpen(true);
    }
  }, []);

  // Closing mid-trip would unmount TripTimer and pause GPS route tracking,
  // corrupting distance. Block it — driver must Complete or Cancel first.
  const closeSheet = () => {
    if (hasActiveTimerSession()) {
      setActiveSession(true);
      toast.info('Trip in progress — tap Complete or Cancel to finish it first.');
      return;
    }
    setActiveSession(false);
    setSheetOpen(false);
  };

  const defaultVehicleId =
    driverRecord?.assignedVehicleId || driverRecord?.vehicleId || driverRecord?.vehicle;

  const handleTimerComplete = (data: {
    startTime: string;
    endTime: string;
    duration: number;
    startDate: string;
    startLocation?: string;
    pickupCoords?: { lat: number; lon: number };
    endLocation?: string;
    dropoffCoords?: { lat: number; lon: number };
    route?: TripFareInitialData['route'];
    stops?: TripFareInitialData['stops'];
    totalWaitTime?: number;
    distance?: number;
    isOffline?: boolean;
  }) => {
    setTripInitialData({
      date: data.startDate,
      time: data.startTime,
      endTime: data.endTime,
      duration: data.duration,
      pickupLocation: data.startLocation,
      endLocation: data.endLocation,
      pickupCoords: data.pickupCoords,
      dropoffCoords: data.dropoffCoords,
      route: data.route,
      stops: data.stops,
      totalWaitTime: data.totalWaitTime,
      distance: data.distance,
      isOffline: data.isOffline,
      resolutionMethod: (data as { resolutionMethod?: TripFareInitialData['resolutionMethod'] })
        .resolutionMethod,
      geocodeError: (data as { geocodeError?: string }).geocodeError,
    });
    setFareDialogOpen(true);
  };

  /** Cancel/backdrop: confirm before discarding an unsaved completed trip. */
  const handleFareClose = () => {
    const stillPending = !!localStorage.getItem(PENDING_FARE_STORAGE_KEY);
    if (stillPending) {
      const discard = window.confirm("Discard this trip? It won't be saved.");
      if (!discard) return;
      clearPendingFareTrip();
    }
    setTripInitialData(undefined);
    setFareDialogOpen(false);
    setActiveSession(false);
  };

  const handleManualTripSubmit = async (data: ManualTripInput) => {
    if (!user?.id) {
      toast.error('Please sign in again to save this trip');
      throw new Error('Not signed in');
    }
    try {
      const identity = resolveTripIdentity(user, driverRecord);
      const trip = createManualTrip(
        withTripVehicle(data, identity.vehicleId),
        identity.driverId,
        identity.driverName,
      );
      await api.saveTrips([trip]);
      clearPendingFareTrip();
      toast.success('Trip Logged Successfully', {
        description: `$${data.amount} on ${data.date}`,
      });
      setTripInitialData(undefined);
      setFareDialogOpen(false);
      setActiveSession(false);
      setSheetOpen(false);
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Failed to save manual trip', err);
      const handled = showCatalogGateToastIfApplicable(err, {
        actionLabel: 'View pending requests',
        onAction: () => setPendingDrawerOpen(true),
      });
      if (!handled) toast.error(err.message || 'Failed to save trip');
      throw err;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        aria-label={activeSession ? 'Return to trip in progress' : 'Start a manual trip'}
      >
        {activeSession ? (
          <>
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            Trip in progress
          </>
        ) : (
          <>
            <Play className="h-3.5 w-3.5 text-[#006d43] dark:text-[#59de9b]" aria-hidden />
            Start Trip
          </>
        )}
      </button>

      {sheetOpen &&
        createPortal(
          /* z-[42]: above the bottom nav (z-40) but BELOW TripActionPortal (z-[45])
             so the floating Stop/Cancel/Complete controls stay tappable. */
          <div className="fixed inset-0 z-[42] flex flex-col bg-[#f7f9fb] dark:bg-slate-950">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Start Trip</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Walk-ups, phone bookings, other platforms
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
              <TripTimer onComplete={handleTimerComplete} />
            </div>
          </div>,
          document.body,
        )}

      <TripFareDialog
        open={fareDialogOpen}
        onClose={handleFareClose}
        initialData={tripInitialData}
        defaultVehicleId={defaultVehicleId}
        onSubmit={handleManualTripSubmit}
      />

      <PendingCatalogRequestsDrawer
        open={pendingDrawerOpen}
        onOpenChange={setPendingDrawerOpen}
        onOpenVehicle={undefined}
      />
    </>
  );
}
