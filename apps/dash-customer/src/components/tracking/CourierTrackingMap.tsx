import { useEffect, useRef, useState } from 'react';
import { loadPartnerMapsApi } from '@roam/location';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { TrackingOrder } from '@/lib/trackingContent';
import { TRACKING_MAP_IMAGES } from '@/lib/trackingContent';

type Props = {
  order: TrackingOrder;
  className?: string;
  /** When true, prefer courier GPS for center; otherwise wait-state schematic. */
  preferCourier?: boolean;
};

/**
 * Live courier map via Google Maps (same key path as dash-merchant: GET /delivery/maps-config).
 * Falls back to schematic when GPS or Maps API is unavailable.
 */
export function CourierTrackingMap({ order, className = '', preferCourier = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [mapStatus, setMapStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const hasGps =
    order.courierLat != null &&
    order.courierLng != null &&
    Number.isFinite(order.courierLat) &&
    Number.isFinite(order.courierLng);

  useEffect(() => {
    if (!hasGps || !preferCourier) {
      setMapStatus('idle');
      return;
    }

    let cancelled = false;
    setMapStatus('loading');

    void (async () => {
      try {
        await loadPartnerMapsApi();
        if (cancelled || !containerRef.current) return;

        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        const position = { lat: order.courierLat!, lng: order.courierLng! };

        if (!mapRef.current) {
          mapRef.current = new Map(containerRef.current, {
            center: position,
            zoom: 15,
            disableDefaultUI: true,
            zoomControl: false,
            gestureHandling: 'cooperative',
            clickableIcons: false,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          });
        } else {
          mapRef.current.setCenter(position);
        }

        if (!markerRef.current) {
          markerRef.current = new google.maps.Marker({
            map: mapRef.current,
            position,
            title: order.courier.name || 'Courier',
            zIndex: 10,
          });
        } else {
          markerRef.current.setPosition(position);
          markerRef.current.setMap(mapRef.current);
        }

        if (!cancelled) setMapStatus('ready');
      } catch {
        if (!cancelled) setMapStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    hasGps,
    preferCourier,
    order.courierLat,
    order.courierLng,
    order.courier.name,
  ]);

  // Tear down map instance when leaving GPS mode
  useEffect(() => {
    if (hasGps && preferCourier) return;
    markerRef.current?.setMap(null);
    markerRef.current = null;
    mapRef.current = null;
  }, [hasGps, preferCourier]);

  if (hasGps && preferCourier) {
    return (
      <div className={`relative overflow-hidden bg-surface-container ${className}`}>
        {mapStatus !== 'error' && (
          <div ref={containerRef} className="absolute inset-0" />
        )}
        {mapStatus === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-container">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {mapStatus === 'error' && (
          <SchematicFallback order={order} hasGps showMapsHint />
        )}
        {mapStatus === 'ready' && (
          <div className="absolute bottom-3 left-3 right-3 z-20 flex justify-center pointer-events-none">
            <span className="rounded-full bg-surface/95 px-3 py-1 text-label-sm shadow">
              Live courier location
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-surface-container ${className}`}>
      <SchematicFallback order={order} hasGps={false} />
    </div>
  );
}

function SchematicFallback({
  order,
  hasGps,
  showMapsHint = false,
}: {
  order: TrackingOrder;
  hasGps: boolean;
  showMapsHint?: boolean;
}) {
  const markerStyle = hasGps
    ? projectApproxMarker(order.courierLat!, order.courierLng!)
    : { top: '45%', left: '50%' };

  return (
    <>
      <div
        className="absolute inset-0 bg-cover bg-center opacity-80"
        style={{ backgroundImage: `url('${TRACKING_MAP_IMAGES.courierAssigned}')` }}
      />
      <div
        className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
        style={markerStyle}
      >
        <div className="rounded-full border-2 border-primary-container bg-surface p-1 shadow-lg tracking-pulse-animation">
          {order.courier.avatar ? (
            <img src={order.courier.avatar} alt="Courier" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-container/20 text-primary">
              <MaterialIcon name="two_wheeler" className="text-[20px]" />
            </div>
          )}
        </div>
      </div>
      {showMapsHint && (
        <div className="absolute top-3 left-0 right-0 z-30 flex justify-center px-4 pointer-events-none">
          <span className="rounded-full bg-surface/95 px-3 py-1 text-label-sm text-on-surface-variant shadow">
            Map unavailable — showing approximate location
          </span>
        </div>
      )}
      {!hasGps && !showMapsHint && (
        <div className="absolute top-3 left-0 right-0 z-30 flex justify-center px-4 pointer-events-none">
          <span className="rounded-full bg-surface/95 px-3 py-1 text-label-sm text-on-surface-variant shadow">
            Waiting for courier GPS
          </span>
        </div>
      )}
    </>
  );
}

/** Rough Jamaica-centered projection for schematic fallback (Kingston-ish bounds). */
function projectApproxMarker(lat: number, lng: number): { top: string; left: string } {
  const latMin = 17.9;
  const latMax = 18.15;
  const lngMin = -77.0;
  const lngMax = -76.7;
  const y = 1 - (lat - latMin) / (latMax - latMin);
  const x = (lng - lngMin) / (lngMax - lngMin);
  const top = `${Math.min(85, Math.max(15, y * 100))}%`;
  const left = `${Math.min(85, Math.max(15, x * 100))}%`;
  return { top, left };
}
