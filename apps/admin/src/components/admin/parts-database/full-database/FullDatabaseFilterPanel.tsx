import type { CatalogMatch } from "../partsCatalogUrl";

const MATCHES: Array<{ id: CatalogMatch; label: string; tag?: string; dot?: string }> = [
  { id: "all", label: "All" },
  { id: "oem", label: "Made for the car", tag: "OEM", dot: "#0153dc" },
  { id: "sister", label: "Same car, diff. badge", tag: "Sister", dot: "#0e7490" },
  { id: "engine", label: "Fits the engine", tag: "Engine", dot: "#b45309" },
  { id: "aftermarket", label: "Other brands", tag: "Aftermarket", dot: "#7c3aed" },
  { id: "universal", label: "Fits by size", tag: "Universal", dot: "#006e31" },
];

const AREA_ICONS: Record<string, string> = {
  Brakes: "album",
  Engine: "settings_suggest",
  Filters: "filter_alt",
  "Lights & visibility": "lightbulb",
  "Suspension & steering": "swap_driving_apps",
  Cooling: "ac_unit",
  "Battery & electrical": "battery_charging_full",
  "A/C": "air",
  Transmission: "motion_sensor_active",
  "Tyres & wheels": "tire_repair",
};

const QUIET_AREAS = Object.keys(AREA_ICONS).filter((name) => name !== "Brakes" && name !== "Engine");

