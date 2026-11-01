import { useMemo } from "react";
import type { Fp5Actions } from "./Fp5Screen";
import type { Fp12ViewModel } from "../findPartsViewModels";

const STITCH_OEM_TIER_PREFIX = "Made for your car (OEM)";
const STITCH_OEM_TIER_ONE = "Made for your car (OEM) • 1 option";

function fp12TierHeading(tierLabel: string, count: number, isOemTier: boolean) {
  if (isOemTier) {
    if (count === 1) return STITCH_OEM_TIER_ONE;
    return `${STITCH_OEM_TIER_PREFIX} • ${count} options`;
  }
  return `${tierLabel} · ${count} option${count === 1 ? "" : "s"}`;
}

function groupRowsByTier(rows: Fp12ViewModel["rows"]) {
  const map = new Map<string, Fp12ViewModel["rows"]>();
  for (const row of rows) {
    const key = row.tierLabel || "None yet";
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()];
}

export function Fp12Screen({ actions, data, partName }: { actions: Fp5Actions; data: Fp12ViewModel; partName?: string }) {
  const titlePart = partName || data.componentTitle || "Part";
  const tiers = useMemo(() => groupRowsByTier(data.rows), [data.rows]);
  const best = data.rows.find((row) => row.isBest) || data.rows[0];

  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root flex flex-col w-full pb-28">
        <section className="py-space-xs flex items-center gap-space-xs bg-surface-container-lowest shadow-sm sticky top-0 z-20 overflow-x-auto px-margin">
          <button type="button" className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-fixed text-caption font-caption whitespace-nowrap" onClick={actions.onChangeCar}>
            <span className="font-label-plate text-caption tracking-wider">{data.plate}</span>
            <span className="truncate max-w-[110px]">{data.fitYearLabel}</span>
          </button>
          <span className="text-on-surface-variant/40">/</span>
          <span className="px-2.5 py-1 rounded-full bg-primary-fixed text-on-primary-fixed text-caption font-caption font-semibold whitespace-nowrap">
            {titlePart}
          </span>
        </section>

        <header className="px-margin pt-space-lg pb-space-sm flex flex-col gap-1">
          <span className="font-caption text-caption text-on-surface-variant uppercase">Tier Compatibility · {data.filterAllCount} results sorted</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{titlePart} for {data.vehicleLabel}</h2>
          <span className="font-caption text-caption text-on-surface-variant">{data.trimLabel || "None yet"} · {data.hubLabel}</span>
        </header>

        {best && best.id !== "empty" ? (
          <section className="px-margin my-space-sm">
            <div className="relative bg-primary text-on-primary rounded-xl p-space-lg shadow-md flex flex-col gap-space-md">
              <div className="font-caption text-caption text-secondary-fixed tracking-wider uppercase">Best fitment match</div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary-fixed text-on-secondary-fixed font-caption text-caption font-semibold w-fit">
                <span className="material-symbols-outlined text-[13px]">verified</span>
                Verified Fit
              </span>
              <span className="font-caption text-caption text-on-primary/80">Genuine OEM Spec</span>
              <span className="font-caption text-caption text-on-primary/70">Fitment spec</span>
              <h3 className="font-headline-sm text-headline-sm leading-snug">{best.brandLabel} {best.partNumber}</h3>
              <p className="font-body-sm text-body-sm text-surface-container-high/90">{best.partName}</p>
              <button type="button" className="w-full h-11 bg-surface-container-lowest text-primary rounded-lg font-body-sm font-semibold flex items-center justify-center gap-2 shadow-sm" onClick={actions.onUseInService}>
                <span className="material-symbols-outlined text-[18px]">build_circle</span>
                <span>Use in service log</span>
              </button>
              <button type="button" className="h-10 bg-surface-container-highest/20 text-on-primary rounded-lg font-body-sm flex items-center justify-center gap-1.5" onClick={actions.onOpenBest}>
                <span className="material-symbols-outlined text-[16px]">info</span>
                <span>Fitment details</span>
              </button>
            </div>
          </section>
        ) : null}

        <section className="px-margin flex flex-col gap-space-md mt-space-sm">
          {tiers.map(([tierLabel, tierRows]) => {
            const isOemTier = tierRows.some((row) => row.isOemTier);
            return (
            <div key={tierLabel} className="flex flex-col gap-1.5">
              <span className="font-caption text-caption font-semibold text-on-surface">
                {fp12TierHeading(tierLabel, tierRows.length, isOemTier)}
              </span>
              {tierRows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="relative bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between active:bg-surface-container-low transition-colors w-full text-left"
                  onClick={() => actions.onOpenRow(row.id)}
                >
                  <div className="flex flex-col gap-1 pl-2 min-w-0">
                    <span className="font-body-md font-semibold text-on-surface">{row.partName}</span>
                    <span className="font-label-code text-caption text-on-surface-variant">{row.brandLabel} {row.partNumber}</span>
                    {row.verified ? (
                      <span className="font-caption text-caption text-emerald-800">Verified</span>
                    ) : null}
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
                </button>
              ))}
            </div>
            );
          })}
        </section>

        <section className="px-margin mt-space-md flex flex-col gap-space-sm">
          <details className="bg-surface-container-lowest rounded-xl shadow-sm p-space-md">
            <summary className="font-headline-sm text-body-sm font-semibold text-on-surface cursor-pointer">Your Parts Activity</summary>
            <p className="font-body-sm text-caption text-on-surface-variant mt-space-sm">Awaiting response from Roam</p>
            <p className="font-body-sm text-caption text-on-surface-variant mt-space-sm">Repeat Part Notice: wear alerts appear here when the same component is replaced unusually often.</p>
          </details>
        </section>

        <section className="px-margin mt-space-md flex flex-col gap-space-sm">
          <h3 className="font-headline-sm text-body-sm font-semibold text-on-surface">Explore System Categories</h3>
          <div className="grid grid-cols-2 gap-2">
            {["Braking", "Engine", "Filters", "Electrical"].map((area) => (
              <button key={area} type="button" className="p-space-sm rounded-lg bg-surface-container-lowest shadow-sm text-left" onClick={actions.onEditPartCategory}>
                <span className="font-body-sm text-body-sm font-semibold text-on-surface">{area}</span>
                <span className="font-caption text-caption text-primary block mt-1">View schematic</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="fixed bottom-16 inset-x-0 z-30 bg-surface-container-lowest/95 backdrop-blur-md px-margin py-space-sm shadow-md">
          <div className="max-w-md mx-auto flex items-center gap-space-sm">
            <button type="button" className="h-11 px-4 rounded-lg bg-surface-container text-on-surface font-body-sm font-medium flex items-center gap-1" onClick={actions.onBackToPartSelection}>
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Back</span>
            </button>
            <button type="button" className="flex-1 h-11 px-4 rounded-lg bg-primary text-on-primary font-body-sm font-semibold flex items-center justify-center gap-1.5 shadow-sm" onClick={actions.onAskRoam}>
              Ask Roam to add this part
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
