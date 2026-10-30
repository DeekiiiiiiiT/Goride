// Stitch: dominion-redesign/S42c
export type BrowseComponent = { id: string; plainName: string; positionAware: boolean; count: number };
export type BrowseArea = { id: string; plainName: string; icon: string | null; components: BrowseComponent[] };

export function PartStep({
  query,
  areas,
  common,
  partTotal,
  hits,
  problems,
  onQuery,
  onPick,
  onPartHit,
  onSkip,
  onBack,
}: {
  query: string;
  areas: BrowseArea[];
  common: Array<{ id: string; plainName: string; positionAware: boolean }>;
  partTotal: number;
  hits: Array<{ id: string; plainName: string; kind: "part" | "synonym" | "name"; note?: string }>;
  problems: Array<{ id: string; label: string; hint: string | null; parts: Array<{ id: string; plainName: string; positionAware: boolean }> }>;
  onQuery: (value: string) => void;
  onPick: (id: string, name: string, positionAware: boolean) => void;
  onPartHit: (part: { partId: string; name: string; brand: string; number: string; tier: number; reason: string; status: "needs_checking"; fitsVariantIds: string[] }) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-space-lg">
      <div className="bg-surface-container-lowest rounded-2xl shadow-md p-space-xl md:p-8 flex flex-col gap-space-xl">
        <div className="flex items-start justify-between gap-space-md">
          <div>
            <h2 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">What part do you need?</h2>
            <p className="font-body-md text-body-md text-secondary mt-1">{areas.length} areas · {partTotal.toLocaleString()} parts on file</p>
          </div>
          <button type="button" className="font-label-md text-label-md text-primary" onClick={onSkip}>Skip</button>
        </div>
        <div className="relative flex items-center bg-surface-container-low rounded-xl">
          <span className="material-symbols-outlined absolute left-3.5 text-primary text-[22px]">search</span>
          <input
            className="w-full h-12 pl-11 pr-4 rounded-xl bg-transparent font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none"
            placeholder="Search a part or a part number"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        {hits.length > 0 ? (
          <div className="flex flex-col gap-2">
            {hits.map((hit) => (
              <button key={hit.id + hit.kind} type="button" className="text-left rounded-xl bg-surface-container-low px-4 py-3" onClick={() => {
                if (hit.kind === "part") {
                  onPartHit({
                    partId: hit.id,
                    name: hit.plainName,
                    brand: "",
                    number: hit.plainName,
                    tier: 1,
                    reason: "Exact part number lookup ›",
                    status: "needs_checking",
                    fitsVariantIds: [],
                  });
                  return;
                }
                const match = areas.flatMap((area) => area.components).find((item) => item.id === hit.id);
                onPick(hit.id, hit.plainName, match?.positionAware ?? false);
              }}>
                <span className="font-body-md text-body-md font-semibold text-on-surface block">{hit.plainName}</span>
                {hit.note ? <span className="font-body-sm text-body-sm text-secondary">also called {hit.note}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {common.length > 0 ? (
          <div>
            <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-bold">Common parts</span>
            <div className="flex flex-wrap gap-space-sm mt-space-sm">
              {common.map((row) => (
                <button key={row.id} type="button" className="px-3 py-2 rounded-xl bg-surface-container-low font-body-sm text-body-sm text-on-surface" onClick={() => onPick(row.id, row.plainName, row.positionAware)}>
                  {row.plainName}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-space-md">
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-bold">By area</span>
          {areas.map((area) => (
            <div key={area.id} className="rounded-xl bg-surface-container-low p-space-md">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-[20px] text-primary">{area.icon || "category"}</span>
                <span className="font-headline-md text-headline-md font-semibold text-on-surface">{area.plainName}</span>
              </div>
              <div className="flex flex-col">
                {area.components.map((row) => (
                  <button key={row.id} type="button" className="flex items-center justify-between py-2 text-left" onClick={() => onPick(row.id, row.plainName, row.positionAware)}>
                    <span className="font-body-md text-body-md text-on-surface">{row.plainName}</span>
                    <span className="font-mono-sm text-mono-sm text-secondary">{row.count} parts</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div>
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-secondary font-bold">By problem</span>
          <div className="flex flex-col gap-2 mt-space-sm">
            {problems.map((problem) => (
              <div key={problem.id} className="rounded-xl bg-surface-container-low p-space-md">
                <span className="font-body-md text-body-md font-semibold text-on-surface block">{problem.label}</span>
                {problem.hint ? <span className="font-body-sm text-body-sm text-secondary">{problem.hint}</span> : null}
                <div className="flex flex-wrap gap-2 mt-2">
                  {problem.parts.map((part) => (
                    <button key={part.id} type="button" className="px-3 py-2 rounded-xl bg-surface-container-lowest" onClick={() => onPick(part.id, part.plainName, part.positionAware)}>
                      {part.plainName}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="self-start h-12 px-4 text-secondary font-label-md text-label-md" onClick={onBack}>Back to version</button>
      </div>
    </div>
  );
}
