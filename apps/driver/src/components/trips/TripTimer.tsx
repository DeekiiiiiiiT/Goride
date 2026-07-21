import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Square, Timer, Clock, MapPin, Loader2, Navigation, X } from 'lucide-react';
import { Button } from '@roam/ui';
import { Card, CardContent } from '@roam/ui';
import { TripSession, RoutePoint, TripStatus, TripStop } from '../../types/tripSession';
import { getCurrentPosition, reverseGeocode, createStop, calculatePathDistance } from '../../utils/locationService';
import { useTripTracker } from '../../hooks/useTripTracker';
import { LeafletMap } from '../maps/LeafletMap';
import { StopList } from './StopList';
import { toast } from 'sonner';
import { useOffline } from '../providers/OfflineProvider';
import { TripActionPortal } from './TripActionPortal';
import { CancelTripDialog } from './CancelTripDialog';
interface TripTimerProps {
  onComplete: (data: {
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    duration: number; // minutes
    startDate: string; // YYYY-MM-DD
    startLocation?: string;
    pickupCoords?: { lat: number; lon: number };
    endLocation?: string;
    dropoffCoords?: { lat: number; lon: number };
    route?: RoutePoint[];
    stops?: TripStop[]; // Phase 2: Multi-Stop Support
    totalWaitTime?: number; // Phase 2: Wait Time Tracking
    distance?: number; // Phase 3: Snapped Distance (KM)
    isOffline?: boolean;
  }) => void;
}

const STORAGE_KEY = 'current_trip_session';

/** Downsample GPS route so Complete / save does not block the main thread. */
function sampleRoute(points: RoutePoint[], maxPoints = 80): RoutePoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled: RoutePoint[] = [];
  for (let i = 0; i < points.length; i += step) sampled.push(points[i]);
  const last = points[points.length - 1];
  if (sampled[sampled.length - 1] !== last) sampled.push(last);
  return sampled;
}

const formatElapsedTime = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number) => num.toString().padStart(2, '0');
  
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
};

const getOrdinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export function TripTimer({ onComplete }: TripTimerProps) {
  const { isOnline } = useOffline();
  const [tripStatus, setTripStatus] = useState<TripStatus>('IDLE');
  const [stops, setStops] = useState<TripStop[]>([]);
  const [currentStop, setCurrentStop] = useState<TripStop | null>(null);
  
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isArriving, setIsArriving] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [startLocation, setStartLocation] = useState<string | null>(null);
  const [startCoords, setStartCoords] = useState<{ lat: number; lon: number } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const isActive = tripStatus !== 'IDLE';

  // Tracking Hook
  const {
    startTracking,
    stopTracking,
    resetRoute,
    route,
    setRoute,
    currentLocation,
  } = useTripTracker();

  // Defer restore so login paint and taps are not blocked by large route JSON.parse
  useEffect(() => {
    let cancelled = false;

    const restoreSession = () => {
    const storedSession = localStorage.getItem(STORAGE_KEY);
    if (storedSession) {
      try {
        const session: TripSession = JSON.parse(storedSession);
        if (cancelled) return;
        
        // Check for stale session (> 12 hours)
        const now = Date.now();
        const ageHours = (now - session.startTime!) / (1000 * 60 * 60);
        
        if (ageHours > 12) {
            console.log("Clearing stale trip session");
            localStorage.removeItem(STORAGE_KEY);
            return;
        }

        const isActiveSession = session.isActive || (session.status && session.status !== 'IDLE');

        if (isActiveSession && session.startTime) {
          setStartTime(session.startTime);
          
          // Restore status with legacy fallback
          setTripStatus(session.status || 'DRIVING');
          
          // Restore stops data
          setStops(session.stops || []);
          setCurrentStop(session.currentStop || null);

          setStartLocation(session.startLocation);
          setStartCoords(session.startCoords);
          
          if (session.route && session.route.length > 0) {
            setRoute(session.route);
            // Resume tracking if session was active
            startTracking();
          }
          
          // Calculate elapsed time immediately so we don't start at 0
          const seconds = Math.floor((now - session.startTime) / 1000);
          setElapsedSeconds(seconds);
        }
      } catch (error) {
        console.error("Failed to parse trip session", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    };

    const frame = requestAnimationFrame(restoreSession);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  // Debounce session writes — skip while cancel confirm is open; cap route size for mobile
  useEffect(() => {
    if (!isActive || !startTime || cancelDialogOpen) return;

    const routeForStorage =
      route.length > 300 ? route.slice(-300) : route;

    const session: TripSession = {
      isActive,
      status: tripStatus,
      startTime,
      startLocation,
      startCoords,
      vehicleId: null,
      route: routeForStorage,
      stops,
      currentStop,
    };

    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch (e) {
        console.warn('Failed to persist trip session', e);
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [route, isActive, tripStatus, startTime, startLocation, startCoords, stops, currentStop, cancelDialogOpen]);

  // Timer interval — paused while cancel confirm is open (stops re-render storm)
  useEffect(() => {
    if (isActive && startTime && !cancelDialogOpen) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const seconds = Math.floor((now - startTime) / 1000);
        setElapsedSeconds(seconds);
        
        if (tripStatus === 'WAITING' && currentStop) {
           setWaitSeconds(Math.floor((now - currentStop.arrivalTime) / 1000));
        } else {
           setWaitSeconds(0);
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, startTime, tripStatus, currentStop, cancelDialogOpen]);

  // Phase 3: Stop Handlers
  const handleArriveAtStop = async () => {
    if (isArriving) return;
    setIsArriving(true);
    try {
      const position = await getCurrentPosition();
      const address = await reverseGeocode(position.latitude, position.longitude);
      
      const stop = createStop(address, { lat: position.latitude, lon: position.longitude });
      
      setCurrentStop(stop);
      setTripStatus('WAITING');
      toast.info("Arrived at stop. Wait timer started.");
    } catch (error) {
      console.error("Failed to record stop:", error);
      
      // Fallback logic
      let fallbackLat = 0;
      let fallbackLon = 0;
      
      if (currentLocation) {
          fallbackLat = currentLocation.lat;
          fallbackLon = currentLocation.lon;
      }
      
      const fallbackStop = createStop("Location Unknown", { lat: fallbackLat, lon: fallbackLon });
      
      setCurrentStop(fallbackStop);
      setTripStatus('WAITING');
      toast.warning("GPS check failed, using approximate location.");
    } finally {
      setIsArriving(false);
    }
  };

  const handleResumeTrip = async () => {
    if (!currentStop) return;

    const now = Date.now();
    const durationSeconds = Math.floor((now - currentStop.arrivalTime) / 1000);
    
    const finalizedStop: TripStop = {
        ...currentStop,
        departureTime: now,
        durationSeconds: durationSeconds,
        isOverThreshold: durationSeconds > 120
    };

    setStops(prev => [...prev, finalizedStop]);
    setCurrentStop(null);
    setTripStatus('DRIVING');
    toast.success(`Stop completed. Duration: ${formatElapsedTime(durationSeconds)}`);
  };

  const startTrip = async () => {
    setIsStarting(true);
    const now = Date.now();
    
    // Default session state
    let session: TripSession = {
      isActive: true,
      status: 'DRIVING',
      startTime: now,
      startLocation: null,
      startCoords: null,
      vehicleId: null,
      route: [],
      stops: [],
      currentStop: null
    };

    // Try to get location
    try {
      const position = await getCurrentPosition();
      session.startCoords = { lat: position.latitude, lon: position.longitude };
      
      // Try geocode but don't block if it fails
      try {
          const address = await reverseGeocode(position.latitude, position.longitude);
          session.startLocation = address;
          toast.success("Location detected: " + address.split(',')[0]);
      } catch (e) {
          console.warn("Initial geocode failed, using coords", e);
          session.startLocation = `Lat: ${position.latitude.toFixed(5)}, Lon: ${position.longitude.toFixed(5)}`;
      }
      
      setStartCoords(session.startCoords);
      setStartLocation(session.startLocation);
    } catch (error) {
      console.error("GPS Error:", error);
      toast.warning("Could not detect location. Starting trip with manual entry fallback.");
    }

    // Start timer logic
    setStartTime(now);
    setTripStatus('DRIVING');
    setElapsedSeconds(0);
    setWaitSeconds(0);
    setStops([]);
    setCurrentStop(null);
    
    // Start tracking
    startTracking();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setIsStarting(false);
    toast.success("Trip started");
  };

  const cancelTrip = () => {
    stopTracking();
    setCancelDialogOpen(true);
  };

  const dismissCancelDialog = useCallback(() => {
    setCancelDialogOpen(false);
    if (tripStatus !== 'IDLE' && startTime) {
      startTracking();
    }
  }, [tripStatus, startTime, startTracking]);

  const confirmCancelTrip = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setCancelDialogOpen(false);
    stopTracking();
    localStorage.removeItem(STORAGE_KEY);
    resetRoute();
    setTripStatus('IDLE');
    setStartTime(null);
    setElapsedSeconds(0);
    setWaitSeconds(0);
    setStartLocation(null);
    setStartCoords(null);
    setStops([]);
    setCurrentStop(null);
    setIsStarting(false);
    setIsStopping(false);
    toast.info('Trip cancelled');
  }, [stopTracking, resetRoute]);

  const stopTrip = async () => {
    if (!startTime || isStopping) return;

    setIsStopping(true);
    try {
      let finalStops = [...stops];
      if (tripStatus === 'WAITING' && currentStop) {
        const now = Date.now();
        const durationSeconds = Math.floor((now - currentStop.arrivalTime) / 1000);
        finalStops.push({
          ...currentStop,
          departureTime: now,
          durationSeconds,
          isOverThreshold: durationSeconds > 120,
        });
      }

      const endTimeMs = Date.now();
      const durationMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));

      const startObj = new Date(startTime);
      const endObj = new Date(endTimeMs);
      const formatTime = (date: Date) =>
        date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      const formatDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const finalStartCoords =
        startCoords ??
        (route[0] ? { lat: route[0].lat, lon: route[0].lon } : undefined);
      const finalStartLocation =
        startLocation ??
        (finalStartCoords
          ? `Lat: ${finalStartCoords.lat.toFixed(5)}, Lon: ${finalStartCoords.lon.toFixed(5)}`
          : undefined);

      let endCoordsObj: { lat: number; lon: number } | undefined = currentLocation
        ? { lat: currentLocation.lat, lon: currentLocation.lon }
        : undefined;
      if (!endCoordsObj && route.length > 0) {
        const lastPoint = route[route.length - 1];
        endCoordsObj = { lat: lastPoint.lat, lon: lastPoint.lon };
      }

      const endLocationStr = endCoordsObj
        ? `Lat: ${endCoordsObj.lat.toFixed(5)}, Lon: ${endCoordsObj.lon.toFixed(5)}`
        : undefined;

      const routeSample = sampleRoute(route, 150);
      const processedDistanceKm =
        routeSample.length >= 2 ? calculatePathDistance(routeSample) : undefined;
      const routeForSave = sampleRoute(route, 80);

      const geocodeParts: string[] = [];
      if (!startLocation && finalStartCoords) geocodeParts.push('Pickup: pending geocode');
      if (endCoordsObj && !endLocationStr?.includes(',')) {
        geocodeParts.push('Dropoff: pending geocode');
      }
      const geocodeError = geocodeParts.length > 0 ? geocodeParts.join(' | ') : undefined;

      const tripData = {
        startTime: formatTime(startObj),
        endTime: formatTime(endObj),
        duration: durationMinutes,
        startDate: formatDate(startObj),
        startLocation: finalStartLocation,
        pickupCoords: finalStartCoords,
        endLocation: endLocationStr,
        dropoffCoords: endCoordsObj,
        route: routeForSave,
        stops: finalStops,
        totalWaitTime: finalStops.reduce((acc, stop) => acc + stop.durationSeconds, 0),
        distance: processedDistanceKm,
        isOffline: !isOnline,
        resolutionMethod: 'pending' as const,
        resolutionTimestamp: undefined,
        geocodeError,
      };

      localStorage.removeItem(STORAGE_KEY);
      stopTracking();
      resetRoute();
      setTripStatus('IDLE');
      setStartTime(null);
      setElapsedSeconds(0);
      setWaitSeconds(0);
      setStartLocation(null);
      setStartCoords(null);
      setStops([]);
      setCurrentStop(null);
      setIsStopping(false);

      requestAnimationFrame(() => {
        onComplete(tripData);
        toast.info('Enter the fare you received to save this trip.');
      });
    } catch (error) {
      console.error('Failed to complete trip', error);
      toast.error('Could not complete trip. Please try again.');
      setIsStopping(false);
    }
  };

  if (!isActive) {
    return (
      <div className="mt-auto w-full shrink-0 pb-1">
        <Button
          type="button"
          onClick={() => void startTrip()}
          disabled={isStarting}
          className="btn-touch w-full h-14 sm:h-16 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-xl shadow-indigo-500/20 rounded-2xl border-0 transition-all active:scale-[0.99] touch-manipulation"
        >
          {isStarting ? (
            <div className="flex items-center gap-2 text-lg font-bold">
              <Loader2 className="h-6 w-6 animate-spin" /> 
              <span>Starting Engine...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3 text-xl font-bold tracking-wide">
              <span>START TRIP</span>
            </div>
          )}
        </Button>
      </div>
    );
  }

  return (
    <>
    <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800">
      <CardContent className="p-4 flex flex-col gap-4">
        <div className="flex items-start gap-3 min-w-0">
            <div className={`h-12 w-12 shrink-0 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center animate-pulse shadow-sm ${tripStatus === 'WAITING' ? (waitSeconds > 120 ? 'text-red-600' : 'text-emerald-600') : 'text-blue-600'}`}>
              <Clock className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${tripStatus === 'WAITING' ? (waitSeconds > 120 ? 'text-red-600' : 'text-emerald-600') : 'text-blue-600'}`}>
                  {tripStatus === 'WAITING' ? (waitSeconds > 120 ? 'Wait Limit Exceeded' : 'Waiting at Stop') : 'Trip in Progress'}
              </div>
              
              {tripStatus === 'WAITING' ? (
                  <div className={`text-3xl font-mono font-bold leading-none mb-1 ${waitSeconds > 120 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatElapsedTime(waitSeconds)}
                  </div>
              ) : (
                  <div className="text-2xl font-mono font-bold text-slate-900 dark:text-white leading-none mb-1">
                    {formatElapsedTime(elapsedSeconds)}
                  </div>
              )}
              
              {tripStatus === 'WAITING' && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      Total Trip: {formatElapsedTime(elapsedSeconds)}
                  </div>
              )}

              {tripStatus !== 'WAITING' && startLocation && (
                <div className="flex items-center gap-1 text-xs text-blue-800 dark:text-blue-300 min-w-0 mt-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate" title={startLocation}>{startLocation.split(',')[0]}</span>
                </div>
              )}
            </div>
          </div>

        <StopList stops={stops} />
      </CardContent>
    </Card>

    <TripActionPortal inert={cancelDialogOpen}>
      <div
        className="flex flex-col gap-2 rounded-2xl border border-blue-200 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-blue-800 dark:bg-slate-900/95"
        role="toolbar"
        aria-label="Trip controls"
      >
        {tripStatus === 'DRIVING' && (
          <Button
            type="button"
            onClick={() => void handleArriveAtStop()}
            disabled={isArriving}
            className="btn-touch h-12 w-full bg-amber-500 hover:bg-amber-600 text-white gap-2 shadow-sm font-bold touch-manipulation"
          >
            {isArriving ? (
              <>
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                <span>Getting location…</span>
              </>
            ) : (
              <>
                <MapPin className="h-5 w-5 shrink-0" />
                <span>{getOrdinal(stops.length + 1)} Stop</span>
              </>
            )}
          </Button>
        )}

        {tripStatus === 'WAITING' && (
          <Button
            type="button"
            onClick={() => void handleResumeTrip()}
            className="btn-touch h-12 w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm font-bold touch-manipulation"
          >
            <Play className="h-5 w-5 shrink-0" />
            <span>Resume Trip</span>
          </Button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={cancelTrip}
            disabled={cancelDialogOpen}
            variant="outline"
            className="btn-touch h-12 w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:border-red-900 dark:hover:bg-red-950/50 gap-2 font-semibold touch-manipulation"
            title="Cancel Trip"
          >
            <X className="h-5 w-5 shrink-0" />
            <span>Cancel</span>
          </Button>

          <Button
            type="button"
            onClick={() => void stopTrip()}
            variant="destructive"
            className="btn-touch h-12 w-full gap-2 shadow-sm font-bold touch-manipulation"
            disabled={isStopping || cancelDialogOpen}
          >
            {isStopping ? (
              <>
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                <span>Finalizing...</span>
              </>
            ) : (
              <>
                <Square className="h-5 w-5 shrink-0 fill-current" />
                <span>Complete</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </TripActionPortal>

    <div className="h-44 shrink-0" aria-hidden />

    <CancelTripDialog
      open={cancelDialogOpen}
      onGoBack={dismissCancelDialog}
      onConfirm={confirmCancelTrip}
    />
    </>
  );
}