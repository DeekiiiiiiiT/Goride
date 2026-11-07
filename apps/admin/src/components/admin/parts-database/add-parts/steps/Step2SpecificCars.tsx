// Stitch — specific cars + per-car trust (Dominion 2)
import { useEffect, useMemo, useState, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { AddPartsDraft } from "../addPartsTypes";
import { searchAddPartVehicles, type AddPartVehicleRow, type SelfServePreview } from "../addPartsApi";
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

function sourceTypePhrase(t: string): string {
  if (t === "car_maker_catalogue") return "Car maker catalogue";
  if (t === "part_maker_catalogue") return "Part maker catalogue";
  return "Other source";
}

function defaultListingTrust(
  preview: SelfServePreview | null | undefined,
  vehicleId: string,
): "confirmed" | "needs_checking" | undefined {
  // Only the server decides the default (from the link and the trusted-sources list).
  // Until it has answered for this car, leave it blank so its answer can fill it in.
  const row = preview?.listingTrustPreview?.find((x) => x.catalogId === vehicleId);
  if (row?.trust === "confirmed") return "confirmed";
  if (row?.trust === "needs_checking") return "needs_checking";
  return undefined;
}

const emptyFilters = { make: "", model: "", chassis: "", engine: "", yearFrom: "", yearTo: "" };

export function Step2SpecificCars({
  draft,
  setDraft,
  preview,
}: {
  draft: AddPartsDraft;
  setDraft: (value: SetStateAction<AddPartsDraft>) => void;
  preview: SelfServePreview | null;
}) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [yearEditId, setYearEditId] = useState<string | null>(null);
  const [yearDraftFrom, setYearDraftFrom] = useState("");
  const [yearDraftTo, setYearDraftTo] = useState("");

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

  const vehicleById = useMemo(() => {
    const m = new Map<string, AddPartVehicleRow>();
    for (const v of search.data ?? []) m.set(v.id, v);
    return m;
  }, [search.data]);

  const selectedIds = useMemo(() => new Set(draft.listings.map((l) => l.vehicleId)), [draft.listings]);

  const sortedRows = useMemo(() => {
    const items = [...(search.data ?? [])];
    items.sort((a, b) => [a.make, a.model, a.chassis_code ?? ""].join("\0").localeCompare([b.make, b.model, b.chassis_code ?? ""].join("\0")));
    return items;
  }, [search.data]);

  useEffect(() => {
    if (!yearEditId) return;
    const l = draft.listings.find((x) => x.vehicleId === yearEditId);
    if (!l) {
      setYearEditId(null);
      return;
    }
    setYearDraftFrom(l.yearFrom != null ? String(l.yearFrom) : "");
    setYearDraftTo(l.yearTo != null ? String(l.yearTo) : "");
  }, [yearEditId, draft.listings]);

  useEffect(() => {
    if (!preview?.listingTrustPreview?.length) return;
    setDraft((d) => {
      if (!d.listings.length) return d;
      const next = d.listings.map((l) => {
        const auto = defaultListingTrust(preview, l.vehicleId);
        if (auto === undefined || l.listingTrust === auto) return l;
        if (l.listingTrust === undefined || l.listingTrust === null) {
          return { ...l, listingTrust: auto };
        }
        return l;
      });
      if (!next.some((l, i) => l.listingTrust !== d.listings[i]?.listingTrust)) return d;
      return { ...d, listings: next };
    });
  }, [preview?.listingTrustPreview, setDraft]);

  function resetFilters() {
    setFilters(emptyFilters);
    setQ("");
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
      const lt = defaultListingTrust(preview, id);
      const end = v.production_end_year;
      const yearTo = end != null && end < 9999 ? end : undefined;
      setDraft({
        ...draft,
        listings: [
          ...draft.listings,
          {
            vehicleId: id,
            label,
            position: draft.position,
            side: draft.side,
            yearFrom: v.production_start_year ?? undefined,
            yearTo,
            listingTrust: lt,
            reason: "",
          },
        ],
      });
    }
  }

  function patchListing(vehicleId: string, patch: Partial<AddPartsDraft["listings"][number]>) {
    setDraft({
      ...draft,
      listings: draft.listings.map((l) => (l.vehicleId === vehicleId ? { ...l, ...patch } : l)),
    });
  }

  if (!draft.partType) return null;

  const globalAxlePosition = draft.listings[0]?.position ?? draft.position;
  const autoRows = preview?.listingTrustPreview ?? [];
  const defaultTrustLine = !draft.evidenceUrl.trim()
    ? "Needs checking · no link yet"
    : autoRows.length === 0
    ? "Worked out from your link when you tick a car"
    : autoRows.every((r) => r.trust === "confirmed")
    ? "Confirmed · your link is a trusted site"
    : autoRows.some((r) => r.trust === "confirmed")
    ? "Mixed · see each car"
    : "Needs checking · your link is not on the trusted list";
  const nTotal = draft.listings.length;
  const nConf = draft.listings.filter((l) => l.listingTrust === "confirmed").length;
  const nNeed = draft.listings.filter((l) => l.listingTrust === "needs_checking").length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
      <section className="lg:col-span-7 space-y-space-md">
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm space-y-space-sm border border-outline-variant/30">
          <span className="font-label-xs uppercase font-bold text-primary tracking-wider">Where did you find this list?</span>
          <p className="font-body-sm text-on-surface-variant">
            {sourceTypePhrase(draft.sourceType)}
            {" · "}
            <span className="text-on-surface font-medium">Default trust (auto from your link):</span>{" "}
            {defaultTrustLine}
          </p>
          {draft.evidenceUrl ? (
            <a
              href={draft.evidenceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono-sm text-primary hover:underline break-all"
            >
              {draft.evidenceUrl.replace(/^https?:\/\//, "").split("/")[0]}
              <MaterialIcon name="north_east" className="text-[13px]" />
            </a>
          ) : null}
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
              <span className="text-on-surface-variant font-body-sm">Make:</span>
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
              <span className="text-on-surface-variant font-body-sm">Model:</span>
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
              <span className={filters.chassis ? "text-primary font-body-sm" : "text-on-surface-variant font-body-sm"}>Chassis:</span>
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
              <span className="text-on-surface-variant font-body-sm">Years:</span>
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
              <span className="text-on-surface-variant font-body-sm">Engine:</span>
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

        {search.isFetching ? <p className="font-body-sm text-on-surface-variant">Loading cars…</p> : null}

        {sortedRows.length === 0 && !search.isFetching ? (
          <p className="font-body-sm text-on-surface-variant">Search by make, model, or chassis to list car versions.</p>
        ) : null}

        {sortedRows.length > 0 ? (
          <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30">
            <div className="grid grid-cols-12 px-space-md py-2 bg-surface-container-low text-on-surface-variant font-label-xs uppercase tracking-wider gap-1">
              <div className="col-span-1" />
              <div className="col-span-3 min-w-0">Car</div>
              <div className="col-span-2 min-w-0">Chassis</div>
              <div className="col-span-3 min-w-0">Years</div>
              <div className="col-span-3 min-w-0">Engine</div>
            </div>
            <div className="divide-y divide-outline-variant/25 bg-surface-container-low">
              {sortedRows.map((v) => (
                <label
                  key={v.id}
                  className="grid grid-cols-12 items-center px-space-md py-2.5 gap-1 cursor-pointer hover:bg-surface-container-lowest"
                >
                  <div className="col-span-1 flex justify-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleVehicle(v)}
                    />
                  </div>
                  <div className="col-span-3 font-body-sm font-semibold text-on-surface truncate min-w-0">
                    {v.make} {v.model}
                  </div>
                  <div className="col-span-2 font-mono-sm text-on-surface truncate min-w-0">{v.chassis_code ?? "—"}</div>
                  <div className="col-span-3 font-mono-sm text-on-surface-variant truncate min-w-0">{productionLabel(v)}</div>
                  <div className="col-span-3 font-mono-sm text-on-surface-variant truncate min-w-0">{engineTrim(v)}</div>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <RequestCarPanel draft={draft} />
      </section>

      <section className="lg:col-span-5 space-y-space-md">
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm space-y-space-md border border-outline-variant/30">
          <div>
            <h2 className="font-headline-md text-on-surface">Selected cars</h2>
            <p className="font-body-sm text-on-surface-variant">Trust and years apply when you save.</p>
          </div>

          {draft.partType.positionScheme !== "none" && draft.listings.length > 0 ? (
            <div className="space-y-2 rounded-xl bg-surface-container-low p-space-md border border-outline-variant/30">
              <p className="font-headline-md text-on-surface">Where on the car?</p>
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
          ) : null}

          {draft.listings.length === 0 ? (
            <p className="font-body-sm text-on-surface-variant">Tick cars in the table to build your list.</p>
          ) : (
            <div className="space-y-space-sm max-h-[min(520px,70vh)] overflow-y-auto pr-1">
              {draft.listings.map((l) => {
                const v = vehicleById.get(l.vehicleId);
                const yLabel =
                  l.yearFrom != null || l.yearTo != null
                    ? `${l.yearFrom ?? "—"}–${l.yearTo != null ? l.yearTo : "present"}`
                    : v
                    ? productionLabel(v)
                    : "—";
                const trust = l.listingTrust;
                const editingYears = yearEditId === l.vehicleId;
                return (
                  <div key={l.vehicleId} className="rounded-xl border border-outline-variant/35 bg-surface-container-low p-space-sm space-y-space-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-body-sm font-semibold text-on-surface truncate">{l.label ?? l.vehicleId.slice(0, 8)}</p>
                        {v?.chassis_code ? (
                          <span className="inline-block mt-1 font-mono-sm px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
                            {v.chassis_code}
                          </span>
                        ) : null}
                      </div>
                      <PartsButton
                        variant="icon"
                        aria-label="Remove car"
                        onClick={() => setDraft({ ...draft, listings: draft.listings.filter((x) => x.vehicleId !== l.vehicleId) })}
                      >
                        <MaterialIcon name="close" className="text-[18px]" />
                      </PartsButton>
                    </div>
                    <p className="font-mono-sm text-on-surface-variant">Years: {yLabel}</p>
                    <div className="inline-flex rounded-lg border border-outline-variant/50 p-0.5 bg-surface-container">
                      <button
                        type="button"
                        className={
                          trust === "confirmed"
                            ? "px-3 py-1.5 rounded-md font-label-xs font-semibold bg-primary-container text-on-primary"
                            : "px-3 py-1.5 rounded-md font-label-xs text-on-surface-variant"
                        }
                        onClick={() => patchListing(l.vehicleId, { listingTrust: "confirmed", reason: "" })}
                      >
                        Confirmed
                      </button>
                      <button
                        type="button"
                        className={
                          trust === "needs_checking"
                            ? "px-3 py-1.5 rounded-md font-label-xs font-semibold bg-amber-500/20 text-amber-900 dark:text-amber-100"
                            : "px-3 py-1.5 rounded-md font-label-xs text-on-surface-variant"
                        }
                        onClick={() => patchListing(l.vehicleId, { listingTrust: "needs_checking" })}
                      >
                        Needs checking
                      </button>
                    </div>
                    {trust === "needs_checking" ? (
                      <label className="block space-y-1">
                        <span className="font-label-xs text-on-surface-variant">Why?</span>
                        <textarea
                          className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 font-body-sm text-on-surface min-h-[56px]"
                          placeholder="Short reason…"
                          value={l.reason ?? ""}
                          onChange={(e) => patchListing(l.vehicleId, { reason: e.target.value })}
                        />
                      </label>
                    ) : null}
                    {editingYears ? (
                      <div className="flex flex-col gap-2 pt-1 border-t border-outline-variant/30">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-1">
                            <span className="font-label-xs text-on-surface-variant">From</span>
                            <input
                              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 font-mono-sm"
                              inputMode="numeric"
                              value={yearDraftFrom}
                              onChange={(e) => setYearDraftFrom(e.target.value.replace(/\D/g, ""))}
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="font-label-xs text-on-surface-variant">To</span>
                            <input
                              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 font-mono-sm"
                              inputMode="numeric"
                              value={yearDraftTo}
                              onChange={(e) => setYearDraftTo(e.target.value.replace(/\D/g, ""))}
                            />
                          </label>
                        </div>
                        <div className="flex justify-end gap-2">
                          <PartsButton variant="danger" onClick={() => { setYearEditId(null); }}>
                            Cancel
                          </PartsButton>
                          <PartsButton
                            variant="primary"
                            onClick={() => {
                              const yf = yearDraftFrom.trim() ? Number(yearDraftFrom) : undefined;
                              const yt = yearDraftTo.trim() ? Number(yearDraftTo) : undefined;
                              patchListing(l.vehicleId, { yearFrom: yf, yearTo: yt });
                              setYearEditId(null);
                            }}
                          >
                            Save years
                          </PartsButton>
                        </div>
                      </div>
                    ) : (
                      <PartsButton variant="secondary" className="text-sm" onClick={() => setYearEditId(l.vehicleId)}>
                        Change years
                      </PartsButton>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {draft.listings.length > 0 ? (
        <div className="lg:col-span-12 flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline-variant/30">
          <p className="font-body-sm text-on-surface-variant">
            {nTotal} car{nTotal === 1 ? "" : "s"} · {nConf} Confirmed · {nNeed} Needs checking
          </p>
        </div>
      ) : null}
    </div>
  );
}
