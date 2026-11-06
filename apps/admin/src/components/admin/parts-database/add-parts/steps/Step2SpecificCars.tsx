// Stitch AP4
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { AddPartsDraft } from "../addPartsTypes";
import { searchAddPartVehicles, type AddPartVehicleRow } from "../addPartsApi";
import { fetchVehicleOptions } from "../../partsDatabaseApi";
import { PositionChips, AxlePositionButtons } from "../Step2FitBlock";
import { PartsButton } from "../../PartsButton";
import { RequestCarPanel } from "../states/RequestCarPanel";

function productionLabel(v: AddPartVehicleRow) {
  const start = v.production_start_year;
  const end = v.production_end_year;
  if (start && end && end < 9999) return `${start}–${end}`;
  if (start) return `${start}–`;
  return "—";
}

function engineTrim(v: AddPartVehicleRow) {
  return [v.engine_code, v.version_name].filter(Boolean).join(" · ") || "—";
}

function vehicleRowLabel(v: AddPartVehicleRow) {
  return [v.make, v.model, v.chassis_code, productionLabel(v)].filter(Boolean).join(" ");
}

const emptyFilters = { make: "", model: "", chassis: "", engine: "", yearFrom: "", yearTo: "" };

function sisterTitle(models: string[]) {
  const uniq = [...new Set(models)].slice(0, 6);
  return uniq.length ? uniq.join(" · ") : "Related models";
}

