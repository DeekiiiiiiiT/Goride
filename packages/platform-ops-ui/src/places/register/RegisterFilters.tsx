// Stitch: dominion-redesign/7b9231f8dae1411996e38bd680d73727
import type { Taxonomy } from "../placesApi";

const STATUSES = ["verified", "pending", "learnt", "rejected", "duplicate", "closed", "anomaly"];
const PINS = ["unchecked", "confirmed", "offset"];
const SOURCES = [
  ["manual", "Manual"],
  ["fleet", "Roam Fleet"],
  ["plug", "Plug"],
  ["import", "Import"],
];
const ISSUES = [
  ["pin_unchecked", "Pin not checked"],
  ["verified_pin_unchecked", "Verified, pin not checked"],
  ["no_brand", "No brand"],
  ["no_phone", "No phone"],
  ["parish_mismatch", "Parish text differs"],
  ["outside_jamaica", "Outside Jamaica"],
  ["area_parish_only", "Parish only"],
];

function Menu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="h-8 px-2.5 bg-surface-container-low text-on-surface font-label rounded-lg hover:bg-surface-container flex items-center gap-1.5 transition-colors text-xs">
      <span>{value ? options.find((option) => option.value === value)?.label || label : label}</span>
      <span className="material-symbols-outlined text-[15px] text-outline">expand_more</span>
      <select className="sr-only" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{label}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

export function RegisterFilters({
  filters,
  taxonomy,
  onChange,
  onSearch,
  onClear,
}: {
  filters: Record<string, string>;
  taxonomy: Taxonomy | null;
  onChange: (key: string, value: string) => void;
  onSearch: (value: string) => void;
  onClear: () => void;
}) {
  const types = (taxonomy?.placeTypes || []).map((row) => ({ value: row.slug, label: row.label }));
  const brands = (taxonomy?.brands || []).map((row) => ({ value: row.id, label: row.name }));
  const parishNames = ["Kingston", "Saint Andrew", "Saint Catherine", "Clarendon", "Manchester", "Saint Elizabeth", "Westmoreland", "Hanover", "Saint James", "Trelawny", "Saint Ann", "Saint Mary", "Portland", "Saint Thomas"];
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm p-3 mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[320px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
          <input
            className="w-full pl-9 pr-4 py-1.5 bg-surface-container-low text-on-surface text-xs rounded-lg outline-none font-body placeholder:text-outline focus:bg-surface-container transition-colors"
            placeholder="Search name, brand, alias, plus code or address"
            value={filters.q || ""}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          <Menu label="Type" value={filters.type || ""} options={types} onChange={(value) => onChange("type", value)} />
          <Menu label="Status" value={filters.status || ""} options={STATUSES.map((status) => ({ value: status, label: status }))} onChange={(value) => onChange("status", value)} />
          <Menu label="Brand" value={filters.brand || ""} options={brands} onChange={(value) => onChange("brand", value)} />
          {filters.parish ? (
            <button className="h-8 px-2.5 bg-secondary-container text-on-secondary-container font-label font-medium rounded-lg flex items-center gap-1.5" type="button" onClick={() => onChange("parish", "")}>
              <span>Parish: {filters.parish}</span>
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          ) : (
            <Menu label="Parish" value="" options={parishNames.map((name) => ({ value: name, label: name }))} onChange={(value) => onChange("parish", value)} />
          )}
          <Menu label="Pin" value={filters.pin || ""} options={PINS.map((pin) => ({ value: pin, label: pin }))} onChange={(value) => onChange("pin", value)} />
          <Menu label="Source" value={filters.source || ""} options={SOURCES.map(([value, label]) => ({ value, label }))} onChange={(value) => onChange("source", value)} />
          <Menu label="Issue" value={filters.issue || ""} options={ISSUES.map(([value, label]) => ({ value, label }))} onChange={(value) => onChange("issue", value)} />
          <button className="text-xs text-secondary hover:text-secondary-dim font-medium px-2 py-1 transition-colors" type="button" onClick={onClear}>
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
