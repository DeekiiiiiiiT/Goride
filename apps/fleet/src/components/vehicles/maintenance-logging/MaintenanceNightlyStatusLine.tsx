import React from "react";
import { formatNightlyCheckRanLabel } from "../../utils/maintenanceDisplayFormat";

type NightlyRun = {
  started_at?: string;
  finished_at?: string;
  vehicles_checked?: number;
  alerts_written?: number;
  success?: boolean;
  id?: string;
};

export function MaintenanceNightlyStatusLine({
  run,
  missed,
}: {
  run: NightlyRun | null | undefined;
  missed?: boolean;
}) {
  if (missed) {
    return (
      <div className="flex items-center gap-2 mt-2 font-mono text-[11px] text-error flex-wrap">
        <span className="w-2 h-2 rounded-full bg-error shadow-sm" />
        <span className="font-medium text-on-surface">Nightly check didn&apos;t run last night</span>
        <span className="text-outline-variant">·</span>
        <span className="text-stitch-secondary">Due items may be out of date</span>
      </div>
    );
  }
  if (!run?.success) {
    return (
      <div className="flex items-center gap-2 mt-2 font-mono text-[11px] text-stitch-secondary">
        <span className="w-2 h-2 rounded-full bg-outline" />
        Nightly check status unknown.
      </div>
    );
  }
  const alerts = Number(run.alerts_written ?? 0);
  const cars = Number(run.vehicles_checked ?? 0);
  const ranLabel = formatNightlyCheckRanLabel(run.started_at ?? null);
  return (
    <div className="flex items-center gap-2 mt-2 font-mono text-[11px] text-stitch-secondary flex-wrap">
      <span className="w-2 h-2 rounded-full bg-emerald-600 shadow-sm animate-pulse" />
      <span className="font-medium text-on-surface">{ranLabel}</span>
      <span className="text-outline-variant">·</span>
      <span>{cars} cars checked</span>
      {alerts > 0 ? (
        <>
          <span className="text-outline-variant">·</span>
          <span className="text-error font-semibold">{alerts} alerts flagged</span>
        </>
      ) : null}
    </div>
  );
}
