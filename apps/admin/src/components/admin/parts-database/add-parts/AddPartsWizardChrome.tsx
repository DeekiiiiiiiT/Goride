import type { ReactNode } from "react";
import { MaterialIcon } from "../import/MaterialIcon";
import type { FitMode } from "./addPartsTypes";
import { trustLabelFromSource } from "./addPartsShared";

export function AddPartsDominionBreadcrumb({ stepLabel }: { stepLabel: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
      <div className="flex flex-wrap items-center gap-2 font-mono-sm text-on-surface-variant uppercase tracking-normal text-[11px]">
        <span className="font-semibold text-on-surface">DOMINION</span>
        <span>/</span>
        <span>MASTER DATA</span>
        <span>/</span>
        <span>VEHICLES</span>
        <span>/</span>
        <span>PARTS DATABASE</span>
        <span>/</span>
        <span className="text-primary font-semibold">{stepLabel}</span>
      </div>
    </div>
  );
}

export function AddPartsPartSummaryChip({
  brand,
  partNumber,
  partTypeName,
  sourceType,
}: {
  brand: string;
  partNumber: string;
  partTypeName?: string;
  sourceType: string;
}) {
  const trust = trustLabelFromSource(sourceType);
  const verified = trust.startsWith("Verified");
  return (
    <div className="inline-flex flex-wrap items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-xl shadow-sm">
      <MaterialIcon name="category" className="text-[16px] text-tertiary" />
      <span className="font-mono-md text-on-surface font-semibold text-sm">
        {[brand, partNumber].filter(Boolean).join(" ") || "New part"}
      </span>
      {partTypeName ? (
        <>
          <span className="text-outline-variant font-mono-sm">·</span>
          <span className="font-body-sm text-on-surface-variant">{partTypeName}</span>
        </>
      ) : null}
      <span className="text-outline-variant font-mono-sm">·</span>
      <span
        className={
          verified
            ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[#006e31] font-label-xs"
            : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label-xs"
        }
      >
        {verified ? (
          <MaterialIcon name="verified" className="text-[14px]" filled />
        ) : (
          <MaterialIcon name="help" className="text-[14px]" />
        )}
        {verified ? "Verified" : "Needs checking"}
      </span>
    </div>
  );
}

const STEPS = [
  { n: 1, short: "Step 1", title: "The part" },
  { n: 2, short: "Step 2", title: "How it fits" },
  { n: 3, short: "Step 3", title: "Replaces" },
  { n: 4, short: "Step 4", title: "Review" },
];

export function AddPartsStepTracker({ wizardStep }: { wizardStep: 1 | 2 | 3 | 4 }) {
  return (
    <div className="bg-surface-container-lowest p-space-md shadow-sm rounded-xl">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-space-md">
        {STEPS.map((s) => {
          const done = wizardStep > s.n;
          const active = wizardStep === s.n;
          return (
            <div
              key={s.n}
              className={
                active
                  ? "flex items-center gap-space-sm text-primary bg-secondary-container/30 p-1.5 rounded-lg"
                  : "flex items-center gap-space-sm text-on-surface"
              }
            >
              <div
                className={
                  done
                    ? "w-6 h-6 rounded-full bg-[#006e31] text-on-primary flex items-center justify-center font-mono-sm"
                    : active
                      ? "w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-mono-sm font-bold"
                      : "w-6 h-6 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center font-mono-sm"
                }
              >
                {done ? <MaterialIcon name="check" className="text-[14px] font-bold" /> : s.n}
              </div>
              <div className="flex flex-col min-w-0">
                <span className={active ? "font-label-xs text-primary font-bold uppercase" : "font-label-xs text-on-surface-variant uppercase"}>
                  {active ? "Current step" : s.short}
                </span>
                <span className={active ? "font-body-sm font-bold truncate text-primary" : "font-body-sm font-semibold truncate"}>
                  {s.title}
                  {s.n === 3 ? (
                    <span className="font-label-xs text-outline font-normal"> (optional)</span>
                  ) : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AddPartsFitModeSegmented({
  value,
  onChange,
}: {
  value: FitMode;
  onChange: (m: FitMode) => void;
}) {
  const modes: Array<{ id: FitMode; label: string; icon: string }> = [
    { id: "specific", label: "Specific cars", icon: "check_circle" },
    { id: "engine", label: "By engine", icon: "memory" },
    { id: "spec", label: "By size or spec", icon: "straighten" },
  ];
  return (
    <div className="inline-flex p-1 bg-surface-container rounded-xl shadow-inner gap-1" role="group" aria-label="How it fits">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          className={
            value === m.id
              ? "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-surface-container-lowest text-primary shadow-sm font-label-md font-semibold transition-all"
              : "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface font-label-md transition-all"
          }
          onClick={() => onChange(m.id)}
        >
          <MaterialIcon name={m.icon} className="text-[16px]" filled={value === m.id} />
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function AddPartsWizardFooter({
  step,
  onBack,
  onCancel,
  onNext,
  nextLabel = "Next",
  nextDisabled,
}: {
  step: 1 | 2 | 3 | 4;
  onBack?: () => void;
  onCancel: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-margin px-margin py-space-md bg-surface/95 backdrop-blur border-t border-outline-variant/40 mt-space-lg">
      <div className="max-w-[1520px] mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {onBack ? (
            <button type="button" className="h-10 px-4 rounded-lg border border-outline-variant/50 font-label-md hover:bg-surface-container-low" onClick={onBack}>
              Back
            </button>
          ) : null}
          <button type="button" className="h-10 px-4 rounded-lg text-on-surface-variant font-label-md hover:underline" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <span className="font-mono-sm text-on-surface-variant">Step {step} of 4 · Not saved yet</span>
        {onNext ? (
          <button
            type="button"
            className="h-10 px-6 rounded-lg bg-primary-container text-on-primary font-label-md font-semibold disabled:opacity-50 shadow-sm"
            disabled={nextDisabled}
            onClick={onNext}
          >
            {nextLabel}
          </button>
        ) : (
          <span className="w-[88px]" />
        )}
      </div>
    </div>
  );
}

export function AddPartsWizardShell({
  wizardStep,
  stepLabel,
  draftBrand,
  draftNumber,
  partTypeName,
  sourceType,
  children,
  footer,
}: {
  wizardStep: 1 | 2 | 3 | 4;
  stepLabel: string;
  draftBrand: string;
  draftNumber: string;
  partTypeName?: string;
  sourceType: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="w-full max-w-[1520px] mx-auto flex flex-col gap-space-lg pb-24">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md">
        <AddPartsDominionBreadcrumb stepLabel={stepLabel} />
        {draftBrand || draftNumber ? (
          <AddPartsPartSummaryChip
            brand={draftBrand}
            partNumber={draftNumber}
            partTypeName={partTypeName}
            sourceType={sourceType}
          />
        ) : null}
      </div>
      {wizardStep >= 1 && draftBrand ? <AddPartsStepTracker wizardStep={wizardStep} /> : null}
      {children}
      {footer}
    </div>
  );
}
