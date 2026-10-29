import type { StationDetail, StationListRow } from "./stationRegisterApi";

const AMENITIES = ["convenience_store", "restroom", "food", "wifi", "air_water", "atm", "parking"];

export function DrawerDetails({
  row,
  detail,
  draft,
  brands,
  canWrite,
  onChange,
}: {
  row: StationListRow;
  detail?: StationDetail;
  draft: Record<string, unknown>;
  brands: { id: string; name: string }[];
  canWrite: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const place = detail?.place;
  const facilities = new Set((place?.place_facility || []).map((item) => item.facility_type));
  const picked = new Set(((draft.facilities as string[] | undefined) || [...facilities]).filter((slug) => slug !== "fuel_pump"));
  const locked = !canWrite;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <label className="flex flex-col gap-1 font-semibold text-slate-700">Name
        <input className="font-normal border border-slate-200 rounded-lg px-3 py-2" value={String(draft.name ?? place?.name ?? row.name)} disabled={locked} onChange={(event) => onChange({ name: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 font-semibold text-slate-700">Brand
        <select className="font-normal border border-slate-200 rounded-lg px-3 py-2" value={String(draft.brandId ?? place?.brand_id ?? "")} disabled={locked} onChange={(event) => onChange({ brandId: event.target.value || null })}>
          <option value="">No brand set</option>
          {brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-semibold text-slate-700">Address
        <input className="font-normal border border-slate-200 rounded-lg px-3 py-2" value={String(draft.address ?? place?.address ?? "")} disabled={locked} onChange={(event) => onChange({ address: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 font-semibold text-slate-700">Phone
        <input className="font-normal border border-slate-200 rounded-lg px-3 py-2" value={String(draft.phone ?? place?.phone ?? "")} disabled={locked} onChange={(event) => onChange({ phone: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 font-semibold text-slate-700">Website
        <input className="font-normal border border-slate-200 rounded-lg px-3 py-2" value={String(draft.website ?? place?.website ?? "")} disabled={locked} onChange={(event) => onChange({ website: event.target.value })} />
      </label>
      <label className="flex flex-col gap-1 font-semibold text-slate-700">Status
        <select className="font-normal border border-slate-200 rounded-lg px-3 py-2" value={String(draft.status ?? place?.status ?? row.status)} disabled={locked} onChange={(event) => onChange({ status: event.target.value })}>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="duplicate">Duplicate</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <div>
        <div className="font-semibold text-slate-700">Parish</div>
        <div className="mt-1 text-slate-800">{row.parish_name || "—"}</div>
        <div className="text-[11px] text-slate-500">Parish text: {row.parish_text || "—"}</div>
        {row.parish_text_mismatch && canWrite ? (
          <button type="button" className="mt-1 text-blue-600 font-bold" onClick={() => onChange({ parish: row.parish_name })}>Use map parish</button>
        ) : null}
      </div>
      <div>
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Amenities on Site</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {AMENITIES.map((slug) => {
            const on = picked.has(slug);
            return (
              <button
                key={slug}
                type="button"
                disabled={locked}
                aria-pressed={on}
                className={`px-2 py-1 rounded-full border text-[11px] ${on ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}
                onClick={() => {
                  const next = new Set(picked);
                  if (on) next.delete(slug);
                  else next.add(slug);
                  onChange({ facilities: [...next] });
                }}
              >{slug.replace(/_/g, " ")}</button>
            );
          })}
        </div>
        {Array.isArray(place?.attributes?.unmapped_amenities) ? (
          <div className="mt-1 text-[11px] text-slate-500">Unmapped: {(place?.attributes?.unmapped_amenities as string[]).join(", ")}</div>
        ) : null}
      </div>
    </div>
  );
}
