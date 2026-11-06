// Stitch AP5
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { MaterialIcon } from "../../import/MaterialIcon";
import type { AddPartsDraft } from "../addPartsTypes";
import { fetchEngineFamilies, fetchEngineFamilyDetail } from "../addPartsApi";
import { PositionChips } from "../Step2FitBlock";
import { PartsButton } from "../../PartsButton";
import { RequestEnginePanel } from "../states/RequestEnginePanel";

function vehicleLabel(v: { make: string; model: string; chassisCode?: string | null; year?: number | null }) {
  return [v.make, v.model, v.chassisCode, v.year].filter(Boolean).join(" ");
}

export function Step2ByEngine({ draft, setDraft }: { draft: AddPartsDraft; setDraft: (d: AddPartsDraft) => void }) {
  const [q, setQ] = useState(draft.engineCode);
  const [exactOnly, setExactOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [globalYearFrom, setGlobalYearFrom] = useState("");
  const [globalYearTo, setGlobalYearTo] = useState("");
  const engines = useQuery({ queryKey: ["engine-families", q], queryFn: () => fetchEngineFamilies(q), enabled: q.length >= 2 });
  const detail = useQuery({
    queryKey: ["engine-family-detail", draft.engineFamilyId],
    queryFn: () => fetchEngineFamilyDetail(draft.engineFamilyId),
    enabled: Boolean(draft.engineFamilyId),
  });

  const list = useMemo(() => {
    const items = engines.data ?? [];
    if (!exactOnly || !q.trim()) return items;
    const needle = q.trim().toUpperCase();
    return items.filter((e) => e.code.toUpperCase() === needle);
  }, [engines.data, exactOnly, q]);

  const visible = showAll ? list : list.slice(0, 8);
  const excluded = useMemo(() => new Set(draft.excludedVehicleIds), [draft.excludedVehicleIds]);
  const vehicles = detail.data?.vehicles ?? [];
  const visibleVehicles = showAll ? vehicles : vehicles.slice(0, 5);

  function toggleExclude(vehicleId: string) {
    setDraft({
      ...draft,
      excludedVehicleIds: excluded.has(vehicleId)
        ? draft.excludedVehicleIds.filter((id) => id !== vehicleId)
        : [...draft.excludedVehicleIds, vehicleId],
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
      <section className="lg:col-span-7 flex flex-col gap-space-md">
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm">
          <div className="relative">
            <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
            <input
              className="w-full h-10 pl-10 pr-3 bg-surface-container-low rounded-lg font-mono-md text-mono-md uppercase border border-transparent focus:border-primary-container focus:outline-none"
              placeholder="Engine code e.g. 1KR-FE"
              value={q}
              onChange={(e) => setQ(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={
                exactOnly
                  ? "px-3 py-1 rounded-full bg-primary-container text-on-primary font-mono-sm text-mono-sm font-semibold"
                  : "px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-mono-sm text-mono-sm"
              }
              onClick={() => setExactOnly((v) => !v)}
            >
              Exact match
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {visible.map((e) => (
              <button
                key={e.id}
                type="button"
                className={
                  draft.engineFamilyId === e.id
                    ? "px-3 py-2 rounded-lg bg-primary-container text-on-primary font-mono-sm text-mono-sm text-left shadow-sm"
                    : "px-3 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container font-mono-sm text-mono-sm text-left"
                }
                onClick={() => setDraft({ ...draft, engineFamilyId: e.id, engineCode: e.code, excludedVehicleIds: [] })}
              >
                <span className="font-semibold block">{e.code}</span>
                <span className="text-[10px] opacity-80 block">
                  {(e as { displacement?: string }).displacement ?? "1.0L"} · {(e as { cylinders?: number }).cylinders ?? 3} cyl
                  {e.variantCount != null ? ` · ${e.variantCount} cars` : ""}
                </span>
              </button>
            ))}
          </div>
          {list.length > 8 && !showAll ? (
            <PartsButton variant="secondary" className="self-start" onClick={() => setShowAll(true)}>
              Show {list.length - 8} more
            </PartsButton>
          ) : null}
        </div>

        {detail.data && vehicles.length > 0 ? (
          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-space-md shadow-sm flex flex-col gap-space-sm">
            <p className="font-headline-md text-headline-md text-on-surface">
              {detail.data.variantCount ?? vehicles.length} car versions have engine {detail.data.code}
            </p>
            <ol className="flex flex-col gap-1 max-h-52 overflow-y-auto font-body-sm text-on-surface list-none m-0 p-0">
              {visibleVehicles.map((v, idx) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-outline-variant/20 last:border-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono-sm text-label-xs text-outline w-6 shrink-0">{String(idx + 1).padStart(2, "0")}</span>
                    <span>{vehicleLabel(v)}</span>
                  </div>
                  <PartsButton
                    variant={excluded.has(v.id) ? "secondary" : "danger"}
                    className="shrink-0 min-h-[32px] h-8"
                    onClick={() => toggleExclude(v.id)}
                  >
                    {excluded.has(v.id) ? "Include car" : "Exclude car"}
                  </PartsButton>
                </li>
              ))}
            </ol>
            {vehicles.length > 5 && !showAll ? (
              <PartsButton variant="secondary" className="self-start" onClick={() => setShowAll(true)}>
                Show {vehicles.length - 5} more
              </PartsButton>
            ) : null}
          </div>
        ) : null}

        {draft.partType && draft.partType.positionScheme !== "none" && draft.engineFamilyId ? (
          <div className="rounded-xl border border-outline-variant/40 p-space-md bg-surface-container-lowest space-y-2">
            <p className="font-headline-md text-on-surface">Where on the car?</p>
            <PositionChips
              scheme={draft.partType.positionScheme}
              position={draft.position}
              side={draft.side}
              onPick={(pos, side) => setDraft({ ...draft, position: pos, side })}
            />
          </div>
        ) : null}

        <RequestEnginePanel draft={draft} />
      </section>

      <aside className="lg:col-span-5 flex flex-col gap-space-md">
        <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm border border-outline-variant/30 space-y-space-sm">
          <span className="font-label-xs text-label-xs uppercase text-outline font-bold">Part on this step</span>
          <p className="font-mono-md text-mono-md text-primary font-semibold">
            {[draft.brand, draft.partNumber].filter(Boolean).join(" ") || "Your part"}
          </p>
          <p className="font-body-sm text-on-surface-variant">{draft.partType?.name ?? "Part type"}</p>
        </div>
        {detail.data ? (
          <div className="rounded-xl bg-surface-container-low p-space-lg border border-outline-variant/30 space-y-1">
            <span className="font-label-xs text-label-xs uppercase text-outline font-bold">Engine family</span>
            <p className="font-mono-lg text-mono-lg font-semibold text-on-surface">{detail.data.code}</p>
            <p className="font-body-sm text-on-surface-variant">{detail.data.variantCount ?? 0} car versions in catalog</p>
          </div>
        ) : null}
        {draft.engineFamilyId ? (
          <div className="rounded-xl bg-surface-container-low p-space-md border border-outline-variant/30">
            <div className="flex items-center justify-between gap-2 mb-space-sm">
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
                  onChange={(e) => setGlobalYearFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <span className="font-label-xs text-on-surface-variant">To (year)</span>
                <input
                  className="w-full h-9 px-3 bg-surface-container-low rounded text-on-surface font-mono-md placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none"
                  placeholder="Present / current"
                  value={globalYearTo}
                  onChange={(e) => setGlobalYearTo(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
