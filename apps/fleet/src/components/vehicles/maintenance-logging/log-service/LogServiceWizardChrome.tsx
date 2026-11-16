/**
 * Log service window frame — ported exactly from Stitch docs/stitch/powertrain-job-fit-fleet/html/04
 * (grey round icon + subtitle, navy car card with plate chip + mint powertrain pill, step bar in a lavender
 * rounded bar with four equal parts, Cancel / Back / Continue footer). Phone = screen 10.
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
      <div className={`hidden sm:grid grid-cols-4 items-center gap-1 rounded-lg p-2 ${LS.low}`}>
        {STEP_LABELS.map((label, index) => {
          const stepNum = (index + 1) as LogServiceWizardStep;
          const isActive = stepNum === activeStep;
          const isComplete = stepNum < activeStep;
          const canClick = isComplete && onStepClick;
          const inner = (
            <span className={`flex items-center gap-1 px-1 min-w-0 ${!isActive && !isComplete ? "opacity-50" : ""}`}>
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  isComplete
                    ? "bg-[#006c4a] text-white"
                    : isActive
                      ? `${LS.btnPrimary} ${LT.titleSm}`
                      : `bg-[#dad9e3] dark:bg-[#32333e] ${LS.muted} ${LT.labelMd}`
                }`}
              >
                {isComplete ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : stepNum}
              </span>
              <span
                className={`truncate ${isActive ? `${LT.titleSm} ${LS.text}` : isComplete ? `${LT.labelMd} ${LS.text}` : `${LT.labelMd} ${LS.muted}`}`}
              >
                {label}
              </span>
            </span>
          );
          return canClick ? (
            <button key={label} type="button" onClick={() => onStepClick(stepNum)} className="rounded-md text-left hover:opacity-80 min-w-0">
              {inner}
            </button>
          ) : (
            <span key={label} aria-current={isActive ? "step" : undefined} className="min-w-0">
              {inner}
            </span>
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
      className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${LT.labelMd} font-semibold ${
        unknown ? "bg-white/15 text-[#e3e1ec]" : "bg-[#82f5c1] text-[#00714e]"
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
      {/* 1. Header: grey round icon, title + subtitle, close. */}
      <div className="px-4 sm:px-8 pt-5 sm:pt-8 pb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${LS.high} ${LS.text}`}>
            <Wrench className="w-[22px] h-[22px]" />
          </span>
          <div className="flex flex-col">
            <h2 className={`${LT.headlineMd} leading-tight ${LS.text}`}>{LOG_SERVICE_COPY.dialogTitle}</h2>
            <span className={`${LT.bodySm} ${LS.muted}`} data-testid="log-service-step-caption">
              <span className="sm:hidden">{LOG_SERVICE_COPY.stepCaption(activeStep, STEP_LABELS[activeStep - 1])}</span>
              <span className="hidden sm:inline">Vehicle maintenance &amp; repair ledger entry</span>
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${LS.muted} ${LS.hoverMid}`}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-2 flex flex-col gap-6">
        {/* 2. Car card. */}
        <div className={`${LS.navy} p-4 rounded-xl flex flex-wrap items-center justify-between gap-2 shadow-sm`} data-testid="log-service-car">
          <div className="flex items-center gap-4 min-w-0">
            <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/10">
              <Car className="w-5 h-5" />
            </span>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className={`${LT.titleMd} font-medium truncate`}>{name}</span>
              {plate ? (
                <span className={`${LT.labelMd} tracking-wider rounded-full bg-[#e3e1ec]/25 text-[#dad9e3] px-2 py-0.5`}>{plate}</span>
              ) : null}
              {vehicle.powertrainLabel ? <PowertrainPill label={vehicle.powertrainLabel} /> : null}
            </div>
          </div>
          <div className={`${LT.bodySm} text-[#84819a] flex items-center gap-1 tabular-nums max-sm:w-full`}>
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
        <div className={`px-4 sm:px-8 pt-6 pb-5 sm:pb-8 mt-2 flex items-center justify-between gap-2 ${LS.lowest}`}>
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
      className={`h-10 px-6 max-sm:h-12 max-sm:flex-1 justify-center rounded-lg ${LT.titleSm} flex items-center gap-1 shadow-sm transition-all ${LS.btnPrimary} ${
        disabled || loading ? "opacity-40 cursor-not-allowed" : "hover:opacity-90 active:scale-[0.98]"
      }`}
    >
      {loading ? LOG_SERVICE_COPY.loggingLabel : label}
      <ArrowRight className="w-4 h-4" />
    </button>
  );
}
