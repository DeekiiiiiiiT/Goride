// Stitch AP2
import { MaterialIcon } from "../../import/MaterialIcon";
import type { PartTypeRow } from "../addPartsTypes";
import { AskPartTypePanel } from "../states/AskPartTypePanel";

export function Step1TypePicker({
  types,
  typeSearch,
  onSearch,
  onSelect,
  onSubmitPartTypeRequest,
}: {
  types: PartTypeRow[];
  typeSearch: string;
  onSearch: (q: string) => void;
  onSelect: (t: PartTypeRow) => void;
  onSubmitPartTypeRequest: (p: { name: string; area?: string; exampleNumber?: string; reason: string }) => Promise<void>;
}) {
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
          className="w-full h-11 pl-11 pr-4 rounded-lg bg-surface-container-low text-on-surface font-body-md text-body-md placeholder:text-outline focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container/20 shadow-inner"
          placeholder="Search part types — pads, oil filter, H4, wiper…"
          value={typeSearch}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-space-sm max-h-[420px] overflow-y-auto">
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.name}
            className="text-left p-3 rounded-lg border border-outline-variant/30 hover:border-primary-container bg-surface-container-lowest hover:bg-primary-fixed/20 transition-all min-h-[96px] flex flex-col justify-between"
            onClick={() => onSelect(t)}
          >
            {t.iconKey ? <MaterialIcon name={t.iconKey} className="text-[20px] text-primary-container mb-1" /> : null}
            <span className="font-body-sm text-body-sm font-semibold text-on-surface block leading-tight">{t.name}</span>
            {t.tradeTerm ? <span className="text-[11px] text-on-surface-variant font-mono-sm mt-1">{t.tradeTerm}</span> : null}
          </button>
        ))}
      </div>
      <AskPartTypePanel onSubmit={onSubmitPartTypeRequest} />
    </div>
  );
}
