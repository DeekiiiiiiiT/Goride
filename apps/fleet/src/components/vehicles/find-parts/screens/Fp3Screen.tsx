import type { Fp3AreaRow, Fp3ViewModel } from "../findPartsViewModels";
import { fp3AreaIcon } from "../findPartsViewModels";
import { FindPartsStickyHeader } from "../FindPartsStickyHeader";

export type Fp3Actions = {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  onPickPart: (id: string, name: string, positionAware?: boolean) => void;
  onPickProblem: (id: string, name: string, positionAware?: boolean) => void;
  onSelectArea: (id: string) => void;
  onSelectSubChip: (chipId: string, name: string, positionAware?: boolean) => void;
  onToggleSymptom: (id: string) => void;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onSearchHit: (id: string, name: string, positionAware?: boolean) => void;
  onStartVoiceSearch: () => void;
  searchQuery: string;
  selectedAreaId: string;
  openSymptomId: string;
  speechSupported: boolean;
};

function symptomIcon(name: string) {
  const text = name.toLowerCase();
  if (text.includes("brake") || text.includes("grind") || text.includes("squeak")) return "hearing";
  if (text.includes("start") || text.includes("click")) return "electric_car";
  if (text.includes("check engine") || text.includes("warning")) return "warning";
  if (text.includes("light")) return "lightbulb";
  return "troubleshoot";
}

