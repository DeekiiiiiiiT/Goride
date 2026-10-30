// Stitch: dominion-redesign/S42d
import { MatchTypeStrip } from "./MatchTypeStrip";

export function PositionStep({
  partName,
  partCount,
  onChoose,
  onBack,
}: {
  partName: string;
  partCount: number | null;
  onChoose: (position: "front" | "rear" | "both", side: "left" | "right" | "both") => void;
  onBack: () => void;
}) {
  const cards = [
    { id: "front" as const, title: "Front" },
    { id: "rear" as const, title: "Back" },
    { id: "both" as const, title: "Both" },
  ];
  const sides = [
    { id: "left" as const, title: "Left" },
    { id: "right" as const, title: "Right" },
    { id: "both" as const, title: "Both sides" },
  ];
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-space-lg">
      <div className="bg-surface-container-lowest rounded-2xl shadow-md p-space-xl md:p-8 flex flex-col gap-space-xl">
        <div>
          <h2 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Front or back?</h2>
          <p className="font-body-md text-body-md text-secondary mt-1">{partName}</p>
          {partCount != null ? <p className="font-mono-sm text-mono-sm text-secondary mt-1">{partCount} parts</p> : null}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          {cards.map((card) => (
            <button key={card.id} type="button" className="rounded-xl bg-surface-container-low p-space-lg text-left" onClick={() => onChoose(card.id, "both")}>
              <span className="font-headline-md text-headline-md font-bold text-on-surface">{card.title}</span>
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-surface-container-low p-space-md font-body-md text-body-md text-on-surface">
          Front and back {partName.toLowerCase()} are different parts.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          {sides.map((card) => (
            <button key={card.id} type="button" className="rounded-xl bg-surface-container-low p-space-lg text-left" onClick={() => onChoose("both", card.id)}>
              <span className="font-headline-md text-headline-md font-bold text-on-surface">{card.title}</span>
            </button>
          ))}
        </div>
        <button type="button" className="self-start h-12 px-5 rounded-xl bg-primary-container text-on-primary" onClick={() => onChoose("both", "both")} aria-label="Show parts arrow_forward">Show parts arrow_forward</button>
        <button type="button" className="self-start h-12 px-4 text-secondary font-label-md text-label-md" onClick={onBack}>Back</button>
      </div>
      <MatchTypeStrip />
    </div>
  );
}
