// Stitch AP2
import { MaterialIcon } from "../../import/MaterialIcon";
import type { PartTypeRow } from "../addPartsTypes";
import { groupPartTypesByArea, PartTypeIcon } from "../addPartsShared";
import { AskPartTypePanel } from "../states/AskPartTypePanel";

export function Step1TypePicker({
  types,
  typeSearch,
  onSearch,
  selectedId,
  onSelect,
  onSubmitPartTypeRequest,
}: {
  types: PartTypeRow[];
  typeSearch: string;
  onSearch: (q: string) => void;
  selectedId: string | null;
  onSelect: (t: PartTypeRow) => void;
  onSubmitPartTypeRequest: (p: { name: string; area?: string; exampleNumber?: string; reason: string }) => Promise<void>;
}) {
  const groups = groupPartTypesByArea(types);
  const selected = types.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex flex-col bg-surface-container-lowest rounded-xl p-space-xl shadow-sm gap-space-lg">
      <div className="flex flex-col">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-headline-xl text-headline-xl text-on-surface">What kind of part is it?</h2>
          <span className="font-mono-sm text-[11px] text-outline uppercase tracking-wider">Step 1 of 4</span>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
          Pick the closest match. Search to filter standard names or trade terms.
        </p>
      </div>
      <div className="relative w-full">
        <MaterialIcon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
        <input
          className="w-full h-11 pl-11 pr-24 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 shadow-inner"
          placeholder="Search part types — pads, oil filter, H4, wiper…"
          value={typeSearch}
          onChange={(e) => onSearch(e.target.value)}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {typeSearch ? (
            <button type="button" className="w-7 h-7 rounded-md hover:bg-surface-container flex items-center justify-center text-outline" aria-label="Clear search" onClick={() => onSearch("")}>
              <MaterialIcon name="close" className="text-[18px]" />
            </button>
          ) : null}
          <span className="px-1.5 py-0.5 rounded bg-surface-container-highest font-mono-sm text-mono-sm text-on-surface-variant">⌘K</span>
        </div>
      </div>

      <div className="flex flex-col gap-space-xl max-h-[480px] overflow-y-auto pr-1">
        {groups.map(({ area, types: areaTypes }) => (
          <section key={area ? area.label : "other"}>
            <div className="flex items-center gap-space-sm pb-1 border-b border-outline-variant/30 mb-space-sm">
              {area ? <MaterialIcon name={area.sectionIcon} className="text-[16px] text-primary-container" /> : null}
              <h3 className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface font-bold flex-1">
                {area ? `${area.num}. ${area.label}` : "Other"}
              </h3>
              <span className="font-mono-sm text-mono-sm text-[10px] text-outline">{areaTypes.length} items</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-space-sm pt-1">
              {areaTypes.map((t) => {
                const active = selectedId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={t.name}
                    aria-pressed={active}
                    className={
                      active
                        ? "text-left p-3 rounded-lg ring-2 ring-primary-container bg-primary-fixed/30 transition-all min-h-[96px] flex flex-col justify-between relative shadow-sm"
                        : "text-left p-3 rounded-lg bg-surface-container-low hover:bg-surface-container transition-all min-h-[96px] flex flex-col justify-between"
                    }
                    onClick={() => onSelect(t)}
                  >
                    {active ? (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary-container text-on-primary flex items-center justify-center">
                        <MaterialIcon name="check" className="text-[12px] font-bold" />
                      </div>
                    ) : null}
                    <PartTypeIcon iconKey={t.iconKey} className={`text-[20px] mb-1 ${active ? "text-primary-container" : "text-on-surface-variant"}`} />
                    <div className="flex flex-col">
                      <span className={`font-label-md text-label-md block leading-tight ${active ? "font-bold text-on-surface" : "font-medium text-on-surface"}`}>{t.name}</span>
                      {t.tradeTerm ? (
                        <span className={`text-[10px] font-mono-sm mt-1 truncate ${active ? "text-primary" : "text-outline"}`}>{t.tradeTerm}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {selected ? (
        <div className="p-space-md rounded-xl bg-primary-fixed/40 flex items-start gap-space-md">
          <MaterialIcon name="info" className="text-primary-container text-[20px] mt-0.5" />
          <div className="flex flex-col">
            <span className="font-label-md text-label-md font-bold text-on-primary-fixed">
              Selected classification: {selected.tradeTerm || selected.name}
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              {selected.editorHint
                || (selected.defaultFitMode === "specific"
                  ? "Default fitment: Specific cars (front or rear axle). In Step 2, assign pad positioning and axle geometry."
                  : `Default fitment: ${selected.defaultFitMode === "engine" ? "By engine" : "By size or spec"}.`)}
            </p>
          </div>
        </div>
      ) : null}

      <AskPartTypePanel onSubmit={onSubmitPartTypeRequest} />
    </div>
  );
}
