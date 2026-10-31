// Stitch: dominion-redesign/S42 + find_parts_not_on_file_yet trail
export type TrailChip = { label: string; step: "car" | "version" | "part" | "position" };

export function ChoiceTrail({
  chips,
  onOpen,
  gapDetected,
}: {
  chips: TrailChip[];
  onOpen: (step: TrailChip["step"]) => void;
  gapDetected?: boolean;
}) {
  if (!chips.length) return null;
  return (
    <div className="sticky top-16 z-30 bg-surface-container-lowest rounded-xl p-space-sm px-space-md shadow-sm flex flex-wrap items-center justify-between gap-space-md mb-space-xl">
      <div className="flex flex-wrap items-center gap-space-xs font-body-sm text-body-sm min-w-0">
        <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline mr-1 shrink-0">Active query:</span>
        {chips.map((chip, index) => (
          <span key={chip.step + chip.label} className="inline-flex items-center gap-space-xs">
            {index > 0 ? <span className="text-outline-variant font-mono-sm text-mono-sm">›</span> : null}
            <button
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container-low text-on-surface hover:bg-surface-container transition-colors"
              onClick={() => onOpen(chip.step)}
            >
              <span>{chip.label}</span>
              <span className="material-symbols-outlined text-[13px] text-outline">edit</span>
            </button>
          </span>
        ))}
      </div>
      {gapDetected ? (
        <span className="px-2.5 py-1 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed font-mono-sm text-mono-sm font-semibold tracking-wide inline-flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-tertiary" />
          Status: gap detected (no match)
        </span>
      ) : null}
    </div>
  );
}
