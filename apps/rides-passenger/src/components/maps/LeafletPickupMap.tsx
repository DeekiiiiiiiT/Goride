import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Loader2, MapPinned, Navigation } from 'lucide-react';
import { isValidMapCoord } from '@/lib/mapCoords';
import { ensureLeafletCss } from '@/lib/leafletSetup';
import {
  getCurrentPositionWithAccuracy,
  resolveAddressFromCoordinates,
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
  enableSnapToRoad?: boolean;
  className?: string;
};

/** Capacitor-safe pickup pin selector using OpenStreetMap tiles. */
export function LeafletPickupMapSelector({
  pickup,
  accuracy,
  onPickupChange,
  isLoading = false,
  enableSnapToRoad = true,
  className = 'h-56',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const reverseGeocodeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isLocating, setIsLocating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [wasSnapped, setWasSnapped] = useState(false);

  const reverseGeocodeCenter = useCallback(
    (lat: number, lng: number) => {
      if (reverseGeocodeTimeoutRef.current) {
        clearTimeout(reverseGeocodeTimeoutRef.current);
      }
      reverseGeocodeTimeoutRef.current = setTimeout(() => {
        void (async () => {
          let nextLat = lat;
          let nextLng = lng;
          let snapped = false;

          if (enableSnapToRoad) {
            try {
              const snappedCoords = await snapToNearestRoad(nextLat, nextLng);
              if (snappedCoords) {
                const distMoved =
                  Math.abs(nextLat - snappedCoords.lat) + Math.abs(nextLng - snappedCoords.lng);
                if (distMoved > 0.00001 && distMoved < 0.002) {
                  nextLat = snappedCoords.lat;
                  nextLng = snappedCoords.lng;
                  snapped = true;
                  mapRef.current?.setView([nextLat, nextLng], mapRef.current.getZoom());
                }
              }
            } catch {
              /* snap optional */
            }
          }

          setWasSnapped(snapped);

          try {
            const address = await resolveAddressFromCoordinates(nextLat, nextLng);
            onPickupChange({ lat: nextLat, lng: nextLng, address, accuracyMeters: accuracy ?? undefined });
          } catch {
            onPickupChange({
              lat: nextLat,
              lng: nextLng,
              address: `${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`,
              accuracyMeters: accuracy ?? undefined,
            });
          }
        })();
      }, 500);
    },
    [accuracy, enableSnapToRoad, onPickupChange],
  );

  useEffect(() => {
    ensureLeafletCss();
    let cancelled = false;

    if (!containerRef.current) return;

    try {
      const initialCenter = pickup ?? JAMAICA_CENTER;
      const map = L.map(containerRef.current, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: pickup ? ZOOM_ON_GPS : DEFAULT_ZOOM,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      accuracyCircleRef.current = L.circle([initialCenter.lat, initialCenter.lng], {
        radius: accuracy ?? 0,
        color: '#059669',
        fillColor: '#059669',
        fillOpacity: 0.15,
        weight: 1,
        opacity: 0.4,
      });
      if (accuracy && accuracy > 0) {
        accuracyCircleRef.current.addTo(map);
      }

      map.on('movestart', () => setIsDragging(true));
      map.on('moveend', () => {
        setIsDragging(false);
        const c = map.getCenter();
        reverseGeocodeCenter(c.lat, c.lng);
      });

      mapRef.current = map;
      if (!cancelled) setMapStatus('ready');
    } catch {
      if (!cancelled) setMapStatus('error');
    }

    return () => {
      cancelled = true;
      if (reverseGeocodeTimeoutRef.current) clearTimeout(reverseGeocodeTimeoutRef.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const circle = accuracyCircleRef.current;
    const map = mapRef.current;
    if (!circle || !map || !pickup) return;

    if (accuracy && accuracy > 0) {
      circle.setLatLng([pickup.lat, pickup.lng]);
      circle.setRadius(accuracy);
      if (!map.hasLayer(circle)) circle.addTo(map);
    } else if (map.hasLayer(circle)) {
      map.removeLayer(circle);
    }
  }, [accuracy, pickup?.lat, pickup?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickup || mapStatus !== 'ready') return;
    const c = map.getCenter();
    const distance = Math.abs(c.lat - pickup.lat) + Math.abs(c.lng - pickup.lng);
    if (distance > 0.0001) {
      map.setView([pickup.lat, pickup.lng], Math.max(map.getZoom(), ZOOM_ON_GPS));
    }
  }, [pickup?.lat, pickup?.lng, mapStatus]);

  const handleUseMyLocation = useCallback(async () => {
    setIsLocating(true);
    try {
      const position: GeoPositionWithAccuracy = await getCurrentPositionWithAccuracy();
      mapRef.current?.setView([position.lat, position.lng], ZOOM_ON_GPS);
    } catch (e) {
      console.error('Location error:', e);
    } finally {
      setIsLocating(false);
    }
  }, []);

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
    <div
      className={`relative rounded-2xl overflow-hidden border border-zinc-200 ring-1 ring-zinc-100 ${className}`}
    >
      {(mapStatus === 'loading' || isLoading) && (
        <div className="absolute inset-0 z-20 bg-zinc-100/80 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      )}

      <div ref={containerRef} className="h-full w-full" aria-label="Pickup location map" />

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
        <div
          className={`absolute left-1/2 -translate-x-1/2 w-3 h-1 bg-black/20 rounded-full blur-sm transition-all ${
            isDragging ? 'scale-150 opacity-30' : 'opacity-50'
          }`}
          style={{ top: '100%', marginTop: 2 }}
        />
      </div>

      {isDragging && (
        <div className="absolute left-1/2 top-1/2 z-[5] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <Crosshair className="h-8 w-8 text-emerald-600/30" strokeWidth={1} />
        </div>
      )}

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

      {accuracy != null && accuracy > 50 && mapStatus === 'ready' && (
        <div className="absolute top-3 left-3 right-14 z-20">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 shadow-sm">
            GPS accuracy: ~{Math.round(accuracy)}m — drag pin or move outside
          </div>
        </div>
      )}

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

/** Single-point preview for booking hero. */
export function LeafletPickupPreviewMap({
  pickup,
}: {
  pickup: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    ensureLeafletCss();
    let cancelled = false;
    if (!containerRef.current) return;

    try {
      const center = pickup ?? JAMAICA_CENTER;
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: pickup ? 15 : 9,
        zoomControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      if (pickup && isValidMapCoord(pickup.lat, pickup.lng)) {
        markerRef.current = L.circleMarker([pickup.lat, pickup.lng], {
          radius: 9,
          color: '#ffffff',
          weight: 2,
          fillColor: '#059669',
          fillOpacity: 1,
        }).addTo(map);
      }

      mapRef.current = map;
      if (!cancelled) setStatus('ready');
    } catch {
      if (!cancelled) setStatus('error');
    }

    return () => {
      cancelled = true;
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pickup || status !== 'ready') return;
    map.setView([pickup.lat, pickup.lng], 15);
    if (markerRef.current) {
      markerRef.current.setLatLng([pickup.lat, pickup.lng]);
    } else {
      markerRef.current = L.circleMarker([pickup.lat, pickup.lng], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: '#059669',
        fillOpacity: 1,
      }).addTo(map);
    }
  }, [pickup?.lat, pickup?.lng, status]);

  if (status === 'error') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-sm text-zinc-500">
        Map unavailable
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-zinc-200">
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 bg-zinc-100 animate-pulse" aria-hidden />
      )}
      <div ref={containerRef} className="h-full w-full" aria-label="Booking map preview" />
      {!pickup && status === 'ready' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4 z-[400]">
          <p className="rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-zinc-600 shadow-md">
            Add pickup and destination below
          </p>
        </div>
      )}
    </div>
  );
}
