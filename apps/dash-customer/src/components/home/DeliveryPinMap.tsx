import { useEffect, useRef, useState, type ReactNode } from 'react';
import { loadPartnerMapsApi } from '@roam/location';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { isValidLatLng, osmEmbedUrl } from '@/lib/deliveryPinMap';

type Props = {
  lat?: number | null;
  lng?: number | null;
  className?: string;
  emptyLabel?: string;
  overlay?: ReactNode;
};

export function DeliveryPinMap({
  lat,
  lng,
  className = '',
  emptyLabel = 'Drop a pin for this address',
  overlay,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [status, setStatus] = useState<'empty' | 'loading' | 'ready' | 'osm'>('empty');
  const hasPin = isValidLatLng(lat, lng);

  useEffect(() => {
    if (!hasPin) {
      mapRef.current = null;
      markerRef.current = null;
      setStatus('empty');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    void (async () => {
      try {
        await loadPartnerMapsApi();
        if (cancelled || !containerRef.current) return;

        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        const position = { lat: lat!, lng: lng! };

        if (!mapRef.current) {
          mapRef.current = new Map(containerRef.current, {
            center: position,
            zoom: 16,
            disableDefaultUI: true,
            gestureHandling: 'none',
            clickableIcons: false,
            keyboardShortcuts: false,
          });
        } else {
          mapRef.current.setCenter(position);
        }

        if (!markerRef.current) {
          markerRef.current = new google.maps.Marker({
            map: mapRef.current,
            position,
            title: 'Delivery pin',
          });
        } else {
          markerRef.current.setPosition(position);
          markerRef.current.setMap(mapRef.current);
        }

        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('osm');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasPin, lat, lng]);

  return (
    <div className={`relative overflow-hidden bg-surface-container ${className}`}>
      {hasPin && status !== 'osm' && <div ref={containerRef} className="absolute inset-0" />}
      {hasPin && status === 'osm' && (
        <iframe
          title="Delivery map"
          className="absolute inset-0 h-full w-full border-0"
          src={osmEmbedUrl(lat!, lng!)}
        />
      )}
      {hasPin && status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {!hasPin && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <MaterialIcon name="location_on" className="text-3xl text-primary" filled />
          <p className="text-body-sm text-on-surface-variant">{emptyLabel}</p>
        </div>
      )}
      {overlay}
    </div>
  );
}
