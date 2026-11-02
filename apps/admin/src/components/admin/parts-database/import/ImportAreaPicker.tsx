// Stitch: dominion-redesign/parts_import_pick_area
import type { ImportAreaSummary } from "./partsImportApi";

const AREA_LABELS = [
  "Brakes",
  "Engine",
  "Filters",
  "Fluids",
  "Transmission",
  "Tires & wheels",
  "Belts & hoses",
  "Lighting & visibility",
  "Suspension & steering",
  "Battery & electrical",
  "HVAC",
] as const;

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
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <h1 className="font-headline-lg text-headline-lg font-semibold text-on-surface">Parts database</h1>
        <button type="button" className="text-on-surface-variant">Find parts</button>
        <button type="button" className="text-on-surface-variant">Full database</button>
        <button type="button" className="font-semibold text-primary">Import CSV</button>
        <button type="button" className="text-on-surface-variant">Advanced tune</button>
        <button type="button" className="text-on-surface-variant">Add a part</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-headline-lg text-headline-lg font-semibold text-on-surface">Which area are you importing?</h2>
        <button type="button" className="text-sm font-semibold text-secondary" onClick={onOpenLedger}>
          Import ledger
        </button>
      </div>
      <p className="text-sm text-on-surface-variant">
        Dominion Master Integrity — every import is staged, checked, and logged before it reaches Find parts.
      </p>
      <div className="flex flex-wrap gap-1 text-[10px] font-mono uppercase text-outline opacity-80">
        {AREA_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => (
          <button
            key={area.id}
            type="button"
            className="text-left rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-sm hover:border-primary transition-colors"
            onClick={() => onPick(area)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-on-surface">{area.name}</span>
              <span className="text-xs text-outline">Start →</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-2">{area.partsOnFile} parts · fits on file</p>
            <p className="text-xs text-outline mt-1">
              {area.lastImportAt ? `Last import ${new Date(area.lastImportAt).toLocaleDateString()}` : "Nothing imported yet"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
