import React, { useMemo, useState } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "../../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  formatMaintenanceDisplayDate,
  formatOdometerMetaSubline,
} from "../../../utils/maintenanceDisplayFormat";

export { MaintenanceHubKpiCards } from "./MaintenanceHubKpiCards";
export type { MaintenanceHubKpiProps } from "./MaintenanceHubKpiCards";

export type MaintenanceOverviewVehicleRow = {
  vehicleId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string;
  fleetUnitId?: string;
  homeBase?: string;
  vin?: string;
  odometer: number;
  odometerMeta?: {
    reading: number;
    recordedAt: string;
    source: string;
    sourceLabel: string;
  } | null;
  fleetStatus: string;
  nextDueSummary?: string | null;
  worstDueTaskName?: string | null;
  lastService?: { date: string; miles: number | null } | null;
  dueCounts?: { overdue: number; dueSoon: number };
  servicesAttention: Array<{ taskName: string; kind: "overdue" | "due_soon" }>;
  doNotDrive?: boolean;
  doNotDriveReason?: string | null;
};

function vehicleTitle(row: MaintenanceOverviewVehicleRow): string {
  const name = [row.make, row.model, row.year ? `(${row.year})` : ""].filter(Boolean).join(" ").trim();
  return name || row.licensePlate || row.vehicleId;
}

