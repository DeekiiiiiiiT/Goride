import React from "react";
import { ArrowRight, Car, Check, Wrench, X } from "lucide-react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";

export type LogServiceWizardStep = 1 | 2 | 3 | 4;

export type LogServiceVehicleStrip = {
  vehicleLabel: string;
  odometerKm?: number | null;
  odometerDateLabel?: string | null;
  sourceLabel?: string | null;
  homeBase?: string | null;
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
    <div className="bg-surface-container-lowest px-4 pb-3 sm:px-6 sm:py-4 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
      {/* Phone (Stitch screen 9): four thin segments; done + current in Stitch orange. */}
      <div className="grid grid-cols-4 gap-1.5 sm:hidden" data-testid="log-service-step-segments">
        {STEP_LABELS.map((label, index) => (
          <span
            key={label}
            className={`h-1 rounded-full ${index + 1 <= activeStep ? "bg-[#fd651e]" : "bg-surface-container-highest"}`}
          />
        ))}
      </div>
      <div className="hidden sm:grid grid-cols-4 gap-2 items-center">
        {STEP_LABELS.map((label, index) => {
          const stepNum = (index + 1) as LogServiceWizardStep;
          const isActive = stepNum === activeStep;
          const isComplete = stepNum < activeStep;
          const canClick = isComplete && onStepClick;
          const rowContent = (
            <>
              <div className="flex items-center gap-1.5 min-w-0">
                {isComplete ? (
                  <span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" strokeWidth={3} />
                  </span>
                ) : isActive ? (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-outline-variant shrink-0" />
                )}
                <span
                  className={`text-sm truncate ${
                    isActive
                      ? "font-bold text-on-surface"
                      : isComplete
                        ? "text-on-surface"
                        : "text-stitch-secondary"
                  }`}
                >
                  {stepNum} {label}
                </span>
              </div>
              <div
                className={`h-1 w-full rounded-full ${
                  isActive || isComplete ? "bg-primary" : "bg-surface-container-highest"
                }`}
              />
            </>
          );
          return (
            <div key={label} className="flex flex-col gap-1 min-w-0">
              {canClick ? (
                <button
                  type="button"
                  aria-current={undefined}
                  onClick={() => onStepClick(stepNum)}
                  className="flex flex-col gap-1 min-w-0 text-left rounded-lg border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 hover:bg-surface-container hover:border-outline-variant transition-colors cursor-pointer"
                >
                  {rowContent}
                </button>
              ) : (
                <div
                  className="flex flex-col gap-1 min-w-0"
                  aria-current={isActive ? "step" : undefined}
                >
                  {rowContent}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
  /** Phone only: the running total pinned above the footer (Stitch screen 9). */
  mobileSummary?: React.ReactNode;
}) {
  const odo =
    vehicle.odometerKm != null && vehicle.odometerKm > 0
      ? `${vehicle.odometerKm.toLocaleString()} km`
      : null;

  return (
    <div className="flex flex-col max-h-[90vh] overflow-hidden bg-surface-container-lowest">
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="sm:hidden w-9 h-9 rounded-lg bg-black text-white flex items-center justify-center">
            <Wrench className="w-[18px] h-[18px]" />
          </span>
          <Wrench className="hidden sm:block w-5 h-5 text-on-surface" />
          <div className="flex flex-col">
            <h2 className="text-lg sm:text-xl font-semibold text-on-surface tracking-tight leading-tight">
              {LOG_SERVICE_COPY.dialogTitle}
            </h2>
            <span className="sm:hidden text-xs font-medium text-on-surface-variant" data-testid="log-service-step-caption">
              {LOG_SERVICE_COPY.stepCaption(activeStep, STEP_LABELS[activeStep - 1])}
            </span>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-stitch-secondary hover:bg-surface-container hover:text-on-surface transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-primary text-on-primary px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Car className="w-[18px] h-[18px] shrink-0 opacity-90" />
          <span className="text-sm font-bold truncate">{vehicle.vehicleLabel}</span>
        </div>
        <div className="shrink-0 flex items-center gap-1 text-xs font-medium opacity-90">
          {odo ? (
            <>
              <span className="opacity-70">Current</span>
              <span className="font-semibold">{odo}</span>
            </>
          ) : null}
          {vehicle.odometerDateLabel ? (
            <>
              <span className="opacity-40">·</span>
              <span>{vehicle.odometerDateLabel}</span>
            </>
          ) : null}
          {vehicle.sourceLabel ? (
            <>
              <span className="opacity-40">·</span>
              <span className="bg-white/15 px-1 py-0.5 rounded text-on-primary">
                {vehicle.sourceLabel}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <StepBar activeStep={activeStep} onStepClick={onStepClick} />

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">{children}</div>

      {mobileSummary ? (
        <div
          className="sm:hidden bg-surface-container-lowest px-4 pt-3 border-t border-outline-variant/30"
          data-testid="log-service-mobile-summary"
        >
          {mobileSummary}
        </div>
      ) : null}
      {footer ? (
        <div
          className={`bg-surface-container-low px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 ${
            mobileSummary ? "max-sm:bg-surface-container-lowest" : "border-t border-outline-variant/30"
          } sm:border-t sm:border-outline-variant/30`}
        >
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
      className={`px-6 py-2 max-sm:py-3 max-sm:flex-1 justify-center rounded-lg font-medium text-sm flex items-center gap-1.5 transition-all ${
        disabled || loading
          ? "bg-surface-container-highest text-stitch-secondary cursor-not-allowed"
          : "bg-primary text-on-primary hover:opacity-90 active:scale-[0.98] shadow-sm"
      }`}
    >
      {loading ? LOG_SERVICE_COPY.loggingLabel : label}
      {!loading && !disabled ? <ArrowRight className="w-[18px] h-[18px]" /> : null}
    </button>
  );
}
