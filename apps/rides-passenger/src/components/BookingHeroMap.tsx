import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isNativeCapacitorPlatform } from '@roam/types';
import { loadGoogleMapsApi } from '@/services/locationService';
import { TripRouteMap } from '@/components/TripRouteMap';
import { LeafletPickupPreviewMap } from '@/components/maps/LeafletPickupMap';

const JAMAICA_CENTER = { lat: 18.1096, lng: -77.2975 };

type LatLng = { lat: number; lng: number };

type Props = {
  pickup: LatLng | null;
  dropoff: LatLng | null;
  encodedPolyline?: string | null;
  quoteLoading?: boolean;
};

/** Full-width hero map: route when both points set, otherwise pickup preview or placeholder. */
export function BookingHeroMap({
  pickup,
  dropoff,
  encodedPolyline,
  quoteLoading = false,
}: Props) {
  if (pickup && dropoff) {
    return (
      <div className="relative h-full w-full bg-zinc-200">
        <TripRouteMap
          pickup={pickup}
          dropoff={dropoff}
          encodedPolyline={encodedPolyline}
          variant="hero"
        />
        {quoteLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-md text-sm font-medium text-zinc-700">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
              Updating route…
            </div>
          </div>
        )}
      </div>
    );
  }

  return <PickupPreviewMap pickup={pickup} />;
}

function PickupPreviewMap({ pickup }: { pickup: LatLng | null }) {
  if (isNativeCapacitorPlatform()) {
    return <LeafletPickupPreviewMap pickup={pickup} />;
  }
  return <GooglePickupPreviewMap pickup={pickup} />;
}

function GooglePickupPreviewMap({ pickup }: { pickup: LatLng | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadGoogleMapsApi();
        if (cancelled || !containerRef.current) return;

        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        if (cancelled || !containerRef.current) return;

        const center = pickup ?? JAMAICA_CENTER;
        const map = new Map(containerRef.current, {
          center,
          zoom: pickup ? 15 : 9,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
        });
        mapRef.current = map;

        if (pickup) {
          markerRef.current = new google.maps.Marker({
            map,
            position: center,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: '#059669',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          });
        }

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      mapRef.current = null;
    };
  }, [pickup?.lat, pickup?.lng]);

  useEffect(() => {
    if (!mapRef.current || !pickup || status !== 'ready') return;
    mapRef.current.panTo(pickup);
    mapRef.current.setZoom(15);
    markerRef.current?.setPosition(pickup);
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
        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-4">
          <p className="rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-zinc-600 shadow-md">
            Add pickup and destination below
          </p>
        </div>
      )}
    </div>
  );
}
