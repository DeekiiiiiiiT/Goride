// Stitch: dominion-redesign/S42b
import type { FindPartsCandidate } from "../partsDatabaseApi";
import { MatchTypeStrip } from "./MatchTypeStrip";

export function VariantStep({
  carLabel,
  candidates,
  pickedId,
  onPick,
  onNotSure,
  onBack,
  onContinue,
}: {
  carLabel: string;
  candidates: FindPartsCandidate[];
  pickedId: string;
  onPick: (id: string) => void;
  onNotSure: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-space-lg">
      <div className="bg-surface-container-lowest rounded-2xl shadow-md p-space-xl md:p-8 flex flex-col gap-space-xl">
        <div>
          <h2 className="font-headline-xl text-headline-xl text-on-surface font-bold tracking-tight">Which {carLabel} is it?</h2>
          <p className="font-body-md text-body-md text-secondary mt-1">The letters before the dash are the model code, for example GP5.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          {candidates.map((row) => {
            const on = row.id === pickedId;
            return (
              <button
                key={row.id}
                type="button"
                className={"text-left rounded-xl p-space-md shadow-sm " + (on ? "bg-primary-container text-on-primary" : "bg-surface-container-low text-on-surface")}
                onClick={() => onPick(row.id)}
              >
                <span className="font-headline-md text-headline-md font-bold block">{row.plainLabel || "Version"}</span>
                {row.codeLine ? <span className={"font-mono-sm text-mono-sm " + (on ? "text-on-primary" : "text-secondary")}>{row.codeLine}</span> : null}
              </button>
            );
          })}
          <button
            type="button"
            className={"text-left rounded-xl p-space-md shadow-sm " + (pickedId === "any" ? "bg-primary-container text-on-primary" : "bg-surface-container-low text-on-surface")}
            onClick={onNotSure}
          >
            <span className="font-headline-md text-headline-md font-bold block">Not sure</span>
            <span className={"font-body-sm text-body-sm " + (pickedId === "any" ? "text-on-primary" : "text-secondary")}>Show parts that fit any of these versions.</span>
          </button>
        </div>
        <div className="rounded-xl bg-surface-container-low p-space-md">
          <h3 className="font-headline-md text-headline-md font-semibold text-on-surface">Where do I find this?</h3>
          <p className="font-body-sm text-body-sm text-secondary mt-1">The letters before the dash are the model code, for example GP5.</p>
          <p className="font-body-sm text-body-sm text-on-surface mt-2">+ Add it now</p>
        </div>
        <div className="flex items-center justify-between gap-space-md">
          <button type="button" className="h-12 px-4 rounded-xl text-secondary font-label-md text-label-md" onClick={onBack} aria-label="Back to car selection">Back to car selection</button>
          <button type="button" className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-primary-container text-on-primary font-headline-md text-headline-md font-semibold disabled:opacity-40" disabled={!pickedId} onClick={onContinue} aria-label="Continue to part selection arrow_forward">
            Continue to part selection
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </button>
        </div>
      </div>
      <MatchTypeStrip />
    </div>
  );
}
