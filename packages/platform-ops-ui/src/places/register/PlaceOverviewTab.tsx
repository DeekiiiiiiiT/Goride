// Stitch: dominion-redesign/149b1cf614544883961723d7f8b60303
import { formatUpdated } from "./registerFormat";
import { PlacePinMap } from "./PlacePinMap";
import type { PlaceDetail } from "./registerApi";

export function PlaceOverviewTab({
  detail,
  onConfirmPin,
}: {
  detail: PlaceDetail;
  onConfirmPin: () => void;
}) {
  const place = detail.place;
  return (
    <div className="flex flex-col gap-4 p-4">
      <PlacePinMap lat={place.lat} lng={place.lng} radius={place.geofence_m || 50} />
      <button type="button" className="self-start rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary" onClick={onConfirmPin}>Confirm pin</button>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div><dt className="text-outline">Address</dt><dd className="text-on-surface">{place.address || "—"}</dd></div>
        <div><dt className="text-outline">Parish</dt><dd className="text-on-surface">{place.parish || "—"}</dd></div>
        <div><dt className="text-outline">Plus code</dt><dd className="font-mono text-on-surface">{place.plus_code || "—"}</dd></div>
        <div><dt className="text-outline">Pcode</dt><dd className="font-mono text-on-surface">{place.pcode || "—"}</dd></div>
        <div><dt className="text-outline">Phone</dt><dd className="text-on-surface">{place.phone || "—"}</dd></div>
        <div><dt className="text-outline">Pin</dt><dd className="text-on-surface">{place.pin_state}</dd></div>
        <div><dt className="text-outline">Source</dt><dd className="text-on-surface">{place.origin_app || "manual"}</dd></div>
        <div><dt className="text-outline">Geofence</dt><dd className="text-on-surface">{place.geofence_m || "Type default"}</dd></div>
        <div><dt className="text-outline">Verified</dt><dd className="text-on-surface">{formatUpdated(place.verified_at)}</dd></div>
        <div><dt className="text-outline">Updated</dt><dd className="text-on-surface">{formatUpdated(place.updated_at)}</dd></div>
        <div><dt className="text-outline">On Plug</dt><dd className="text-on-surface">{detail.public ? "Yes" : "No"}</dd></div>
      </dl>
    </div>
  );
}