export function Step2SpecificCars({ draft, setDraft }: { draft: AddPartsDraft; setDraft: (d: AddPartsDraft) => void }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [globalYearFrom, setGlobalYearFrom] = useState("");
  const [globalYearTo, setGlobalYearTo] = useState("");

  const makes = useQuery({ queryKey: ["vehicle-options-makes"], queryFn: () => fetchVehicleOptions({}) });
  const models = useQuery({
    queryKey: ["vehicle-options-models", filters.make],
    queryFn: () => fetchVehicleOptions({ make: filters.make }),
    enabled: Boolean(filters.make),
  });

  const search = useQuery({
    queryKey: ["add-part-vehicles", q, filters],
    queryFn: () =>
      searchAddPartVehicles({
        q,
        make: filters.make || undefined,
        model: filters.model || undefined,
        chassis: filters.chassis || undefined,
        engine: filters.engine || undefined,
        yearFrom: filters.yearFrom ? Number(filters.yearFrom) : undefined,
        yearTo: filters.yearTo ? Number(filters.yearTo) : undefined,
      }),
    enabled: q.trim().length >= 1 || Boolean(filters.make || filters.model || filters.chassis || filters.engine),
  });

  const selectedIds = useMemo(() => new Set(draft.listings.map((l) => l.vehicleId)), [draft.listings]);

  const grouped = useMemo(() => {
    const items = search.data ?? [];
    const map = new Map<string, AddPartVehicleRow[]>();
    for (const v of items) {
      const key = v.platform_id ?? v.id;
      const list = map.get(key) ?? [];
      list.push(v);
      map.set(key, list);
    }
    return [...map.values()];
  }, [search.data]);

  function resetFilters() {
    setFilters(emptyFilters);
    setQ("");
  }

  function applyGlobalYears(from?: number, to?: number) {
    setDraft({
      ...draft,
      listings: draft.listings.map((l) => ({ ...l, yearFrom: from, yearTo: to })),
    });
  }

  function setAxlePosition(pos: string, side: string) {
    setDraft({
      ...draft,
      position: pos,
      side,
      listings: draft.listings.map((l) => ({ ...l, position: pos, side })),
    });
  }

  function toggleVehicle(v: AddPartVehicleRow) {
    const id = v.id;
    const label = vehicleRowLabel(v);
    if (selectedIds.has(id)) {
      setDraft({ ...draft, listings: draft.listings.filter((l) => l.vehicleId !== id) });
    } else {
      setDraft({
        ...draft,
        listings: [
          ...draft.listings,
          {
            vehicleId: id,
            label,
            position: draft.position,
            side: draft.side,
          },
        ],
      });
    }
  }

  function toggleGroupAll(group: AddPartVehicleRow[], on: boolean) {
    if (on) {
      const next = [...draft.listings];
      const ids = new Set(next.map((l) => l.vehicleId));
      for (const v of group) {
        if (!ids.has(v.id)) {
          next.push({
            vehicleId: v.id,
            label: vehicleRowLabel(v),
            position: draft.position,
            side: draft.side,
          });
        }
      }
      setDraft({ ...draft, listings: next });
    } else {
      const groupIds = new Set(group.map((v) => v.id));
      setDraft({ ...draft, listings: draft.listings.filter((l) => !groupIds.has(l.vehicleId)) });
    }
  }

  if (!draft.partType) return null;

  const globalAxlePosition = draft.listings[0]?.position ?? draft.position;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
      <section className="lg:col-span-7 space-y-space-md">
        <div className="relative bg-surface-container-low p-space-md rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between relative z-10 gap-space-md flex-wrap">
            <div className="space-y-1 min-w-0">
              <span className="font-label-xs uppercase font-bold text-primary tracking-wider">Axle Application Matrix</span>
              <div className="font-headline-md text-on-surface">Toyota / Daihatsu Common Chassis</div>
              <p className="font-body-sm text-secondary">
                Front Disc Brake Caliper Assembly [Pad Code {draft.partNumber || "—"}]
              </p>
            </div>
            <div className="w-32 h-16 text-primary flex items-center justify-center opacity-90 shrink-0">
              <svg className="w-full h-full fill-none stroke-current" strokeWidth="1.5" viewBox="0 0 160 80" aria-hidden>
                <circle className="text-outline-variant" cx="40" cy="40" r="28" strokeDasharray="2 3" />
                <circle className="text-outline-variant" cx="120" cy="40" r="28" strokeDasharray="2 3" />
                <line className="text-outline" x1="40" x2="120" y1="40" y2="40" />
                <rect className="fill-primary-fixed text-primary" height="32" rx="4" width="28" x="26" y="24" />
                <rect className="fill-primary-fixed text-primary" height="32" rx="4" width="28" x="106" y="24" />
                <circle className="fill-primary text-primary" cx="40" cy="40" r="6" />
                <circle className="fill-primary text-primary" cx="120" cy="40" r="6" />
                <text className="stroke-none fill-primary font-mono-sm text-[9px] font-bold" textAnchor="middle" x="80" y="32">FRONT AXLE</text>
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm space-y-space-sm">
          <div className="relative flex items-center">
            <MaterialIcon name="search" className="absolute left-3 text-on-surface-variant text-[20px]" />
            <input
              className="w-full h-10 pl-10 pr-3 bg-surface-container-low rounded-lg text-on-surface font-body-sm placeholder:text-outline border border-transparent focus:border-primary-container focus:outline-none"
              placeholder="Make, model or chassis code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-on-surface font-mono-sm hover:bg-surface-container-high cursor-pointer">
              <span className="text-secondary font-body-sm">Make:</span>
              <select
                className="bg-transparent border-0 outline-none font-mono-sm text-on-surface max-w-[100px] appearance-none pr-4"
                value={filters.make}
                onChange={(e) => setFilters({ ...filters, make: e.target.value, model: "" })}
              >
                <option value="">All</option>
                {(makes.data?.makes ?? []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <MaterialIcon name="arrow_drop_down" className="text-[14px] text-outline -ml-3 pointer-events-none" />
            </label>
            <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-on-surface font-mono-sm hover:bg-surface-container-high cursor-pointer">
              <span className="text-secondary font-body-sm">Model:</span>
              <select
                className="bg-transparent border-0 outline-none font-mono-sm text-on-surface max-w-[100px] appearance-none pr-4"
                value={filters.model}
                disabled={!filters.make}
                onChange={(e) => setFilters({ ...filters, model: e.target.value })}
              >
                <option value="">All</option>
                {(models.data?.models ?? []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <MaterialIcon name="arrow_drop_down" className="text-[14px] text-outline -ml-3 pointer-events-none" />
            </label>
            <label
              className={
                filters.chassis
                  ? "inline-flex items-center gap-1 px-2.5 py-1 rounded bg-primary-fixed text-primary font-mono-sm font-semibold"
                  : "inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-on-surface font-mono-sm"
              }
            >
              <span className={filters.chassis ? "text-primary font-body-sm" : "text-secondary font-body-sm"}>Chassis:</span>
              <input
                className="bg-transparent border-0 outline-none font-mono-sm uppercase w-16"
                placeholder="All"
                value={filters.chassis}
                onChange={(e) => setFilters({ ...filters, chassis: e.target.value.toUpperCase() })}
              />
              {filters.chassis ? (
                <button type="button" aria-label="Clear chassis" onClick={() => setFilters({ ...filters, chassis: "" })}>
                  <MaterialIcon name="close" className="text-[14px]" />
                </button>
              ) : (
                <MaterialIcon name="arrow_drop_down" className="text-[14px] text-outline" />
              )}
            </label>
            <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-on-surface font-mono-sm">
              <span className="text-secondary font-body-sm">Years:</span>
              <input
                className="bg-transparent border-0 outline-none font-mono-sm w-10"
                placeholder="From"
                aria-label="Filter years from"
                inputMode="numeric"
                value={filters.yearFrom}
                onChange={(e) => setFilters({ ...filters, yearFrom: e.target.value.replace(/\D/g, "") })}
              />
              <span className="text-outline">–</span>
              <input
                className="bg-transparent border-0 outline-none font-mono-sm w-10"
                placeholder="To"
                aria-label="Filter years to"
                inputMode="numeric"
                value={filters.yearTo}
                onChange={(e) => setFilters({ ...filters, yearTo: e.target.value.replace(/\D/g, "") })}
              />
            </label>
            <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container text-on-surface font-mono-sm hover:bg-surface-container-high">
              <span className="text-secondary font-body-sm">Engine:</span>
              <input
                className="bg-transparent border-0 outline-none font-mono-sm uppercase w-14"
                placeholder="All"
                aria-label="Filter by engine code"
                value={filters.engine}
                onChange={(e) => setFilters({ ...filters, engine: e.target.value.toUpperCase() })}
              />
              <MaterialIcon name="arrow_drop_down" className="text-[14px] text-outline" />
            </label>
            <PartsButton variant="secondary" className="ml-auto font-label-xs min-h-[32px] h-8" onClick={resetFilters}>
              Reset filters
            </PartsButton>
          </div>
        </div>

        {search.isFetching ? (
          <p className="font-body-sm text-on-surface-variant">Loading cars…</p>
        ) : null}

        {grouped.length === 0 && !search.isFetching ? (
          <p className="font-body-sm text-on-surface-variant">Search by make, model, or chassis to list car versions.</p>
        ) : null}

        {grouped.map((group) => {
          const selectedInGroup = group.filter((v) => selectedIds.has(v.id)).length;
          const allInGroup = selectedInGroup === group.length && group.length > 0;
          const modelsInGroup = group.map((v) => v.model);
          return (
            <div key={group[0]!.id} className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
              <div className="bg-surface-container-low px-space-md py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MaterialIcon name="directions_car" className="text-primary text-[18px]" />
                  <span className="font-headline-md text-on-surface truncate">
                    Same body: {sisterTitle(modelsInGroup)}
                  </span>
                </div>
                <span className="font-label-xs text-on-surface-variant shrink-0">
                  {selectedInGroup} / {group.length} selected
                </span>
              </div>
              <div className="grid grid-cols-12 px-space-md py-2 bg-surface text-on-surface-variant font-label-xs uppercase tracking-wider min-w-0">
                <div className="col-span-1 flex items-center shrink-0">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary cursor-pointer"
                    checked={allInGroup}
                    onChange={(e) => toggleGroupAll(group, e.target.checked)}
                    title="Select all in group"
                  />
                </div>
                <div className="col-span-4 min-w-0 truncate">Vehicle Model</div>
                <div className="col-span-2 min-w-0 truncate">Chassis</div>
                <div className="col-span-3 min-w-0 truncate">Production</div>
                <div className="col-span-2 min-w-0 truncate">Engine &amp; Trim</div>
              </div>
              <div className="space-y-0.5 p-1 bg-surface-container-low">
                {group.map((v) => (
                  <label
                    key={v.id}
                    className="grid grid-cols-12 items-center px-space-md py-2.5 bg-surface-container-lowest hover:bg-surface-container-low cursor-pointer transition-colors rounded"
                  >
                    <div className="col-span-1">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-primary"
                        checked={selectedIds.has(v.id)}
                        onChange={() => toggleVehicle(v)}
                      />
                    </div>
                    <div className="col-span-4 font-body-sm font-semibold text-on-surface min-w-0 truncate">{v.make} {v.model}</div>
                    <div className="col-span-2 font-mono-sm text-primary font-semibold min-w-0 truncate">{v.chassis_code ?? "—"}</div>
                    <div className="col-span-3 font-mono-sm text-on-surface-variant min-w-0 truncate">{productionLabel(v)}</div>
                    <div className="col-span-2 font-mono-sm text-on-surface-variant truncate min-w-0">{engineTrim(v)}</div>
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        <RequestCarPanel draft={draft} />
      </section>

      <section className="lg:col-span-5 space-y-space-md">
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm space-y-space-lg">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-headline-md text-on-surface">Your selection</h2>
              <span className="font-body-sm text-on-surface-variant">Assigned fitment target list</span>
            </div>
            <span className="px-2.5 py-1 rounded bg-primary-fixed text-primary font-mono-md font-semibold text-sm">
              {draft.listings.length} car{draft.listings.length === 1 ? "" : "s"} selected
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-[200px] overflow-y-auto">
            {draft.listings.map((l) => (
              <div
                key={l.vehicleId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container text-on-surface font-body-sm"
              >
                <span>{l.label ?? l.vehicleId.slice(0, 8)}</span>
                <PartsButton
                  variant="icon"
                  aria-label="Remove"
                  onClick={() => setDraft({ ...draft, listings: draft.listings.filter((x) => x.vehicleId !== l.vehicleId) })}
                >
                  <MaterialIcon name="close" className="text-[16px]" />
                </PartsButton>
              </div>
            ))}
            {draft.listings.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">Tick cars in the table to build your list.</p>
            ) : null}
          </div>

          {draft.partType.positionScheme !== "none" && draft.listings.length > 0 ? (
            <div className="space-y-2 border-t border-outline-variant/30 pt-space-md">
              <p className="font-headline-md text-on-surface">Where on the car?</p>
              <div className="rounded-xl bg-surface-container-low p-space-md border border-outline-variant/30">
                <p className="font-label-xs text-outline uppercase mb-2">Axle matrix</p>
                {draft.partType.positionScheme === "axle" || draft.partType.positionScheme === "axle_inner_outer" ? (
                  <AxlePositionButtons position={globalAxlePosition} onPick={setAxlePosition} />
                ) : (
                  <PositionChips
                    scheme={draft.partType.positionScheme}
                    position={globalAxlePosition}
                    side={draft.side}
                    onPick={setAxlePosition}
                  />
                )}
              </div>
              {draft.listings.length > 0
                && (draft.partType.positionScheme === "axle" || draft.partType.positionScheme === "axle_inner_outer") ? (
                <div className="flex items-start gap-2 p-2.5 bg-surface-container-low rounded-lg">
                  <MaterialIcon name="info" className="text-primary text-[18px] mt-0.5 shrink-0" />
                  <p className="font-body-sm text-secondary">
                    Pads come as an axle set (left and right together). Matching clips and shims are bundled.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {draft.listings.length > 0 ? (
            <div className="rounded-xl bg-surface-container-low p-space-md space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-headline-md font-semibold text-on-surface">Only some years?</p>
                <span className="font-label-xs text-outline uppercase font-semibold">Optional constraint</span>
              </div>
              <div className="grid grid-cols-2 gap-space-md">
                <div className="space-y-1">
                  <span className="font-label-xs text-on-surface-variant">From (year)</span>
                  <input
                    className="w-full h-9 px-3 bg-surface-container-low rounded text-on-surface font-mono-md focus:bg-surface-container-lowest focus:outline-none"
                    type="number"
                    placeholder="2016"
                    value={globalYearFrom}
                    onChange={(e) => {
                      setGlobalYearFrom(e.target.value);
                      const y = Number(e.target.value.replace(/\D/g, ""));
                      applyGlobalYears(y || undefined, globalYearTo ? Number(globalYearTo) : undefined);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <span className="font-label-xs text-on-surface-variant">To (year)</span>
                  <input
                    className="w-full h-9 px-3 bg-surface-container-low rounded text-on-surface font-mono-md placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none"
                    placeholder="Present / current"
                    value={globalYearTo}
                    onChange={(e) => {
                      setGlobalYearTo(e.target.value);
                      const y = Number(e.target.value.replace(/\D/g, ""));
                      applyGlobalYears(globalYearFrom ? Number(globalYearFrom) : undefined, y || undefined);
                    }}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
