import React, { useEffect, useRef, useState } from 'react';
import { isNativeCapacitorPlatform } from '@roam/types';
import { driverVehicleMarkerIcon, dropoffMarkerIcon, riderPickupMarkerIcon } from '@/lib/mapMarkerIcons';
import { loadGoogleMapsApi } from '@/services/locationService';
import { LeafletRouteMap } from '@/components/maps/LeafletRouteMap';

type LatLng = { lat: number; lng: number };

type Props = {
  pickup: LatLng;
  dropoff: LatLng;
  encodedPolyline?: string | null;
  driverLocation?: LatLng | null;
  driverHeading?: number | null;
  statusLabel?: string;
  /** Full-bleed map behind bottom sheet (live ride screen). */
  variant?: 'default' | 'live' | 'trip';
  /** Extra bottom padding when fitting bounds (px). */
  sheetInsetPx?: number;
};

export function LiveRideMap(props: Props) {
  if (isNativeCapacitorPlatform()) {
    const isLive = props.variant === 'live' || props.variant === 'trip';
    const map = (
      <LeafletRouteMap
        pickup={props.pickup}
        dropoff={props.dropoff}
        encodedPolyline={props.encodedPolyline}
        driverLocation={props.driverLocation}
        variant={props.variant === 'trip' ? 'trip' : isLive ? 'live' : 'card'}
        sheetInsetPx={props.sheetInsetPx}
        className={isLive ? 'live-ride-map__canvas h-full w-full' : 'h-full w-full'}
        fallbackClassName={
          isLive
            ? 'live-ride-map__fallback'
            : 'h-[38dvh] min-h-[180px] w-full flex items-center justify-center bg-zinc-100 text-sm text-zinc-500 rounded-b-3xl'
        }
      />
    );
    return (
      <div
        className={
          isLive
            ? 'h-full w-full overflow-hidden'
            : 'relative h-[38dvh] min-h-[180px] w-full overflow-hidden rounded-b-3xl'
        }
      >
        {!isLive && props.statusLabel && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-zinc-800 shadow-md border border-zinc-200/80">
            {props.statusLabel}
          </div>
        )}
        {map}
      </div>
    );
  }
  return <GoogleLiveRideMap {...props} />;
}

function GoogleLiveRideMap({
  pickup,
  dropoff,
  encodedPolyline,
  driverLocation,
  driverHeading,
  statusLabel,
  variant = 'default',
  sheetInsetPx = 280,
}: Props) {
  const isLive = variant === 'live' || variant === 'trip';
  const isTrip = variant === 'trip';
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const markers: google.maps.Marker[] = [];
    let polyline: google.maps.Polyline | null = null;

    void (async () => {
      try {
        await loadGoogleMapsApi();
        if (cancelled || !containerRef.current) return;

        const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
        const geometryLib = (await google.maps.importLibrary('geometry')) as google.maps.GeometryLibrary;

        const map = new Map(containerRef.current, {
          disableDefaultUI: true,
          zoomControl: !isLive,
          gestureHandling: 'cooperative',
          clickableIcons: false,
        });
        mapRef.current = map;

        const pickupLatLng = new google.maps.LatLng(pickup.lat, pickup.lng);
        const dropoffLatLng = new google.maps.LatLng(dropoff.lat, dropoff.lng);

        markers.push(
          new google.maps.Marker({
            map,
            position: pickupLatLng,
            title: 'Pickup',
            icon: riderPickupMarkerIcon(),
            zIndex: 2,
          }),
          new google.maps.Marker({
            map,
            position: dropoffLatLng,
            title: 'Drop-off',
            icon: dropoffMarkerIcon(),
            zIndex: 2,
          }),
        );

        const bounds = new google.maps.LatLngBounds();
        bounds.extend(pickupLatLng);
        bounds.extend(dropoffLatLng);

        if (encodedPolyline) {
          const path = geometryLib.encoding.decodePath(encodedPolyline);
          polyline = new google.maps.Polyline({
            map,
            path,
            strokeColor: isLive ? '#2563eb' : '#059669',
            strokeOpacity: isTrip ? 0.88 : isLive ? 0.9 : 0.85,
            strokeWeight: isTrip ? 6 : isLive ? 5 : 4,
          });
          for (const p of path) bounds.extend(p);
        }

        if (driverLocation) {
          bounds.extend(new google.maps.LatLng(driverLocation.lat, driverLocation.lng));
        }

        const fitPadding = isLive
          ? {
              top: isTrip ? 88 : 72,
              right: 32,
              bottom: sheetInsetPx,
              left: 32,
            }
          : { top: 48, right: 28, bottom: 28, left: 28 };
        map.fitBounds(bounds, fitPadding);
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      for (const m of markers) m.setMap(null);
      polyline?.setMap(null);
      driverMarkerRef.current?.setMap(null);
      driverMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, encodedPolyline, isLive, isTrip, sheetInsetPx]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready' || !isLive || !driverLocation) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend(new google.maps.LatLng(pickup.lat, pickup.lng));
    bounds.extend(new google.maps.LatLng(dropoff.lat, dropoff.lng));
    bounds.extend(new google.maps.LatLng(driverLocation.lat, driverLocation.lng));
    map.fitBounds(bounds, { top: 72, right: 32, bottom: sheetInsetPx, left: 32 });
  }, [
    driverLocation?.lat,
    driverLocation?.lng,
    status,
    isLive,
    sheetInsetPx,
    pickup.lat,
    pickup.lng,
    dropoff.lat,
    dropoff.lng,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== 'ready') return;

    if (!driverLocation) {
      driverMarkerRef.current?.setMap(null);
      driverMarkerRef.current = null;
      return;
    }

    const pos = new google.maps.LatLng(driverLocation.lat, driverLocation.lng);
    const rotation = driverHeading ?? 0;

    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new google.maps.Marker({
        map,
        position: pos,
        title: 'Driver',
        icon: driverVehicleMarkerIcon(rotation),
        zIndex: 3,
      });
    } else {
      driverMarkerRef.current.setPosition(pos);
      driverMarkerRef.current.setIcon(driverVehicleMarkerIcon(rotation));
    }
  }, [driverLocation?.lat, driverLocation?.lng, driverHeading, status]);

  if (status === 'error') {
    return (
      <div
        className={
          isLive
            ? 'live-ride-map__fallback'
            : 'h-[38dvh] min-h-[180px] w-full flex items-center justify-center bg-zinc-100 text-sm text-zinc-500 rounded-b-3xl'
        }
        role="img"
        aria-label="Live map unavailable"
      >
        Map unavailable
      </div>
    );
  }

  return (
    <div
      className={
        isLive
          ? 'h-full w-full overflow-hidden'
          : 'relative h-[38dvh] min-h-[180px] w-full overflow-hidden rounded-b-3xl'
      }
    >
      {status === 'loading' && (
        <div
          className={
            isLive
              ? 'live-ride-map__shimmer'
              : 'absolute inset-0 z-10 bg-zinc-100 animate-pulse'
          }
          aria-hidden
        />
      )}
      {!isLive && statusLabel && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-full bg-white/95 px-4 py-1.5 text-xs font-semibold text-zinc-800 shadow-md border border-zinc-200/80">
          {statusLabel}
        </div>
      )}
      <div
        ref={containerRef}
        className={isLive ? 'live-ride-map__canvas' : 'h-full w-full'}
        aria-label="Live ride map"
      />
    </div>
  );
}
