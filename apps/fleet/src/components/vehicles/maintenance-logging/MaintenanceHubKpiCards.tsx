import React, { useMemo } from "react";
import { formatMaintenanceScheduledDate } from "../../../utils/maintenanceDisplayFormat";
import { FoundByInspectionKpiCard } from "./FoundByInspection";

export type MaintenanceHubKpiProps = {
  overdueCount: number;
  telemetryMissingCount: number;
  fleetTotal: number;
  nextScheduledWindow?: { date: string; site: string } | null;
  nextScheduledDateLine?: string | null;
  partsRequisition?: { status: string; detail: string } | null;
  costPerKmApprox?: number;
  pmOnTimePct?: number;
  /** Inspection findings counts; null/undefined = switch off (no card). */
  foundByInspection?: { total: number; cars: number; oldestDays: number | null } | null;
  /** Opens the car with the oldest waiting found job. */
  onOpenFound?: () => void;
  /** Step 7: parts nobody has dated, and on how many cars. Undefined = the server did not send it (no card). */
  historyUnknownParts?: number;
  historyUnknownCars?: number;
};

const GRID: Record<number, string> = {
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 xl:grid-cols-4",
  5: "md:grid-cols-3 xl:grid-cols-5",
};

function progressPct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function formatScheduledLabel(isoDate: string): string {
  return formatMaintenanceScheduledDate(isoDate);
}

function KpiProgressBar({ pct, barClass }: { pct: number; barClass: string }) {
  return (
    <div className="w-full bg-surface-container h-1.5 rounded-full mt-3 overflow-hidden">
      <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(pct, 8)}%` }} />
    </div>
  );
}

export function MaintenanceHubKpiCards({
  overdueCount,
  telemetryMissingCount,
  fleetTotal,
  nextScheduledWindow,
  nextScheduledDateLine,
  partsRequisition,
  costPerKmApprox,
  pmOnTimePct,
  foundByInspection,
  onOpenFound,
  historyUnknownParts,
  historyUnknownCars,
}: MaintenanceHubKpiProps) {
  const showHistory = historyUnknownParts != null;
  // Removed by the owner 16 Nov: cost / km, PM on-time % and parts requisition cards.
  void partsRequisition;
  void costPerKmApprox;
  void pmOnTimePct;
  const nextLabel = nextScheduledWindow?.date
    ? formatScheduledLabel(nextScheduledWindow.date)
    : "—";
  const nextSite = nextScheduledWindow?.site?.trim() || "No upcoming window";

  const overduePct = useMemo(() => progressPct(overdueCount, fleetTotal), [overdueCount, fleetTotal]);
  const telemetryPct = useMemo(
    () => progressPct(telemetryMissingCount, fleetTotal),
    [telemetryMissingCount, fleetTotal],
  );

  return (
    <div className="space-y-3 mb-6">
    <div
      className={`grid grid-cols-1 ${GRID[3 + (foundByInspection ? 1 : 0) + (showHistory ? 1 : 0)]} gap-3 mb-0 max-[390px]:grid-cols-1 max-[390px]:gap-2`}
    >
      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-stitch-secondary mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold">Overdue Service</span>
          <span className="material-symbols-outlined text-error text-[18px]">warning</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-2xl font-bold text-error">{overdueCount}</span>
          <span className="text-[11px] text-stitch-secondary">
            unit{overdueCount === 1 ? "" : "s"} (critical)
          </span>
        </div>
        <KpiProgressBar pct={overduePct} barClass="bg-error" />
      </div>

      {showHistory ? (
        <div
          className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between"
          data-testid="mm-kpi-history-unknown"
        >
          <div className="flex items-center justify-between text-stitch-secondary mb-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold">History unknown</span>
            <span className="material-symbols-outlined text-violet-700 text-[18px]">help</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-2xl font-bold text-violet-800">{historyUnknownParts}</span>
            <span className="text-[11px] text-stitch-secondary">
              part{historyUnknownParts === 1 ? "" : "s"}
              {historyUnknownCars ? ` on ${historyUnknownCars} car${historyUnknownCars === 1 ? "" : "s"}` : ""} · check
              at next service
            </span>
          </div>
          <KpiProgressBar pct={progressPct(historyUnknownCars ?? 0, fleetTotal)} barClass="bg-violet-500" />
        </div>
      ) : null}

      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-stitch-secondary mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold">No odometer reading</span>
          <span className="material-symbols-outlined text-on-surface-variant text-[18px]">speed</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-2xl font-bold text-on-surface">{telemetryMissingCount}</span>
          <span className="text-[11px] text-stitch-secondary">vehicles without a recent odometer</span>
        </div>
        <KpiProgressBar pct={telemetryPct} barClass="bg-on-surface-variant" />
      </div>

      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-stitch-secondary mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold">Next Scheduled Window</span>
          <span className="material-symbols-outlined text-stitch-secondary text-[18px]">event</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className="font-mono text-lg font-bold text-on-surface">{nextLabel}</span>
            <span className="text-[11px] text-stitch-secondary">{nextSite}</span>
          </div>
          {nextScheduledDateLine ? (
            <span className="text-[11px] text-stitch-secondary">{nextScheduledDateLine}</span>
          ) : null}
        </div>
        <KpiProgressBar pct={nextScheduledWindow ? 75 : 0} barClass="bg-stitch-secondary" />
      </div>

      {foundByInspection ? (
        <FoundByInspectionKpiCard
          total={foundByInspection.total}
          cars={foundByInspection.cars}
          oldestDays={foundByInspection.oldestDays}
          onOpen={onOpenFound}
        />
      ) : null}
    </div>
    </div>
  );
}
