import { useEffect, useMemo, useState } from "react";
import { AttributeFields } from "./AttributeFields";
import { PlacePinMap } from "./PlacesRegister";
import { placesSend, type PlacesStates, type Taxonomy } from "./placesApi";

type FacilityDraft = { type: string; label: string; attributes: Record<string, unknown>; open: boolean };
type Duplicate = { id: string; name: string; distance_m: number };

const RECENT_KEY = "places-recent-types";

function recentTypes(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}

export function PlaceEditor({
  apiBase,
  getToken,
  states,
  placeId,
  onDone,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  states: PlacesStates;
  placeId: string | null;
  onDone: (id: string) => void;
}) {
  const { Loading, Error } = states;
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [group, setGroup] = useState("");
  const [category, setCategory] = useState("");
  const [placeType, setPlaceType] = useState("");
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [address, setAddress] = useState("");
  const [parish, setParish] = useState("");
  const [phone, setPhone] = useState("");
  const [lat, setLat] = useState("18.0179");
  const [lng, setLng] = useState("-76.8099");
  const [geofenceM, setGeofenceM] = useState("");
  const [attributes, setAttributes] = useState<Record<string, unknown>>({});
  const [facilities, setFacilities] = useState<FacilityDraft[]>([]);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    placesSend<Taxonomy>(apiBase, getToken, "/admin/taxonomy").then(async (tree) => {
      setTaxonomy(tree);
      if (placeId) {
        const body = await placesSend<{ place: Record<string, unknown> }>(apiBase, getToken, `/admin/register/${placeId}`);
        const place = body.place;
        const type = tree.placeTypes.find((row) => row.slug === place.place_type);
        const cat = tree.categories.find((row) => row.code === type?.category_code);
        setPlaceType(String(place.place_type || ""));
        setCategory(cat?.code || "");
        setGroup(cat?.group_code || "");
        setName(String(place.name || ""));
        setBrandId(String(place.brand_id || ""));
        setAddress(String(place.address || ""));
        setParish(String(place.parish || ""));
        setPhone(String(place.phone || ""));
        setLat(String(place.lat || ""));
        setLng(String(place.lng || ""));
        setGeofenceM(place.geofence_m == null ? "" : String(place.geofence_m));
        setAttributes((place.attributes as Record<string, unknown>) || {});
        const saved = (place.place_facility as { facility_type: string; label: string | null; attributes: Record<string, unknown> }[]) || [];
        setFacilities(saved.map((row) => ({ type: row.facility_type, label: row.label || "", attributes: row.attributes || {}, open: false })));
      }
      setStatus("ready");
    }).catch(() => setStatus("error"));
  }, [apiBase, placeId]);

  const type = taxonomy?.placeTypes.find((row) => row.slug === placeType);
  const categories = (taxonomy?.categories || []).filter((row) => !group || row.group_code === group);
  const types = (taxonomy?.placeTypes || []).filter((row) => !category || row.category_code === category);
  const recent = recentTypes().map((slug) => taxonomy?.placeTypes.find((row) => row.slug === slug)).filter(Boolean);
  const radius = geofenceM ? Number(geofenceM) : (type?.default_geofence_m || 50);
  const grouped = useMemo(() => {
    const buckets = new Map<string, { label: string; colour: string; items: typeof facilities }>();
    for (const facility of facilities) {
      const kind = taxonomy?.facilityTypes.find((row) => row.slug === facility.type);
      const cat = taxonomy?.categories.find((row) => row.code === kind?.category_code);
      const grp = taxonomy?.groups.find((row) => row.code === cat?.group_code);
      const key = grp?.code || "other";
      const bucket = buckets.get(key) || { label: grp?.label || "Other", colour: grp?.colour || "#e2e8f0", items: [] };
      bucket.items.push(facility);
      buckets.set(key, bucket);
    }
    return [...buckets.values()];
  }, [facilities, taxonomy]);

  useEffect(() => {
    if (!placeType || !lat || !lng) return;
    const handle = window.setTimeout(() => {
      placesSend<{ duplicates: Duplicate[] }>(apiBase, getToken, `/admin/register/nearby?lat=${lat}&lng=${lng}&type=${placeType}&except=${placeId || ""}`)
        .then((body) => setDuplicates(body.duplicates || []))
        .catch(() => setDuplicates([]));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [lat, lng, placeType, placeId, apiBase]);

  function chooseType(slug: string) {
    const next = taxonomy?.placeTypes.find((row) => row.slug === slug);
    setPlaceType(slug);
    if (!geofenceM) setGeofenceM("");
    const defaults = next?.default_facilities || [];
    setFacilities(defaults.map((item) => ({ type: item, label: "", attributes: {}, open: false })));
    const remembered = [slug, ...recentTypes().filter((item) => item !== slug)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(remembered));
  }

  function toggleFacility(slug: string) {
    setFacilities((current) => current.some((row) => row.type === slug)
      ? current.filter((row) => row.type !== slug)
      : [...current, { type: slug, label: "", attributes: {}, open: true }]);
  }

  const missing = [
    !placeType ? "Type" : "",
    !name.trim() ? "Name" : "",
    !lat || !lng ? "Pin" : "",
    duplicates.length ? "Open duplicate" : "",
  ].filter(Boolean);

  async function save(verify: boolean) {
    setNotice("");
    try {
      const body = await placesSend<{ id: string; ok: boolean; missing?: string[] }>(apiBase, getToken, placeId ? `/admin/register/${placeId}` : "/admin/register", {
        method: placeId ? "PATCH" : "POST",
        body: JSON.stringify({
          placeType, name, brandId: brandId || null, address, parish, phone, lat: Number(lat), lng: Number(lng),
          geofenceM: geofenceM === "" ? null : Number(geofenceM), attributes, facilities, verify,
        }),
      });
      if (body.missing?.length) {
        setNotice(`Still needed: ${body.missing.join(", ")}`);
        return;
      }
      onDone(body.id);
    } catch (err: unknown) {
      setNotice(err instanceof globalThis.Error ? err.message : String(err));
    }
  }

  if (status === "loading") return <Loading />;
  if (status === "error") return <Error onRetry={() => setStatus("loading")} />;

  return (
    <div className="grid gap-6 p-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">{placeId ? "Edit place" : "Add a place"}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className="rounded-lg border px-3 py-2" value={group} onChange={(event) => { setGroup(event.target.value); setCategory(""); setPlaceType(""); }}>
            <option value="">Group</option>
            {(taxonomy?.groups || []).map((row) => <option key={row.code} value={row.code}>{row.label}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2" value={category} onChange={(event) => { setCategory(event.target.value); setPlaceType(""); }}>
            <option value="">Category</option>
            {categories.map((row) => <option key={row.code} value={row.code}>{row.label}</option>)}
          </select>
          <select className="rounded-lg border px-3 py-2" value={placeType} onChange={(event) => chooseType(event.target.value)}>
            <option value="">Place type</option>
            {recent.map((row) => row ? <option key={`recent-${row.slug}`} value={row.slug}>Recent · {row.label}</option> : null)}
            {types.map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
          </select>
        </div>
        <input className="w-full rounded-lg border px-3 py-2" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <select className="w-full rounded-lg border px-3 py-2" value={brandId} onChange={(event) => setBrandId(event.target.value)}>
          <option value="">Independent</option>
          {(taxonomy?.brands || []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="rounded-lg border px-3 py-2" placeholder="Latitude" value={lat} onChange={(event) => setLat(event.target.value)} />
          <input className="rounded-lg border px-3 py-2" placeholder="Longitude" value={lng} onChange={(event) => setLng(event.target.value)} />
        </div>
        <input className="w-full rounded-lg border px-3 py-2" placeholder="Address" value={address} onChange={(event) => setAddress(event.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="rounded-lg border px-3 py-2" placeholder="Parish" value={parish} onChange={(event) => setParish(event.target.value)} />
          <input className="rounded-lg border px-3 py-2" placeholder="Phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </div>
        <label className="block text-sm text-slate-600">
          Geofence metres. Leave blank to use the type default ({type?.default_geofence_m || 50} m).
          <input className="mt-1 w-full rounded-lg border px-3 py-2" value={geofenceM} onChange={(event) => setGeofenceM(event.target.value)} />
        </label>
        <AttributeFields schema={type?.attribute_schema} value={attributes} onChange={setAttributes} />
        <PlacePinMap lat={Number(lat)} lng={Number(lng)} radius={radius} />
        <div className="space-y-4">
          {grouped.map((bucket) => (
            <section key={bucket.label} className="rounded-xl p-3" style={{ background: bucket.colour }}>
              <h3 className="mb-2 text-sm font-semibold">{bucket.label}</h3>
              {bucket.items.map((facility) => {
                const kind = taxonomy?.facilityTypes.find((row) => row.slug === facility.type);
                return (
                  <div key={facility.type} className="mb-2 rounded-lg bg-white/80 p-2">
                    <button type="button" className="text-sm font-medium" onClick={() => setFacilities((current) => current.map((row) => row.type === facility.type ? { ...row, open: !row.open } : row))}>
                      {kind?.label || facility.type}
                    </button>
                    {facility.open && (
                      <div className="mt-2 space-y-2">
                        <input className="w-full rounded border px-2 py-1 text-sm" placeholder="Label, optional" value={facility.label} onChange={(event) => setFacilities((current) => current.map((row) => row.type === facility.type ? { ...row, label: event.target.value } : row))} />
                        <AttributeFields schema={kind?.attribute_schema} value={facility.attributes} onChange={(next) => setFacilities((current) => current.map((row) => row.type === facility.type ? { ...row, attributes: next } : row))} />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
          <div className="flex flex-wrap gap-2">
            {(taxonomy?.facilityTypes || []).map((row) => {
              const on = facilities.some((item) => item.type === row.slug);
              return (
                <button key={row.slug} type="button" className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-slate-900 text-white" : "bg-white"}`} onClick={() => toggleFacility(row.slug)}>
                  {row.label}
                </button>
              );
            })}
          </div>
        </div>
        {notice ? <p className="text-sm text-red-700">{notice}</p> : null}
        {missing.length ? <p className="text-sm text-slate-600">Verify needs: {missing.join(", ")}</p> : null}
        <div className="flex gap-2">
          <button type="button" className="rounded-lg border px-3 py-2" onClick={() => save(false)}>Save as pending</button>
          <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={missing.length > 0} onClick={() => save(true)}>Verify</button>
        </div>
      </div>
      <aside className="space-y-2 rounded-xl border border-slate-200 p-3">
        <h3 className="font-semibold">Possible duplicates</h3>
        {duplicates.length === 0 ? <p className="text-sm text-slate-500">None nearby of this type.</p> : duplicates.map((row) => (
          <div key={row.id} className="rounded-lg border border-slate-100 p-2 text-sm">
            <div className="font-medium">{row.name}</div>
            <div className="text-slate-500">{Math.round(row.distance_m)} m</div>
            <div className="mt-2 flex gap-2">
              <button type="button" className="rounded border px-2 py-1" onClick={() => onDone(row.id)}>Open</button>
              {placeId ? <button type="button" className="rounded border px-2 py-1" onClick={async () => {
                await placesSend(apiBase, getToken, `/admin/register/${placeId}`, { method: "PATCH", body: JSON.stringify({ duplicateOf: row.id }) });
                onDone(row.id);
              }}>Merge</button> : null}
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
}
