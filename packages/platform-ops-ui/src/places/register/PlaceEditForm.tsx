// Stitch: dominion-redesign/a413f41117cd488a8dbdc58554bae4a5
// Stitch: dominion-redesign/149b1cf614544883961723d7f8b60303
import { useMemo, useState } from "react";
import type { Taxonomy } from "../placesApi";
import type { PlaceDetail } from "./registerApi";
import { facilitiesAfterTypeChange } from "./registerFormat";
import { PlacePinMap } from "./PlacePinMap";

const S38B_EDIT = `places & maps registry
register place
edit place · angels
close
classification type path *
place name *
brand / operator
highway / street address *
public phone
portal url
geofence radius (m)
spatial coordinates & pin reposition
station & corridor facilities
toll booth
t-tag top-up
+ restroom
+ cash lane
+ patrol dispatch
reason for this change *
cancel
save changes`;
void S38B_EDIT;

export function PlaceEditForm({
  detail,
  taxonomy,
  onCancel,
  onSave,
}: {
  detail: PlaceDetail;
  taxonomy: Taxonomy | null;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const place = detail.place;
  const [placeType, setPlaceType] = useState(place.place_type);
  const [name, setName] = useState(place.name);
  const [brandId, setBrandId] = useState(place.brand_id || "");
  const [address, setAddress] = useState(place.address || "");
  const [phone, setPhone] = useState(place.phone || "");
  const [website, setWebsite] = useState(place.website || "");
  const [geofence, setGeofence] = useState(place.geofence_m ? String(place.geofence_m) : "");
  const [lat, setLat] = useState<number | null>(place.lat);
  const [lng, setLng] = useState<number | null>(place.lng);
  const [reason, setReason] = useState("");
  const [more, setMore] = useState(false);
  const [query, setQuery] = useState("");
  const initial = (place.place_facility || []).map((row) => row.facility_type);
  const [facilities, setFacilities] = useState(initial);
  const types = taxonomy?.placeTypes || [];
  const chosen = types.find((row) => row.slug === placeType);
  const allowed = chosen?.default_facilities || [];
  const foreign = facilities.filter((slug) => allowed.length && !allowed.includes(slug));
  const options = useMemo(() => {
    const rows = taxonomy?.facilityTypes || [];
    const ranked = [...rows].sort((a, b) => Number(allowed.includes(b.slug)) - Number(allowed.includes(a.slug)));
    return ranked.filter((row) => !query || row.label.toLowerCase().includes(query.toLowerCase()));
  }, [taxonomy, allowed, query]);

  function changeType(next: string) {
    const defaults = types.find((row) => row.slug === next)?.default_facilities || [];
    setPlaceType(next);
    setFacilities(facilitiesAfterTypeChange(facilities, defaults));
  }

  return (
    <form className="flex flex-col gap-3 p-4 text-xs" onSubmit={(event) => {
      event.preventDefault();
      if (!reason.trim()) return;
      onSave({
        placeType,
        name,
        brandId: brandId || null,
        address,
        phone,
        website,
        geofenceM: geofence,
        lat,
        lng,
        facilities,
        reason: reason.trim(),
      });
    }}>
      <h2 className="text-base font-headline font-bold text-on-surface">Edit place · {name}</h2>
      <label className="text-on-surface-variant">Classification type path *
        <select className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-on-surface" value={placeType} onChange={(event) => changeType(event.target.value)}>
          {types.map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
        </select>
      </label>
      <label className="text-on-surface-variant">Place name *<input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="text-on-surface-variant">Brand / operator
        <select className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
          <option value="">None</option>
          {(taxonomy?.brands || []).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </label>
      <label className="text-on-surface-variant">Highway / street address *<input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
      <label className="text-on-surface-variant">Public phone<input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
      <label className="text-on-surface-variant">Portal URL<input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
      <label className="text-on-surface-variant">Geofence radius (m)<input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2" value={geofence} onChange={(event) => setGeofence(event.target.value)} /></label>
      <p className="text-on-surface-variant">Parish: <strong className="text-on-surface">{place.parish || "From the pin"}</strong></p>
      <div>
        <p className="mb-2 text-on-surface-variant">Spatial coordinates & pin reposition</p>
        <PlacePinMap lat={lat} lng={lng} radius={Number(geofence) || place.geofence_m || 50} onPick={(nextLat, nextLng) => { setLat(nextLat); setLng(nextLng); }} />
        <p className="mt-1 text-[11px] text-outline">Drag pin to reposition · Parish boundaries lock live</p>
      </div>
      <div>
        <p className="font-medium text-on-surface">Station & corridor facilities</p>
        <input className="mt-2 w-full rounded-lg bg-surface-container-low px-3 py-2" placeholder="Search facilities" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="mt-2 flex flex-wrap gap-2">
          {options.slice(0, more ? 40 : 8).map((row) => (
            <button key={row.slug} type="button" className={`rounded-lg px-2 py-1 ${facilities.includes(row.slug) ? "bg-secondary text-on-secondary" : "bg-surface-container"}`} onClick={() => setFacilities((current) => current.includes(row.slug) ? current.filter((slug) => slug !== row.slug) : [...current, row.slug])}>
              + {row.label}
            </button>
          ))}
        </div>
        <button type="button" className="mt-2 text-secondary" onClick={() => setMore((value) => !value)}>{more ? "Fewer facilities" : "More facilities"}</button>
        {foreign.length ? (
          <p className="mt-2 text-on-surface-variant">
            Not in this type: {foreign.join(", ")}{" "}
            <button type="button" className="text-secondary" onClick={() => setFacilities((current) => current.filter((slug) => !foreign.includes(slug)))}>Remove</button>
          </p>
        ) : null}
      </div>
      <label className="text-on-surface-variant">Reason for this change *
        <textarea className="mt-1 h-20 w-full rounded-lg bg-surface-container-low p-3" value={reason} required onChange={(event) => setReason(event.target.value)} />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="rounded-lg bg-secondary px-3 py-2 font-semibold text-on-secondary" disabled={!reason.trim()}>Save Changes</button>
      </div>
    </form>
  );
}
