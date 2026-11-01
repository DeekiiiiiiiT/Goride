export type FindPartsWizardStep = 3 | 4 | 5 | 8;

export type FindPartsStickyHeaderProps = {
  step: FindPartsWizardStep;
  onBack: () => void;
  vehicleLabel: string;
  plate: string;
  versionTag: string;
  onEditVehicle?: () => void;
  /** Step 3 label in trail when on FP4/FP8 (e.g. "Brake pads") */
  partTrailLabel?: string;
  /** FP5: e.g. "4. Rear · Both sides" */
  resultsTrailLabel?: string;
  /** FP8 catalog breadcrumb */
  fitmentQueryRef?: string;
  onNext?: () => void;
  nextDisabled?: boolean;
  onSaveSearch?: () => void;
  onDownloadFitmentReport?: () => void;
};

function StepTrail({
  step,
  partTrailLabel,
  resultsTrailLabel,
}: {
  step: FindPartsWizardStep;
  partTrailLabel?: string;
  resultsTrailLabel?: string;
}) {
  const step3Text = partTrailLabel?.trim() ? `3. ${partTrailLabel}` : "3. Part";
  if (step === 8) {
    return (
      <div className="max-lg:max-h-0 max-lg:overflow-hidden max-lg:opacity-0 lg:flex lg:items-center lg:gap-space-sm font-body-sm text-body-sm">
        <span className="inline-flex items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] text-on-surface">check_circle</span>
          <span>1. Pick car</span>
        </span>
        <span className="text-outline-variant font-label-code">/</span>
        <span className="inline-flex items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] text-on-surface">check_circle</span>
          <span>2. Version</span>
        </span>
        <span className="text-outline-variant font-label-code">/</span>
        <span className="inline-flex items-center gap-1 font-headline-sm text-headline-sm text-on-surface">
          <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
          <span className="font-medium text-body-sm text-on-surface">{step3Text.replace(/^3\. /, "3. ")}</span>
        </span>
      </div>
    );
  }
  if (step === 5) {
    return (
      <nav aria-label="Breadcrumb Trail" className="max-md:max-h-0 max-md:overflow-hidden max-md:opacity-0 md:flex md:items-center gap-space-xs font-caption text-caption text-on-surface-variant">
        <span className="flex items-center gap-1 text-on-surface font-medium">
          <span className="material-symbols-outlined text-[14px]">check</span>
          <span>1. Pick car</span>
        </span>
        <span className="text-outline-variant">/</span>
        <span className="flex items-center gap-1 text-on-surface font-medium">
          <span className="material-symbols-outlined text-[14px]">check</span>
          <span>2. Version</span>
        </span>
        <span className="text-outline-variant">/</span>
        <span className="flex items-center gap-1 text-on-surface font-medium">
          <span className="material-symbols-outlined text-[14px]">check</span>
          <span>{step3Text}</span>
        </span>
        <span className="text-outline-variant">/</span>
        <span className="flex items-center gap-1 text-primary font-bold">
          <span className="material-symbols-outlined text-[14px]">check_circle</span>
          <span>{resultsTrailLabel || "4. Side"}</span>
        </span>
      </nav>
    );
  }
  return (
    <nav aria-label="Progress" className="max-lg:max-h-0 max-lg:overflow-hidden max-lg:opacity-0 lg:flex lg:items-center gap-space-sm font-caption text-caption">
      <button type="button" className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
        <span className="material-symbols-outlined text-[15px] text-primary">check_circle</span>
        <span className="font-medium">1. Pick car</span>
      </button>
      <span className="text-surface-variant">/</span>
      <button type="button" className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
        <span className="material-symbols-outlined text-[15px] text-primary">check_circle</span>
        <span className="font-medium">2. Version</span>
      </button>
      <span className="text-surface-variant">/</span>
      {step === 3 ? (
        <div className="flex items-center gap-1 text-on-surface font-semibold bg-surface-container px-2 py-0.5 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
          <span>3. Part</span>
        </div>
      ) : (
        <button type="button" className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer">
          <span className="material-symbols-outlined text-[15px] text-primary">check_circle</span>
          <span className="font-medium">{step3Text}</span>
        </button>
      )}
      <span className="text-surface-variant">/</span>
      {step === 4 ? (
        <div className="flex items-center gap-1 text-on-surface font-bold">
          <span className="w-2 h-2 rounded-full bg-primary inline-block"></span>
          <span>4. Side</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-outline opacity-60">
          <span>4. Side</span>
        </div>
      )}
    </nav>
  );
}

