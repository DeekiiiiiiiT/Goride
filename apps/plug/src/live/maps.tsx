import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import { publicGet } from '../api';
import { getPlugRuntime } from '../shell/click';

type Station = { id: string; name: string; brand?: string; lat: number; lng: number; prices?: Record<string, number> };

function pinPrice(prices: Record<string, number> | undefined, grade: string): string {
  const value = prices?.[grade];
  return value == null || !Number.isFinite(Number(value)) ? '' : String(Math.round(Number(value)));
}

function pinColor(name: string, brand?: string): string {
  const blob = `${brand || ''} ${name}`.toLowerCase();
  if (blob.includes('rubis')) return '#c8102e';
  if (blob.includes('total')) return '#d1001c';
  if (blob.includes('texaco')) return '#e10600';
  if (blob.includes('fesco')) return '#c8960c';
  if (blob.includes('petcom')) return '#0b7a3b';
  if (blob.includes('unipet')) return '#1d4e89';
  return '#a33900';
}

function listenRecenter(map: L.Map, zoom: number) {
  const recenter = () => {
    const lat = Number(sessionStorage.getItem('plug-lat'));
    const lng = Number(sessionStorage.getItem('plug-lng'));
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], zoom);
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      sessionStorage.setItem('plug-lat', String(pos.coords.latitude));
      sessionStorage.setItem('plug-lng', String(pos.coords.longitude));
      map.setView([pos.coords.latitude, pos.coords.longitude], zoom);
    });
  };
  window.addEventListener('plug-recenter', recenter);
  return () => window.removeEventListener('plug-recenter', recenter);
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
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 56,
      disableClusteringAtZoom: 17,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (cluster) => L.divIcon({
        className: '',
        html: `<span style="display:flex;width:44px;height:44px;border-radius:999px;background:#a33900;color:#fff;align-items:center;justify-content:center;font:700 13px Inter,sans-serif;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.28)">${cluster.getChildCount()}</span>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }),
    });
    stations.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng)).forEach((row) => {
      const price = pinPrice(row.prices, grade);
      const color = pinColor(row.name, row.brand);
      const label = row.name.replace(/[<>&"]/g, '');
      const icon = L.divIcon({
        className: '',
        html: `<button type="button" aria-label="${label}" data-station-id="${row.id}" style="width:44px;height:44px;border:2px solid #fff;border-radius:999px;background:${color};color:#fff;padding:0;font:700 11px Inter,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.28)">${price}</button>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      L.marker([row.lat, row.lng], { icon }).on('click', () => {
        sessionStorage.setItem('plug-station', row.id);
        getPlugRuntime().go(`/stations/${row.id}`);
      }).addTo(group);
    });
    group.addTo(map);
    const stopRecenter = listenRecenter(map, map.getZoom());
    return () => {
      stopRecenter();
      group.remove();
      map.remove();
    };
  }, [stations, grade]);

  return <div ref={node} className="absolute inset-0 z-0" />;
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
    if (navigator.geolocation) {
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
    const stopRecenter = listenRecenter(map, 17);
    return () => {
      stopRecenter();
      map.remove();
    };
  }, []);
  return <div ref={node} className="absolute inset-0 z-0" />;
}
