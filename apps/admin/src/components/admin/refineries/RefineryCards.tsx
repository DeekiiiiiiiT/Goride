import type { RefineryCard } from "./refineriesApi";
import { formatSynced, formatWeek } from "./refineryFormat";

function monogram(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function RefineryCards({
  refineries,
  selected,
  canWrite,
  onSelect,
  onAdd,
}: {
  refineries: RefineryCard[];
  selected: string;
  canWrite: boolean;
  onSelect: (slug: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-1 lg:grid lg:grid-cols-4 lg:overflow-visible">
      {refineries.map((refinery) => {
        const on = refinery.slug === selected;
        return (
          <button
            key={refinery.slug}
            type="button"
            onClick={() => onSelect(refinery.slug)}
            className={`w-[300px] shrink-0 lg:w-full bg-surface-container-lowest p-5 rounded-xl flex flex-col justify-between shadow-xs text-left ${on ? "border-2 border-secondary ring-2 ring-secondary/15" : "border border-surface-variant/80"}`}
          >
            <div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-surface-container text-on-surface font-mono-code font-bold text-sm flex items-center justify-center">
                  {monogram(refinery.name)}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-on-surface leading-tight">{refinery.name}</h3>
                  <p className="text-[11px] text-outline">{refinery.operator || "—"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                {refinery.is_benchmark ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary-container text-on-secondary-container">Benchmark</span> : null}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> {refinery.status === "active" ? "Active" : refinery.status === "planned" ? "Planned" : "Closed"}
                </span>
              </div>
              <div className="font-mono-code text-[11px] text-on-surface-variant space-y-1 my-3.5 pt-1">
                <div className="flex items-center justify-between"><span className="text-outline">Location</span><span>{refinery.location || "—"}</span></div>
                <div className="flex items-center justify-between"><span className="text-outline">Latest week</span><span className="tabular-nums">{formatWeek(refinery.latest_week)}</span></div>
                <div className="flex items-center justify-between"><span className="text-outline">Portfolio</span><span className="tabular-nums">{refinery.product_count} products</span></div>
              </div>
            </div>
            <div className="pt-3 border-t border-surface-container flex items-center justify-between">
              {refinery.freshness ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-700" /> {refinery.freshness}
                </span>
              ) : <span className="text-[10px] text-outline">No prices yet</span>}
              <span className="font-mono-code text-[10px] text-outline">{refinery.synced_at ? `Synced ${formatSynced(refinery.synced_at)}` : ""}</span>
            </div>
          </button>
        );
      })}
      {canWrite ? (
        <button type="button" onClick={onAdd} className="w-[300px] shrink-0 lg:w-full border-2 border-dashed border-outline-variant rounded-xl p-5 flex flex-col items-center justify-center text-center hover:border-outline cursor-pointer bg-surface/50 min-h-[195px] transition-all group">
          <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-outline group-hover:text-on-surface mb-2">
            <span className="material-symbols-outlined text-base">add</span>
          </div>
          <span className="text-xs font-medium text-on-surface group-hover:text-secondary">Add a refinery</span>
          <span className="text-[11px] text-outline max-w-[180px] mt-1">Jamaica has one today. Add more as they open.</span>
        </button>
      ) : null}
    </div>
  );
}
