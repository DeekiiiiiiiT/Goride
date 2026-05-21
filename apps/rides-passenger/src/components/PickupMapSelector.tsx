import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, Navigation, MapPinned } from 'lucide-react';
import {
  loadGoogleMapsApi,
  resolveAddressFromCoordinates,
  getCurrentPositionWithAccuracy,
  snapToNearestRoad,
  type GeoPositionWithAccuracy,
} from '@/services/locationService';

const JAMAICA_CENTER = { lat: 18.1096, lng: -77.2975 };
const DEFAULT_ZOOM = 15;
const ZOOM_ON_GPS = 17;

export type PickupLocation = {
  lat: number;
  lng: number;
  address: string;
  accuracyMeters?: number;
};

type Props = {
  pickup: { lat: number; lng: number } | null;
  accuracy: number | null;
  onPickupChange: (location: PickupLocation) => void;
  isLoading?: boolean;
  /** Enable snap-to-road feature (attempts to snap pin to nearest road) */
  enableSnapToRoad?: boolean;
  /** Root container height / layout classes */
  className?: string;
};

export function PickupMapSelector({
  pickup,
  accuracy,
  onPickupChange,
  isLoading = false,
  enableSnapToRoad = true,
  className = 'h-56',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const gpsMarkerRef = useRef<google.maps.Marker | null>(null);
  const reverseGeocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isLocating, setIsLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [wasSnapped, setWasSnapped] = useState(false);

  // Initialize map
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadGoogleMapsApi();
        if (cancelled || !containerRef.current) return;

        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        if (cancelled || !containerRef.current) return;

        const initialCenter = pickup
          ? { lat: pickup.lat, lng: pickup.lng }
          : JAMAICA_CENTER;

        const map = new Map(containerRef.current, {
          center: initialCenter,
          zoom: pickup ? ZOOM_ON_GPS : DEFAULT_ZOOM,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          styles: [
            {
              featureType: 'poi',
              elementType: 'labels',
              stylers: [{ visibility: 'off' }],
            },
          ],
        });

        mapRef.current = map;

        // Create accuracy circle (hidden initially)
        accuracyCircleRef.current = new google.maps.Circle({
          map,
          center: initialCenter,
          radius: accuracy ?? 0,
          fillColor: '#059669',
          fillOpacity: 0.15,
          strokeColor: '#059669',
          strokeOpacity: 0.4,
          strokeWeight: 1,
          visible: false,
        });

        // Create GPS position marker (blue dot)
        gpsMarkerRef.current = new google.maps.Marker({
          map,
          position: initialCenter,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: '#3b82f6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
          visible: false,
          zIndex: 1,
        });

        // Listen to map drag events
        map.addListener('dragstart', () => {
          setIsDragging(true);
        });

        map.addListener('dragend', () => {
          setIsDragging(false);
        });

        // Reverse geocode after map movement stops (idle event)
        map.addListener('idle', () => {
          const center = map.getCenter();
          if (!center) return;

          // Clear previous timeout
          if (reverseGeocodeTimeoutRef.current) {
            clearTimeout(reverseGeocodeTimeoutRef.current);
          }

          // Debounce reverse geocode
          reverseGeocodeTimeoutRef.current = setTimeout(() => {
            void (async () => {
              let lat = center.lat();
              let lng = center.lng();
              let snapped = false;

              // Try snap-to-road if enabled
              if (enableSnapToRoad) {
                try {
                  const snappedCoords = await snapToNearestRoad(lat, lng);
                  if (snappedCoords) {
                    const distMoved = Math.abs(lat - snappedCoords.lat) + Math.abs(lng - snappedCoords.lng);
                    // Only snap if the adjustment is meaningful but not too far
                    if (distMoved > 0.00001 && distMoved < 0.002) {
                      lat = snappedCoords.lat;
                      lng = snappedCoords.lng;
                      snapped = true;
                    }
                  }
                } catch {
                  // Snap failed, continue with original coords
                }
              }

              setWasSnapped(snapped);

              try {
                const address = await resolveAddressFromCoordinates(lat, lng);
                onPickupChange({ lat, lng, address, accuracyMeters: accuracy ?? undefined });
              } catch {
                onPickupChange({
                  lat,
                  lng,
                  address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
                  accuracyMeters: accuracy ?? undefined,
                });
              }
            })();
          }, 500);
        });

        if (!cancelled) setMapStatus('ready');
      } catch (e) {
        console.error('Map init error:', e);
        if (!cancelled) setMapStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      if (reverseGeocodeTimeoutRef.current) {
        clearTimeout(reverseGeocodeTimeoutRef.current);
      }
    };
  }, []);

  // Update accuracy circle when accuracy changes
  useEffect(() => {
    if (!accuracyCircleRef.current || !mapRef.current) return;
    
    if (accuracy && accuracy > 0 && pickup) {
      accuracyCircleRef.current.setCenter({ lat: pickup.lat, lng: pickup.lng });
      accuracyCircleRef.current.setRadius(accuracy);
      accuracyCircleRef.current.setVisible(true);
      
      gpsMarkerRef.current?.setPosition({ lat: pickup.lat, lng: pickup.lng });
      gpsMarkerRef.current?.setVisible(true);
    } else {
      accuracyCircleRef.current.setVisible(false);
      gpsMarkerRef.current?.setVisible(false);
    }
  }, [accuracy, pickup?.lat, pickup?.lng]);

  // Handle "Use my location" button
  const handleUseMyLocation = useCallback(async () => {
    setIsLocating(true);
    try {
      const position: GeoPositionWithAccuracy = await getCurrentPositionWithAccuracy();
      
      if (mapRef.current) {
        mapRef.current.panTo({ lat: position.lat, lng: position.lng });
        mapRef.current.setZoom(ZOOM_ON_GPS);
      }

      // Update accuracy circle position
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setCenter({ lat: position.lat, lng: position.lng });
        accuracyCircleRef.current.setRadius(position.accuracyMeters);
        accuracyCircleRef.current.setVisible(true);
      }

      if (gpsMarkerRef.current) {
        gpsMarkerRef.current.setPosition({ lat: position.lat, lng: position.lng });
        gpsMarkerRef.current.setVisible(true);
      }

      // Reverse geocode will happen via idle event
    } catch (e) {
      console.error('Location error:', e);
    } finally {
      setIsLocating(false);
    }
  }, []);

  // Pan map when pickup prop changes externally (e.g., from search)
  useEffect(() => {
    if (!mapRef.current || !pickup || mapStatus !== 'ready') return;
    
    const center = mapRef.current.getCenter();
    if (!center) return;

    // Only pan if significantly different (avoid loops)
    const distance = Math.abs(center.lat() - pickup.lat) + Math.abs(center.lng() - pickup.lng);
    if (distance > 0.0001) {
      mapRef.current.panTo({ lat: pickup.lat, lng: pickup.lng });
    }
  }, [pickup?.lat, pickup?.lng, mapStatus]);

  if (mapStatus === 'error') {
    return (
      <div
        className={`rounded-2xl border border-zinc-200 bg-zinc-50 flex items-center justify-center text-sm text-zinc-500 ${className}`}
        role="img"
        aria-label="Map unavailable"
      >
        Map unavailable — use search below
      </div>
    );
  }

  return (
    <div className={`relative rounded-2xl overflow-hidden border border-zinc-200 ring-1 ring-zinc-100 ${className}`}>
      {/* Loading overlay */}
      {(mapStatus === 'loading' || isLoading) && (
        <div className="absolute inset-0 z-20 bg-zinc-100/80 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      )}

      {/* Map container */}
      <div ref={containerRef} className="h-full w-full" aria-label="Pickup location map" />

      {/* Center pin (fixed in center of map) */}
      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-full pointer-events-none">
        <div className={`transition-transform ${isDragging ? 'scale-110 -translate-y-2' : ''}`}>
          <svg
            width="32"
            height="44"
            viewBox="0 0 32 44"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="drop-shadow-lg"
          >
            <path
              d="M16 0C7.163 0 0 7.163 0 16c0 12 16 28 16 28s16-16 16-28c0-8.837-7.163-16-16-16z"
              fill="#059669"
            />
            <circle cx="16" cy="16" r="6" fill="white" />
          </svg>
        </div>
        {/* Pin shadow */}
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-3 h-1 bg-black/20 rounded-full blur-sm transition-all ${
            isDragging ? 'scale-150 opacity-30' : 'opacity-50'
          }`}
          style={{ top: '100%', marginTop: 2 }}
        />
      </div>

      {/* Crosshair indicator when dragging */}
      {isDragging && (
        <div className="absolute left-1/2 top-1/2 z-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <Crosshair className="h-8 w-8 text-emerald-600/30" strokeWidth={1} />
        </div>
      )}

      {/* Use my location button */}
      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={isLocating || mapStatus !== 'ready'}
        className="absolute bottom-3 right-3 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg border border-zinc-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 touch-manipulation active:scale-95 transition-all"
        aria-label="Use my current location"
      >
        {isLocating ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Navigation className="h-5 w-5" />
        )}
      </button>

      {/* Accuracy indicator overlay */}
      {accuracy != null && accuracy > 50 && mapStatus === 'ready' && (
        <div className="absolute top-3 left-3 right-14 z-20">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 shadow-sm">
            GPS accuracy: ~{Math.round(accuracy)}m — drag pin or move outside
          </div>
        </div>
      )}

      {/* Snap-to-road indicator */}
      {wasSnapped && mapStatus === 'ready' && !isDragging && (
        <div className="absolute bottom-3 left-3 z-20">
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5 text-xs text-emerald-700 shadow-sm">
            <MapPinned className="h-3 w-3" aria-hidden />
            <span>Snapped to road</span>
          </div>
        </div>
      )}
    </div>
  );
}
