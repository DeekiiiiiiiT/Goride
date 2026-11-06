// Stitch AP9
import { MaterialIcon } from "../../import/MaterialIcon";
import { PartsButton } from "../../PartsButton";

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
  const reach = preview?.totalReach ?? preview?.carCount ?? 8;
  const brand = String(saveResult.brand ?? "MK Kashiyama");
  const partNumber = String(saveResult.partNumber ?? "D0051MH");
  const category = String(saveResult.categoryLabel ?? "Front brake pads");
  const batchCode = String(saveResult.batchCode ?? "").trim();
  const directCount = Number(saveResult.directVehicleCount ?? 7);
  const linkedCount = Number(saveResult.autoLinkedCount ?? 1);

  return (
    <div className="parts-database-stitch w-full max-w-[880px] mx-auto px-margin py-space-xl flex flex-col gap-space-xl">
      <div className="w-full bg-surface-container-lowest p-space-md shadow-sm rounded-xl flex flex-wrap items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md flex-wrap">
          {batchCode ? (
            <div className="flex items-center gap-space-xs px-2.5 py-1 bg-surface-container-low rounded-full">
              <span className="w-2 h-2 rounded-full bg-primary-container" />
              <span className="font-mono-sm text-mono-sm text-primary uppercase">{batchCode}</span>
            </div>
          ) : null}
          <span className="font-label-xs text-label-xs uppercase tracking-wider text-outline">Workflow complete</span>
        </div>
        <div className="flex flex-wrap items-center gap-space-sm">
          {["1. The part", "2. How it fits", "3. Replaces", "4. Review"].map((label, i) => (
            <div key={label} className={`flex items-center gap-1.5 px-2 py-0.5 rounded font-label-xs text-label-xs ${i === 3 ? "bg-primary-fixed text-on-primary-fixed font-semibold" : "bg-surface-container-low text-on-surface-variant"}`}>
              <MaterialIcon name="check_circle" className="text-[14px] text-primary" filled />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full bg-surface-container-lowest shadow-md rounded-xl p-8 flex flex-col gap-6">
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 shrink-0 rounded-full bg-[#e6f4ea] flex items-center justify-center">
            <MaterialIcon name="check" className="text-[#006e31] text-[32px]" filled />
          </div>
          <div className="flex flex-col gap-1.5 pt-0.5">
            <h1 className="font-headline-xl text-headline-xl text-on-surface tracking-tight">Part added</h1>
            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              <span className="font-semibold text-on-surface">{brand} {partNumber}</span> now shows for{" "}
              <span className="font-semibold text-on-surface">{reach} cars</span>
              {linkedCount > 0 ? ` (${directCount} you ticked + ${linkedCount} through cross-reference).` : "."}
            </p>
          </div>
        </div>

        <div className="w-full bg-surface-container-low rounded-lg p-space-md flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="font-label-xs text-label-xs uppercase text-outline">Brand</span>
            <span className="font-body-sm font-semibold text-on-surface">{brand}</span>
          </div>
          <span className="text-outline-variant font-mono-sm">·</span>
          <div className="flex items-center gap-2">
            <span className="font-label-xs text-label-xs uppercase text-outline">Part No</span>
            <span className="font-mono-md text-mono-md font-semibold text-primary">{partNumber}</span>
          </div>
          <span className="text-outline-variant font-mono-sm">·</span>
          <div className="flex items-center gap-2">
            <span className="font-label-xs text-label-xs uppercase text-outline">Category</span>
            <span className="font-body-sm text-on-surface">{category}</span>
          </div>
          <span className="flex items-center gap-1.5 bg-[#e6f4ea] text-[#006e31] px-2 py-0.5 rounded font-mono-sm text-mono-sm font-semibold">
            <MaterialIcon name="verified" className="text-[14px]" />
            Verified
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-space-md">
            <span className="font-label-xs text-label-xs uppercase text-outline font-bold">Direct vehicles</span>
            <p className="font-headline-lg text-primary font-semibold mt-1">{directCount}</p>
            <p className="font-body-sm text-on-surface-variant">Cars you ticked on step 2</p>
          </div>
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container-low p-space-md">
            <span className="font-label-xs text-label-xs uppercase text-outline font-bold">Auto-linked</span>
            <p className="font-headline-lg text-primary font-semibold mt-1">{linkedCount}</p>
            <p className="font-body-sm text-on-surface-variant">Extra reach via factory number cross-ref</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-space-md pt-2">
          <button type="button" className="h-9 px-space-lg bg-primary-container hover:bg-primary text-on-primary rounded font-label-md font-semibold flex items-center gap-2 shadow-sm" onClick={onAddAnother}>
            <MaterialIcon name="add" className="text-[18px]" />
            Add another part
          </button>
          <button type="button" className="h-9 px-space-lg bg-surface-container-lowest hover:bg-surface-container-high text-on-surface rounded font-label-md flex items-center gap-2 shadow-sm" onClick={onFindParts}>
            <MaterialIcon name="travel_explore" className="text-outline text-[18px]" />
            See it in Find parts
          </button>
          <PartsButton variant="secondary" className="h-9 px-space-md flex items-center gap-1.5" onClick={onHome}>
            <MaterialIcon name="arrow_back" className="text-[16px]" />
            Back to Add parts
          </PartsButton>
        </div>

        {saveResult.batchId ? (
          <div className="w-full bg-surface-container-low rounded-lg p-space-md flex items-center justify-between gap-space-md flex-wrap">
            <div className="flex items-center gap-space-md">
              <MaterialIcon name="undo" className="text-outline text-[18px]" />
              <div className="flex flex-col">
                <span className="font-body-sm font-medium text-on-surface">Added by mistake?</span>
                <span className="font-body-sm text-on-surface-variant">Undo removes this part and its fits (within 24h).</span>
              </div>
            </div>
            <PartsButton variant="danger" className="px-space-md py-1.5 font-mono-sm font-semibold" onClick={onUndo}>
              Undo this part
            </PartsButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
