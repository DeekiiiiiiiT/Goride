// Stitch: dominion-redesign/149b1cf614544883961723d7f8b60303
import type { PlaceDetail } from "./registerApi";

export function PlaceFacilitiesTab({ detail }: { detail: PlaceDetail }) {
  const rows = detail.place.place_facility || [];
  return (
    <ul className="flex flex-col gap-2 p-4 text-xs">
      {rows.length ? rows.map((row) => (
        <li key={row.id} className="rounded-lg bg-surface-container px-3 py-2 text-on-surface">{row.label || row.facility_type}</li>
      )) : <li className="text-on-surface-variant">No facilities yet.</li>}
    </ul>
  );
}
