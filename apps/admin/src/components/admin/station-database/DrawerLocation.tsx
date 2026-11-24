import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { decodePlusCode, encodePlusCode, isFullPlusCode, isValidPlusCode, recoverShortCode, stationFuelService } from "@roam/platform-ops-ui";
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
  plusCode,
  address,
  onMove,
  onPlusCode,
  onAddress,
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
  plusCode: string;
  address: string;
  onMove: (lat: number, lng: number) => void;
  onPlusCode: (code: string, lat: number, lng: number, address?: string) => void;
  onAddress: (address: string) => void;
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
    if (mapRef.current && !mapRef.current.getBounds().contains([lat, lng])) mapRef.current.panTo([lat, lng]);
    circleRef.current?.setRadius(geofence || 150);
  }, [lat, lng, geofence]);

  const [codeText, setCodeText] = useState(plusCode);
  const [codeError, setCodeError] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  useEffect(() => {
    setCodeText(plusCode);
  }, [plusCode]);

  // Accepts "7794WR3W+X66", "WR3W+X66", "VQ85+WMP, Hayes" or "VQ85+WMP Hayes, Clarendon".
  const applyPlusCode = async (
    text: string = codeText,
    setErr: (message: string) => void = setCodeError,
    fromAddressBox = false,
  ) => {
    const setCodeError = setErr;
    const typed = text.trim();
    if (!typed) return;
    const match = typed.match(/^([^\s,]+)[\s,]*(.*)$/);
    const codePart = (match?.[1] || "").toUpperCase();
    const town = (match?.[2] || "").replace(/^[\s,]+|[\s,]+$/g, "");
    if (!isValidPlusCode(codePart)) {
      setCodeError("That is not a plus code. Examples: 7794WR3W+X66 or VQ85+WMP, Hayes");
      return;
    }
    setCodeError("");
    setCodeBusy(true);
    try {
      let full = codePart;
      if (!isFullPlusCode(codePart)) {
        let refLat = lat;
        let refLng = lng;
        if (town) {
          try {
            const ref = await stationFuelService.geocodeAddress(`${town}, Jamaica`);
            refLat = ref.lat;
            refLng = ref.lng;
          } catch {
            setCodeError(`Could not find "${town}". Try the full code, e.g. 7794WR3W+X66.`);
            return;
          }
        }
        const recovered = recoverShortCode(codePart, refLat, refLng);
        if (!recovered) {
          setCodeError("Could not work out the full plus code. Try the full code, e.g. 7794WR3W+X66.");
          return;
        }
        full = recovered;
      }
      const point = decodePlusCode(full);
      if (!point) {
        setCodeError("Could not read that plus code.");
        return;
      }
      const pinLat = Number(point.lat.toFixed(7));
      const pinLng = Number(point.lng.toFixed(7));
      let address: string | undefined;
      try {
        const found = await stationFuelService.reverseGeocode(pinLat, pinLng);
        const street = found.streetAddress || found.formattedAddress || "";
        if (street && !isValidPlusCode(street.split(",")[0].trim())) address = street;
      } catch {
        // Pin still moves; address stays as typed on the Details tab.
      }
      // A plus code typed in the address box never stays as the street address.
      onPlusCode(full, pinLat, pinLng, address ?? (fromAddressBox ? "" : undefined));
      if (fromAddressBox && !address) setErr("Pin moved. No street address found — type it here.");
    } finally {
      setCodeBusy(false);
    }
  };

  const [addressError, setAddressError] = useState("");

  // Address box takes a plus code ("VQ85+WMP, Hayes") or a street address; both move the pin.
  const findAddress = async () => {
    const typed = address.trim();
    if (!typed) return;
    setAddressError("");
    const firstPart = (typed.match(/^[^\s,]+/)?.[0] || "").toUpperCase();
    if (isValidPlusCode(firstPart)) {
      await applyPlusCode(typed, setAddressError, true);
      return;
    }
    setCodeBusy(true);
    try {
      const found = await stationFuelService.geocodeAddress(/jamaica/i.test(typed) ? typed : `${typed}, Jamaica`);
      const pinLat = Number(Number(found.lat).toFixed(7));
      const pinLng = Number(Number(found.lng).toFixed(7));
      if (!Number.isFinite(pinLat) || !Number.isFinite(pinLng)) throw new Error("not found");
      onPlusCode(encodePlusCode(pinLat, pinLng, 11), pinLat, pinLng);
    } catch {
      setAddressError(`Could not find "${typed}" on the map. Try a plus code, e.g. VQ85+WMP, Hayes.`);
    } finally {
      setCodeBusy(false);
    }
  };

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
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-label uppercase font-bold text-slate-400 tracking-wider">Spatial Plus Code</span>
            <span className="text-[9px] font-bold text-blue-600 uppercase bg-blue-50 px-1.5 py-0.5 rounded">OLC v1</span>
          </div>
          {canWrite ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <input
                  className="min-w-0 flex-1 font-mono text-xs font-bold tracking-tight border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  placeholder="e.g. VQ85+WMP, Hayes"
                  aria-label="Plus code"
                  value={codeText}
                  disabled={codeBusy}
                  onChange={(event) => { setCodeText(event.target.value); setCodeError(""); }}
                  onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") void applyPlusCode(); }}
                />
                <button type="button" className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold disabled:opacity-40" disabled={codeBusy || !codeText.trim() || codeText.trim().toUpperCase() === plusCode.toUpperCase()} onClick={() => void applyPlusCode()}>
                  {codeBusy ? "Finding…" : "Move pin"}
                </button>
              </div>
              {codeError
                ? <span className="text-[10px] text-rose-600">{codeError}</span>
                : <span className="text-[10px] text-slate-400">Full code, or short code + town (VQ85+WMP, Hayes)</span>}
            </div>
          ) : (
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2 text-slate-900">
                <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
                  <StationIcon name="qr_code_2" className="text-[16px]" />
                </div>
                <span className="font-mono text-xs font-bold tracking-tight">{plusCode || "—"}</span>
              </div>
              <button type="button" className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100" title="Copy Plus Code" onClick={() => { if (plusCode) void navigator.clipboard.writeText(plusCode); }}>
                <StationIcon name="content_copy" className="text-[16px]" />
              </button>
            </div>
          )}
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-label uppercase font-bold text-slate-400 tracking-wider">Street Address</span>
            {canWrite ? (
              <>
                <div className="flex items-center gap-1.5">
                  <input
                    className="min-w-0 flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                    placeholder="Street address or plus code"
                    aria-label="Street address"
                    value={address}
                    disabled={codeBusy}
                    onChange={(event) => { onAddress(event.target.value); setAddressError(""); }}
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Enter") void findAddress(); }}
                  />
                  <button type="button" className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold disabled:opacity-40" disabled={codeBusy || !address.trim()} onClick={() => void findAddress()}>
                    {codeBusy ? "Finding…" : "Find"}
                  </button>
                </div>
                {addressError
                  ? <span className="text-[10px] text-rose-600">{addressError}</span>
                  : <span className="text-[10px] text-slate-400">Find moves the pin. Saved separately from the plus code.</span>}
              </>
            ) : (
              <span className="text-xs text-slate-900">{address || "—"}</span>
            )}
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
