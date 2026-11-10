import React from "react";
import { AlertTriangle, Calendar, Info, Loader2 } from "lucide-react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import { formatMaintenanceDisplayDate } from "../../../../utils/maintenanceDisplayFormat";

export type OdometerCheckResult = {
  expected: number | null;
  before: { reading: number; recordedAt: string; sourceLabel: string } | null;
  after: { reading: number; recordedAt: string; sourceLabel: string } | null;
  isAnomaly: boolean;
  anomalyReason: string | null;
};

export type LogServiceDateMileageStepProps = {
  date: string;
  odometer: number;
  onDateChange: (date: string) => void;
  onOdometerChange: (odo: number) => void;
  lastTrustedReading?: number | null;
  lastTrustedMeta?: string | null;
  showOdometerError?: boolean;
  checkLoading?: boolean;
  checkResult?: OdometerCheckResult | null;
  anomalyAcknowledged?: boolean;
  onAcknowledgeAnomaly?: () => void;
};

type ReadingChoice = { key: string; label: string; reading: number; source: string };

/** Readings the user can tap to fill the odometer: before, best guess, after. */
export function buildReadingChoices(
  checkResult: OdometerCheckResult | null | undefined,
  serviceDate: string,
): ReadingChoice[] {
  if (!checkResult) return [];
  const choices: ReadingChoice[] = [];
  const { before, after, expected } = checkResult;
  if (before) {
    choices.push({
      key: "before",
      label: LOG_SERVICE_COPY.pickBeforeLabel(formatMaintenanceDisplayDate(before.recordedAt.slice(0, 10))),
      reading: before.reading,
      source: before.sourceLabel,
    });
  }
  const roundedExpected = expected != null ? Math.round(expected) : null;
  if (
    roundedExpected != null &&
    roundedExpected > 0 &&
    roundedExpected !== before?.reading &&
    roundedExpected !== after?.reading
  ) {
    choices.push({
      key: "expected",
      label: LOG_SERVICE_COPY.pickExpectedLabel(formatMaintenanceDisplayDate(serviceDate)),
      reading: roundedExpected,
      source: "estimate",
    });
  }
  if (after && after.reading !== before?.reading) {
    choices.push({
      key: "after",
      label: LOG_SERVICE_COPY.pickAfterLabel(formatMaintenanceDisplayDate(after.recordedAt.slice(0, 10))),
      reading: after.reading,
      source: after.sourceLabel,
    });
  }
  return choices;
}

