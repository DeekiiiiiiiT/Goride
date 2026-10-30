// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
// Stitch: dominion-redesign/23f682ed913f4930b9c446cd902aa284
import { useState } from "react";
import type { TaxonomyTable } from "./categoriesFormat";

const TITLES: Record<TaxonomyTable, string> = {
  category_group: "Group",
  category: "Category",
  place_type: "Place type",
  facility_type: "Facility type",
  brand: "Brand",
};

export function TaxonomyEditDrawer({
  table,
  creating,
  initial,
  busy,
  error,
  onClose,
  onSave,
}: {
  table: TaxonomyTable;
  creating: boolean;
  initial: Record<string, string>;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (fields: Record<string, string>, reason: string) => void;
}) {
  const [fields, setFields] = useState(initial);
  const [reason, setReason] = useState("");
  const set = (key: string, value: string) => setFields((current) => ({ ...current, [key]: value }));
  const ready = reason.trim().length >= 10 && !busy;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-slate-200 bg-white text-slate-800 shadow-2xl">
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-6">
          <div>
            <p className="text-xs text-slate-500">{creating ? "Add" : "Edit"}</p>
            <h2 className="text-base font-semibold">{TITLES[table]}</h2>
          </div>
          <button type="button" className="rounded-lg px-2 py-1 text-sm text-slate-500" onClick={onClose}>Close</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5 text-sm">
          {creating && (table === "category_group" || table === "category") && (
            <Field label="Code" value={fields.code || ""} onChange={(value) => set("code", value)} />
          )}
          {creating && table !== "brand" && (
            <Field label="Slug" value={fields.slug || ""} onChange={(value) => set("slug", value)} />
          )}
          {creating && table === "brand" && (
            <Field label="Slug" value={fields.slug || ""} onChange={(value) => set("slug", value)} />
          )}
          {table === "brand" ? (
            <Field label="Name" value={fields.name || ""} onChange={(value) => set("name", value)} />
          ) : (
            <Field label="Label" value={fields.label || ""} onChange={(value) => set("label", value)} />
          )}
          {table === "category_group" && <Field label="Colour" value={fields.colour || "#e1e2ed"} onChange={(value) => set("colour", value)} />}
          {(table === "category" || table === "place_type" || table === "facility_type") && creating && (
            <Field label={table === "category" ? "Group code" : "Category code"} value={fields[table === "category" ? "group_code" : "category_code"] || ""} onChange={(value) => set(table === "category" ? "group_code" : "category_code", value)} />
          )}
          {table === "place_type" && <Field label="Geofence metres" value={fields.default_geofence_m || "50"} onChange={(value) => set("default_geofence_m", value)} />}
          {table === "place_type" && <Field label="Default facilities" value={fields.default_facilities || ""} onChange={(value) => set("default_facilities", value)} />}
          {table === "place_type" && <Field label="Plug label" value={fields.plug_label || ""} onChange={(value) => set("plug_label", value)} />}
          {table === "place_type" && <Field label="Map label" value={fields.plug_map_label || ""} onChange={(value) => set("plug_map_label", value)} />}
          {table === "place_type" && <Field label="Plug icon" value={fields.grid_icon || ""} onChange={(value) => set("grid_icon", value)} />}
          {table === "place_type" && <Field label="Order weight" value={fields.grid_sort || ""} onChange={(value) => set("grid_sort", value)} />}
          {table === "place_type" && <Field label="Empty hint" value={fields.empty_hint || ""} onChange={(value) => set("empty_hint", value)} />}
          {table === "brand" && <Field label="Aliases" value={fields.aliases || ""} onChange={(value) => set("aliases", value)} />}
          {table === "brand" && <Field label="Add logo" value={fields.logo_url || ""} onChange={(value) => set("logo_url", value)} />}
          {table === "brand" && <Field label="Used for" value={fields.place_types || "gas_station"} onChange={(value) => set("place_types", value)} />}
          <label className="block text-xs font-semibold text-slate-700">
            Reason *
            <textarea className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <p className="text-[11px] text-slate-500">A save needs a reason of at least 10 characters. Match profile stays locked.</p>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600" onClick={onClose}>Cancel</button>
          <button type="button" disabled={!ready} className="rounded-lg bg-[#316bf3] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => onSave(fields, reason.trim())}>
            Save
          </button>
        </div>
      </aside>
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-xs font-semibold text-slate-700">
      {label}
      <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
