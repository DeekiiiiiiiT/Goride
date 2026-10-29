import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { StationDetail } from "./stationRegisterApi";
import { StationIcon } from "./StationIcon";

export function DrawerLocation({
  detail,
  canWrite,
  lat,
  lng,
  geofence,
  pinState,
  onMove,
  onGeofence,
  onPin,
  onAddAlias,
  onRemoveAlias,
  onSync,
  nearby,
  onMerge,
}: {
  detail?: StationDetail;
  canWrite: boolean;
  lat: number;
  lng: number;
  geofence: number;
  pinState: string;
  onMove: (lat: number, lng: number) => void;
  onGeofence: (meters: number) => void;
  onPin: (state: "unchecked" | "confirmed" | "offset") => void;
  onAddAlias: (raw: string) => void;
  onRemoveAlias: (id: string) => void;
  onSync: () => void;
  nearby: { id: string; name?: string; distance_m?: number }[];
  onMerge: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    if (!host.current || mapRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const map = L.map(host.current, { zoomControl: true }).setView([lat, lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
    const marker = L.circleMarker([lat, lng], { radius: 8, color: "#2563eb", fillOpacity: 0.9 });
    if (canWrite) {
      marker.on("mousedown", () => {
        map.dragging.disable();
      });
      map.on("mousemove", (event: L.LeafletMouseEvent) => {
        if (!map.dragging.enabled()) marker.setLatLng(event.latlng);
      });
      map.on("mouseup", (event: L.LeafletMouseEvent) => {
        map.dragging.enable();
        onMove(event.latlng.lat, event.latlng.lng);
      });
    }
    marker.addTo(map);
    const circle = L.circle([lat, lng], { radius: geofence || 150, color: "#2563eb", weight: 1, fillOpacity: 0.08 }).addTo(map);
    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [canWrite]);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    markerRef.current?.setLatLng([lat, lng]);
    circleRef.current?.setLatLng([lat, lng]);
    circleRef.current?.setRadius(geofence || 150);
  }, [lat, lng, geofence]);

  const nudge = (dLat: number, dLng: number) => {
    if (!canWrite) return;
    onMove(Number((lat + dLat).toFixed(6)), Number((lng + dLng).toFixed(6)));
  };

  const aliases = (detail?.place.place_alias || []).filter((alias) => alias.kind === "gps");
  const coords = Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(4)}° N, ${Math.abs(lng).toFixed(4)}° W` : "—";

  return (
    <div className="flex flex-col gap-4 text-xs" onKeyDown={(event) => {
      const step = 0.0001;
      if (event.key === "ArrowUp") nudge(step, 0);
      if (event.key === "ArrowDown") nudge(-step, 0);
      if (event.key === "ArrowLeft") nudge(0, -step);
      if (event.key === "ArrowRight") nudge(0, step);
    }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          <span className="text-[11px] font-label uppercase font-bold text-slate-700 tracking-wider">Spatial Geometry & Geofence</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-slate-200/70 font-mono text-[10px] text-slate-600 font-semibold">EPSG:4326 WGS84</span>
          <span className="px-2 py-0.5 rounded bg-emerald-100 font-mono text-[10px] text-emerald-800 font-bold">GPS LOCK</span>
        </div>
      </div>
      <div className="relative w-full h-[270px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/80 shadow-md">
        <div ref={host} className="absolute inset-0" role="application" aria-label="Station pin. Arrow keys move it." tabIndex={0} />
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-slate-700/80 text-[10px] font-mono text-slate-200 z-[400]">
          <StationIcon name="satellite_alt" className="text-[13px] text-emerald-400" />
          <span>{coords}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-label uppercase font-bold text-slate-400 tracking-wider">Spatial Plus Code</span>
            <span className="text-[9px] font-bold text-blue-600 uppercase bg-blue-50 px-1.5 py-0.5 rounded">OLC v1</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-2 text-slate-900">
              <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                <StationIcon name="qr_code_2" className="text-[16px]" />
              </div>
              <span className="font-mono text-xs font-bold tracking-tight">{detail?.place.plus_code || "—"}</span>
            </div>
            <button type="button" className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100" title="Copy Plus Code" onClick={() => { if (detail?.place.plus_code) void navigator.clipboard.writeText(detail.place.plus_code); }}>
              <StationIcon name="content_copy" className="text-[16px]" />
            </button>
          </div>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-label uppercase font-bold text-slate-400 tracking-wider">Pin Audit Status</span>
          <div className="grid grid-cols-3 p-1 bg-slate-100 rounded-lg text-[11px] font-bold mt-1 gap-1">
            {(["unchecked", "confirmed", "offset"] as const).map((state) => (
              <button key={state} type="button" disabled={!canWrite} className={`py-1 rounded-md ${pinState === state ? "bg-amber-500 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"}`} onClick={() => onPin(state)}>
                {state[0].toUpperCase() + state.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-900">Geofence Boundary Radius</span>
              <StationIcon name="info" className="text-[14px] text-slate-400" />
            </div>
            <span className="text-[11px] text-slate-500">Automated arrival buffer around dispenser zone</span>
          </div>
          <span className="font-mono text-xs font-extrabold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">{geofence || "default"} m</span>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <span className="font-mono text-[10px] text-slate-400 font-semibold">10 m</span>
          <input className="w-full accent-blue-600 h-2 bg-slate-100 rounded-lg cursor-pointer" type="range" min={10} max={2000} value={geofence || 150} disabled={!canWrite} onChange={(event) => onGeofence(Number(event.target.value))} />
          <span className="font-mono text-[10px] text-slate-400 font-semibold">2000 m</span>
        </div>
        {canWrite ? <button type="button" className="self-start text-xs font-bold text-blue-600" onClick={onSync}>Sync Master Pin</button> : null}
      </div>
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-900">GPS Aliases</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">{aliases.length} mapped</span>
          </div>
          {canWrite ? (
            <button type="button" className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1" onClick={() => {
              const raw = window.prompt("Alias") || "";
              if (raw.trim()) onAddAlias(raw.trim());
            }}>
              <StationIcon name="add" className="text-[15px]" />Add alias
            </button>
          ) : null}
        </div>
        {aliases.map((alias) => (
          <div key={alias.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between">
            <span className="font-mono text-[11px] font-bold text-slate-800">{alias.raw_value}</span>
            {canWrite ? <button type="button" className="text-[11px] font-bold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-md hover:bg-rose-50" onClick={() => onRemoveAlias(alias.id)}>Remove</button> : null}
          </div>
        ))}
      </div>
      <div className="bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 p-4 rounded-xl border border-amber-300 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StationIcon name="warning" className="text-[17px] text-amber-600" />
            <span className="text-xs font-bold text-slate-900">Nearby Station Conflict</span>
            {nearby.length ? <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[10px]">Clash risk</span> : null}
          </div>
        </div>
        {nearby.length === 0 ? <div className="text-slate-500">Not a duplicate</div> : nearby.map((hit) => (
          <div key={hit.id} className="p-3 rounded-xl bg-white border border-amber-200/80 flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900">{hit.name || hit.id}</span>
              {hit.distance_m != null ? <span className="font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded text-[10px] mt-1 w-fit">{Math.round(hit.distance_m)} m away</span> : null}
            </div>
            {canWrite ? <button type="button" className="px-3 py-1.5 rounded-lg bg-slate-900 text-xs font-bold text-white hover:bg-slate-800" onClick={() => onMerge(hit.id)}>Merge into this…</button> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
