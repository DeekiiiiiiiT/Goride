// Stitch: dominion-redesign/S42
export type TrailChip = { label: string; step: "car" | "version" | "part" | "position" };

export function ChoiceTrail({
  chips,
  onOpen,
}: {
  chips: TrailChip[];
  onOpen: (step: TrailChip["step"]) => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="find-parts-trail sticky top-0 z-10 mb-space-md overflow-x-auto bg-surface-container-low rounded-xl px-3 py-2">
      <div className="flex items-center gap-2 min-w-max">
        {chips.map((chip, index) => (
          <button key={chip.step + chip.label} type="button" className="font-body-sm text-body-sm text-on-surface" onClick={() => onOpen(chip.step)}>
            {index > 0 ? <span className="text-secondary mx-1">›</span> : null}
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
