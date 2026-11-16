/**
 * Log service window frame — ported exactly from Stitch docs/stitch/powertrain-job-fit-fleet/html/01
 * (header with peach icon tile + subtitle, navy car card with plate chip + powertrain pill, round-dot step
 * bar with mint done steps, lavender surfaces, Cancel / Back / Continue footer). Phone = screen 10.
 */
import React from "react";
import { ArrowRight, Car, Check, Fuel, Gauge, HelpCircle, Wrench, X, Zap } from "lucide-react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import { LS, LT, splitPlate } from "./logServiceStitch";

export type LogServiceWizardStep = 1 | 2 | 3 | 4;

export type LogServiceVehicleStrip = {
  vehicleLabel: string;
  odometerKm?: number | null;
  odometerDateLabel?: string | null;
  sourceLabel?: string | null;
  homeBase?: string | null;
  /** Powertrain job fit: "Petrol", "Hybrid", "Electric"… or "Engine type unknown". Absent = flag off. */
  powertrainLabel?: string | null;
};

const STEP_LABELS = LOG_SERVICE_COPY.stepBarLabels;

function StepBar({
  activeStep,
  onStepClick,
}: {
  activeStep: LogServiceWizardStep;
  onStepClick?: (step: LogServiceWizardStep) => void;
}) {
  return (
    <div className="py-1 px-1">
      {/* Phone (Stitch screen 10): four thin segments. */}
      <div className="grid grid-cols-4 gap-1.5 sm:hidden" data-testid="log-service-step-segments">
        {STEP_LABELS.map((label, index) => (
          <span
            key={label}
            className={`h-1 rounded-full ${index + 1 < activeStep ? "bg-[#006c4a]" : index + 1 === activeStep ? "bg-black dark:bg-white" : LS.highest}`}
          />
        ))}
      </div>
      <div className="hidden sm:flex items-center justify-between w-full">
        {STEP_LABELS.map((label, index) => {
          const stepNum = (index + 1) as LogServiceWizardStep;
          const isActive = stepNum === activeStep;
          const isComplete = stepNum < activeStep;
          const canClick = isComplete && onStepClick;
          const dot = (
            <span className={`flex items-center gap-2 ${!isActive && !isComplete ? "opacity-60" : ""}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${LT.labelSm} ${
                  isComplete ? LS.mintDone : isActive ? LS.btnPrimary : `${LS.highest} ${LS.muted}`
                }`}
              >
                {isComplete ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : stepNum}
              </span>
              <span className={`${LT.labelMd} whitespace-nowrap ${isActive ? `${LS.text} font-semibold` : LS.muted}`}>{label}</span>
            </span>
          );
          return (
            <React.Fragment key={label}>
              {index > 0 ? (
                <span className={`flex-1 mx-3 h-0.5 ${stepNum <= activeStep ? LS.mintLine : LS.high}`} aria-hidden />
              ) : null}
              {canClick ? (
                <button type="button" onClick={() => onStepClick(stepNum)} className="rounded-full hover:opacity-80">
                  {dot}
                </button>
              ) : (
                <span aria-current={isActive ? "step" : undefined}>{dot}</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** Stitch powertrain 01 / 04 / 05: green pill with a fuel or lightning icon; grey with "?" when unknown. */
function PowertrainPill({ label }: { label: string }) {
  const unknown = label === "Engine type unknown";
  const combustion = ["Petrol", "Diesel", "CNG (gas)"].includes(label);
  const Icon = unknown ? HelpCircle : combustion ? Fuel : Zap;
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
        unknown ? "bg-white/15 text-[#e3e1ec]" : LS.mintPill
      }`}
      data-testid="powertrain-pill"
    >
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </span>
  );
}

export function LogServiceWizardChrome({
  activeStep,
  vehicle,
  onClose,
  onStepClick,
  children,
  footer,
  mobileSummary,
}: {
  activeStep: LogServiceWizardStep;
  vehicle: LogServiceVehicleStrip;
  onClose: () => void;
  onStepClick?: (step: LogServiceWizardStep) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Phone only: the running total pinned above the footer. */
  mobileSummary?: React.ReactNode;
}) {
  const odo =
    vehicle.odometerKm != null && vehicle.odometerKm > 0 ? `${vehicle.odometerKm.toLocaleString()} km` : null;
  const { name, plate } = splitPlate(vehicle.vehicleLabel);

  return (
    <div className={`flex flex-col max-h-[90vh] overflow-hidden ${LS.lowest}`}>
      {/* 1. Header: peach icon tile, title + subtitle, round close button. */}
      <div className="px-4 sm:px-8 pt-5 sm:pt-6 pb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${LS.peachTile}`}>
            <Wrench className="w-5 h-5" />
          </span>
          <div className="flex flex-col">
            <h2 className={`${LT.headlineMd} ${LS.text}`}>{LOG_SERVICE_COPY.dialogTitle}</h2>
            <span className={`${LT.bodySm} ${LS.muted}`} data-testid="log-service-step-caption">
              <span className="sm:hidden">{LOG_SERVICE_COPY.stepCaption(activeStep, STEP_LABELS[activeStep - 1])}</span>
              <span className="hidden sm:inline">Record maintenance tasks and replacement parts.</span>
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${LS.low} ${LS.hoverMid} ${LS.muted}`}
        >
          <X className="w-[18px] h-[18px]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-6 flex flex-col gap-4">
        {/* 2. Car card. */}
        <div className={`${LS.navy} p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-sm`} data-testid="log-service-car">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${LS.navyTile}`}>
              <Car className="w-[18px] h-[18px]" />
            </span>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className={`${LT.titleSm} truncate`}>{name}</span>
              {plate ? (
                <span className={`${LT.labelSm} font-mono rounded-full bg-[#e3e1ec]/20 text-[#f1effa] px-2 py-0.5`}>{plate}</span>
              ) : null}
              {vehicle.powertrainLabel ? <PowertrainPill label={vehicle.powertrainLabel} /> : null}
            </div>
          </div>
          <div className={`${LT.bodySm} ${LS.onNavySoft} flex items-center gap-1.5 tabular-nums max-sm:w-full`}>
            {odo ? (
              <>
                <Gauge className="w-4 h-4 opacity-60" />
                <span>{odo}</span>
              </>
            ) : null}
            {vehicle.odometerDateLabel ? (
              <>
                {odo ? <span className="opacity-50">·</span> : null}
                <span>{vehicle.odometerDateLabel}</span>
              </>
            ) : null}
            {vehicle.sourceLabel ? (
              <span className="rounded bg-white/15 px-1.5 py-0.5 text-[11px] text-white">{vehicle.sourceLabel}</span>
            ) : null}
          </div>
        </div>

        {/* 3. Step bar. */}
        <StepBar activeStep={activeStep} onStepClick={onStepClick} />

        {children}
      </div>

      {mobileSummary ? (
        <div className={`sm:hidden px-4 pt-3 border-t border-[#c9c5cd]/40 ${LS.lowest}`} data-testid="log-service-mobile-summary">
          {mobileSummary}
        </div>
      ) : null}
      {footer ? (
        <div className={`px-4 sm:px-8 py-4 flex items-center justify-between gap-2 shadow-[0_-1px_3px_rgba(0,0,0,0.04)] ${LS.lowest}`}>
          {footer}
        </div>
      ) : null}
    </div>
  );
}

export function LogServiceWizardContinueButton({
  label,
  disabled,
  onClick,
  loading,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={`px-6 py-2 max-sm:py-3 max-sm:flex-1 justify-center rounded-lg ${LT.titleSm} flex items-center gap-1.5 shadow-sm transition-all ${LS.btnPrimary} ${
        disabled || loading ? "opacity-40 cursor-not-allowed" : "hover:opacity-90 active:scale-[0.98]"
      }`}
    >
      {loading ? LOG_SERVICE_COPY.loggingLabel : label}
      <ArrowRight className="w-4 h-4" />
    </button>
  );
}