export function FindPartsStickyHeader(props: FindPartsStickyHeaderProps) {
  const {
    step,
    onBack,
    vehicleLabel,
    plate,
    versionTag,
    onEditVehicle,
    partTrailLabel,
    resultsTrailLabel,
    fitmentQueryRef,
    onNext,
    nextDisabled,
    onSaveSearch,
    onDownloadFitmentReport,
  } = props;

  if (step === 8) {
    return (
      <header className="sticky top-0 pt-4 z-20 bg-surface-container-lowest shadow-sm w-full">
        <div className="w-full py-space-sm flex items-center justify-between min-h-[58px] gap-space-md flex-wrap">
          <div className="flex items-center gap-space-md">
            <button
              type="button"
              className="inline-flex items-center gap-space-xs font-body-sm text-body-sm text-on-surface hover:text-primary transition-colors py-1.5 px-2 rounded hover:bg-surface-container-low"
              onClick={onBack}
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Back</span>
            </button>
            <div className="h-4 w-px bg-surface-container-high max-md:max-h-0 max-md:overflow-hidden max-md:opacity-0 md:block"></div>
            <div className="max-sm:max-h-0 max-sm:overflow-hidden max-sm:opacity-0 sm:flex sm:items-center sm:gap-space-xs">
              <span className="font-label-code text-caption text-on-surface-variant uppercase">Catalog</span>
              <span className="font-label-code text-caption text-outline">/</span>
              <span className="font-label-code text-caption text-on-surface">
                Fitment Query #{fitmentQueryRef || "New query"}
              </span>
            </div>
          </div>
          <StepTrail step={step} partTrailLabel={partTrailLabel} />
          <div className="flex items-center gap-space-sm flex-wrap">
            <div className="inline-flex items-center gap-space-xs bg-surface-container px-2.5 py-1.5 rounded-lg">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">directions_car</span>
              <span className="font-body-sm text-body-sm font-medium text-on-surface">{vehicleLabel}</span>
              <span className="font-label-plate text-caption bg-surface-container-lowest text-on-surface px-1.5 py-0.5 rounded shadow-sm">{plate}</span>
              {onEditVehicle ? (
                <button type="button" className="text-on-surface-variant hover:text-on-surface ml-0.5" title="Edit vehicle selection" onClick={onEditVehicle}>
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                </button>
              ) : null}
            </div>
            <span className="font-label-code text-caption uppercase bg-secondary-container text-on-secondary-container px-2 py-1 rounded max-md:max-h-0 max-md:overflow-hidden max-md:opacity-0 md:inline-block">
              {versionTag}
            </span>
          </div>
        </div>
      </header>
    );
  }

  if (step === 5) {
    return (
      <div className="sticky top-0 pt-4 z-20 w-full bg-surface-container-lowest shadow-sm">
        <div className="w-full py-space-sm flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-md">
            <button type="button" className="group inline-flex items-center gap-space-xs text-on-surface hover:text-primary transition-colors py-1 px-2 -ml-2 rounded-lg hover:bg-surface-container" onClick={onBack}>
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span className="font-body-sm text-body-sm font-semibold">Back</span>
            </button>
            <span className="text-outline-variant font-caption text-caption hidden sm:inline">/</span>
            <StepTrail step={step} partTrailLabel={partTrailLabel} resultsTrailLabel={resultsTrailLabel} />
          </div>
          <div className="flex items-center gap-space-md flex-wrap">
            <div className="flex items-center gap-space-xs bg-surface-container px-space-sm py-1 rounded-lg">
              <div className="flex items-center gap-1 text-on-surface">
                <span className="font-headline-sm text-body-sm font-bold">{vehicleLabel}</span>
                <span className="font-label-plate text-caption px-1.5 py-0.5 bg-surface-container-lowest rounded shadow-sm">{plate}</span>
                {onEditVehicle ? (
                  <button type="button" className="text-on-surface-variant hover:text-primary cursor-pointer ml-0.5" onClick={onEditVehicle}>
                    <span className="material-symbols-outlined text-[15px]">edit</span>
                  </button>
                ) : null}
              </div>
              <span className="font-label-code text-caption bg-surface-container-highest text-on-surface-variant px-1.5 py-0.5 rounded font-medium">{versionTag}</span>
            </div>
            <div className="flex items-center gap-space-xs">
              <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium transition-colors shadow-sm" onClick={onSaveSearch}>
                <span className="material-symbols-outlined text-[16px]">bookmark_border</span>
                <span>Save search</span>
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium transition-colors shadow-sm" onClick={onDownloadFitmentReport}>
                <span className="material-symbols-outlined text-[16px]">download</span>
                <span>Download fitment report</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 pt-4 z-20 w-full bg-surface-container-lowest shadow-sm">
      <div className="w-full h-16 flex items-center justify-between gap-space-md flex-wrap">
        <div className="flex items-center gap-space-sm flex-shrink-0">
          <button type="button" className="group flex items-center gap-space-xs px-3.5 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container-high transition-colors" onClick={onBack}>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-hover:text-on-surface">arrow_back</span>
            <span className="font-body-sm text-body-sm font-medium text-on-surface-variant group-hover:text-on-surface">Back</span>
          </button>
        </div>
        <div className="max-lg:max-h-0 max-lg:overflow-hidden max-lg:opacity-0 lg:flex lg:items-center lg:gap-space-lg lg:flex-1 lg:justify-center lg:max-w-3xl">
          <StepTrail step={step} partTrailLabel={partTrailLabel} />
          <div className="flex items-center gap-space-xs bg-surface-container-low px-2.5 py-1 rounded-lg">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">directions_car</span>
            <span className="font-body-sm text-body-sm font-semibold text-on-surface">{vehicleLabel}</span>
            <span className="text-on-surface-variant">·</span>
            <span className="font-label-plate text-caption tracking-wider bg-surface-container-highest px-1.5 py-0.5 rounded text-on-surface">{plate}</span>
            <span className="font-label-code text-caption text-on-surface-variant uppercase bg-surface-container px-1.5 py-0.5 rounded">{versionTag}</span>
            {onEditVehicle ? (
              <button type="button" className="text-on-surface-variant hover:text-on-surface ml-0.5" title="Change target vehicle" onClick={onEditVehicle}>
                <span className="material-symbols-outlined text-[14px]">edit</span>
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-space-sm flex-shrink-0">
          {onNext ? (
            <button
              type="button"
              disabled={nextDisabled}
              className="flex items-center gap-space-xs px-4 py-2 rounded-lg bg-primary text-on-primary font-body-sm text-body-sm font-semibold hover:bg-on-surface transition-transform active:scale-95 shadow-sm disabled:opacity-50"
              onClick={onNext}
            >
              <span>Next</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
