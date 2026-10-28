import { useEffect, useState } from "react";
import { placesSend, type PlacesStates, type Taxonomy } from "./placesApi";

type PlaceBody = {
  place: {
    id: string;
    name: string;
    place_type: string;
    status: string;
    address: string | null;
    parish: string | null;
    phone: string | null;
    plus_code: string | null;
    lat: number;
    lng: number;
    attributes: Record<string, unknown>;
    brand: { name: string } | { name: string }[] | null;
    place_facility: { id: string; facility_type: string; label: string | null; attributes: Record<string, unknown> }[];
    place_alias: { id: string; kind: string; raw_value: string | null; lat: number | null; lng: number | null }[];
  };
  evidence: { id: string; kind: string; created_at: string }[];
  history: { action: string; reason: string | null; created_at: string }[];
  prices: { grade: string; price_per_litre: number }[];
  public: boolean;
};

const TABS = ["Overview", "Facilities", "Aliases", "Evidence", "Prices", "History"] as const;

export function PlaceRecord({
  apiBase,
  getToken,
  states,
  placeId,
  onEdit,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  states: PlacesStates;
  placeId: string;
  onEdit: () => void;
}) {
  const { Loading, Error } = states;
  const [body, setBody] = useState<PlaceBody | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");

  const load = () => {
    setStatus("loading");
    Promise.all([
      placesSend<Taxonomy>(apiBase, getToken, "/admin/taxonomy"),
      placesSend<PlaceBody>(apiBase, getToken, `/admin/register/${placeId}`),
    ]).then(([tree, place]) => {
      setTaxonomy(tree);
      setBody(place);
      setStatus("ready");
    }).catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, [placeId]);

  if (status === "loading") return <Loading />;
  if (status === "error" || !body) return <Error onRetry={load} />;

  const place = body.place;
  const type = taxonomy?.placeTypes.find((row) => row.slug === place.place_type);
  const showPrices = type?.match_profile === "fuel" || (place.place_facility || []).some((row) => row.facility_type === "fuel_pump");
  const brand = Array.isArray(place.brand) ? place.brand[0]?.name : place.brand?.name;
  const groups = (taxonomy?.groups || []).map((group) => ({
    ...group,
    items: (place.place_facility || []).filter((facility) => {
      const kind = taxonomy?.facilityTypes.find((row) => row.slug === facility.facility_type);
      const category = taxonomy?.categories.find((row) => row.code === kind?.category_code);
      return category?.group_code === group.code;
    }),
  })).filter((group) => group.items.length);

  return (
    <div className="space-y-4 p-4">
      <div className={`rounded-xl px-4 py-3 text-sm ${body.public ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
        {body.public ? "Visible on Plug" : "Not public — pending verification"}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{place.name}</h2>
          <p className="text-sm text-slate-500">{brand || "Independent"} · {type?.label || place.place_type}</p>
        </div>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={onEdit}>Edit</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.filter((name) => name !== "Prices" || showPrices).map((name) => (
          <button key={name} type="button" className={`rounded-full px-3 py-1 text-sm ${tab === name ? "bg-slate-900 text-white" : "bg-slate-100"}`} onClick={() => setTab(name)}>{name}</button>
        ))}
      </div>
      {tab === "Overview" && (
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Status</dt><dd>{place.status}</dd></div>
          <div><dt className="text-slate-500">Address</dt><dd>{[place.address, place.parish].filter(Boolean).join(", ") || "—"}</dd></div>
          <div><dt className="text-slate-500">Plus code</dt><dd>{place.plus_code || "—"}</dd></div>
          <div><dt className="text-slate-500">Phone</dt><dd>{place.phone || "—"}</dd></div>
        </dl>
      )}
      {tab === "Facilities" && (
        <div className="space-y-3">
          {groups.map((group) => (
            <section key={group.code} className="rounded-xl p-3" style={{ background: group.colour }}>
              <h3 className="mb-2 text-sm font-semibold">{group.label}</h3>
              <ul className="space-y-1 text-sm">
                {group.items.map((item) => {
                  const kind = taxonomy?.facilityTypes.find((row) => row.slug === item.facility_type);
                  return <li key={item.id}>{item.label || kind?.label || item.facility_type}</li>;
                })}
              </ul>
            </section>
          ))}
          {groups.length === 0 ? <p className="text-sm text-slate-500">No facilities yet.</p> : null}
        </div>
      )}
      {tab === "Aliases" && (
        <ul className="space-y-2 text-sm">
          {(place.place_alias || []).map((row) => (
            <li key={row.id}>{row.kind}: {row.raw_value || (row.lat != null ? `${row.lat}, ${row.lng}` : "—")}</li>
          ))}
          {(place.place_alias || []).length === 0 ? <li className="text-slate-500">No aliases.</li> : null}
        </ul>
      )}
      {tab === "Evidence" && (
        <ul className="space-y-2 text-sm">
          {body.evidence.map((row) => <li key={row.id}>{row.kind} · {new Date(row.created_at).toLocaleString()}</li>)}
          {body.evidence.length === 0 ? <li className="text-slate-500">No evidence.</li> : null}
        </ul>
      )}
      {tab === "Prices" && showPrices && (
        <ul className="space-y-2 text-sm">
          {body.prices.map((row) => <li key={row.grade}>{row.grade}: {row.price_per_litre}</li>)}
          {body.prices.length === 0 ? <li className="text-slate-500">No pump prices yet.</li> : null}
        </ul>
      )}
      {tab === "History" && (
        <ul className="space-y-2 text-sm">
          {body.history.map((row, index) => <li key={`${row.created_at}-${index}`}>{row.reason || row.action} · {new Date(row.created_at).toLocaleString()}</li>)}
          {body.history.length === 0 ? <li className="text-slate-500">No history yet.</li> : null}
        </ul>
      )}
    </div>
  );
}
