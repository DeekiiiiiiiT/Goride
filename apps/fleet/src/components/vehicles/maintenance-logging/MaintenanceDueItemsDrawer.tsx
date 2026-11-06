import React, { useEffect, useMemo, useState } from "react";
import { Loader2, MoreHorizontal, X } from "lucide-react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Sheet, SheetContent } from "../../ui/sheet";
import {
  MmDueStatusChip,
  MmMetaChip,
  MmSourceChip,
  mmFormatDueLine,
  mmFormatCustomInterval,
  type MmDueRow,
} from "./maintenanceMasterFleetUi";
import { MmCustomScheduleDialog } from "./MmCustomScheduleDialog";
import { MmHardUseDialog } from "./MmHardUseDialog";
import { MmWhySchedulePopover } from "./MmWhySchedulePopover";
import { formatMaintenanceDisplayDate } from "../../../utils/maintenanceDisplayFormat";

function vehicleLabel(row: {
  make?: string;
  model?: string;
  year?: string;
  licensePlate?: string;
  vehicleId: string;
}): string {
  const name = [row.make, row.model, row.year ? `· ${row.year}` : ""].filter(Boolean).join(" ");
  return name || row.licensePlate || row.vehicleId;
}

export function MaintenanceDueItemsDrawer({
  open,
  onOpenChange,
  vehicle,
  onLogService,
  onRecordMaintenanceEvent,
  onLogOdometer,
  mobileCompact,
  canEditMaintenance = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: {
    vehicleId: string;
    licensePlate?: string;
    make?: string;
    model?: string;
    year?: string;
    fleetUnitId?: string;
    homeBase?: string;
    odometer?: number;
    odometerMeta?: { sourceLabel?: string; recordedAt?: string } | null;
    severeDuty?: boolean;
  } | null;
  onLogService?: (vehicleId: string) => void;
  onRecordMaintenanceEvent?: (vehicleId: string) => void;
  onLogOdometer?: (vehicleId: string) => void;
  mobileCompact?: boolean;
  canEditMaintenance?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MmDueRow[]>([]);
  const [severeDuty, setSevereDuty] = useState(false);
  const [customRow, setCustomRow] = useState<MmDueRow | null>(null);
  const [whyRow, setWhyRow] = useState<MmDueRow | null>(null);
  const [hardUseOpen, setHardUseOpen] = useState(false);

  const reload = () => {
    if (!vehicle?.vehicleId) return;
    setLoading(true);
    api
      .getMaintenanceDueItems(vehicle.vehicleId)
      .then((res) => {
        const rows = (res.items || []) as MmDueRow[];
        setItems(rows);
        setSevereDuty(rows.some((r) => r.severe_duty));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open && vehicle?.severeDuty != null) setSevereDuty(Boolean(vehicle.severeDuty));
  }, [open, vehicle?.vehicleId, vehicle?.severeDuty]);

  useEffect(() => {
    if (!open || !vehicle?.vehicleId) {
      setItems([]);
      return;
    }
    reload();
  }, [open, vehicle?.vehicleId, vehicle?.licensePlate, vehicle?.odometer, vehicle?.odometerMeta?.recordedAt]);

  const overdue = useMemo(() => items.filter((i) => i.due_status === "overdue"), [items]);
  const dueSoon = useMemo(() => items.filter((i) => i.due_status === "due_soon"), [items]);
  const ok = useMemo(
    () => items.filter((i) => i.due_status === "ok" || i.due_status === "odometer_needed"),
    [items],
  );
  const waitingOdometer =
    !(vehicle?.odometer != null && vehicle.odometer > 0) &&
    (items.some((i) => i.odometer_needed || i.due_status === "odometer_needed") ||
      vehicle?.licensePlate === "1505LM");

  if (!vehicle) return null;

  const logService = onLogService ?? onRecordMaintenanceEvent;

  function renderLine(row: MmDueRow, idx: number) {
    const key = `${row.category_code}-${row.position ?? ""}-${idx}`;
    const retired = row.schedule_status === "retired";
    return (
      <li
        key={key}
        className={`rounded-xl border p-3 space-y-2 ${
          retired ? "border-slate-200 bg-slate-50 opacity-80" : "border-black/10 bg-white"
        }`}
        data-testid="mm-due-line"
        data-retired={retired ? "true" : undefined}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`font-medium ${retired ? "text-slate-500 line-through" : "text-on-surface"}`}>
              {row.category_name || row.category_code}
              {row.position ? ` · ${row.position}` : ""}
            </p>
            {retired ? (
              <p className="text-xs text-slate-500 mt-1">No longer scheduled by Roam</p>
            ) : (
              <p className="font-mono text-xs text-slate-600 mt-1">{mmFormatDueLine(row)}</p>
            )}
          </div>
          {!retired ? <MmDueStatusChip status={row.due_status} /> : null}
        </div>
        {!retired ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <MmSourceChip source={row.source_type} />
              {row.custom_interval_km != null || row.custom_interval_months != null ? (
                <span className="text-[11px] text-slate-500">
                  Custom: every {mmFormatCustomInterval(row)}
                </span>
              ) : row.interval_sentence ? (
                <span className="text-[11px] text-slate-500">Every {row.interval_sentence}</span>
              ) : null}
              {row.needs_checking ? <MmMetaChip tone="amber">Needs checking</MmMetaChip> : null}
              {row.custom_interval_km != null ? <MmMetaChip tone="indigo">Custom</MmMetaChip> : null}
              {row.updated_by_roam_at ? (
                <MmMetaChip tone="indigo">Updated by Roam</MmMetaChip>
              ) : null}
              {row.odometer_needed || row.due_status === "odometer_needed" ? (
                <MmMetaChip tone="slate">Waiting for odometer</MmMetaChip>
              ) : null}
            </div>
            <div className="flex justify-end flex-wrap gap-1" data-testid="mm-due-line-actions">
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setWhyRow(row)}>
                <MoreHorizontal className="h-4 w-4" />
                Why this schedule?
              </Button>
              {canEditMaintenance ? (
                <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setCustomRow(row)}>
                  Set custom schedule
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </li>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          hideCloseButton
          className={`w-full p-0 flex flex-col overflow-hidden ${
            mobileCompact
              ? "left-0 right-0 w-full max-w-[100vw] sm:max-w-[100vw] inset-y-0 h-full border-l-0"
              : "sm:max-w-lg"
          }`}
          data-testid="mm-due-drawer"
        >
          <div className="px-6 py-4 border-b flex items-start justify-between shrink-0">
            <div>
              <p className="font-mono text-lg font-semibold">{vehicle.licensePlate ?? "—"}</p>
              <p className="text-sm text-slate-600">{vehicleLabel(vehicle)}</p>
              {vehicle.odometer != null ? (
                <p className="font-mono text-xs text-slate-500 mt-1">
                  {Number(vehicle.odometer).toLocaleString()} km
                  {vehicle.odometerMeta?.recordedAt
                    ? ` · read ${formatMaintenanceDisplayDate(vehicle.odometerMeta.recordedAt)}`
                    : ""}
                </p>
              ) : null}
              {canEditMaintenance ? (
                severeDuty ? (
                  <button
                    type="button"
                    className="mt-2 inline-flex rounded-full border border-slate-400 px-2 py-0.5 text-[11px]"
                    data-testid="mm-hard-use-chip"
                    onClick={() => setHardUseOpen(true)}
                  >
                    Hard use
                  </button>
                ) : (
                  <button
                    type="button"
                    className="mt-2 text-xs text-indigo-600 underline"
                    onClick={() => setHardUseOpen(true)}
                  >
                    Mark as hard use
                  </button>
                )
              ) : severeDuty ? (
                <span className="mt-2 inline-flex rounded-full border border-slate-400 px-2 py-0.5 text-[11px]">
                  Hard use
                </span>
              ) : null}
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {waitingOdometer ? (
            <div className="mx-6 mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700" data-testid="mm-odometer-banner">
              We need a first odometer reading to work out distance-based due dates. Date-based dates are shown below.
              {onLogOdometer ? (
                <Button type="button" size="sm" className="mt-2 w-full" onClick={() => onLogOdometer(vehicle.vehicleId)}>
                  Log odometer
                </Button>
              ) : null}
            </div>
          ) : null}

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <div
              className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0"
              data-testid={loading ? undefined : "mm-due-drawer-loaded"}
            >
              {overdue.length ? (
                <section>
                  <h3 className="text-sm font-semibold text-red-800 mb-2">Overdue</h3>
                  <ul className="space-y-3">{overdue.map(renderLine)}</ul>
                </section>
              ) : null}
              {dueSoon.length ? (
                <section>
                  <h3 className="text-sm font-semibold text-amber-900 mb-2">Due soon</h3>
                  <ul className="space-y-3">{dueSoon.map(renderLine)}</ul>
                </section>
              ) : null}
              {ok.length ? (
                <section>
                  <h3 className="text-sm font-semibold text-emerald-900 mb-2">OK</h3>
                  <ul className="space-y-3">{ok.map(renderLine)}</ul>
                </section>
              ) : null}
            </div>
          )}

          <div
            className={`shrink-0 p-4 border-t flex flex-col gap-2 bg-slate-50 ${
              mobileCompact ? "sticky bottom-0 z-10" : ""
            }`}
          >
            {onLogOdometer ? (
              <Button type="button" variant="outline" className="w-full" onClick={() => onLogOdometer(vehicle.vehicleId)}>
                Log odometer
              </Button>
            ) : null}
            {logService ? (
              <Button type="button" className="w-full" data-testid="mm-log-service" onClick={() => logService(vehicle.vehicleId)}>
                Log service
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {whyRow && vehicle ? (
        <MmWhySchedulePopover
          open={!!whyRow}
          onOpenChange={(v) => !v && setWhyRow(null)}
          vehicleId={vehicle.vehicleId}
          plate={vehicle.licensePlate ?? ""}
          row={whyRow}
          onSetCustom={() => {
            setCustomRow(whyRow);
            setWhyRow(null);
          }}
        />
      ) : null}

      {customRow && vehicle ? (
        <MmCustomScheduleDialog
          open={!!customRow}
          onOpenChange={(v) => !v && setCustomRow(null)}
          vehicleId={vehicle.vehicleId}
          plate={vehicle.licensePlate ?? ""}
          row={customRow}
          onSaved={reload}
        />
      ) : null}

      {vehicle ? (
        <MmHardUseDialog
          open={hardUseOpen}
          onOpenChange={setHardUseOpen}
          vehicleId={vehicle.vehicleId}
          plate={vehicle.licensePlate ?? ""}
          initial={severeDuty}
          onSaved={(v) => {
            setSevereDuty(v);
            reload();
          }}
        />
      ) : null}
    </>
  );
}
