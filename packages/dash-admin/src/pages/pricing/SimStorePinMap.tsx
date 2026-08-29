import React, { useEffect, useRef, useState } from 'react';
import { loadPartnerMapsApi } from '@roam/location';

type Props = {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
};

/** Compact click/drag pin map for the standalone pricing calculator. */
export function SimStorePinMap({ lat, lng, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadPartnerMapsApi();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Maps failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const center = {
      lat: Number.isFinite(lat) ? lat : 18.015,
      lng: Number.isFinite(lng) ? lng : -76.955,
    };
    const map = new google.maps.Map(containerRef.current, {
      center,
      zoom: 13,
      mapTypeId: 'roadmap',
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      gestureHandling: 'greedy',
    });
    mapRef.current = map;

    const marker = new google.maps.Marker({
      map,
      position: center,
      draggable: true,
      title: 'Store pin',
    });
    markerRef.current = marker;

    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      if (!pos) return;
      onChangeRef.current(pos.lat(), pos.lng());
    });

    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      marker.setPosition(e.latLng);
      onChangeRef.current(e.latLng.lat(), e.latLng.lng());
    });
  }, [ready]);

  // Sync external lat/lng → marker (address search / number fields)
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = { lat, lng };
    marker.setPosition(pos);
    map.panTo(pos);
  }, [lat, lng]);

  if (error) {
    return (
      <p className="text-xs text-rose-300 rounded-lg border border-rose-900/50 bg-rose-950/30 px-3 py-2">
        Map unavailable — use address search or lat/lng. ({error})
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className="h-48 w-full rounded-lg border border-slate-700 overflow-hidden bg-slate-950"
      />
      <p className="text-xs text-slate-500">Click the map or drag the pin to set the store location.</p>
    </div>
  );
}
