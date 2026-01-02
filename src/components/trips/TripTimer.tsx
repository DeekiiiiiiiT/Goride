import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer, Clock, MapPin, Loader2, Navigation, Map as MapIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { TripSession, RoutePoint } from '../../types/tripSession';
import { getCurrentPosition, reverseGeocode } from '../../utils/locationService';
import { useTripTracker } from '../../hooks/useTripTracker';
import { LeafletMap } from '../maps/LeafletMap';
import { toast } from 'sonner@2.0.3';

interface TripTimerProps {
  onComplete: (data: {
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    duration: number; // minutes
    startDate: string; // YYYY-MM-DD
    startLocation?: string;
    startCoords?: { lat: number; lon: number };
    endLocation?: string;
    endCoords?: { lat: number; lon: number };
    route?: RoutePoint[];
  }) => void;
}

const STORAGE_KEY = 'current_trip_session';

export function TripTimer({ onComplete }: TripTimerProps) {
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false); // New state for stopping loader
  const [showMap, setShowMap] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startLocation, setStartLocation] = useState<string | null>(null);
  const [startCoords, setStartCoords] = useState<{ lat: number; lon: number } | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
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
        if (session.isActive && session.startTime) {
          setStartTime(session.startTime);
          setIsActive(true);
          setStartLocation(session.startLocation);
          setStartCoords(session.startCoords);
          
          if (session.route && session.route.length > 0) {
            setRoute(session.route);
            // Resume tracking if session was active
            startTracking();
          }
          
          // Calculate elapsed time immediately so we don't start at 0
          const now = Date.now();
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
        startTime,
        startLocation,
        startCoords,
        vehicleId: null,
        route // Save current route
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  }, [route, isActive, startTime, startLocation, startCoords]);

  // Timer interval
  useEffect(() => {
    if (isActive && startTime) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        const seconds = Math.floor((now - startTime) / 1000);
        setElapsedSeconds(seconds);
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
  }, [isActive, startTime]);

  const startTrip = async () => {
    setIsStarting(true);
    const now = Date.now();
    
    // Default session state
    let session: TripSession = {
      isActive: true,
      startTime: now,
      startLocation: null,
      startCoords: null,
      vehicleId: null,
      route: []
    };

    // Try to get location
    try {
      const position = await getCurrentPosition();
      const address = await reverseGeocode(position.latitude, position.longitude);
      
      session.startCoords = { lat: position.latitude, lon: position.longitude };
      session.startLocation = address;
      
      setStartCoords(session.startCoords);
      setStartLocation(session.startLocation);
      toast.success("Location detected: " + address.split(',')[0]);
    } catch (error) {
      console.error("GPS Error:", error);
      toast.warning("Could not detect location. You can enter it manually.");
    }

    // Start timer logic
    setStartTime(now);
    setIsActive(true);
    setElapsedSeconds(0);
    
    // Start tracking
    startTracking();
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    setIsStarting(false);
    toast.success("Trip started");
  };

  const stopTrip = async () => {
    if (!startTime) return;

    setIsStopping(true);
    // Stop tracking first
    stopTracking();

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

    try {
        const position = await getCurrentPosition();
        endCoordsObj = { lat: position.latitude, lon: position.longitude };
        const address = await reverseGeocode(position.latitude, position.longitude);
        endLocationStr = address;
        toast.success("Dropoff location detected: " + address.split(',')[0]);
    } catch (e) {
        console.error("Failed to get dropoff location", e);
        // Fallback: use last point from route if available
        if (route.length > 0) {
            const lastPoint = route[route.length - 1];
            endCoordsObj = { lat: lastPoint.lat, lon: lastPoint.lng };
        }
    }

    const tripData = {
      startTime: formatTime(startObj),
      endTime: formatTime(endObj),
      duration: durationMinutes,
      startDate: formatDate(startObj),
      startLocation: startLocation || undefined,
      startCoords: startCoords || undefined,
      endLocation: endLocationStr,
      endCoords: endCoordsObj,
      route: route // Pass captured route
    };

    // Clean up
    setIsActive(false);
    setStartTime(null);
    setElapsedSeconds(0);
    setStartLocation(null);
    setStartCoords(null);
    setRoute([]); // Clear route state
    localStorage.removeItem(STORAGE_KEY);
    setIsStopping(false);

    onComplete(tripData);
  };

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

  if (!isActive) {
    return (
      <Card className="bg-slate-50 border-dashed">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <Timer className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-medium text-slate-900">Start Live Trip</h3>
              <p className="text-sm text-slate-500">Track time and location automatically</p>
            </div>
          </div>
          <Button 
            onClick={startTrip} 
            disabled={isStarting}
            className="gap-2 bg-blue-600 hover:bg-blue-700"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Starting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Start Trip
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-blue-50 border-blue-200">
      <CardContent className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center animate-pulse text-blue-600 shadow-sm">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-0.5">Trip in Progress</div>
              <div className="text-2xl font-mono font-bold text-slate-900 leading-none mb-1">
                {formatElapsedTime(elapsedSeconds)}
              </div>
              {startLocation && (
                <div className="flex items-center gap-1 text-xs text-blue-800 max-w-[200px] truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate" title={startLocation}>{startLocation.split(',')[0]}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={() => setShowMap(!showMap)} 
              variant="outline" 
              className="gap-2 bg-white/60 hover:bg-white border-blue-200 text-blue-700"
            >
              <MapIcon className="h-4 w-4" /> 
              <span className="hidden sm:inline">{showMap ? 'Hide Map' : 'Show Map'}</span>
            </Button>
            
            <Button 
              onClick={stopTrip} 
              variant="destructive"
              className="gap-2 shadow-sm"
              disabled={isStopping}
            >
              {isStopping ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Finalizing...
                  </>
              ) : (
                  <>
                    <Square className="h-4 w-4 fill-current" /> <span className="hidden sm:inline">Complete</span>
                  </>
              )}
            </Button>
          </div>
        </div>
        
        {showMap && (
          <div className="rounded-lg overflow-hidden border border-blue-200 shadow-inner bg-white">
            <LeafletMap route={route} currentLocation={currentLocation} height="250px" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