export function LogServiceDateMileageStep({
  date,
  odometer,
  onDateChange,
  onOdometerChange,
  lastTrustedReading,
  lastTrustedMeta,
  showOdometerError,
  checkLoading,
  checkResult,
  anomalyAcknowledged,
  onAcknowledgeAnomaly,
}: LogServiceDateMileageStepProps) {
  const displayDate = date ? formatMaintenanceDisplayDate(date) : "";
  const odoEmpty = !odometer || odometer <= 0;
  const showAnomaly =
    checkResult?.isAnomaly === true && !anomalyAcknowledged && !odoEmpty && Boolean(date);
  const readingChoices = showAnomaly ? buildReadingChoices(checkResult, date) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-lg font-semibold text-on-surface">{LOG_SERVICE_COPY.dateMileageHeading}</h3>
        <p className="text-sm text-stitch-secondary">{LOG_SERVICE_COPY.dateMileageSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="svc-date" className="text-sm font-semibold text-on-surface">
            Date of service
          </label>
          <div className="relative flex items-center">
            <input
              id="svc-date"
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full h-9 bg-surface-container-lowest text-on-surface text-sm pl-3 pr-9 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Calendar className="absolute right-2.5 w-[18px] h-[18px] text-stitch-secondary pointer-events-none" />
          </div>
          {displayDate ? (
            <p className="text-xs text-stitch-secondary sr-only">{displayDate}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="svc-odo"
            className={`text-sm font-semibold flex items-center gap-1 ${
              showOdometerError || odoEmpty ? "text-error" : "text-on-surface"
            }`}
          >
            <span>Odometer (km)</span>
            <span className="text-error font-bold">*</span>
          </label>
          <div className="relative flex items-center">
            <span className="absolute left-3 text-stitch-secondary text-[11px] font-medium uppercase">km</span>
            <input
              id="svc-odo"
              type="number"
              min={1}
              value={odometer || ""}
              onChange={(e) => onOdometerChange(Number(e.target.value) || 0)}
              className={`w-full h-9 bg-surface-container-lowest text-on-surface font-mono text-sm pl-10 pr-3 rounded-lg shadow-sm text-right focus:outline-none focus:ring-1 focus:ring-primary ${
                showAnomaly
                  ? "ring-1 ring-tertiary-container font-bold"
                  : showOdometerError || odoEmpty
                    ? "ring-2 ring-error bg-error-container/20"
                    : ""
              }`}
              placeholder="e.g. 195,192"
            />
            {checkLoading ? (
              <Loader2 className="absolute right-2 w-4 h-4 animate-spin text-stitch-secondary" />
            ) : null}
          </div>
          {showOdometerError || odoEmpty ? (
            <div className="flex items-center gap-1 text-error">
              <span className="text-xs font-semibold">{LOG_SERVICE_COPY.odometerRequired}</span>
            </div>
          ) : checkResult?.expected != null && showAnomaly ? (
            <p className="text-xs text-stitch-secondary mt-0.5">
              {LOG_SERVICE_COPY.expectedReadingPrefix}
              {checkResult.expected.toLocaleString()} km for this time period
            </p>
          ) : lastTrustedReading != null && lastTrustedReading > 0 ? (
            <p className="text-xs text-stitch-secondary mt-0.5">
              Last trusted reading {lastTrustedReading.toLocaleString()} km
              {lastTrustedMeta ? ` · ${lastTrustedMeta}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {showAnomaly ? (
        <div className="p-4 bg-tertiary-fixed rounded-xl flex flex-col gap-3 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-tertiary-container flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-on-tertiary" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-base font-bold text-on-tertiary-fixed">
                {LOG_SERVICE_COPY.checkReadingTitle}
              </span>
              <p className="text-sm text-on-tertiary-fixed-variant leading-relaxed">
                {LOG_SERVICE_COPY.checkReadingBody(odometer, formatMaintenanceDisplayDate(date))}
              </p>
            </div>
          </div>

          {readingChoices.length > 0 ? (
            <div className="flex flex-col gap-2 pl-11">
              <span className="text-xs font-semibold uppercase tracking-wide text-on-tertiary-fixed">
                {LOG_SERVICE_COPY.pickReadingHeading}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {readingChoices.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    data-testid={`odo-pick-${c.key}`}
                    onClick={() => onOdometerChange(c.reading)}
                    className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg bg-surface-container-lowest text-left shadow-sm ring-1 ring-outline-variant hover:ring-2 hover:ring-primary focus:outline-none focus:ring-2 focus:ring-primary transition"
                  >
                    <span className="text-xs text-stitch-secondary">{c.label}</span>
                    <span className="font-mono text-base font-bold text-on-surface">
                      {c.key === "expected" ? "~" : ""}
                      {c.reading.toLocaleString()} km
                    </span>
                    <span className="text-[11px] text-stitch-secondary">{c.source}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 pt-1 pl-11">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                className="px-4 py-1.5 rounded-lg bg-surface-container-lowest text-on-surface text-sm font-semibold shadow-sm ring-1 ring-outline-variant hover:bg-surface-container transition-colors"
                onClick={() => {
                  const el = document.getElementById("svc-odo") as HTMLInputElement | null;
                  el?.focus();
                  el?.select();
                }}
              >
                {LOG_SERVICE_COPY.fixReadingLabel}
              </button>
              <button
                type="button"
                className="px-4 py-1.5 rounded-lg bg-tertiary-container text-on-tertiary text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity"
                onClick={() => onAcknowledgeAnomaly?.()}
              >
                {LOG_SERVICE_COPY.keepReadingLabel(odometer)}
              </button>
            </div>
            <span className="text-xs text-on-tertiary-fixed-variant">{LOG_SERVICE_COPY.keepReadingHint}</span>
          </div>
        </div>
      ) : null}

      <div className="p-4 bg-surface-container rounded-lg flex items-start gap-4">
        <Info className="w-[18px] h-[18px] text-stitch-secondary shrink-0 mt-0.5" />
        <p className="text-sm text-on-surface-variant leading-relaxed">
          {LOG_SERVICE_COPY.mileageHelper}
        </p>
      </div>
    </div>
  );
}