function statusBadge(status: string, attention?: string) {
  const s = status.toLowerCase();
  if (s.includes("odometer")) {
    return (
      <span className="inline-flex items-center gap-1 bg-surface-container-highest text-on-surface-variant font-caption text-[11px] font-semibold px-2 py-1 rounded-full">
        <span className="material-symbols-outlined text-[12px]">schedule</span>
        Odometer needed
      </span>
    );
  }
  if (s.includes("overdue")) {
    return (
      <span className="inline-flex items-center gap-1 bg-error text-on-error font-caption text-[11px] font-semibold px-2 py-1 rounded-full shadow-sm">
        <span className="material-symbols-outlined text-[12px]">error</span>
        Overdue{attention ? ` · ${attention}` : ""}
      </span>
    );
  }
  if (s.includes("due")) {
    return (
      <span className="inline-flex items-center gap-1 bg-secondary-container text-on-secondary-container font-caption text-[11px] font-semibold px-2 py-1 rounded-full">
        Due soon
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 bg-surface-container text-on-surface-variant font-caption text-[11px] font-semibold px-2 py-1 rounded-full">
      OK
    </span>
  );
}

export function MaintenanceOverviewPanel({
  items,
  orgName,
  onLogService,
  onLogOdometer,
  onOpenDueDrawer,
  onOdometerHistory,
  onGoToVehicles,
}: {
  items: MaintenanceOverviewVehicleRow[];
  orgName?: string;
  onLogService: (vehicleId: string) => void;
  onLogOdometer: (vehicleId: string) => void;
  onOpenDueDrawer: (vehicleId: string) => void;
  onOdometerHistory: (vehicleId: string) => void;
  onGoToVehicles?: () => void;
}) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((row) => {
      const blob = [row.licensePlate, row.make, row.model, row.fleetUnitId, row.homeBase]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [filter, items]);

  const syncLabel = orgName?.trim()
    ? `${orgName} Synchronized`
    : "Fleet register synchronized";

  return (
    <div className="flex flex-col w-full max-[390px]:text-sm">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col mb-6">
        <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-on-surface">Vehicle Service Ledger</span>
            <span className="bg-surface-container-high text-on-surface-variant font-mono text-[11px] px-2 py-0.5 rounded">
              Sorted by urgency
            </span>
          </div>
          <div className="relative">
            <input
              className="bg-surface-container-low pl-8 pr-3 py-1.5 rounded-lg text-sm text-on-surface placeholder:text-outline focus:outline-none w-full sm:w-56 shadow-sm"
              placeholder="Filter plate or model..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="material-symbols-outlined absolute left-2 top-2 text-outline text-[16px]">search</span>
          </div>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-surface-container-low text-stitch-secondary text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 font-semibold">Vehicle</th>
                <th className="py-3 px-3 font-semibold">Plate</th>
                <th className="py-3 px-3 font-semibold">Odometer</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold">Next due</th>
                <th className="py-3 px-3 font-semibold">Due items</th>
                <th className="py-3 px-3 font-semibold">Last service</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-on-surface-variant">
                    No vehicles match this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const primaryAttention =
                    row.worstDueTaskName ??
                    row.servicesAttention.find((a) => a.kind === "overdue")?.taskName ??
                    row.servicesAttention[0]?.taskName;
                  const odo = row.odometerMeta?.reading ?? row.odometer;
                  const needsOdo = row.fleetStatus.toLowerCase().includes("odometer");
                  return (
                    <tr
                      key={row.vehicleId}
                      className={`hover:bg-surface-container-low/60 border-t border-surface-container ${
                        needsOdo ? "bg-surface-container-low/20" : "bg-surface-container-lowest"
                      }`}
                    >
                      <td className="py-4 px-4 align-top">
                        <div className="flex flex-col">
                          <span className="font-bold text-on-surface">{vehicleTitle(row)}</span>
                          {row.fleetUnitId ? (
                            <span className="text-[11px] text-stitch-secondary mt-0.5">
                              Fleet ID: {row.fleetUnitId}
                              {row.homeBase ? ` · ${row.homeBase}` : ""}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 px-3 align-top">
                        <span className="inline-block bg-surface-container text-on-surface font-mono text-xs font-bold px-2 py-0.5 rounded tracking-widest shadow-sm">
                          {row.licensePlate ?? "—"}
                        </span>
                      </td>
                      <td className="py-4 px-3 align-top">
                        {odo > 0 ? (
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold">{odo.toLocaleString()} km</span>
                            {row.odometerMeta?.sourceLabel || row.odometerMeta?.recordedAt ? (
                              <span className="text-[11px] text-stitch-secondary mt-0.5">
                                {formatOdometerMetaSubline(
                                  row.odometerMeta?.recordedAt,
                                  row.odometerMeta?.sourceLabel,
                                )}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="font-mono text-sm font-bold text-stitch-secondary">—</span>
                            <span className="text-[11px] text-stitch-secondary mt-0.5">No reading yet</span>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-3 align-top">
                        <div className="flex flex-col gap-1">
                          {row.doNotDrive ? (
                            <span
                              className="inline-flex items-center gap-1 bg-error text-on-error font-caption text-[11px] font-semibold px-2 py-1 rounded-full w-fit"
                              title={row.doNotDriveReason ?? undefined}
                            >
                              <span className="material-symbols-outlined text-[12px]">block</span>
                              Do not drive
                            </span>
                          ) : null}
                          {statusBadge(row.fleetStatus, primaryAttention)}
                        </div>
                      </td>
                      <td className="py-4 px-3 align-top">
                        {needsOdo && !row.nextDueSummary ? (
                          <div className="flex flex-col">
                            <span className="text-sm text-stitch-secondary">
                              Log an odometer reading to see km-based items
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`font-mono text-sm font-bold ${
                              row.fleetStatus.toLowerCase().includes("overdue") ? "text-error" : "text-on-surface"
                            }`}
                          >
                            {row.nextDueSummary ?? "—"}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-3 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(row.dueCounts?.overdue ?? 0) > 0 ? (
                            <button
                              type="button"
                              className="bg-error-container text-on-error-container hover:bg-error hover:text-on-error px-2 py-0.5 rounded-full font-mono text-[11px] font-bold flex items-center gap-1"
                              onClick={() => onOpenDueDrawer(row.vehicleId)}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-error" />
                              {row.dueCounts?.overdue} overdue
                            </button>
                          ) : null}
                          {(row.dueCounts?.dueSoon ?? 0) > 0 ? (
                            <button
                              type="button"
                              className="bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full font-mono text-[11px]"
                              onClick={() => onOpenDueDrawer(row.vehicleId)}
                            >
                              {row.dueCounts?.dueSoon} due soon
                            </button>
                          ) : null}
                          {!row.dueCounts?.overdue && !row.dueCounts?.dueSoon ? (
                            <span className="font-mono text-[11px] text-stitch-secondary">—</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4 px-3 align-top">
                        {row.lastService?.date ? (
                          <div className="flex flex-col">
                            <span className="font-mono text-sm">{formatMaintenanceDisplayDate(row.lastService.date)}</span>
                            {row.lastService.miles != null ? (
                              <span className="text-[11px] text-stitch-secondary">
                                {row.lastService.miles.toLocaleString()} km
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-stitch-secondary">Never serviced</span>
                        )}
                      </td>
                      <td className="py-4 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1 flex-wrap max-[390px]:flex-col max-[390px]:items-stretch">
                          {needsOdo ? (
                            <button
                              type="button"
                              className="bg-primary hover:bg-primary-container text-on-primary font-semibold px-3 py-1 rounded shadow-sm text-sm flex items-center justify-center gap-1"
                              onClick={() => onLogOdometer(row.vehicleId)}
                            >
                              <span className="material-symbols-outlined text-[15px]">speed</span>
                              Log odometer
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="bg-surface-container hover:bg-surface-variant text-on-surface font-semibold px-3 py-1 rounded shadow-sm text-sm"
                            onClick={() => onLogService(row.vehicleId)}
                          >
                            Log service
                          </button>
                          {!needsOdo ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
                                  title="More actions"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onLogOdometer(row.vehicleId)}>
                                  Log odometer
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => onOdometerHistory(row.vehicleId)}>
                                  Odometer history
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-surface-container-lowest flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-surface-container">
          <div className="flex flex-wrap items-center gap-3 text-stitch-secondary text-[11px]">
            <span>
              Showing {filtered.length} of {items.length} fleet registered assets
            </span>
            <span className="text-outline-variant hidden sm:inline">|</span>
            <span className="flex items-center gap-1 text-on-surface font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
              {syncLabel}
            </span>
          </div>
          {onGoToVehicles ? (
            <Button
              type="button"
              variant="secondary"
              className="gap-1 shadow-sm bg-surface-container hover:bg-surface-variant"
              onClick={onGoToVehicles}
            >
              Go to Vehicles
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-container-low p-4 rounded-xl flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant shrink-0">
            <span className="material-symbols-outlined text-[18px]">verified_user</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">Automatic Diagnostic Polling</h3>
            <p className="text-[11px] text-stitch-secondary mt-0.5">
              The fleet diagnostic runner automatically scans odometer logs from driver shifts and fuel
              dispensary receipts daily at 02:00 EST. An alert is raised for every item past its limit.
            </p>
          </div>
        </div>
        <div className="bg-surface-container-low p-4 rounded-xl flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center text-on-surface-variant shrink-0">
            <span className="material-symbols-outlined text-[18px]">alt_route</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">Find parts</h3>
            <p className="text-[11px] text-stitch-secondary mt-0.5">
              Look up compatible parts for your fleet vehicles using the catalog — then open the Find parts tab to
              search by vehicle and component.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
