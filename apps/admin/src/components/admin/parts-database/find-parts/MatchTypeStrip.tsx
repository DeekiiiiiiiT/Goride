import { PART_MATCH_TIERS, fillPlainReason } from "../../../../../../../packages/types/src/partsResolution";

const DOTS = ["#0153dc", "#0e7490", "#b45309", "#7c3aed", "#006e31"];

export function MatchTypeStrip() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-space-sm p-space-md rounded-2xl bg-surface-container-low shadow-sm">
      {PART_MATCH_TIERS.map((row, index) => (
        <div key={row.tier} className="flex flex-col gap-1 p-space-sm rounded-xl bg-surface-container-lowest shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DOTS[index] }} />
            <span className="font-mono-sm text-mono-sm font-bold" style={{ color: DOTS[index] }}>{row.tag}</span>
          </div>
          <span className="font-label-md text-label-md font-semibold text-on-surface">{row.plainLabel}</span>
          <span className="font-body-sm text-body-sm text-secondary">{fillPlainReason(row.tier)}</span>
        </div>
      ))}
    </div>
  );
}
