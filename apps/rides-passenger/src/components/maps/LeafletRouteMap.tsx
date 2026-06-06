import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { decodeEncodedPolyline } from '@/lib/decodePolyline';
import { isValidMapCoord } from '@/lib/mapCoords';
import {
  driverDivIcon,
  dropoffDivIcon,
  ensureLeafletCss,
  pickupDivIcon,
} from '@/lib/leafletSetup';

type LatLng = { lat: number; lng: number };

export type LeafletRouteMapProps = {
  pickup: LatLng;
  dropoff: LatLng;
  encodedPolyline?: string | null;
  driverLocation?: LatLng | null;
  variant?: 'hero' | 'card' | 'live' | 'trip' | 'summary';
  sheetInsetPx?: number;
  interactive?: boolean;
  routeColor?: string;
  routeWeight?: number;
  className?: string;
  fallbackClassName?: string;
};

const JAMAICA_CENTER: LatLng = { lat: 18.1096, lng: -77.2975 };

function fitPadding(
  variant: LeafletRouteMapProps['variant'],
  sheetInsetPx: number,
): L.FitBoundsOptions['padding'] {
  switch (variant) {
    case 'hero':
      return [52, 36];
    case 'live':
      return [72, 32];
    case 'trip':
      return [88, 32];
    case 'summary':
      return [24, 24];
    default:
      return [28, 28];
  }
}

function bottomPadding(variant: LeafletRouteMapProps['variant'], sheetInsetPx: number): number {
  if (variant === 'live' || variant === 'trip') return sheetInsetPx;
  if (variant === 'hero') return 72;
  return 28;
}

export function LeafletRouteMap({
  pickup,
  dropoff,
  encodedPolyline,
  driverLocation,
  variant = 'card',
  sheetInsetPx = 280,
  interactive = true,
  routeColor,
  routeWeight,
  className = 'h-full w-full',
  fallbackClassName,
}: LeafletRouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const strokeColor =
    routeColor ??
    (variant === 'summary' ? '#004ac6' : variant === 'live' || variant === 'trip' ? '#2563eb' : '#059669');
  const strokeWeight =
    routeWeight ?? (variant === 'trip' ? 6 : variant === 'live' ? 5 : variant === 'summary' ? 5 : 4);

  useEffect(() => {
    ensureLeafletCss();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!containerRef.current) return;

    try {
      const center = isValidMapCoord(pickup.lat, pickup.lng) ? pickup : JAMAICA_CENTER;
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: 12,
        zoomControl: interactive && variant !== 'summary',
        dragging: interactive,
        scrollWheelZoom: interactive,
        doubleClickZoom: interactive,
        touchZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);

      if (!cancelled) setStatus('ready');
    } catch {
      if (!cancelled) setStatus('error');
    }

    return () => {
      cancelled = true;
      layersRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [interactive, variant]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current;
    if (!map || !group || status !== 'ready') return;

    group.clearLayers();

    const bounds = L.latLngBounds([]);
    let hasBounds = false;

    const extend = (lat: number, lng: number) => {
      if (!isValidMapCoord(lat, lng)) return;
      bounds.extend([lat, lng]);
      hasBounds = true;
    };

    extend(pickup.lat, pickup.lng);
    extend(dropoff.lat, dropoff.lng);

    let routePoints: Array<[number, number]> = [];
    if (encodedPolyline) {
      routePoints = decodeEncodedPolyline(encodedPolyline)
        .filter((p) => isValidMapCoord(p.lat, p.lng))
        .map((p) => [p.lat, p.lng] as [number, number]);
    }

    if (routePoints.length > 1) {
      L.polyline(routePoints, {
        color: strokeColor,
        weight: strokeWeight,
        opacity: 0.9,
      }).addTo(group);
      for (const [lat, lng] of routePoints) extend(lat, lng);
    } else if (isValidMapCoord(pickup.lat, pickup.lng) && isValidMapCoord(dropoff.lat, dropoff.lng)) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [dropoff.lat, dropoff.lng],
        ],
        { color: '#a1a1aa', weight: 3, opacity: 0.8, dashArray: '6 4' },
      ).addTo(group);
    }

    if (isValidMapCoord(pickup.lat, pickup.lng)) {
      L.marker([pickup.lat, pickup.lng], { icon: pickupDivIcon() }).addTo(group);
    }
    if (isValidMapCoord(dropoff.lat, dropoff.lng)) {
      L.marker([dropoff.lat, dropoff.lng], { icon: dropoffDivIcon() }).addTo(group);
    }
    if (driverLocation && isValidMapCoord(driverLocation.lat, driverLocation.lng)) {
      L.marker([driverLocation.lat, driverLocation.lng], { icon: driverDivIcon() }).addTo(group);
      extend(driverLocation.lat, driverLocation.lng);
    }

    if (hasBounds && bounds.isValid()) {
      const pad = fitPadding(variant, sheetInsetPx);
      const topSide = Array.isArray(pad) ? pad[0] : 28;
      const side = Array.isArray(pad) ? pad[1] : 28;
      map.fitBounds(bounds, {
        paddingTopLeft: [side, topSide],
        paddingBottomRight: [side, bottomPadding(variant, sheetInsetPx)],
      });
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [
    pickup.lat,
    pickup.lng,
    dropoff.lat,
    dropoff.lng,
    encodedPolyline,
    driverLocation?.lat,
    driverLocation?.lng,
    status,
    variant,
    sheetInsetPx,
    strokeColor,
    strokeWeight,
  ]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !containerRef.current) return;
    const map = mapRef.current;
    const node = containerRef.current;
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => map.invalidateSize());
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [status]);

  if (status === 'error') {
    return (
      <div
        className={
          fallbackClassName ??
          'flex h-full w-full items-center justify-center bg-zinc-100 text-sm text-zinc-500'
        }
        role="img"
        aria-label="Route map unavailable"
      >
        Map unavailable
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 z-10 bg-zinc-100 animate-pulse" aria-hidden />
      )}
      <div ref={containerRef} className="h-full w-full" aria-label="Trip route map" />
    </div>
  );
}
