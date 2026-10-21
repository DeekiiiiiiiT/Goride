import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

type Cell = { lat: number; lng: number; count: number };
type Pair = { from: string; to: string; trips: number };

export function TripAnalyticsGeo({
  geo,
  onZone,
}: {
  geo?: {
    gpsTrips?: number;
    completedTrips?: number;
    cells?: Cell[];
    dropoffCells?: Cell[];
    areas?: { area: string; trips: number }[];
    routes?: Pair[];
    matrix?: Pair[];
    deadhead?: { trips?: number; km?: number; label?: string };
  };
  onZone: (zone: string) => void;
}) {
  const [mode, setMode] = useState<'pickup' | 'dropoff'>('pickup');
  const mapRef = useRef<HTMLDivElement>(null);
  const gps = geo?.gpsTrips ?? 0;
  const total = geo?.completedTrips ?? 0;
  const cells = mode === 'pickup' ? geo?.cells || [] : geo?.dropoffCells || [];
  const zones = [...new Set((geo?.matrix || []).map((row) => row.from))].slice(0, 8);
  const matrix = geo?.matrix || [];

  useEffect(() => {
    let map: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      if (!mapRef.current || !cells.length) return;
      const leaflet = await import('leaflet');
      await import('leaflet.heat');
      if (cancelled || !mapRef.current) return;
      const L = (leaflet as unknown as { default?: { map: Function; tileLayer: Function; heatLayer: Function } }).default ?? (leaflet as unknown as { map: Function; tileLayer: Function; heatLayer: Function });
      const instance = L.map(mapRef.current).setView([18.1096, -77.2975], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
      }).addTo(instance);
      const heat = (L as unknown as { heatLayer: (points: [number, number, number][], options: { radius: number }) => { addTo: (m: unknown) => void } })
        .heatLayer(cells.map((cell) => [Number(cell.lat), Number(cell.lng), Number(cell.count)]), { radius: 18 });
      heat.addTo(instance);
      map = instance;
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [mode, cells.map((cell) => `${cell.lat}:${cell.lng}:${cell.count}`).join('|')]);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">Where trips happen</h3>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">GPS on {gps} of {total}</span>
      </div>
      <div className="flex gap-2">
        <button type="button" className={`min-h-11 rounded-lg px-3 text-sm ${mode === 'pickup' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`} onClick={() => setMode('pickup')}>Pickups</button>
        <button type="button" className={`min-h-11 rounded-lg px-3 text-sm ${mode === 'dropoff' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`} onClick={() => setMode('dropoff')}>Dropoffs</button>
      </div>
      {cells.length ? <div ref={mapRef} className="h-80 overflow-hidden rounded-xl border" /> : (
        <p className="rounded-xl border border-dashed p-6 text-sm text-slate-500">No GPS for this filter. Uber sends area names, not pins.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 font-medium">Top areas</p>
          {(geo?.areas || []).length === 0 ? <p className="text-sm text-slate-500">—</p> : (geo?.areas || []).map((row) => (
            <button key={row.area} type="button" className="flex min-h-11 w-full items-center justify-between text-left text-sm" onClick={() => onZone(row.area)}>
              <span>{row.area}</span><span>{row.trips}</span>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 font-medium">Top routes</p>
          {(geo?.routes || []).length === 0 ? <p className="text-sm text-slate-500">—</p> : (geo?.routes || []).map((row) => (
            <p key={`${row.from}-${row.to}`} className="flex min-h-11 items-center justify-between text-sm">
              <span>{row.from} → {row.to}</span><span>{row.trips}</span>
            </p>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-sm font-medium">Area to area</p>
        {zones.length === 0 ? <p className="text-sm text-slate-500">—</p> : (
          <table className="text-sm">
            <thead>
              <tr>
                <th className="p-2" />
                {zones.map((zone) => <th key={zone} className="p-2 text-left">{zone}</th>)}
              </tr>
            </thead>
            <tbody>
              {zones.map((pickup) => (
                <tr key={pickup}>
                  <th className="p-2 text-left font-medium">{pickup}</th>
                  {zones.map((dropoff) => {
                    const hit = matrix.find((row) => row.from === pickup && row.to === dropoff);
                    return <td key={dropoff} className="p-2 text-center">{hit?.trips ?? '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-sm text-slate-600">
        {geo?.deadhead?.trips
          ? `Allocated deadhead: ${Number(geo.deadhead.km || 0).toFixed(1)} km across ${geo.deadhead.trips} Uber trips. This is Uber’s allocated figure, not a measured empty drive.`
          : 'Uber does not export allocated deadhead for this filter.'}
      </p>
    </section>
  );
}
