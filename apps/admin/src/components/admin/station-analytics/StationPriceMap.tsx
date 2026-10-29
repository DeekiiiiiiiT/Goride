import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatJmdPerLitre, formatWhen } from "./stationAnalyticsFormat";
import type { StationRow } from "./stationAnalyticsApi";

const SHADES = ["#dbeafe", "#93c5fd", "#60a5fa", "#316bf3", "#1e3a8a"];

function quintile(price: number, prices: number[]): number {
  if (prices.length < 2) return 2;
  const sorted = [...prices].sort((a, b) => a - b);
  const index = sorted.findIndex((value) => value >= price);
  return Math.min(4, Math.floor((Math.max(index, 0) / sorted.length) * 5));
}

export function StationPriceMap({
  stations,
  onOpen,
}: {
  stations: StationRow[];
  onOpen: (placeId: string) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const prices = useMemo(
    () => stations.map((station) => station.price).filter((price): price is number => price != null),
    [stations],
  );
  const unchecked = stations.filter((station) => station.pinState === "unchecked").length;

  useEffect(() => {
    if (!host.current || mapRef.current) return;
    const dark = document.documentElement.classList.contains("dark");
    const map = L.map(host.current, { zoomControl: true }).setView([18.1, -77.3], 8);
    L.tileLayer(
      dark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { attribution: "&copy; OpenStreetMap" },
    ).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    stations.forEach((station) => {
      if (station.lat == null || station.lng == null) return;
      bounds.push([station.lat, station.lng]);
      const verified = station.status === "verified";
      const priced = station.price != null;
      const shade = priced ? SHADES[quintile(station.price as number, prices)] : "transparent";
      const size = verified ? 9 : 8;
      const icon = L.divIcon({
        className: "",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<span title="${station.name}" style="display:block;width:${size}px;height:${size}px;background:${shade};border:1.5px solid ${priced ? "#1e3a8a" : "#94a3b8"};border-radius:${verified ? "1px" : "99px"};${station.outdated ? "background-image:repeating-linear-gradient(45deg,#d97706,#d97706 1px,transparent 1px,transparent 3px);" : ""}"></span>`,
      });
      const marker = L.marker([station.lat, station.lng], { icon, title: station.name });
      const age = formatWhen(station.lastReportAt);
      marker.bindPopup(`
        <strong>${station.name}</strong><br/>
        ${station.brand || "No brand set"} · ${station.parish || "Parish unknown"}<br/>
        ${priced ? formatJmdPerLitre(station.price) : "no price"}
        ${station.outdated ? " · May be outdated" : ""}<br/>
        ${station.reportCount ?? 0} reports · ${age.relative}
        <br/><button type="button" data-open="${station.placeId}">Open station</button>
      `);
      marker.on("popupopen", () => {
        const button = map.getContainer().querySelector(`[data-open="${station.placeId}"]`);
        button?.addEventListener("click", () => onOpen(station.placeId), { once: true });
      });
      marker.addTo(layer);
    });
    if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [16, 16], maxZoom: 12 });
    else if (bounds.length === 1) map.setView(bounds[0], 12);
  }, [stations, prices, onOpen]);

  return (
    <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:col-span-8">
      <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Geo-spatial coverage</h2>
      <div className="mb-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 font-mono text-[11px] text-amber-900 dark:text-amber-200">
        Pins not yet verified: {unchecked} of {stations.length}
      </div>
      <div ref={host} className="h-64 w-full overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-b from-[#0f172a] to-[#1e293b] lg:h-72" />
      <p className="mt-2 text-[10px] text-slate-500">
        Price quintile (low to high) · hollow grey means no price · stripes mean May be outdated · square verified · circle pending
      </p>
    </section>
  );
}
