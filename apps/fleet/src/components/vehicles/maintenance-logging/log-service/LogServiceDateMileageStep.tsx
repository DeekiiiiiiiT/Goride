import React from "react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";

/** Stitch step shell — full mileage UX lives in LogMaintenanceServiceDialog (`when` step). */
export function LogServiceDateMileageStep({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold text-on-surface">{LOG_SERVICE_COPY.dateMileageTitle}</h2>
      <p className="text-sm text-stitch-secondary">{LOG_SERVICE_COPY.dateMileageSubtitle}</p>
      <p className="text-xs text-stitch-secondary mt-2">{LOG_SERVICE_COPY.mileageHelper}</p>
      {children}
    </div>
  );
}
