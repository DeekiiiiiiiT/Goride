// Stitch AP9
import { MaterialIcon } from "../../import/MaterialIcon";
import { AddPartsScreenFrame } from "../AddPartsScreenFrame";

export function StepSaved({
  saveResult,
  onAddAnother,
  onHome,
  onUndo,
  onFindParts,
}: {
  saveResult: Record<string, unknown>;
  onAddAnother: () => void;
  onHome: () => void;
  onUndo: () => void;
  onFindParts: () => void;
}) {
  const preview = saveResult.preview as { totalReach?: number; carCount?: number } | undefined;
  const chassis = (saveResult.chassisList as string[] | undefined) ?? [];
  const reach = preview?.totalReach ?? preview?.carCount ?? "—";

  return (
    <AddPartsScreenFrame ap="AP9" title="Saved" subtitle={String(saveResult.trustLabel ?? "Part saved to the master catalog.")}>
      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col gap-space-md">
        <p className="font-headline-lg text-headline-lg text-on-surface">
          Reach: {String(reach)} car version(s)
        </p>
        {chassis.length > 0 ? (
          <div className="flex items-center gap-2 bg-surface-container-low rounded px-2.5 py-1.5 font-mono-sm text-mono-sm text-on-surface-variant">
            <MaterialIcon name="check" className="text-outline text-[16px]" />
            <span>{chassis.slice(0, 6).join(", ")}{chassis.length > 6 ? ` +${chassis.length - 6} more` : ""}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-space-md pt-2">
          <button type="button" className="h-9 px-space-lg bg-primary-container hover:bg-primary text-on-primary rounded font-label-md font-semibold flex items-center gap-2 shadow-sm" onClick={onAddAnother}>
            <MaterialIcon name="add" className="text-[18px]" />
            Add another part
          </button>
          <button type="button" className="h-9 px-space-lg bg-surface-container-lowest hover:bg-surface-container-high text-on-surface rounded font-label-md flex items-center gap-2 shadow-sm" onClick={onFindParts}>
            <MaterialIcon name="travel_explore" className="text-outline text-[18px]" />
            See it in Find parts
          </button>
          <button type="button" className="h-9 px-space-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded font-label-md flex items-center gap-1.5" onClick={onHome}>
            <MaterialIcon name="arrow_back" className="text-[16px]" />
            Back to Add parts
          </button>
        </div>
        {saveResult.batchId ? (
          <div className="w-full bg-surface-container-low rounded-lg p-space-md flex items-center justify-between gap-space-md flex-wrap">
            <div className="flex items-center gap-space-md">
              <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center shrink-0">
                <MaterialIcon name="undo" className="text-outline text-[18px]" />
              </div>
              <div className="flex flex-col">
                <span className="font-body-sm text-body-sm text-on-surface font-medium">Added by mistake?</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">Undo removes this part and its fits (within 24h).</span>
              </div>
            </div>
            <button type="button" className="px-space-md py-1.5 bg-surface-container hover:bg-error-container hover:text-on-error-container text-on-surface-variant rounded font-mono-sm font-semibold transition-colors shrink-0" onClick={onUndo}>
              Undo this part
            </button>
          </div>
        ) : null}
      </div>
    </AddPartsScreenFrame>
  );
}
