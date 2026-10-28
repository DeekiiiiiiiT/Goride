import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { AttributeFields } from "./AttributeFields";
import { placesSend, readPlacesQuery, writePlacesQuery, type PlacesStates, type Taxonomy } from "./placesApi";
import { MAP_TILES } from "../utils/mapTiles";

type Row = {
  id: string;
  name: string;
  place_type: string;
  address: string | null;
  parish: string | null;
  plus_code: string | null;
  status: string;
  pin_state: string;
  geofence_m: number | null;
  lat: number;
  lng: number;
  brand: { name: string } | { name: string }[] | null;
  place_facility: { facility_type: string }[];
};

const STATUS_MARK: Record<string, string> = {
  verified: "✓",
  pending: "…",
  learnt: "•",
  rejected: "×",
  duplicate: "=",
  closed: "–",
  anomaly: "!",
};

function brandName(row: Row): string {
  const brand = Array.isArray(row.brand) ? row.brand[0] : row.brand;
  return brand?.name || "Independent";
}

export function PlacesRegister({
  apiBase,
  getToken,
  states,
  onOpen,
  fixedType,
}: {
  apiBase: string;
  getToken: () => Promise<string | null>;
  states: PlacesStates;
  onOpen: (id: string | null) => void;
  fixedType?: string;
}) {
  const { Loading, Empty, Error } = states;
  const initial = readPlacesQuery();
  const [filters, setFilters] = useState(initial);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkType, setBulkType] = useState("");
  const [bulkFacility, setBulkFacility] = useState("");
  const [importNote, setImportNote] = useState("");

  const load = () => {
    setStatus("loading");
    const params = new URLSearchParams();
    const query = { ...filters, type: fixedType || filters.type };
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key === "p" ? "page" : key, value);
    }
    Promise.all([
      placesSend<Taxonomy>(apiBase, getToken, "/admin/taxonomy"),
      placesSend<{ rows: Row[]; total: number }>(apiBase, getToken, `/admin/register?${params.toString()}`),
    ]).then(([tree, list]) => {
      setTaxonomy(tree);
      setRows(list.rows || []);
      setTotal(list.total || 0);
      setStatus("ready");
    }).catch(() => setStatus("error"));
  };

  useEffect(() => { load(); }, [filters.q, filters.group, filters.category, filters.type, filters.status, filters.p, fixedType]);

  const categories = useMemo(
    () => (taxonomy?.categories || []).filter((row) => !filters.group || row.group_code === filters.group),
    [taxonomy, filters.group],
  );
  const types = useMemo(
    () => (taxonomy?.placeTypes || []).filter((row) => !filters.category || row.category_code === filters.category),
    [taxonomy, filters.category],
  );
  const typeBySlug = new Map((taxonomy?.placeTypes || []).map((row) => [row.slug, row]));
  const groupByCategory = new Map((taxonomy?.categories || []).map((row) => [row.code, row.group_code]));
  const groupColour = new Map((taxonomy?.groups || []).map((row) => [row.code, row.colour]));
  const facilityLabel = new Map((taxonomy?.facilityTypes || []).map((row) => [row.slug, row.label]));

  function setFilter(key: string, value: string) {
    const next = { ...filters, [key]: value, p: key === "p" ? value : "1" };
    if (key === "group") {
      next.category = "";
      next.type = "";
    }
    if (key === "category") next.type = "";
    setFilters(next);
    if (!fixedType) writePlacesQuery(next);
  }

  async function runBulk(action: string) {
    await placesSend(apiBase, getToken, "/admin/register/bulk", {
      method: "POST",
      body: JSON.stringify({ ids: selected, action, placeType: bulkType, facility: bulkFacility }),
    });
    setSelected([]);
    load();
  }

  async function importCsv(text: string) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = lines[0].toLowerCase().split(",").map((cell) => cell.trim());
    const typeCol = header.indexOf("place type");
    const nameCol = header.indexOf("name");
    const latCol = header.indexOf("lat");
    const lngCol = header.indexOf("lng");
    const facilityCol = header.indexOf("facilities");
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((cell) => cell.trim());
      return {
        placeType: cols[typeCol] || "",
        name: cols[nameCol] || "",
        lat: Number(cols[latCol]),
        lng: Number(cols[lngCol]),
        facilities: facilityCol >= 0 ? cols[facilityCol] : "",
      };
    });
    const result = await placesSend<{ saved: number; rejected: { row: number; reason: string }[] }>(apiBase, getToken, "/admin/register/import", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
    setImportNote(result.rejected.length
      ? `Saved ${result.saved}. ${result.rejected.map((row) => `Row ${row.row}: ${row.reason}`).join(" ")}`
      : `Saved ${result.saved}.`);
    load();
  }

  if (status === "loading" && !taxonomy) return <Loading />;
  if (status === "error") return <Error onRetry={load} />;

  const pages = Math.max(1, Math.ceil(total / 50));
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{fixedType ? "Filtered register" : "Places register"}</h2>
          <p className="text-sm text-slate-500">{total} places</p>
        </div>
        <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white" onClick={() => onOpen(null)}>Add a place</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Name, brand, alias, plus code, address" value={filters.q} onChange={(event) => setFilter("q", event.target.value)} />
        {!fixedType && (
          <>
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.group} onChange={(event) => setFilter("group", event.target.value)}>
              <option value="">All groups</option>
              {(taxonomy?.groups || []).map((row) => <option key={row.code} value={row.code}>{row.label}</option>)}
            </select>
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.category} onChange={(event) => setFilter("category", event.target.value)}>
              <option value="">All categories</option>
              {categories.map((row) => <option key={row.code} value={row.code}>{row.label}</option>)}
            </select>
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.type} onChange={(event) => setFilter("type", event.target.value)}>
              <option value="">All types</option>
              {types.map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
            </select>
          </>
        )}
        <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
          <option value="">Any status</option>
          {["pending", "learnt", "verified", "rejected", "closed"].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
      {status === "ready" && rows.length === 0 ? <Empty body="No places match these filters." /> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3" />
                <th className="p-3">Place</th>
                <th className="p-3">Type</th>
                <th className="p-3">Location</th>
                <th className="p-3">Status</th>
                <th className="p-3">Facilities</th>
                <th className="p-3">Geofence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const type = typeBySlug.get(row.place_type);
                const colour = groupColour.get(groupByCategory.get(type?.category_code || "") || "") || "#e2e8f0";
                const fence = row.geofence_m
                  ? `±${row.geofence_m} m (override)`
                  : `±${type?.default_geofence_m || 150} m (type default)`;
                return (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="p-3"><input type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td>
                    <td className="p-3">
                      <button type="button" className="font-medium text-slate-900 underline-offset-2 hover:underline" onClick={() => onOpen(row.id)}>{row.name}</button>
                      <div className="text-xs text-slate-500">{brandName(row)}</div>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs" style={{ background: colour }}>
                        <span aria-hidden>{type?.label.slice(0, 1) || "?"}</span>
                        {type?.label || row.place_type}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{[row.address, row.parish, row.plus_code].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-3"><span className="mr-1" aria-hidden>{STATUS_MARK[row.status] || "•"}</span>{row.status}</td>
                    <td className="p-3 text-xs text-slate-600">{(row.place_facility || []).slice(0, 5).map((item) => facilityLabel.get(item.facility_type) || item.facility_type).join(", ") || "—"}</td>
                    <td className="p-3 text-slate-600">{fence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" className="rounded border px-2 py-1" disabled={Number(filters.p) <= 1} onClick={() => setFilter("p", String(Number(filters.p) - 1))}>Previous</button>
        <span>Page {filters.p} of {pages}</span>
        <button type="button" className="rounded border px-2 py-1" disabled={Number(filters.p) >= pages} onClick={() => setFilter("p", String(Number(filters.p) + 1))}>Next</button>
        <select className="rounded border px-2 py-1" value={bulkType} onChange={(event) => setBulkType(event.target.value)}>
          <option value="">Set type</option>
          {(taxonomy?.placeTypes || []).map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
        </select>
        <button type="button" className="rounded border px-2 py-1" disabled={!selected.length || !bulkType} onClick={() => runBulk("type")}>Apply type</button>
        <select className="rounded border px-2 py-1" value={bulkFacility} onChange={(event) => setBulkFacility(event.target.value)}>
          <option value="">Facility</option>
          {(taxonomy?.facilityTypes || []).map((row) => <option key={row.slug} value={row.slug}>{row.label}</option>)}
        </select>
        <button type="button" className="rounded border px-2 py-1" disabled={!selected.length || !bulkFacility} onClick={() => runBulk("add-facility")}>Add facility</button>
        <button type="button" className="rounded border px-2 py-1" disabled={!selected.length || !bulkFacility} onClick={() => runBulk("remove-facility")}>Remove facility</button>
        <button type="button" className="rounded border px-2 py-1" disabled={!selected.length} onClick={() => runBulk("verify")}>Verify checked</button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => {
          const lines = ["name,brand,type,address,status", ...rows.map((row) => `${row.name},${brandName(row)},${row.place_type},"${row.address || ""}",${row.status}`)];
          const blob = new Blob([lines.join("\n")], { type: "text/csv" });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = "places.csv";
          link.click();
        }}>Export</button>
      </div>
      <label className="block text-sm text-slate-600">
        Import CSV. Columns: place type, name, lat, lng, facilities. Facilities are separated by |.
        <input className="mt-1 block text-sm" type="file" accept=".csv,text/csv" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (file) await importCsv(await file.text());
        }} />
      </label>
      {importNote ? <p className="text-sm text-slate-700">{importNote}</p> : null}
    </div>
  );
}

export function PlacePinMap({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  useEffect(() => {
    const node = document.getElementById("place-pin-map");
    if (!node || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const map = L.map(node).setView([lat, lng], 16);
    L.tileLayer(MAP_TILES.LIGHT, { attribution: MAP_TILES.ATTRIBUTION }).addTo(map);
    L.marker([lat, lng]).addTo(map);
    L.circle([lat, lng], { radius, color: "#0f172a", weight: 1 }).addTo(map);
    return () => { map.remove(); };
  }, [lat, lng, radius]);
  return <div id="place-pin-map" className="h-64 w-full rounded-xl border border-slate-200" />;
}
