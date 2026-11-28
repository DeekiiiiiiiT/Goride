import React, { useEffect, useMemo, useState } from "react";
import { CircleHelp, Loader2, MoreHorizontal, X } from "lucide-react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Sheet, SheetContent } from "../../ui/sheet";
import {
  MmDueStatusChip,
  MmMetaChip,
  mmCanLogThis,
  mmCountingFromText,
  mmFormatDueLine,
  mmFormatCustomInterval,
  mmOverdueText,
  mmSourceText,
  type MmDueRow,
} from "./maintenanceMasterFleetUi";
import { MmCustomScheduleDialog } from "./MmCustomScheduleDialog";
import { MmHardUseDialog } from "./MmHardUseDialog";
import { hardUseLine, hardUseTitle } from "./hardUseModel";
import type { VehicleHardUse } from "../../../types/hardUse";
import { MmWhySchedulePopover } from "./MmWhySchedulePopover";
import { MmFillHistoryDialog } from "./MmFillHistoryDialog";
import { formatMaintenanceDisplayDate } from "../../../utils/maintenanceDisplayFormat";
import type { FoundWorkItem } from "../../../types/maintenance";
import { FoundByInspectionSection, type AddToInspectionRequest } from "./FoundByInspection";

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
  onLogFoundWork,
  onFoundChanged,
  onAddToInspection,
  onLogThis,
}: {
  /** Step 10: "Log this" on a due line opens Log service on that part. */
  onLogThis?: (vehicleId: string, categoryId: string) => void;
  /** Inspection findings: "Log it now" on a found job (opens Log service for that job). */
  onLogFoundWork?: (item: FoundWorkItem) => void;
  /** A found job was closed here (Not needed) — the fleet page refreshes its counts. */
  onFoundChanged?: () => void;
  /** LC-14: "Add a job" on an inspection opens Log service in add mode. */
  onAddToInspection?: (target: AddToInspectionRequest) => void;
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
  const [hardUse, setHardUse] = useState<VehicleHardUse | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const reload = () => {
    if (!vehicle?.vehicleId) return;
    setLoading(true);
    api
      .getVehicleHardUse(vehicle.vehicleId)
      .then(setHardUse)
      .catch(() => setHardUse(null));
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
  // Step 7: parts nobody has dated, shown and counted on their own, never as Overdue or OK.
  const historyUnknown = useMemo(() => items.filter((i) => i.due_status === "history_unknown"), [items]);
  const ok = useMemo(
    () => items.filter((i) => i.due_status === "ok" || i.due_status === "odometer_needed"),
    [items],
  );
  // Step 14 (MER-14): a part with no rule has no interval, so it is never shown as OK.
  const noRule = useMemo(() => items.filter((i) => i.due_status === "no_rule"), [items]);
  // Step 8: any car with no reading and a schedule asks for one (was hard-coded to one plate).
  const waitingOdometer = !(vehicle?.odometer != null && vehicle.odometer > 0) && items.length > 0;

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
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e6eeff] text-[#0b1c30]">
            <span className="material-symbols-outlined text-[20px]">build</span>
          </span>
          <div className="min-w-0 flex-1">
            <p className={`font-medium ${retired ? "text-slate-500 line-through" : "text-on-surface"}`}>
              {row.category_name || row.category_code}
              {row.position ? ` · ${row.position}` : ""}
            </p>
            {retired ? (
              // MER-18: the engine's own reason, not a generic line.
              <p className="text-xs text-slate-500 mt-1" data-testid="mm-retired-reason">
                {row.retired_reason || "No longer scheduled by Roam"}
              </p>
            ) : (
              <>
                <p className="mt-1 flex items-center gap-1 text-[13px] text-slate-700" data-testid="mm-due-source">
                  <span className="material-symbols-outlined text-[15px]">
                    {row.source_type === "maker_manual" || row.source_type === "part_maker" ? "menu_book" : "verified_user"}
                  </span>
                  {mmSourceText(row)}
                </p>
                {mmCountingFromText(row) ? (
                  <p className="mt-0.5 flex items-start gap-1 text-[12px] text-slate-600" data-testid="mm-due-counting-from">
                    <span className="material-symbols-outlined text-[14px] mt-px">history</span>
                    {mmCountingFromText(row)}
                  </p>
                ) : null}
                <p className="font-mono text-xs text-slate-600 mt-1">{mmFormatDueLine(row)}</p>
              </>
            )}
          </div>
          {!retired ? (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <MmDueStatusChip status={row.due_status} />
              {mmOverdueText(row) ? (
                <span className="text-[15px] font-semibold text-red-700" data-testid="mm-due-overdue">
                  {mmOverdueText(row)}
                </span>
              ) : null}
              {onLogThis && canEditMaintenance && mmCanLogThis(row) && row.category_id ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 min-w-[88px] bg-white"
                  onClick={() => onLogThis(vehicle!.vehicleId, String(row.category_id))}
                  data-testid="mm-log-this"
                >
                  Log this
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!retired ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
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

  if (!vehicle) return null;

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
              {/* Step 16d: Roam decides hard use each night from distance; the fleet can only change it for this car. */}
              <div className="mt-2 max-w-[420px] text-[12px] text-slate-600" data-testid="mm-hard-use-line">
                <p className="font-medium text-slate-900">
                  {hardUse ? hardUseTitle(hardUse) : severeDuty ? "Hard use: on" : "Hard use"}
                </p>
                {hardUseLine(hardUse) ? <p>{hardUseLine(hardUse)}</p> : null}
                {canEditMaintenance ? (
                  <button
                    type="button"
                    className="mt-1.5 inline-flex min-h-[44px] items-center rounded-full border border-slate-300 bg-white px-4 text-[13px] font-medium text-slate-800 hover:bg-slate-50"
                    onClick={() => setHardUseOpen(true)}
                    data-testid="mm-hard-use-change"
                  >
                    Change for this car
                  </button>
                ) : null}
              </div>
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

          <div
            className="flex-1 overflow-y-auto px-6 py-4 space-y-6 min-h-0"
            data-testid={loading ? undefined : "mm-due-drawer-loaded"}
          >
            {/* Inspection findings (Stitch screen 7): first, above the schedule's Overdue / Due soon.
                Loads on its own, so the schedule's spinner never hides it. */}
            <FoundByInspectionSection
              key={vehicle.vehicleId}
              vehicleId={vehicle.vehicleId}
              canEdit={canEditMaintenance}
              onLogItNow={onLogFoundWork}
              onChanged={onFoundChanged}
              onAddToInspection={onAddToInspection}
              phone={mobileCompact}
            />
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {historyUnknown.length ? (
                <div
                  className="flex items-start gap-3 rounded-2xl bg-[#eff4ff] p-4"
                  data-testid="mm-history-unknown-card"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#dde9ff] text-[#0b1c30]">
                    <CircleHelp className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-[#0b1c30]">
                      {historyUnknown.length} part{historyUnknown.length === 1 ? " has" : "s have"} no known history.
                    </p>
                    <p className="text-[14px] text-[#47464c]">
                      Tell us when they were last done, or check them at the next service.
                    </p>
                  </div>
                  {canEditMaintenance ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 shrink-0 bg-white"
                      onClick={() => setHistoryOpen(true)}
                      data-testid="mm-fill-history"
                    >
                      Fill in history
                    </Button>
                  ) : null}
                </div>
              ) : null}
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
              {historyUnknown.length ? (
                <section data-testid="mm-history-unknown-section">
                  <h3 className="text-sm font-semibold text-violet-900 mb-2">
                    History unknown · {historyUnknown.length}
                  </h3>
                  <ul className="space-y-3">{historyUnknown.map(renderLine)}</ul>
                </section>
              ) : null}
              {ok.length ? (
                <section>
                  <h3 className="text-sm font-semibold text-emerald-900 mb-2">OK</h3>
                  <ul className="space-y-3">{ok.map(renderLine)}</ul>
                </section>
              ) : null}
              {noRule.length ? (
                <section data-testid="mm-no-rule-section">
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">No schedule yet · {noRule.length}</h3>
                  <ul className="space-y-3">{noRule.map(renderLine)}</ul>
                </section>
              ) : null}
            </>
          )}
          </div>

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
        <MmFillHistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          vehicleId={vehicle.vehicleId}
          onSaved={reload}
        />
      ) : null}

      {vehicle ? (
        <MmHardUseDialog
          open={hardUseOpen}
          onOpenChange={setHardUseOpen}
          vehicleId={vehicle.vehicleId}
          plate={vehicle.licensePlate ?? ""}
          carName={vehicleLabel(vehicle)}
          current={hardUse}
          onSaved={(next) => {
            setHardUse(next);
            setSevereDuty(next.hardUse === true);
            reload();
          }}
        />
      ) : null}
    </>
  );
}
