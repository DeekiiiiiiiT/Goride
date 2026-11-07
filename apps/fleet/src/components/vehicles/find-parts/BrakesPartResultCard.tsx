import { BrakesTrustChip } from "./BrakesTrustChip";
import { copyTextToClipboard } from "./findPartsActions";

type BrandNumber = { partId: string; brand: string; number: string; trust: string };

export function BrakesPartResultCard({
  partName,
  primaryPart,
  brandNumbers,
  positionLabel,
  sizeLine,
  alsoFitsSummary,
  onViewDetails,
  onUseInService,
  canUseInService,
}: {
  partName: string;
  primaryPart: { id?: string; name?: string; manufacturer?: string; oem_part_number?: string };
  brandNumbers: BrandNumber[];
  positionLabel: string;
  sizeLine?: string | null;
  alsoFitsSummary?: string | null;
  onViewDetails: () => void;
  onUseInService?: () => void;
  canUseInService?: boolean;
}) {
  const refBrand = String(primaryPart.manufacturer || brandNumbers[0]?.brand || "");
  const refNumber = String(primaryPart.oem_part_number || brandNumbers[0]?.number || "");
  const cardTrust = brandNumbers[0]?.trust || "Needs checking";

  return (
    <article className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-space-xl shadow-sm flex flex-col gap-space-lg">
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      <div className="flex flex-wrap items-center justify-between gap-space-sm pl-1">
        <div className="flex flex-wrap items-center gap-space-sm min-w-0">
          <h3 className="font-headline-lg text-headline-lg font-semibold text-on-surface">{partName}</h3>
          <BrakesTrustChip trust={cardTrust} />
          <span className="px-2 py-0.5 rounded bg-surface-container font-caption text-caption text-on-surface-variant uppercase tracking-wider">
            {positionLabel}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-space-md py-space-xs pl-1">
        <div className="flex flex-col min-w-0">
          <span className="font-caption text-caption text-on-surface-variant uppercase tracking-wider mb-1">Reference number</span>
          <span className="font-label-plate text-headline-xl text-on-surface tracking-tight">
            {[refBrand, refNumber].filter(Boolean).join(" ")}
          </span>
        </div>
        <button
          type="button"
          className="h-10 px-3.5 rounded-lg border border-outline-variant bg-surface-container-low hover:bg-surface-container text-on-surface flex items-center gap-2 font-label-code text-label-code font-medium"
          onClick={() => { void copyTextToClipboard(refNumber || `${refBrand} ${refNumber}`.trim()); }}
        >
          <span className="material-symbols-outlined text-[18px]">content_copy</span>
          Copy
        </button>
      </div>
      <div className="flex flex-col gap-space-md pl-1">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-headline-sm text-headline-sm font-semibold text-on-surface">Same part, other brands</h4>
          <span className="font-caption text-caption text-on-surface-variant font-label-code">
            {brandNumbers.length} other brand number{brandNumbers.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
          {brandNumbers.map((cell) => (
            <div key={cell.partId} className="p-3 bg-surface-container-low rounded-lg flex items-center justify-between gap-space-sm">
              <div className="flex flex-col min-w-0">
                <span className="font-caption text-caption text-on-surface-variant">{cell.brand}</span>
                <span className="font-label-plate text-body-lg text-on-surface truncate">{cell.number}</span>
              </div>
              <div className="flex items-center gap-space-xs shrink-0">
                <BrakesTrustChip trust={cell.trust} />
                <button
                  type="button"
                  className="w-7 h-7 rounded hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant"
                  aria-label={`Copy ${cell.number}`}
                  onClick={() => { void copyTextToClipboard(cell.number); }}
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {sizeLine ? (
        <p className="font-label-code text-body-md text-on-surface-variant pl-1">{sizeLine}</p>
      ) : null}
      {alsoFitsSummary ? (
        <p className="font-body-sm text-on-surface-variant pl-1">{alsoFitsSummary}</p>
      ) : null}
      <div className="flex flex-wrap gap-space-sm pl-1 pt-space-xs">
        <button
          type="button"
          className="rounded-lg border border-outline-variant px-space-md py-2 font-body-sm font-semibold text-on-surface disabled:opacity-40"
          disabled={!canUseInService}
          onClick={() => onUseInService?.()}
        >
          Use in a service log
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-space-md py-2 font-body-sm font-semibold text-on-primary flex items-center gap-1"
          onClick={onViewDetails}
        >
          View details
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    </article>
  );
}
