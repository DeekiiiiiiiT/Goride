import React from "react";
import { Calendar, Info } from "lucide-react";
import { LOG_SERVICE_COPY } from "./logServiceCopy";
import { formatMaintenanceDisplayDate } from "../../../../utils/maintenanceDisplayFormat";

export type LogServiceDateMileageStepProps = {
  date: string;
  odometer: number;
  onDateChange: (date: string) => void;
  onOdometerChange: (odo: number) => void;
  lastTrustedReading?: number | null;
  lastTrustedMeta?: string | null;
  showOdometerError?: boolean;
};

export function LogServiceDateMileageStep({
  date,
  odometer,
  onDateChange,
  onOdometerChange,
  lastTrustedReading,
  lastTrustedMeta,
  showOdometerError,
}: LogServiceDateMileageStepProps) {
  const displayDate = date ? formatMaintenanceDisplayDate(date) : "";
  const odoEmpty = !odometer || odometer <= 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-lg font-semibold text-on-surface">{LOG_SERVICE_COPY.dateMileageHeading}</h3>
        <p className="text-sm text-secondary">{LOG_SERVICE_COPY.dateMileageSubtitle}</p>
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
            <Calendar className="absolute right-2.5 w-[18px] h-[18px] text-secondary pointer-events-none" />
          </div>
          {displayDate ? (
            <p className="text-xs text-secondary sr-only">{displayDate}</p>
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
            <span className="absolute left-3 text-secondary text-[11px] font-medium uppercase">km</span>
            <input
              id="svc-odo"
              type="number"
              min={1}
              value={odometer || ""}
              onChange={(e) => onOdometerChange(Number(e.target.value) || 0)}
              className={`w-full h-9 bg-surface-container-lowest text-on-surface font-mono text-sm pl-10 pr-3 rounded-lg shadow-sm text-right focus:outline-none focus:ring-1 focus:ring-primary ${
                showOdometerError || odoEmpty ? "ring-2 ring-error bg-error-container/20" : ""
              }`}
              placeholder="e.g. 195,192"
            />
          </div>
          {showOdometerError || odoEmpty ? (
            <div className="flex items-center gap-1 text-error">
              <span className="text-xs font-semibold">{LOG_SERVICE_COPY.odometerRequired}</span>
            </div>
          ) : lastTrustedReading != null && lastTrustedReading > 0 ? (
            <p className="text-xs text-secondary mt-0.5">
              Last trusted reading {lastTrustedReading.toLocaleString()} km
              {lastTrustedMeta ? ` · ${lastTrustedMeta}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-4 bg-surface-container rounded-lg flex items-start gap-4">
        <Info className="w-[18px] h-[18px] text-secondary shrink-0 mt-0.5" />
        <p className="text-sm text-on-surface-variant leading-relaxed">
          {LOG_SERVICE_COPY.mileageHelper}
        </p>
      </div>
    </div>
  );
}
