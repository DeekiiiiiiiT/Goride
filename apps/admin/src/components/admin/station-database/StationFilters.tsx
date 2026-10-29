import type { ReactNode } from "react";
import type { StationFilters as Filters, StationListResponse } from "./stationRegisterApi";
import { StationIcon } from "./StationIcon";

const STATUSES = ["", "verified", "pending", "duplicate", "closed"];
const PINS = ["", "unchecked", "confirmed", "offset"];
const SOURCES = ["", "fleet", "plug", "manual", "import"];
const ISSUES = [
  ["", "All"],
  ["duplicate", "Duplicates"],
  ["no_brand", "Missing brand"],
  ["parish_mismatch", "Parish mismatch"],
  ["pin_unchecked", "Pin unchecked"],
  ["company_name", "Company-style name"],
  ["not_verified", "Not verified"],
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-xs hover:border-slate-300">
      <span className="text-slate-400 text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      {children}
    </div>
  );
}

export function StationFilters({
  filters,
  meta,
  open,
  onChange,
  onReset,
}: {
  filters: Filters;
  meta?: StationListResponse;
  open: boolean;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}) {
  const select = "bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer";
  return (
    <div className={`${open ? "flex" : "hidden"} md:flex px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/80 flex-wrap items-center justify-between gap-3 text-xs`}>
      <div className="flex flex-wrap items-center gap-2">
        <Field label="Status">
          <select className={select} value={filters.status} onChange={(event) => onChange({ status: event.target.value, page: 1 })}>
            {STATUSES.map((value) => <option key={value || "all"} value={value}>{value ? value[0].toUpperCase() + value.slice(1) : "All"}</option>)}
          </select>
        </Field>
        <Field label="Parish">
          <select className={select} value={filters.pcode} onChange={(event) => onChange({ pcode: event.target.value, page: 1 })}>
            <option value="">All</option>
            {(meta?.parishes || []).map((parish) => <option key={parish.pcode} value={parish.pcode}>{parish.name}</option>)}
          </select>
        </Field>
        <Field label="Brand">
          <select className={select} value={filters.brand} onChange={(event) => onChange({ brand: event.target.value, page: 1 })}>
            <option value="">All</option>
            <option value="none">No brand set</option>
            {(meta?.brands || []).map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
          </select>
        </Field>
        <Field label="Pin">
          <select className={select} value={filters.pin} onChange={(event) => onChange({ pin: event.target.value, page: 1 })}>
            {PINS.map((value) => <option key={value || "all"} value={value}>{value ? value[0].toUpperCase() + value.slice(1) : "All"}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select className={select} value={filters.source} onChange={(event) => onChange({ source: event.target.value, page: 1 })}>
            {SOURCES.map((value) => <option key={value || "all"} value={value}>{value ? value[0].toUpperCase() + value.slice(1) : "All"}</option>)}
          </select>
        </Field>
        <Field label="Issue">
          <select className={select} value={filters.issue} onChange={(event) => onChange({ issue: event.target.value, page: 1 })}>
            {ISSUES.map(([value, label]) => <option key={value || "all"} value={value}>{label}</option>)}
          </select>
        </Field>
      </div>
      <button type="button" onClick={onReset} className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer flex items-center gap-1">
        <StationIcon name="refresh" className="text-[14px]" />Reset filters
      </button>
    </div>
  );
}
