// Stitch: dominion-redesign/149b1cf614544883961723d7f8b60303
import { useEffect, useId } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_TILES } from "../../utils/mapTiles";

export function PlacePinMap({
  lat,
  lng,
  radius,
  onPick,
}: {
  lat: number | null;
  lng: number | null;
  radius: number;
  onPick?: (lat: number, lng: number) => void;
}) {
  const id = useId().replace(/:/g, "");
  const placed = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    const node = document.getElementById(id);
    if (!node) return;
    const map = L.map(node).setView(placed ? [lat as number, lng as number] : [18.1, -77.3], placed ? 16 : 8);
    L.tileLayer(MAP_TILES.LIGHT, { attribution: MAP_TILES.ATTRIBUTION }).addTo(map);
    if (placed) {
      L.marker([lat as number, lng as number]).addTo(map);
      L.circle([lat as number, lng as number], { radius: radius || 50, color: "#0153dc", weight: 1 }).addTo(map);
    }
    if (onPick) {
      map.on("click", (event) => onPick(event.latlng.lat, event.latlng.lng));
    }
    return () => { map.remove(); };
  }, [id, lat, lng, radius, placed, onPick]);

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-xl bg-surface-container">
      <div id={id} className="h-full w-full" />
      {!placed ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-surface-container-lowest/90 px-3 py-2 text-xs font-headline font-semibold text-on-surface shadow-sm">
          Click the map or search an address to drop the pin
        </div>
      ) : null}
    </div>
  );
}
