import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer, Clock, MapPin, Loader2, Navigation, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { TripSession, RoutePoint, TripStatus, TripStop } from '../../types/tripSession';
import { getCurrentPosition, reverseGeocode, createStop, calculatePathDistance } from '../../utils/locationService';
import { useTripTracker } from '../../hooks/useTripTracker';
import { LeafletMap } from '../maps/LeafletMap';
import { StopList } from './StopList';
import { toast } from 'sonner@2.0.3';
import { mapMatchService } from '../../services/mapMatchService';
import { useOffline } from '../providers/OfflineProvider';

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
  const [isStopping, setIsStopping] = useState(false); // New state for stopping loader
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
    route, 
    setRoute, 
    currentLocation 
  } = useTripTracker();

  // Load session from storage on mount
  useEffect(() => {
    const storedSession = localStorage.getItem(STORAGE_KEY);
    if (storedSession) {
      try {
        const session: TripSession = JSON.parse(storedSession);
        
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
  }, []);

  // Update storage when route changes
  useEffect(() => {
    if (isActive && startTime) {
      const session: TripSession = {
        isActive,
        status: tripStatus,
        startTime,
        startLocation,
        startCoords,
        vehicleId: null,
        route, // Save current route
        stops,
        currentStop
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  }, [route, isActive, tripStatus, startTime, startLocation, startCoords, stops, currentStop]);

  // Timer interval
  useEffect(() => {
    if (isActive && startTime) {
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
  }, [isActive, startTime, tripStatus, currentStop]);

  // Phase 3: Stop Handlers
  const handleArriveAtStop = async () => {
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
          fallbackLon = currentLocation.lng;
      }
      
      const fallbackStop = createStop("Location Unknown", { lat: fallbackLat, lon: fallbackLon });
      
      setCurrentStop(fallbackStop);
      setTripStatus('WAITING');
      toast.warning("GPS check failed, using approximate location.");
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
    setCancelDialogOpen(true);
  };

  const confirmCancelTrip = () => {
    stopTracking();
    setTripStatus('IDLE');
    setStartTime(null);
    setElapsedSeconds(0);
    setWaitSeconds(0);
    setStartLocation(null);
    setStartCoords(null);
    setRoute([]);
    setStops([]);
    setCurrentStop(null);
    localStorage.removeItem(STORAGE_KEY);
    setIsStarting(false);
    setIsStopping(false);
    toast.info("Trip cancelled");
    setCancelDialogOpen(false);
  };

  const stopTrip = async () => {
    if (!startTime) return;

    setIsStopping(true);
    // Stop tracking first
    stopTracking();

    // Close active stop if waiting
    let finalStops = [...stops];
    if (tripStatus === 'WAITING' && currentStop) {
        const now = Date.now();
        const durationSeconds = Math.floor((now - currentStop.arrivalTime) / 1000);
        const finalizedStop: TripStop = {
            ...currentStop,
            departureTime: now,
            durationSeconds: durationSeconds,
            isOverThreshold: durationSeconds > 120
        };
        finalStops.push(finalizedStop);
    }

    const endTimeMs = Date.now();
    const durationMinutes = Math.ceil(elapsedSeconds / 60); // Round up to nearest minute
    
    // Format times for the form
    const startObj = new Date(startTime);
    const endObj = new Date(endTimeMs);

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const formatDate = (date: Date) => {
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    };

    // Capture End Location
    let endLocationStr: string | undefined = undefined;
    let endCoordsObj: { lat: number; lon: number } | undefined = undefined;
    let geocodeError: string | undefined = undefined;
    let resolutionMethod: 'instant' | 'pending' = 'instant';

    // Robust Start Location Recovery
    // If startLocation is missing (e.g. GPS failed at start), try to recover from startCoords or route
    let finalStartLocation = startLocation;
    let finalStartCoords = startCoords;
    let startGeocodeFailed = false;

    if (!finalStartLocation) {
        startGeocodeFailed = true;
        // Try startCoords first
        if (finalStartCoords) {
             try {
                 finalStartLocation = await reverseGeocode(finalStartCoords.lat, finalStartCoords.lon);
                 startGeocodeFailed = false;
             } catch (e: any) {
                 console.error("Failed to recover start location from coords", e);
                 geocodeError = `Pickup: ${e.message}`;
             }
        } 
        // Fallback to first route point
        else if (route.length > 0) {
            const firstPoint = route[0];
            finalStartCoords = { lat: firstPoint.lat, lon: firstPoint.lon };
            try {
                finalStartLocation = await reverseGeocode(firstPoint.lat, firstPoint.lon);
                startGeocodeFailed = false;
            } catch (e: any) {
                console.error("Failed to recover start location from route", e);
                geocodeError = `Pickup: ${e.message}`;
            }
        }
    }

    try {
        const position = await getCurrentPosition();
        endCoordsObj = { lat: position.latitude, lon: position.longitude };
        
        if (isOnline) {
          try {
            const address = await reverseGeocode(position.latitude, position.longitude);
            endLocationStr = address;
            toast.success("Dropoff location detected: " + address.split(',')[0]);
          } catch (e: any) {
            console.error("Failed to geocode dropoff", e);
            resolutionMethod = 'pending';
            geocodeError = geocodeError ? `${geocodeError} | Dropoff: ${e.message}` : `Dropoff: ${e.message}`;
            endLocationStr = `Lat: ${position.latitude.toFixed(5)}, Lon: ${position.longitude.toFixed(5)}`;
          }
        } else {
          endLocationStr = `Lat: ${position.latitude.toFixed(5)}, Lon: ${position.longitude.toFixed(5)}`;
          resolutionMethod = 'pending';
          geocodeError = "Offline: Geocode pending";
          toast.info("Offline: Dropoff location recorded");
        }
    } catch (e: any) {
        console.error("Failed to get dropoff location", e);
        resolutionMethod = 'pending';
        geocodeError = geocodeError ? `${geocodeError} | Dropoff: GPS Failed` : "Dropoff: GPS Failed";
        // Fallback: use last point from route if available
        if (route.length > 0) {
            const lastPoint = route[route.length - 1];
            endCoordsObj = { lat: lastPoint.lat, lon: lastPoint.lng };
            endLocationStr = `Lat: ${lastPoint.lat.toFixed(5)}, Lon: ${lastPoint.lng.toFixed(5)}`;
        }
    }

    // If start geocode failed, overall resolution is pending
    if (startGeocodeFailed) {
        resolutionMethod = 'pending';
    }

    // Phase 3: Snap to Road
    let processedRoute = route;
    let processedDistanceKm: number | undefined = undefined;

    if (route.length >= 2) {
        if (isOnline) {
          try {
              const result = await mapMatchService.snapToRoad(route);
              if (result) {
                  processedRoute = result.snappedRoute.map((pt: any, idx: number) => ({
                      lat: pt.lat,
                      lon: pt.lon,
                      timestamp: route[0]?.timestamp ? route[0].timestamp + (idx * 1000) : Date.now(),
                      speed: 0,
                      heading: 0,
                      accuracy: 0
                  }));
                  processedDistanceKm = result.totalDistance / 1000;
              }
          } catch (err) {
              console.error("Snap failed", err);
              // Fallback
              processedDistanceKm = calculatePathDistance(route);
          }
        } else {
          // Offline Mode: Use local calculation
          processedDistanceKm = calculatePathDistance(route);
        }
    }

    const tripData = {
      startTime: formatTime(startObj),
      endTime: formatTime(endObj),
      duration: durationMinutes,
      startDate: formatDate(startObj),
      startLocation: finalStartLocation || undefined,
      pickupCoords: finalStartCoords || undefined,
      endLocation: endLocationStr,
      dropoffCoords: endCoordsObj,
      route: processedRoute, // Pass processed route
      stops: finalStops,
      totalWaitTime: finalStops.reduce((acc, stop) => acc + stop.durationSeconds, 0),
      distance: processedDistanceKm,
      isOffline: !isOnline,
      resolutionMethod: resolutionMethod,
      resolutionTimestamp: resolutionMethod === 'instant' ? new Date().toISOString() : undefined,
      geocodeError: geocodeError
    };

    // Clean up
    setTripStatus('IDLE');
    setStartTime(null);
    setElapsedSeconds(0);
    setWaitSeconds(0);
    setStartLocation(null);
    setStartCoords(null);
    setRoute([]); // Clear route state
    setStops([]);
    setCurrentStop(null);
    localStorage.removeItem(STORAGE_KEY);
    setIsStopping(false);

    onComplete(tripData);
  };

  if (!isActive) {
    return (
      <Button 
        onClick={startTrip} 
        disabled={isStarting}
        className="w-full h-16 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-xl shadow-indigo-500/20 rounded-2xl border-0 transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        {isStarting ? (
          <div className="flex items-center gap-2 text-lg font-bold">
            <Loader2 className="h-6 w-6 animate-spin" /> 
            <span>Starting Engine...</span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xl font-bold tracking-wide">
            <div className="p-1.5 bg-white/20 rounded-full backdrop-blur-sm">
                <Play className="h-6 w-6 fill-current pl-1" />
            </div>
            <span>START NEW TRIP</span>
          </div>
        )}
      </Button>
    );
  }

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardContent className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-full bg-white flex items-center justify-center animate-pulse shadow-sm ${tripStatus === 'WAITING' ? (waitSeconds > 120 ? 'text-red-600' : 'text-emerald-600') : 'text-blue-600'}`}>
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <div className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${tripStatus === 'WAITING' ? (waitSeconds > 120 ? 'text-red-600' : 'text-emerald-600') : 'text-blue-600'}`}>
                  {tripStatus === 'WAITING' ? (waitSeconds > 120 ? 'Wait Limit Exceeded' : 'Waiting at Stop') : 'Trip in Progress'}
              </div>
              
              {tripStatus === 'WAITING' ? (
                  <div className={`text-3xl font-mono font-bold leading-none mb-1 ${waitSeconds > 120 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatElapsedTime(waitSeconds)}
                  </div>
              ) : (
                  <div className="text-2xl font-mono font-bold text-slate-900 leading-none mb-1">
                    {formatElapsedTime(elapsedSeconds)}
                  </div>
              )}
              
              {tripStatus === 'WAITING' && (
                  <div className="text-xs text-slate-500 font-medium">
                      Total Trip: {formatElapsedTime(elapsedSeconds)}
                  </div>
              )}

              {tripStatus !== 'WAITING' && startLocation && (
                <div className="flex items-center gap-1 text-xs text-blue-800 max-w-[200px] truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate" title={startLocation}>{startLocation.split(',')[0]}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            {tripStatus === 'DRIVING' && (
              <Button 
                onClick={handleArriveAtStop}
                className="bg-amber-500 hover:bg-amber-600 text-white gap-2 shadow-sm"
              >
                <MapPin className="h-4 w-4" />
                <span>{getOrdinal(stops.length + 1)} Stop</span>
              </Button>
            )}
            
            {tripStatus === 'WAITING' && (
              <Button 
                onClick={handleResumeTrip}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
              >
                <Play className="h-4 w-4" />
                <span>Resume Trip</span>
              </Button>
            )}
            
            <Button
              onClick={cancelTrip}
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-100 hover:text-red-700 hover:border-red-300 gap-2 px-3"
              title="Cancel Trip"
            >
                <X className="h-4 w-4" />
                <span>Cancel</span>
            </Button>

            <Button 
              onClick={stopTrip} 
              variant="destructive"
              className="gap-2 shadow-sm"
              disabled={isStopping}
            >
              {isStopping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> <span>Finalizing...</span>
                  </>
              ) : (
                  <>
                    <Square className="h-4 w-4 fill-current" /> <span>Complete</span>
                  </>
              )}
            </Button>
          </div>
        </div>
        

        <StopList stops={stops} />
        
        <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Current Trip?</AlertDialogTitle>
              <AlertDialogDescription>
                This will discard all trip data including route and duration. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Go Back</AlertDialogCancel>
              <AlertDialogAction onClick={confirmCancelTrip} className="bg-red-600 hover:bg-red-700">
                Yes, Cancel Trip
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
