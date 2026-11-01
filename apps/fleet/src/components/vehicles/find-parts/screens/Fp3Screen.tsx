import type { Fp3AreaRow, Fp3ViewModel } from "../findPartsViewModels";
import { fp3AreaIcon } from "../findPartsViewModels";
import { FindPartsStickyHeader } from "../FindPartsStickyHeader";

export type Fp3Actions = {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  nextHint?: string;
  onPickPart: (id: string, name: string, positionAware?: boolean) => void;
  onPickProblem: (id: string, name: string, positionAware?: boolean) => void;
  onOpenArea: (areaId: string) => void;
  onChangePart: () => void;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onSearchHit: (id: string, name: string, positionAware?: boolean) => void;
  onStartVoiceSearch: () => void;
  searchQuery: string;
  selectedChipId: string;
  speechSupported: boolean;
};

function AreaGridV3({
  areas,
  onOpenArea,
}: {
  areas: Fp3AreaRow[];
  onOpenArea: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-space-md">
      {areas.map((area) => (
        <button
          key={area.id}
          type="button"
          className="group p-space-md rounded-xl bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between cursor-pointer text-left min-h-[7.5rem]"
          onClick={() => onOpenArea(area.id)}
        >
          <div className="flex items-start justify-between">
            <span className="font-label-code text-caption text-secondary">{area.areaIndex}</span>
            <span className="material-symbols-outlined text-secondary text-[20px] group-hover:text-primary transition-colors">{area.icon || fp3AreaIcon(area.name)}</span>
          </div>
          <div className="mt-space-lg">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">{area.name}</h3>
            <div className="flex items-center justify-between mt-space-xs font-label-code text-caption text-on-surface-variant gap-2">
              <span className="truncate">{area.partTypesLine}</span>
              <span className="font-medium shrink-0">{area.onFileShortLabel}</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function CommonChips({
  tiles,
  selectedChipId,
  onPickPart,
}: {
  tiles: Fp3ViewModel["partTiles"];
  selectedChipId: string;
  onPickPart: Fp3Actions["onPickPart"];
}) {
  return (
    <div className="flex flex-wrap gap-space-sm">
      {tiles.map((tile) => {
        const active = selectedChipId === tile.id;
        const count = tile.onFileCount ?? 0;
        return (
          <button
            key={tile.id}
            type="button"
            className={`inline-flex items-center gap-space-xs px-3.5 py-2 rounded-full font-body-sm text-body-sm font-medium shadow-sm transition-colors ${active ? "bg-primary text-on-primary font-semibold" : "bg-surface-container-lowest hover:bg-surface-container text-on-surface"}`}
            onClick={() => onPickPart(tile.id, tile.name, tile.positionAware)}
          >
            {active ? <span className="material-symbols-outlined text-[16px]">check</span> : null}
            <span>{tile.name}</span>
            {active && count > 0 ? (
              <span className="ml-1 text-[11px] opacity-75 font-label-code">{tile.statusLabel}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Fp3Screen({ actions, data }: { actions: Fp3Actions; data: Fp3ViewModel }) {
  const showHits = actions.searchQuery.trim().length >= 2 && data.searchHits.length > 0;
  const showChosen = Boolean(actions.selectedChipId && data.selectedPartName && data.selectedPartName !== "None yet");
  const verifiedLine = data.chassisCode !== "—"
    ? `CHASSIS: ${data.chassisCode} · FRONT ${data.brakeFrontType !== "—" ? data.brakeFrontType : "—"} / REAR ${data.brakeRearType !== "—" ? data.brakeRearType : "—"} SETUP`
    : "CHASSIS: —";

  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root flex flex-col w-full max-w-7xl mx-auto px-margin-desktop py-space-xl gap-space-xl">
        <FindPartsStickyHeader
          step={3}
          onBack={actions.onBack}
          vehicleLabel={data.vehicleLabel}
          plate={data.plate}
          versionTag={data.versionTag}
          onNext={actions.onNext}
          nextDisabled={actions.nextDisabled}
          nextHint={actions.nextHint}
        />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-lg">
          <div className="flex flex-col gap-space-xs">
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">What part do you need?</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">Select an assembly group or choose directly from fleet catalogued components.</p>
          </div>
          <div className="w-full md:w-96 flex items-center gap-space-sm bg-surface-container-lowest px-space-md py-2 rounded-lg shadow-sm relative">
            <span className="material-symbols-outlined text-secondary text-[20px]">search</span>
            <input
              className="w-full bg-transparent font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
              placeholder="Search a part by name or system..."
              type="text"
              value={actions.searchQuery}
              onChange={(e) => actions.onSearchChange(e.target.value)}
            />
            <button type="button" className="font-label-code text-caption px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant" onClick={actions.onSearchClear}>
              ESC
            </button>
            {showHits ? (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-surface-container-lowest rounded-xl shadow-xl overflow-hidden">
                {data.searchHits.map((hit) => (
                  <button key={hit.id} type="button" className="w-full px-4 py-3 hover:bg-surface-container text-left flex justify-between" onClick={() => actions.onSearchHit(hit.id, hit.name, hit.positionAware)}>
                    <span className="font-body-md font-semibold">{hit.name}</span>
                    <span className="material-symbols-outlined text-surface-dim">north_east</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {showChosen ? (
          <div className="w-full bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary"></div>
            <div className="flex items-center gap-space-md pl-space-xs">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-sm shrink-0">
                <span className="material-symbols-outlined text-[22px]">check</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-space-sm flex-wrap">
                  <span className="font-headline-sm text-headline-sm text-on-surface">Chosen: {data.selectedPartName}</span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-code text-caption font-semibold">
                    {data.chosenOnFileCount > 0 ? `${data.chosenOnFileCount} on file` : "Not on file yet"}
                  </span>
                  {data.chosenOpCode !== "—" ? (
                    <span className="px-2 py-0.5 rounded-full bg-surface-container text-secondary font-label-code text-caption">{data.chosenOpCode}</span>
                  ) : null}
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Ready to select front or back side placement for {data.vehicleLabel} ({data.plate}).
                </span>
              </div>
            </div>
            <div className="flex items-center gap-space-sm">
              <button type="button" className="px-space-md py-2 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface font-body-sm text-body-sm font-medium flex items-center gap-1.5" onClick={actions.onChangePart}>
                <span className="material-symbols-outlined text-[16px]">tune</span>
                Change
              </button>
              <button type="button" className="px-space-lg py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold flex items-center gap-1.5 shadow-sm" onClick={actions.onNext}>
                Next
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="hidden md:flex flex-col gap-space-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <h2 className="font-headline-sm text-headline-sm text-on-surface tracking-tight">By area</h2>
            <span className="font-label-code text-caption px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">{data.categoryTotal || data.areas.length} SYSTEM MODULES</span>
          </div>
          <span className="font-body-sm text-body-sm text-on-surface-variant hidden sm:inline">Select system assembly to inspect schematics</span>
        </div>
        <AreaGridV3 areas={data.areas} onOpenArea={actions.onOpenArea} />

        <div className="flex flex-col gap-space-md pt-space-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-xs">
              <span className="material-symbols-outlined text-secondary text-[18px]">history</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Common parts</h3>
            </div>
            <span className="font-label-code text-caption text-secondary">FREQUENT DISPATCH UNITS</span>
          </div>
          <CommonChips tiles={data.partTiles} selectedChipId={actions.selectedChipId} onPickPart={actions.onPickPart} />
        </div>

        <div className="mt-space-md p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
              <span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface">Vehicle Configuration Verified</span>
              <span className="font-label-code text-caption text-secondary">{verifiedLine}</span>
            </div>
          </div>
          <div className="flex items-center gap-space-sm font-label-code text-caption text-secondary uppercase">
            <span className="w-2 h-2 rounded-full bg-primary"></span>
            <span>{data.locationChip}</span>
          </div>
        </div>
        </div>

        <div className="md:hidden flex flex-col gap-4 pb-6">
          <div className="flex items-center justify-between">
            <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">By area</span>
            <span className="font-label-code text-caption text-on-surface-variant">{data.categoryTotal || data.areas.length} Modules</span>
          </div>
          <AreaGridV3 areas={data.areas} onOpenArea={actions.onOpenArea} />
          <div className="flex flex-col gap-2">
            <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Common parts</span>
            <CommonChips tiles={data.partTiles} selectedChipId={actions.selectedChipId} onPickPart={actions.onPickPart} />
          </div>
          <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md">
            <div className="flex items-center gap-space-md">
              <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">assignment_turned_in</span>
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-surface">Vehicle Configuration Verified</span>
                <span className="font-label-code text-caption text-secondary">{verifiedLine}</span>
              </div>
            </div>
            <div className="flex items-center gap-space-sm font-label-code text-caption text-secondary uppercase">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              <span>{data.locationChip}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
