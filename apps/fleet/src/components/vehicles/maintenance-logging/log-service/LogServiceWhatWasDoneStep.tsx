import React from "react";
import { ClipboardCheck, Loader2, Package } from "lucide-react";
import { MaintenanceIcon } from "../../MaintenanceIcon";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import type { MaintenanceServiceCategory } from "../../../../types/maintenance";

export type LogServicePackageChoice = {
  id: string;
  shortLabel: string;
  iconKey: string;
  dueKind?: string;
};

export type LogServiceWhatWasDoneStepProps = {
  packages: LogServicePackageChoice[];
  quickJobs: MaintenanceServiceCategory[];
  quickJobsLoading: boolean;
  onPickPackage: (pkg: LogServicePackageChoice) => void;
  onPickSystem: (sys: MaintenanceServiceCategory) => void;
  onOpenInspection: () => void;
  vinLabel?: string | null;
};

export function LogServiceWhatWasDoneStep({
  packages,
  quickJobs,
  quickJobsLoading,
  onPickPackage,
  onPickSystem,
  onOpenInspection,
  vinLabel,
}: LogServiceWhatWasDoneStepProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-end gap-4">
          <div>
            <span className="text-[11px] text-secondary uppercase tracking-wider font-semibold">
              {LOG_SERVICE_COPY.wizardEyebrow}
            </span>
            <h2 className="text-2xl font-semibold text-on-surface mt-0.5">
              {LOG_SERVICE_COPY.whatWasDoneHeading}
            </h2>
          </div>
          {vinLabel ? (
            <span className="text-xs text-on-surface-variant bg-surface-container px-2 py-0.5 rounded shrink-0">
              VIN: {vinLabel}
            </span>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-[18px] h-[18px] text-primary" />
            <h3 className="text-lg font-semibold text-on-surface">{LOG_SERVICE_COPY.servicePackages}</h3>
          </div>
          <span className="text-xs text-secondary">{LOG_SERVICE_COPY.sortedByPriority}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onPickPackage(pkg)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low hover:border-primary/30 transition-colors text-center min-h-[108px]"
            >
              <div className="bg-surface-container p-3 rounded-xl text-on-surface">
                <MaintenanceIcon iconKey={pkg.iconKey} className="w-6 h-6" />
              </div>
              <span className="text-sm font-medium text-on-surface leading-tight">{pkg.shortLabel}</span>
              {pkg.dueKind ? (
                <span className="text-[10px] text-secondary uppercase tracking-wide">
                  {pkg.dueKind.replace(/_/g, " ")}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold text-on-surface">{LOG_SERVICE_COPY.quickJobs}</h3>
        <p className="text-xs text-secondary">{LOG_SERVICE_COPY.quickJobsHint}</p>
        {quickJobsLoading ? (
          <div className="flex items-center gap-2 text-sm text-secondary py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading systems…
          </div>
        ) : quickJobs.length === 0 ? (
          <p className="text-sm text-secondary py-2">No systems available.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickJobs.map((sys) => (
              <button
                key={sys.id}
                type="button"
                onClick={() => onPickSystem(sys)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-outline-variant/40 bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-center min-h-[108px]"
              >
                <div className="bg-surface-container p-3 rounded-xl text-on-surface">
                  <MaintenanceIcon iconKey={sys.icon_key} className="w-6 h-6" />
                </div>
                <span className="text-sm font-medium text-on-surface leading-tight">{sys.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <button
          type="button"
          onClick={onOpenInspection}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-dashed border-outline-variant bg-surface-container-low hover:bg-surface-container transition-colors text-left min-h-11"
        >
          <div className="bg-surface-container-lowest p-3 rounded-xl shadow-sm text-on-surface">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-on-surface">{LOG_SERVICE_COPY.digitalInspection}</p>
            <p className="text-xs text-secondary">{LOG_SERVICE_COPY.digitalInspectionHint}</p>
          </div>
        </button>
      </section>
    </div>
  );
}
