import React from "react";

type NightlyRun = {
  started_at?: string;
  finished_at?: string;
  vehicles_checked?: number;
  alerts_written?: number;
  success?: boolean;
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
      <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
        Nightly check didn&apos;t run last night — due items may be out of date.
      </p>
    );
  }
  if (!run?.success) {
    return (
      <p className="text-sm text-muted-foreground">
        Nightly check status unknown.
      </p>
    );
  }
  const alerts = Number(run.alerts_written ?? 0);
  return (
    <p className="text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2 flex-wrap">
      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
      Nightly check ran 02:00 today · {Number(run.vehicles_checked ?? 0)} cars checked
      {alerts > 0 ? (
        <span className="text-red-600 font-medium">· {alerts} alerts flagged</span>
      ) : null}
    </p>
  );
}
