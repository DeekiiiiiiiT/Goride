// Stitch: dominion-redesign/categories_tree_tab_gas_station_selected
import { useMemo, useState } from "react";
import {
  groupSwatchStyle,
  typeMark,
  type AdminTaxonomy,
  type SelectedRef,
} from "./categoriesFormat";

function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

export function TaxonomyTree({
  tree,
  selected,
  onSelect,
}: {
  tree: AdminTaxonomy;
  selected: SelectedRef | null;
  onSelect: (next: SelectedRef) => void;
}) {
  const [filter, setFilter] = useState("");
  const [showFacilities, setShowFacilities] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const needle = filter.trim().toLowerCase();

  const groups = useMemo(() => tree.groups.filter((row) => row.active), [tree.groups]);

  function matches(text: string) {
    return !needle || text.toLowerCase().includes(needle);
  }

  return (
    <div className="col-span-12 flex min-h-[640px] flex-col rounded-2xl bg-surface-container-lowest p-4 shadow-sm lg:col-span-5">
      <div className="mb-2 flex items-center gap-3 pb-3">
        <div className="relative flex-1">
          <Icon name="filter_list" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-outline" />
          <input
            className="w-full rounded-lg bg-surface-container py-1.5 pl-8 pr-3 text-xs text-on-surface outline-none placeholder:text-outline transition-colors focus:bg-surface-container-low"
            placeholder="Filter categories and types"
            type="text"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2">
          <input
            checked={showFacilities}
            className="h-3.5 w-3.5 cursor-pointer rounded accent-secondary"
            type="checkbox"
            onChange={(event) => setShowFacilities(event.target.checked)}
          />
          <span className="whitespace-nowrap text-[11px] font-medium text-on-surface-variant">Show facilities</span>
        </label>
      </div>
      <div className="flex flex-col space-y-1 font-body text-xs">
        {groups.map((group) => {
          const categories = tree.categories.filter((row) => row.active && row.group_code === group.code);
          const groupOpen = open[group.code] !== false;
          const groupHit = matches(group.label) || categories.some((row) => matches(row.label));
          if (!groupHit && needle) return null;
          return (
            <div key={group.code} className="flex flex-col pt-1">
              <button
                type="button"
                className="flex cursor-pointer select-none items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-container-low"
                onClick={() => onSelect({ table: "category_group", id: group.code })}
              >
                <span className="flex items-center gap-2">
                  <span className="inline-block shrink-0 rounded-full" style={groupSwatchStyle(group.colour)} />
                  <span className="text-xs font-semibold text-on-surface">{group.label}</span>
                </span>
                <span className="font-mono text-[11px] text-outline">{group.type_count} types</span>
              </button>
              {groupOpen && (
                <div className="ml-4 mt-0.5 flex flex-col space-y-0.5 pl-2">
                  {categories.map((category) => {
                    const types = tree.placeTypes.filter((row) => row.active && row.category_code === category.code);
                    const facilities = tree.facilityTypes.filter((row) => row.active && row.category_code === category.code);
                    const catKey = category.code;
                    const contains = types.some((row) => row.slug === selected?.id);
                    const showKids = open[catKey] === true || (open[catKey] !== false && contains);
                    const visible = !needle || matches(category.label) || types.some((row) => matches(row.label)) || facilities.some((row) => matches(row.label));
                    if (!visible) return null;
                    return (
                      <div key={category.code} className="flex flex-col">
                        <button
                          type="button"
                          className="flex cursor-pointer select-none items-center justify-between rounded px-1.5 py-1 text-xs text-on-surface-variant hover:bg-surface-container-low"
                          onClick={() => {
                            setOpen((current) => {
                              const showing = current[catKey] === true || (current[catKey] !== false && contains);
                              return { ...current, [catKey]: !showing };
                            });
                            onSelect({ table: "category", id: category.code });
                          }}
                        >
                          <span className="flex items-center gap-1.5">
                            <Icon name={showKids ? "arrow_drop_down" : "arrow_right"} className="text-[14px]" />
                            <span>{category.label}</span>
                          </span>
                          {category.type_count === 0 ? (
                            <span className="rounded bg-surface-container px-1 py-0.5 font-mono text-[10px] text-outline">No place types</span>
                          ) : (
                            <span className="font-mono text-[11px] text-outline">{category.type_count} {category.type_count === 1 ? "type" : "types"}</span>
                          )}
                        </button>
                        {showKids && types.map((row) => {
                          if (needle && !matches(row.label) && !matches(row.slug) && !matches(category.label)) return null;
                          const on = selected?.table === "place_type" && selected.id === row.slug;
                          const mark = typeMark(row.slug, row.icon);
                          return (
                            <button
                              key={row.slug}
                              type="button"
                              className={`relative ml-4 flex cursor-pointer items-center justify-between rounded-r-lg py-2 pl-3 pr-2 ${on ? "bg-[#ebf2ff]" : "hover:bg-surface-container-low"}`}
                              onClick={() => onSelect({ table: "place_type", id: row.slug })}
                            >
                              {on && <span className="absolute bottom-0 left-0 top-0 w-[3px] rounded-l bg-secondary" />}
                              <span className="flex min-w-0 items-center gap-2">
                                {mark ? <span className="shrink-0 text-[14px]">{mark}</span> : <Icon name={row.icon || "pin_drop"} className="text-[14px] text-on-surface-variant" />}
                                <span className="truncate font-semibold text-on-surface">{row.label}</span>
                                <span className="rounded bg-surface-container-highest/60 px-1 py-0.5 font-mono text-[10px] text-on-surface-variant">{row.slug}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5">
                                {row.places > 0 ? (
                                  <span className="rounded bg-[#e6f4ea] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#137333]">{row.places}</span>
                                ) : (
                                  <span className="font-mono text-[10px] text-outline">Not used yet</span>
                                )}
                                {row.in_plug && (
                                  <span className="rounded bg-secondary px-1.5 py-0.5 font-label text-[9px] font-semibold uppercase tracking-wider text-on-secondary">In Plug</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                        {showKids && showFacilities && facilities.map((row) => (
                          <button
                            key={row.slug}
                            type="button"
                            className="ml-4 flex items-center justify-between rounded px-2 py-1 text-on-surface-variant hover:bg-surface-container-low"
                            onClick={() => onSelect({ table: "facility_type", id: row.slug })}
                          >
                            <span className="flex items-center gap-2">
                              <Icon name={row.icon || "check_box"} className="text-[14px]" />
                              <span>{row.label}</span>
                            </span>
                            {row.facilities_used > 0 ? (
                              <span className="font-mono text-[10px] text-[#137333]">{row.facilities_used}</span>
                            ) : (
                              <span className="font-mono text-[10px] text-outline">Not used yet</span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
