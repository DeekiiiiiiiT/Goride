import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { publicGet } from '../api';
import { demoOn } from '../demo/mode';

type Station = { id: string; name: string; lat: number; lng: number; prices?: Record<string, number> };

function money(prices: Record<string, number> | undefined, grade: string): string {
  const value = prices?.[grade];
  return value == null ? '' : `J$${Number(value).toFixed(2)}`;
}

export function ExploreMap() {
  const node = useRef<HTMLDivElement>(null);
  const [grade, setGrade] = useState(sessionStorage.getItem('plug-grade') || 'e10_87');
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    const load = () => {
      setGrade(sessionStorage.getItem('plug-grade') || 'e10_87');
      void publicGet<{ stations: Station[] }>('/stations')
        .then((body) => setStations(body.stations || []))
        .catch(() => setStations([]));
    };
    load();
    window.addEventListener('plug-refresh', load);
    return () => window.removeEventListener('plug-refresh', load);
  }, []);

  useEffect(() => {
    const host = node.current;
    if (!host) return;
    const map = L.map(host, { zoomControl: false, attributionControl: true }).setView([18.0128, -76.7967], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    const markers = stations.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)).map((row) => {
      const price = money(row.prices, grade);
      const icon = L.divIcon({
        className: '',
        html: `<button type="button" data-station-id="${row.id}" style="min-height:36px;border:0;border-radius:999px;background:#fff;padding:4px 8px;font:700 12px Inter,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.15)">${row.name.replace(/^DEMO /, '')} ${price}</button>`,
        iconSize: [120, 36],
        iconAnchor: [60, 36],
      });
      return L.marker([row.lat, row.lng], { icon }).addTo(map).on('click', () => {
        sessionStorage.setItem('plug-station', row.id);
        window.location.hash = `#/stations/${row.id}`;
      });
    });
    return () => {
      markers.forEach((marker) => marker.remove());
      map.remove();
    };
  }, [stations, grade]);

  return <div ref={node} className="absolute inset-0 z-0" data-demo={demoOn() ? '1' : '0'} />;
}

export function PinMap() {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = node.current;
    if (!host) return;
    const startLat = Number(sessionStorage.getItem('plug-pin-lat') || sessionStorage.getItem('plug-lat') || 18.017);
    const startLng = Number(sessionStorage.getItem('plug-pin-lng') || sessionStorage.getItem('plug-lng') || -76.8);
    const map = L.map(host, { zoomControl: false }).setView([startLat, startLng], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    const save = () => {
      const center = map.getCenter();
      sessionStorage.setItem('plug-pin-lat', String(center.lat));
      sessionStorage.setItem('plug-pin-lng', String(center.lng));
    };
    map.on('moveend', save);
    save();
    if (demoOn()) sessionStorage.setItem('plug-accuracy', '12');
    else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          sessionStorage.setItem('plug-accuracy', String(pos.coords.accuracy));
          sessionStorage.setItem('plug-lat', String(pos.coords.latitude));
          sessionStorage.setItem('plug-lng', String(pos.coords.longitude));
          sessionStorage.setItem('plug-pin-lat', String(pos.coords.latitude));
          sessionStorage.setItem('plug-pin-lng', String(pos.coords.longitude));
          map.setView([pos.coords.latitude, pos.coords.longitude], 17);
        },
        () => sessionStorage.setItem('plug-accuracy', '999'),
        { enableHighAccuracy: true },
      );
    }
    return () => { map.remove(); };
  }, []);
  return <div ref={node} className="absolute inset-0 z-0" />;
}
