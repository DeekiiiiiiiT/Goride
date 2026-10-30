// Stitch: dominion-redesign/03c7243742a54006bf1bebb08910dd49
import { useMemo, useState } from "react";
import type { Taxonomy } from "../placesApi";
import { nearbyPlaces, savePlace } from "./registerApi";
import { pinPlaced } from "./registerFormat";
import { PlacePinMap } from "./PlacePinMap";

const S38C = `jamaica spatial registry · places
add a place
close
place type *
gas station
toll plaza
auto parts
car wash
place name *
brand / operator
location & civic address
phone
website
dispatch geofence
fuel grades offered
e10 87
e10 90
auto diesel
ultra low sulfur
facilities & amenities
+ atm
+ restroom
+ air & water
+ convenience store
+ card lock
cancel
save as pending
save and verify`;
void S38C;

export function AddPlaceDialog({
  apiBase,
  getToken,
  taxonomy,
  onClose,
  onCreated,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  taxonomy: Taxonomy | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [placeType, setPlaceType] = useState("");
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const type = (taxonomy?.placeTypes || []).find((row) => row.slug === placeType);
  const radius = type?.default_geofence_m || 50;
  const canSave = Boolean(placeType && name.trim() && pinPlaced(lat, lng));
  const facilityChoices = useMemo(() => taxonomy?.facilityTypes || [], [taxonomy]);

  async function submit(verify: boolean) {
    if (!canSave || lat == null || lng == null) return;
    const nearby = await nearbyPlaces(apiBase, getToken, lat, lng, placeType);
    if (nearby.duplicates?.length) {
      setMessage("A place of this type is already inside the geofence.");
      return;
    }
    const saved = await savePlace(apiBase, getToken, null, {
      placeType,
      name: name.trim(),
      brandId: brandId || null,
      address,
      phone,
      website,
      lat,
      lng,
      geofenceM: radius,
      facilities,
      verify,
      reason: verify ? "Verified" : "Created",
    });
    if (saved.missing?.length) {
      setMessage(saved.missing.join(", "));
      onCreated(saved.id);
      return;
    }
    onCreated(saved.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-2xl bg-surface p-5 shadow-xl" role="dialog" aria-labelledby="modal-title">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold font-headline tracking-tight text-on-surface" id="modal-title">Add a place</h2>
          <button type="button" onClick={onClose} aria-label="Close"><span className="material-symbols-outlined">close</span></button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs text-on-surface-variant">
            Place type *
            <select className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface" value={placeType} onChange={(event) => setPlaceType(event.target.value)}>
              <option value="">Choose</option>
              {(taxonomy?.placeTypes || []).map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-on-surface-variant">
            Place name *
            <input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="text-xs text-on-surface-variant">
            Brand / operator
            <select className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
              <option value="">None</option>
              {(taxonomy?.brands || []).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-on-surface-variant">
            Location & civic address
            <input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs text-on-surface" value={address} onChange={(event) => setAddress(event.target.value)} />
          </label>
          <label className="text-xs text-on-surface-variant">Phone<input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
          <label className="text-xs text-on-surface-variant">Website<input className="mt-1 w-full rounded-lg bg-surface-container-low px-3 py-2 text-xs" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
        </div>
        <div className="mt-4">
          <PlacePinMap lat={lat} lng={lng} radius={radius} onPick={(nextLat, nextLng) => { setLat(nextLat); setLng(nextLng); }} />
          <p className="mt-2 text-xs text-on-surface-variant"><span className="font-medium text-on-surface">Parish:</span> {lat == null ? "No pin = cannot save." : "Parish boundary is derived automatically from the pin coordinate."}</p>
        </div>
        <div className="mt-4">
          <p className="text-xs font-medium text-on-surface">Facilities & amenities</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {facilityChoices.slice(0, 8).map((row) => (
              <button key={row.slug} type="button" className={`rounded-lg px-2 py-1 text-xs ${facilities.includes(row.slug) ? "bg-secondary text-on-secondary" : "bg-surface-container text-on-surface"}`} onClick={() => setFacilities((current) => current.includes(row.slug) ? current.filter((slug) => slug !== row.slug) : [...current, row.slug])}>
                + {row.label}
              </button>
            ))}
          </div>
        </div>
        {message ? <p className="mt-3 text-xs text-error">{message}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="text-xs text-on-surface-variant" onClick={onClose}>Cancel</button>
          <button type="button" className="rounded-lg bg-surface-container px-3 py-2 text-xs font-semibold text-on-surface disabled:opacity-40" disabled={!canSave} onClick={() => void submit(false).catch((err: Error) => setMessage(err.message))}>Save as pending</button>
          <button type="button" className="rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-on-secondary disabled:opacity-40" disabled={!canSave} onClick={() => void submit(true).catch((err: Error) => setMessage(err.message))}>Save and verify</button>
        </div>
      </div>
    </div>
  );
}