function AreaGrid({
  areas,
  selectedAreaId,
  onSelectArea,
  compact,
}: {
  areas: Fp3AreaRow[];
  selectedAreaId: string;
  onSelectArea: (id: string) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {areas.map((area) => {
          const active = selectedAreaId === area.id;
          const none = area.partCount <= 0;
          return (
            <button
              key={area.id}
              type="button"
              className={`p-2.5 rounded flex flex-col justify-between h-[74px] transition-colors text-left ${active ? "bg-surface-container-highest shadow-sm relative overflow-hidden" : none ? "bg-surface-container-low opacity-75" : "bg-surface-container-low hover:bg-surface-container"}`}
              onClick={() => onSelectArea(area.id)}
            >
              {active ? <div className="absolute top-0 right-0 w-2 h-2 bg-primary"></div> : null}
              <div className="flex items-center justify-between">
                <span className={`material-symbols-outlined text-[20px] ${active ? "text-primary" : none ? "text-secondary" : "text-on-surface"}`}>{area.icon || fp3AreaIcon(area.name)}</span>
                <span className={`font-label-code text-caption ${active ? "bg-primary text-on-primary px-1.5 py-0.2 rounded font-medium" : "text-secondary"}`}>
                  {area.partCount > 0 ? `${area.partCount} on file` : "None"}
                </span>
              </div>
              <span className={`font-body-sm text-body-sm truncate ${active ? "font-bold" : none ? "font-medium text-secondary" : "font-semibold"} text-on-surface`}>{area.name}</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
      {areas.map((area) => {
        const active = selectedAreaId === area.id;
        const none = area.partCount <= 0;
        return (
          <button
            key={area.id}
            type="button"
            className={`bg-surface-container-lowest p-space-md rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-28 text-left relative overflow-hidden ${active ? "shadow-md bg-gradient-to-br from-surface-container-lowest to-surface-container-low" : ""} ${none ? "opacity-80" : ""}`}
            onClick={() => onSelectArea(area.id)}
          >
            {active ? <div className="absolute inset-y-0 left-0 w-1.5 bg-primary"></div> : null}
            <div className={`flex items-start justify-between ${active ? "pl-1" : ""}`}>
              <div className={`p-2 rounded-lg ${active ? "bg-primary text-on-primary" : none ? "bg-surface-container text-on-surface-variant" : "bg-surface-container-low text-on-surface"}`}>
                <span className="material-symbols-outlined text-[20px]">{area.icon || fp3AreaIcon(area.name)}</span>
              </div>
              {active ? (
                <span className="flex items-center gap-1 font-label-code text-caption bg-primary text-on-primary px-2 py-0.5 rounded-full font-medium">
                  <span className="material-symbols-outlined text-[13px]">check</span> Selected
                </span>
              ) : (
                <span className={`font-label-code text-caption ${none ? "text-outline" : "text-on-surface-variant"}`}>{area.areaIndex}</span>
              )}
            </div>
            <div className={active ? "pl-1" : ""}>
              <div className={`font-body-md text-body-md ${active ? "font-bold" : "font-semibold"} text-on-surface`}>{area.name}</div>
              <div className={`font-caption text-caption ${none ? "text-outline" : active ? "text-on-surface font-medium" : "text-on-surface-variant"}`}>{area.onFileLabel}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SubAssemblyStrip({
  area,
  onSelectSubChip,
}: {
  area?: Fp3AreaRow;
  onSelectSubChip: Fp3Actions["onSelectSubChip"];
}) {
  if (!area) return null;
  return (
    <div className="w-full bg-surface-container-low p-space-lg rounded-xl shadow-sm">
      <div className="flex items-center justify-between mb-space-sm">
        <div className="flex items-center gap-space-xs">
          <span className="material-symbols-outlined text-primary text-[18px]">subdirectory_arrow_right</span>
          <span className="font-caption text-caption uppercase tracking-wider text-on-surface font-semibold">Sub-assemblies inside {area.name}</span>
        </div>
        <span className="font-caption text-caption text-on-surface-variant">Select specific component</span>
      </div>
      <div className="flex flex-wrap gap-space-sm">
        {(area.subChips || []).map((chip) => {
          if (chip.disabled) {
            return (
              <div key={chip.id} className="flex items-center gap-space-xs px-3.5 py-2 rounded-lg bg-surface-container text-outline font-body-sm text-body-sm cursor-not-allowed">
                <span>{chip.name}</span>
                <span className="font-label-code text-caption opacity-70 ml-1">{chip.onFileLabel}</span>
              </div>
            );
          }
          return (
            <button
              key={chip.id}
              type="button"
              className={`flex items-center gap-space-xs px-3.5 py-2 rounded-lg font-body-sm text-body-sm transition-colors ${chip.selected ? "bg-primary text-on-primary font-semibold shadow-sm" : "bg-surface-container-lowest hover:bg-surface-container-high text-on-surface"}`}
              onClick={() => onSelectSubChip(chip.id, chip.name, chip.positionAware)}
            >
              {chip.selected ? <span className="material-symbols-outlined text-[16px]">check</span> : null}
              <span>{chip.name}</span>
              <span className={`font-label-code text-caption px-1.5 py-0.2 rounded ml-1 ${chip.selected ? "bg-on-primary/20 text-on-primary" : "bg-surface-container text-on-surface-variant"}`}>{chip.onFileLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CommonPartsRow({
  tiles,
  onPickPart,
}: {
  tiles: Fp3ViewModel["partTiles"];
  onPickPart: Fp3Actions["onPickPart"];
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-space-sm">
      {tiles.map((tile) => {
        const none = tile.statusLabel === "None";
        const active = tile.active;
        return (
          <button
            key={tile.id}
            type="button"
            className={`bg-surface-container-lowest p-space-sm rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-24 text-left ${active ? "shadow-md bg-surface-container-high" : ""} ${none ? "opacity-75" : ""}`}
            onClick={() => onPickPart(tile.id, tile.name, tile.positionAware)}
          >
            <div className="flex justify-between items-start">
              <span className={`material-symbols-outlined text-[18px] ${active ? "text-primary" : none ? "text-outline" : "text-on-surface"}`}>{tile.icon}</span>
              {active ? (
                <span className="flex items-center gap-1 font-label-code text-caption text-on-primary bg-primary px-1.5 py-0.5 rounded font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-surface-container-lowest inline-block"></span>
                  <span>Active</span>
                </span>
              ) : (
                <span className={`flex items-center gap-1 font-label-code text-caption font-medium px-1 py-0.5 rounded ${none ? "text-outline bg-surface-container" : "text-on-surface bg-surface-container"}`}>
                  {!none ? <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span> : null}
                  <span>{tile.statusLabel}</span>
                </span>
              )}
            </div>
            <span className={`font-body-sm text-body-sm truncate ${active ? "font-bold" : none ? "font-medium text-outline" : "font-semibold"} text-on-surface`}>{tile.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function CommonPartsScroll({
  tiles,
  onPickPart,
}: {
  tiles: Fp3ViewModel["partTiles"];
  onPickPart: Fp3Actions["onPickPart"];
}) {
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 -mx-4 px-4">
      {tiles.map((tile) => {
        const active = tile.active;
        const notOnFile = tile.statusLabel === "None";
        return (
          <button
            key={tile.id}
            type="button"
            className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded cursor-pointer ${active ? "bg-primary text-on-primary" : "bg-surface-container-low hover:bg-surface-container text-on-surface"}`}
            onClick={() => onPickPart(tile.id, tile.name, tile.positionAware)}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${active ? "bg-surface-bright" : notOnFile ? "bg-outline-variant" : "bg-primary"}`}></div>
            <span className="font-body-sm text-body-sm font-medium">{tile.name}</span>
            <span className={`font-caption text-caption font-label-code ${active ? "text-inverse-primary" : "text-secondary"}`}>
              {notOnFile ? "Not on file" : tile.statusLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Fp3Screen({ actions, data, activeArea }: { actions: Fp3Actions; data: Fp3ViewModel; activeArea?: Fp3AreaRow }) {
  const areaPanel = activeArea || data.areas.find((a) => a.id === actions.selectedAreaId) || data.areas[0];
  const showHits = actions.searchQuery.trim().length >= 2 && data.searchHits.length > 0;
  const areaCountLabel = `${data.categoryTotal || data.areas.length} areas`;

  return (
    <div className="find-parts-screen-root">
      <div className="fp-screen-root flex flex-col w-full">
        <FindPartsStickyHeader
          step={3}
          onBack={actions.onBack}
          vehicleLabel={data.vehicleLabel}
          plate={data.plate}
          versionTag={data.versionTag}
          onNext={actions.onNext}
          nextDisabled={actions.nextDisabled}
        />

        {/* Desktop / tablet — stitch browse.html */}
        <div className="max-md:max-h-0 max-md:overflow-hidden max-md:opacity-0 md:flex md:flex-col w-full space-y-space-xl">
          <div className="space-y-space-md">
            <div className="space-y-1">
              <h1 className="font-headline-xl text-headline-xl text-on-surface font-semibold tracking-tight">What part do you need?</h1>
              <p className="font-body-md text-body-md text-on-surface-variant">Search by technical name, browse subsystem assemblies, or inspect reported symptoms.</p>
            </div>
            <div className="relative w-full max-w-3xl">
              <div className="flex items-center bg-surface-container-lowest rounded-xl shadow-sm px-4 py-3 gap-space-md transition-all focus-within:shadow-md">
                <span className="material-symbols-outlined text-outline text-[22px]">search</span>
                <input
                  className="flex-1 bg-transparent text-on-surface placeholder:text-outline text-body-lg font-body-lg focus:outline-none"
                  placeholder="Try &apos;brake pads&apos;, &apos;o2 sensor&apos; or a reference code…"
                  type="text"
                  value={actions.searchQuery}
                  onChange={(e) => actions.onSearchChange(e.target.value)}
                />
                <div className="flex items-center gap-space-xs flex-shrink-0">
                  <kbd className="font-label-code text-caption bg-surface-container-high text-on-surface-variant px-1.5 py-0.5 rounded cursor-pointer select-none" onClick={actions.onSearchClear}>ESC</kbd>
                  {actions.speechSupported ? (
                    <button type="button" className="text-outline hover:text-on-surface p-1 rounded-full hover:bg-surface-container transition-colors" title="Voice Search" onClick={actions.onStartVoiceSearch}>
                      <span className="material-symbols-outlined text-[20px]">mic</span>
                    </button>
                  ) : null}
                </div>
              </div>
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

          <section className="space-y-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-on-surface text-[20px]">category</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">By area</h2>
              </div>
              <span className="font-label-code text-caption px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">{areaCountLabel}</span>
            </div>
            <AreaGrid areas={data.areas} selectedAreaId={actions.selectedAreaId || areaPanel?.id || ""} onSelectArea={actions.onSelectArea} />
            <SubAssemblyStrip area={areaPanel} onSelectSubChip={actions.onSelectSubChip} />
          </section>

          <section className="space-y-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-on-surface text-[20px]">stars</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">Common parts</h2>
              </div>
              <span className="font-caption text-caption text-on-surface-variant">Frequently referenced consumables</span>
            </div>
            <CommonPartsRow tiles={data.partTiles} onPickPart={actions.onPickPart} />
          </section>

          <section className="space-y-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-on-surface text-[20px]">troubleshoot</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">What&apos;s wrong with the car?</h2>
              </div>
              <span className="font-caption text-caption text-on-surface-variant">Symptom-to-fitment cross index</span>
            </div>
            <div className="space-y-space-sm">
              {data.symptoms.map((symptom) => {
                const expanded = actions.openSymptomId === symptom.id;
                return (
                  <div key={symptom.id} className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden transition-all">
                    <button type="button" className={`w-full p-space-lg flex items-center justify-between text-left ${expanded ? "bg-surface-container-low/50" : ""}`} onClick={() => actions.onToggleSymptom(symptom.id)}>
                      <div className="flex items-center gap-space-md">
                        <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-on-surface">
                          <span className="material-symbols-outlined text-[20px]">{symptomIcon(symptom.name)}</span>
                        </div>
                        <div>
                          <h3 className="font-body-lg text-body-lg font-semibold text-on-surface">{symptom.name}</h3>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">{symptom.answerText || "Usually worn friction material contacting the rotor or drum."}</p>
                        </div>
                      </div>
                      <span className={`material-symbols-outlined text-on-surface text-[20px] transition-transform ${expanded ? "" : "rotate-180"}`}>expand_less</span>
                    </button>
                    {expanded ? (
                      <div className="p-space-lg bg-surface-container-lowest space-y-space-md">
                        <div className="font-caption text-caption uppercase tracking-wider text-outline font-semibold">Likely matching parts for this issue</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                          {symptom.parts.map((part) => (
                            <button
                              key={part.id}
                              type="button"
                              className={`p-space-md rounded-xl bg-surface-container-low shadow-sm flex flex-col justify-between gap-space-sm text-left ${part.onFileLabel === "Not on file yet" ? "opacity-70" : ""}`}
                              onClick={() => actions.onPickProblem(part.id, part.name, part.positionAware)}
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-body-md text-body-md font-semibold text-on-surface">{part.name}</div>
                                  <div className="font-caption text-caption text-on-surface-variant">{part.subName}</div>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full bg-surface-container font-label-code text-caption font-medium ${part.onFileLabel === "Not on file yet" ? "text-outline" : "text-on-surface"}`}>{part.onFileLabel}</span>
                              </div>
                              <div className="flex items-center justify-between font-caption text-caption text-on-surface-variant pt-space-xs">
                                <span>{part.matchTypeLabel}</span>
                                <span className="font-label-code">{part.crossRefLabel}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Mobile — stitch phone frame (By area before Common parts) */}
        <div className="md:max-h-0 md:overflow-hidden md:opacity-0 max-md:flex max-md:flex-col gap-4 px-4 pb-6 pt-2">
          <div className="flex items-center justify-between max-md:flex md:max-h-0 md:overflow-hidden md:opacity-0">
            <button type="button" className="w-8 h-8 rounded-full bg-surface-container-low flex items-center justify-center" onClick={actions.onBack}>
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </button>
            <div className="flex flex-col items-center">
              <span className="font-caption text-caption uppercase text-secondary tracking-wider font-semibold">Step 3 of 4</span>
              <span className="font-headline-sm text-body-lg font-bold text-on-surface">Part Lookup</span>
            </div>
            <button type="button" className="font-label-code text-body-sm font-semibold text-on-surface bg-surface-container-low px-2.5 py-1 rounded flex items-center gap-0.5" onClick={actions.onNext} disabled={actions.nextDisabled}>
              Next <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
          <div className="overflow-x-auto flex items-center gap-2 py-0.5">
            <div className="flex-shrink-0 flex items-center gap-1.5 bg-surface-container px-2.5 py-1 rounded">
              <span className="material-symbols-outlined text-[15px] text-on-surface-variant">directions_car</span>
              <span className="font-body-sm text-body-sm font-semibold">{data.vehicleLabel}</span>
              <span className="font-label-plate text-caption bg-surface-container-highest px-1.5 py-0.2 rounded font-bold tracking-wider">{data.plate}</span>
            </div>
            <div className="flex-shrink-0 bg-surface-container-low text-secondary font-label-code text-caption px-2 py-1 rounded">{data.versionTag}</div>
          </div>
          <div>
            <h2 className="font-headline-sm text-headline-sm font-bold tracking-tight">What part do you need?</h2>
            <p className="font-body-sm text-body-sm text-secondary">Browse catalog hierarchy or jump to common items</p>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">By area</span>
              <span className="font-label-code text-caption text-on-surface-variant font-medium">{data.categoryTotal || 11} Modules</span>
            </div>
            <AreaGrid areas={data.areas} selectedAreaId={actions.selectedAreaId || areaPanel?.id || ""} onSelectArea={actions.onSelectArea} compact />
            {areaPanel ? (
              <div className="mt-1 bg-surface-container-low p-2.5 rounded flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="font-caption text-caption uppercase text-on-surface font-semibold tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full"></span> {areaPanel.name} Breakdown
                  </span>
                  <span className="font-label-code text-caption text-secondary">{data.chassisCode !== "—" ? `${data.chassisCode} Platform` : "Fleet Platform"}</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {areaPanel.subChips.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      disabled={chip.disabled}
                      className={`flex-shrink-0 px-2.5 py-1.5 rounded flex items-center gap-1.5 ${chip.selected ? "bg-primary text-on-primary" : chip.disabled ? "bg-surface-container text-on-surface-variant" : "bg-surface-container-highest text-on-surface"}`}
                      onClick={() => actions.onSelectSubChip(chip.id, chip.name, chip.positionAware)}
                    >
                      <span className="font-body-sm text-body-sm font-medium">{chip.name}</span>
                      <span className="font-label-code text-caption px-1">{chip.disabled ? chip.onFileLabel : chip.onFileLabel.replace(" on file", "")}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-caption text-caption uppercase tracking-wider text-secondary font-semibold">Common parts</span>
              <span className="font-caption text-caption text-secondary">Horizontal scroll</span>
            </div>
            <CommonPartsScroll tiles={data.partTiles} onPickPart={actions.onPickPart} />
          </div>
        </div>
      </div>
    </div>
  );
}
