import React, { useMemo } from "react";

export type MaintenanceHubKpiProps = {
  overdueCount: number;
  telemetryMissingCount: number;
  fleetTotal: number;
  nextScheduledWindow?: { date: string; site: string } | null;
  partsRequisition?: { status: string; detail: string } | null;
};

function progressPct(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((value / total) * 100));
}

function formatScheduledLabel(isoDate: string): string {
  const d = isoDate.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (d === today) return "Today";
  const dt = new Date(`${d}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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
  partsRequisition,
}: MaintenanceHubKpiProps) {
  const partsReady = partsRequisition?.status === "Ready";
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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6 max-[390px]:grid-cols-1 max-[390px]:gap-2">
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

      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-stitch-secondary mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold">Telemetry Missing</span>
          <span className="material-symbols-outlined text-on-surface-variant text-[18px]">speed</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-2xl font-bold text-on-surface">{telemetryMissingCount}</span>
          <span className="text-[11px] text-stitch-secondary">pending manual input</span>
        </div>
        <KpiProgressBar pct={telemetryPct} barClass="bg-on-surface-variant" />
      </div>

      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-stitch-secondary mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold">Next Scheduled Window</span>
          <span className="material-symbols-outlined text-stitch-secondary text-[18px]">event</span>
        </div>
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="font-mono text-lg font-bold text-on-surface">{nextLabel}</span>
          <span className="text-[11px] text-stitch-secondary">{nextSite}</span>
        </div>
        <KpiProgressBar pct={nextScheduledWindow ? 75 : 0} barClass="bg-stitch-secondary" />
      </div>

      <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between text-stitch-secondary mb-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold">Parts Requisition</span>
          <span className="material-symbols-outlined text-stitch-secondary text-[18px]">inventory_2</span>
        </div>
        <div className="flex items-baseline gap-1 flex-wrap">
          <span className="font-mono text-lg font-bold text-on-surface">
            {partsRequisition?.status ?? "—"}
          </span>
          <span className="text-[11px] text-stitch-secondary line-clamp-1">
            {partsRequisition?.detail ?? "—"}
          </span>
        </div>
        <KpiProgressBar pct={partsReady ? 100 : 40} barClass="bg-primary" />
      </div>
    </div>
  );
}
