// Stitch AP5
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import type { AddPartsDraft } from "../addPartsTypes";
import { fetchEngineFamilies, fetchEngineFamilyDetail } from "../addPartsApi";
import { PositionChips } from "../Step2FitBlock";
import { RequestEnginePanel } from "../states/RequestEnginePanel";

function vehicleLabel(v: { make: string; model: string; chassisCode?: string | null; year?: number | null }) {
  return [v.make, v.model, v.chassisCode, v.year].filter(Boolean).join(" ");
}

export function Step2ByEngine({ draft, setDraft }: { draft: AddPartsDraft; setDraft: (d: AddPartsDraft) => void }) {
  const [q, setQ] = useState(draft.engineCode);
  const [showAll, setShowAll] = useState(false);
  const engines = useQuery({ queryKey: ["engine-families", q], queryFn: () => fetchEngineFamilies(q), enabled: q.length >= 2 });
  const detail = useQuery({
    queryKey: ["engine-family-detail", draft.engineFamilyId],
    queryFn: () => fetchEngineFamilyDetail(draft.engineFamilyId),
    enabled: Boolean(draft.engineFamilyId),
  });

  const list = engines.data ?? [];
  const visible = showAll ? list : list.slice(0, 8);
  const excluded = useMemo(() => new Set(draft.excludedVehicleIds), [draft.excludedVehicleIds]);

  function toggleExclude(vehicleId: string) {
    setDraft({
      ...draft,
      excludedVehicleIds: excluded.has(vehicleId)
        ? draft.excludedVehicleIds.filter((id) => id !== vehicleId)
        : [...draft.excludedVehicleIds, vehicleId],
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        className="h-10 px-3 rounded-xl border border-outline-variant/50 font-mono uppercase"
        placeholder="Engine code e.g. 1KR-FE"
        value={q}
        onChange={(e) => setQ(e.target.value.toUpperCase())}
      />
      <div className="flex flex-wrap gap-2">
        {visible.map((e) => (
          <button
            key={e.id}
            type="button"
            className={
              draft.engineFamilyId === e.id
                ? "px-3 py-1.5 rounded-full bg-primary/10 border border-primary text-primary font-mono text-sm"
                : "px-3 py-1.5 rounded-full border font-mono text-sm"
            }
            onClick={() => setDraft({ ...draft, engineFamilyId: e.id, engineCode: e.code, excludedVehicleIds: [] })}
          >
            {e.code}
            {e.variantCount != null ? ` · ${e.variantCount} cars` : ""}
          </button>
        ))}
      </div>
      {list.length > 8 && !showAll ? (
        <button type="button" className="text-primary text-body-sm hover:underline self-start" onClick={() => setShowAll(true)}>
          Show {list.length - 8} more
        </button>
      ) : null}
      {detail.data ? (
        <div className="rounded-xl border border-outline-variant/40 p-4 flex flex-col gap-3 bg-surface-container-lowest">
          <p className="font-mono-sm text-mono-sm text-on-surface-variant">
            {detail.data.code}
            {detail.data.variantCount != null ? ` · ${detail.data.variantCount} car versions` : ""}
          </p>
          {(detail.data.makeCounts?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-2 font-body-sm">
              {detail.data.makeCounts!.map((row) => (
                <span key={row.make} className="px-2 py-1 rounded-full bg-surface-container border border-outline-variant/40">
                  {row.make} · {row.count}
                </span>
              ))}
            </div>
          ) : null}
          {(detail.data.vehicles?.length ?? 0) > 0 ? (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              <p className="text-body-sm text-on-surface-variant">Exclude specific cars from this engine fit:</p>
              {detail.data!.vehicles!.map((v) => (
                <label key={v.id} className="flex items-center gap-2 py-1 font-body-sm cursor-pointer">
                  <input type="checkbox" checked={excluded.has(v.id)} onChange={() => toggleExclude(v.id)} />
                  <span>{vehicleLabel(v)}</span>
                  {v.fuelType ? <span className="text-on-surface-variant text-xs">{v.fuelType}</span> : null}
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {draft.partType && draft.partType.positionScheme !== "none" && draft.engineFamilyId ? (
        <div className="rounded-xl border border-outline-variant/40 p-4 bg-surface-container-lowest space-y-2">
          <p className="font-headline-md text-on-surface">Where on the car?</p>
          <p className="font-body-sm text-on-surface-variant">{draft.partType.editorHint || "Pick the position for this part type."}</p>
          <PositionChips
            scheme={draft.partType.positionScheme}
            position={draft.position}
            side={draft.side}
            onPick={(pos, side) => setDraft({ ...draft, position: pos, side })}
          />
        </div>
      ) : null}
      <RequestEnginePanel draft={draft} />
    </div>
  );
}
