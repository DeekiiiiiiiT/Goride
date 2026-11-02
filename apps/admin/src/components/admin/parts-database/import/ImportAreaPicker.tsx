// Stitch: dominion-redesign/parts_import_pick_area
import type { ImportAreaSummary } from "./partsImportApi";
import { materialIconForArea } from "./importAreaIcons";
import { MaterialIcon } from "./MaterialIcon";

function formatImportDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function areaStatusChip(area: ImportAreaSummary) {
  if (area.needsChecking > 0) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-[#fef3c7] font-mono-sm text-mono-sm font-semibold text-[#b45309] flex items-center gap-1 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-[#b45309]" />
        Needs checking {area.needsChecking}
      </span>
    );
  }
  if (area.partsOnFile > 0) {
    return (
      <span className="px-2 py-0.5 rounded-full bg-surface-container font-mono-sm text-mono-sm font-medium text-secondary shrink-0">
        Synchronized
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full bg-surface-container font-mono-sm text-mono-sm font-medium text-outline shrink-0">
      Empty
    </span>
  );
}

export function ImportAreaPicker({
  areas,
  onPick,
  onOpenLedger,
}: {
  areas: ImportAreaSummary[];
  onPick: (area: ImportAreaSummary) => void;
  onOpenLedger: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pt-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-headline-lg text-headline-lg font-semibold text-on-surface">Which area are you importing?</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Each area has its own template and checks. Pick one to start.
          </p>
        </div>
        <button
          type="button"
          className="group flex items-center gap-1.5 px-space-md py-1.5 rounded-lg border border-outline-variant bg-surface-container-lowest text-primary font-label-md text-label-md font-semibold hover:bg-primary hover:text-on-primary transition-all shadow-xs shrink-0"
          onClick={onOpenLedger}
        >
          <MaterialIcon name="history" className="text-[18px]" />
          Import ledger
          <span className="group-hover:translate-x-0.5 transition-transform">→</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-lg">
        {areas.map((area) => {
          const lastDate = formatImportDate(area.lastImportAt);
          const typesLine = area.partTypes.length ? area.partTypes.join(" · ") : "—";
          return (
            <button
              key={area.id}
              type="button"
              className="group relative flex flex-col justify-between text-left p-space-lg bg-surface-container-lowest rounded-xl shadow-xs hover:shadow-md transition-all"
              onClick={() => onPick(area)}
            >
              <div className="flex flex-col gap-space-md">
                <div className="flex items-start justify-between gap-2">
                  <div className="w-10 h-10 rounded-xl bg-primary-fixed flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
                    <MaterialIcon name={materialIconForArea(area.iconKey, area.name)} className="text-[22px]" />
                  </div>
                  {areaStatusChip(area)}
                </div>
                <div>
                  <h3 className="font-headline-md text-headline-md font-semibold text-on-surface group-hover:text-primary transition-colors">
                    {area.name}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-1">{typesLine}</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-space-lg mt-space-sm bg-gradient-to-t from-surface-container-low/40 to-transparent -mx-space-lg -mb-space-lg p-space-lg rounded-b-xl">
                <div className="flex items-center justify-between font-mono-sm text-mono-sm text-on-surface-variant">
                  <span className={area.partsOnFile ? "font-semibold text-on-surface" : "font-medium text-outline"}>
                    {area.partsOnFile} parts · {area.fitsOnFile} fits
                  </span>
                  <span className="text-outline">{lastDate ?? (area.lastImportAt ? "—" : "None")}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="font-mono-sm text-mono-sm text-outline">
                    {area.lastImportAt ? "Last import" : "Nothing imported yet"}
                  </span>
                  <span className="font-label-md text-label-md font-semibold text-primary flex items-center gap-0.5 group-hover:translate-x-1 transition-transform">
                    Start <span>→</span>
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-space-md p-space-lg rounded-xl bg-surface-container-low border border-outline-variant/40">
        <MaterialIcon name="info" className="text-[22px] text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-label-md text-label-md font-bold text-on-surface tracking-wide block">
            Dominion Master Integrity
          </span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Imports are isolated by functional area to enforce schema strictness. All rows are validated against car IDs
            and OEM patterns prior to live commit. Zero customer data or prices stored.
          </p>
        </div>
      </div>
    </div>
  );
}