export function FullDatabaseFilterPanel({
  draft,
  onDraft,
  make,
  model,
  year,
  makes,
  models,
  years,
  onMake,
  onModel,
  onYear,
  match,
  counts,
  onMatch,
  assembly,
  areas,
  onAssembly,
  brands,
  brandChoices,
  onToggleBrand,
  status,
  statusCounts,
  onStatus,
  onReset,
}: {
  draft: string;
  onDraft: (value: string) => void;
  make: string;
  model: string;
  year: string;
  makes: string[];
  models: string[];
  years: number[];
  onMake: (value: string) => void;
  onModel: (value: string) => void;
  onYear: (value: string) => void;
  match: CatalogMatch;
  counts: Record<CatalogMatch, number>;
  onMatch: (value: CatalogMatch) => void;
  assembly: string;
  areas: Array<{ name: string; count: number }>;
  onAssembly: (value: string) => void;
  brands: string[];
  brandChoices: Array<{ name: string; count: number }>;
  onToggleBrand: (name: string) => void;
  status: string;
  statusCounts: { all: number; verified: number; needs_checking: number };
  onStatus: (value: string) => void;
  onReset: () => void;
}) {
  const areaRows = [
    ...areas,
    ...QUIET_AREAS.filter((name) => !areas.some((area) => area.name === name)).map((name) => ({ name, count: 0 })),
  ];
  const selectClass = "w-full appearance-none h-7 pl-2.5 pr-6 rounded-lg bg-surface-container-low border border-outline-variant/60 font-body-sm text-[12px] text-on-surface focus:outline-none focus:border-primary";
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-outline text-[18px]">search</span>
        <input
          className="w-full h-8 pl-8 pr-2.5 rounded-lg bg-surface-container-low border border-outline-variant/60 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary focus:bg-surface-container-lowest"
          placeholder="Search part name, number or brand"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/40">
        <div className="flex items-center justify-between">
          <span className="font-mono-sm text-[11px] uppercase tracking-wider text-secondary font-bold">Car</span>
          <span className="text-[11px] text-outline">Filter vehicle</span>
        </div>
        <div className="space-y-1.5">
          <div className="relative">
            <select className={selectClass} value={make} onChange={(event) => onMake(event.target.value)}>
              <option value="">All makes</option>
              {makes.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">arrow_drop_down</span>
          </div>
          <div className="relative">
            <select className={selectClass} value={model} disabled={!make} onChange={(event) => onModel(event.target.value)}>
              <option value="">All models</option>
              {models.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">arrow_drop_down</span>
          </div>
          <div className="relative">
            <select className={selectClass} value={year} disabled={!model} onChange={(event) => onYear(event.target.value)}>
              <option value="">All years</option>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <span className="material-symbols-outlined pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-outline text-[16px]">arrow_drop_down</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/40">
        <span className="font-mono-sm text-[11px] uppercase tracking-wider text-secondary font-bold">Match type</span>
        <div className="flex flex-col gap-1 font-body-sm text-[12px]">
          {MATCHES.map((item) => {
            const count = counts[item.id] ?? 0;
            const muted = item.id !== "all" && count === 0;
            const on = match === item.id;
            return (
              <label key={item.id} className={`flex items-center justify-between px-2 py-1 rounded-md ${muted ? "opacity-45" : "hover:bg-surface-container-low cursor-pointer"} ${on ? "bg-surface-container-low" : ""}`}>
                <span className="flex items-center gap-2">
                  <input className="w-3.5 h-3.5 text-primary" type="radio" name="match_type" checked={on} disabled={muted && !on} onChange={() => onMatch(item.id)} />
                  {item.dot ? <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.dot }} /> : null}
                  <span className={on ? "font-semibold text-on-surface" : "text-on-surface"}>{item.label}</span>
                  {item.tag ? <span className="px-1 py-0.2 rounded bg-surface-container text-secondary text-[9px] font-mono-sm font-semibold">{item.tag}</span> : null}
                </span>
                <span className="px-1.5 py-0.2 rounded-full bg-surface-container text-secondary font-mono-sm text-[10px] font-bold">{count}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/40">
        <span className="font-mono-sm text-[11px] uppercase tracking-wider text-secondary font-bold">Area</span>
        <button type="button" className={`flex items-center justify-between px-2 py-1 rounded-md text-[12px] ${assembly ? "hover:bg-surface-container-low" : "bg-surface-container-low text-primary font-bold"}`} onClick={() => onAssembly("")}>
          <span className="flex items-center gap-2"><span className="material-symbols-outlined text-[15px]">apps</span>All areas</span>
          <span className="px-1.5 py-0.2 rounded-full bg-surface-container-lowest border border-outline-variant/40 font-mono-sm text-[10px]">{statusCounts.all}</span>
        </button>
        {areaRows.map((area) => {
          const on = assembly === area.name;
          const quiet = area.count === 0;
          return (
            <button key={area.name} type="button" className={`flex items-center justify-between px-2 py-1 rounded-md text-[12px] ${quiet ? "text-outline/70" : "hover:bg-surface-container-low text-on-surface"} ${on ? "bg-surface-container-low text-primary font-bold" : ""}`} onClick={() => onAssembly(on ? "" : area.name)}>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[15px] text-secondary">{AREA_ICONS[area.name] ?? "category"}</span>
                <span>{area.name}</span>
              </span>
              <span className="px-1.5 py-0.2 rounded-full bg-surface-container text-secondary font-mono-sm text-[10px]">{area.count}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/40">
        <span className="font-mono-sm text-[11px] uppercase tracking-wider text-secondary font-bold">Brand</span>
        {brandChoices.length === 0 ? <p className="text-[12px] text-outline">No brands in this view</p> : brandChoices.map((item) => (
          <label key={item.name} className="flex items-center justify-between px-1 py-0.5 cursor-pointer text-[12px]">
            <span className="flex items-center gap-2">
              <input className="rounded border-outline-variant text-primary w-3.5 h-3.5" type="checkbox" checked={brands.includes(item.name)} onChange={() => onToggleBrand(item.name)} />
              <span className="text-on-surface">{item.name}</span>
            </span>
            <span className="font-mono-sm text-outline text-[11px]">{item.count}</span>
          </label>
        ))}
      </div>
      <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/40">
        <span className="font-mono-sm text-[11px] uppercase tracking-wider text-secondary font-bold">Status</span>
        {([
          ["", "All", statusCounts.all],
          ["verified", "Verified", statusCounts.verified],
          ["needs_checking", "Needs checking", statusCounts.needs_checking],
        ] as const).map(([value, label, count]) => (
          <label key={label} className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-surface-container-low cursor-pointer text-[12px]">
            <span className="flex items-center gap-2">
              <input className="w-3.5 h-3.5 text-primary" type="radio" name="status_radio" checked={status === value} onChange={() => onStatus(value)} />
              <span className="text-on-surface">{label}</span>
            </span>
            <span className="font-mono-sm text-outline text-[11px]">{count}</span>
          </label>
        ))}
      </div>
      <div className="pt-2 border-t border-outline-variant/40">
        <button className="w-full text-center text-body-sm text-secondary hover:text-primary py-1 font-medium" type="button" onClick={onReset}>Reset filters</button>
      </div>
    </div>
  );
}
