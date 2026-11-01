import React, { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Sheet, SheetContent } from "../../ui/sheet";

type DueRow = {
  category_name?: string;
  category_code?: string;
  position?: string | null;
  due_status?: string;
  km_overdue?: number | null;
  days_overdue?: number | null;
  overdue_effect?: string | null;
  projected_due_date?: string | null;
  next_due_miles?: number | null;
  current_odometer?: number | null;
  avg_km_per_day?: number | null;
  values_json?: Record<string, unknown> | null;
};

function vehicleLabel(row: {
  make?: string;
  model?: string;
  year?: string;
  licensePlate?: string;
  vehicleId: string;
}): string {
  const name = [row.make, row.model, row.year ? `(${row.year})` : ""].filter(Boolean).join(" ");
  const plate = row.licensePlate?.trim();
  if (name && plate) return `${name} · ${plate}`;
  return plate || name || row.vehicleId;
}

function formatDueSoonLine(row: DueRow): string {
  const cur = row.current_odometer ?? null;
  const next = row.next_due_miles ?? null;
  if (cur != null && next != null && next > cur) {
    const kmLeft = next - cur;
    let datePart = "";
    if (row.projected_due_date) {
      const d = new Date(`${String(row.projected_due_date).slice(0, 10)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) {
        datePart = ` · about ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
      }
    }
    return `Due in ${kmLeft.toLocaleString()} km${datePart}`;
  }
  return row.projected_due_date ? `Due ${String(row.projected_due_date).slice(0, 10)}` : "Due soon";
}

function operatingDaysLabel(row: DueRow): string | null {
  const cur = row.current_odometer ?? null;
  const next = row.next_due_miles ?? null;
  const avg = row.avg_km_per_day ?? null;
  if (cur == null || next == null || avg == null || avg <= 0 || next <= cur) return null;
  const days = Math.ceil((next - cur) / avg);
  return `Next ${days} operating days`;
}

function lastMeasured(values: Record<string, unknown> | null | undefined): string | null {
  if (!values || typeof values !== "object") return null;
  for (const [k, v] of Object.entries(values)) {
    if (v == null || v === "") continue;
    return `${k.replace(/_/g, " ")}: ${String(v)}`;
  }
  return null;
}

export function MaintenanceDueItemsDrawer({
  open,
  onOpenChange,
  vehicle,
  onLogService,
  onRecordMaintenanceEvent,
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
  } | null;
  onLogService?: (vehicleId: string) => void;
  onRecordMaintenanceEvent?: (vehicleId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DueRow[]>([]);
  const [okExpanded, setOkExpanded] = useState(false);

  useEffect(() => {
    if (!open || !vehicle?.vehicleId) {
      setItems([]);
      return;
    }
    setLoading(true);
    api
      .getMaintenanceDueItems(vehicle.vehicleId)
      .then((res) => setItems((res.items || []) as DueRow[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, vehicle?.vehicleId]);

  const overdue = useMemo(() => items.filter((i) => i.due_status === "overdue"), [items]);
  const dueSoon = useMemo(() => items.filter((i) => i.due_status === "due_soon"), [items]);
  const ok = useMemo(() => items.filter((i) => i.due_status === "ok"), [items]);

  if (!vehicle) return null;

  const recordHandler = onRecordMaintenanceEvent ?? onLogService;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-container flex items-start justify-between shrink-0">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-error text-[24px]">assignment_late</span>
            <div>
              <h2 className="text-base font-semibold text-on-surface">Due Items Ledger</h2>
              <p className="text-[11px] text-stitch-secondary font-mono">
                {vehicle.licensePlate ?? "—"} · {vehicleLabel(vehicle)}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-stitch-secondary" />
          </div>
        ) : (
          <>
            <div className="px-6 py-4 grid grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-wide shrink-0">
              <div className="rounded-lg border border-error/20 bg-error-container/30 p-2">
                <div className="font-bold text-error text-lg">{overdue.length}</div>
                CRITICAL
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-2">
                <div className="font-bold text-amber-700 dark:text-amber-400 text-lg">{dueSoon.length}</div>
                IMPENDING
              </div>
              <div className="rounded-lg border p-2 bg-surface-container-low">
                <div className="font-bold text-on-surface text-lg">{ok.length}</div>
                COMPLIANT
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-6">
              {overdue.length > 0 ? (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-error">Overdue · Immediate maintenance required</h3>
                    {overdue.length > 1 ? (
                      <span className="text-[10px] font-bold uppercase bg-error text-on-error px-2 py-0.5 rounded-full">
                        CRITICAL
                      </span>
                    ) : null}
                  </div>
                  <ul className="space-y-3">
                    {overdue.map((row, idx) => (
                      <li key={`o-${idx}`} className="bg-surface-container-low rounded-lg p-3 flex flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-on-surface">
                            {row.category_name || row.category_code}
                            {row.position ? ` · ${row.position}` : ""}
                          </span>
                          <span className="text-[10px] font-bold uppercase bg-error text-on-error px-2 py-0.5 rounded-full shrink-0">
                            OVERDUE
                          </span>
                        </div>
                        {row.km_overdue != null ? (
                          <p className="text-xs text-stitch-secondary">
                            Overdue {Number(row.km_overdue).toLocaleString()} km
                            {row.days_overdue != null ? ` · ${row.days_overdue} days` : ""}
                          </p>
                        ) : null}
                        {row.overdue_effect ? (
                          <span className="font-mono text-[11px] text-error">{row.overdue_effect}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {dueSoon.length > 0 ? (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Due soon</h3>
                      <span className="font-mono text-[11px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                        {dueSoon.length}
                      </span>
                    </div>
                    <span className="text-[11px] text-stitch-secondary">Schedule for next hub window</span>
                  </div>
                  <ul className="space-y-3">
                    {dueSoon.map((row, idx) => {
                      const measured = lastMeasured(row.values_json);
                      const opDays = operatingDaysLabel(row);
                      return (
                        <li
                          key={`s-${idx}`}
                          className="bg-surface-container-low rounded-xl p-3 flex flex-col gap-2 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="font-medium text-on-surface">
                                {row.category_name || row.category_code}
                              </span>
                              {measured ? (
                                <p className="text-sm text-stitch-secondary mt-1">
                                  Last measured: <strong className="text-on-surface">{measured}</strong>
                                </p>
                              ) : null}
                            </div>
                            {onLogService ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="shrink-0 h-8 text-xs"
                                onClick={() => onLogService(vehicle.vehicleId)}
                              >
                                Log this
                              </Button>
                            ) : null}
                          </div>
                          <div className="bg-amber-50 dark:bg-amber-950/30 p-2 rounded-lg flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-mono text-[11px] font-bold text-amber-900 dark:text-amber-200">
                              {formatDueSoonLine(row)}
                            </span>
                            {opDays ? (
                              <span className="text-[10px] uppercase tracking-wide text-stitch-secondary">
                                {opDays}
                              </span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {ok.length > 0 ? (
                <section className="bg-surface-container-low rounded-xl p-3 shadow-sm">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => setOkExpanded((v) => !v)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">OK</span>
                      <span className="font-mono text-[11px] bg-surface-container-high px-2 py-0.5 rounded-full">
                        {ok.length}
                      </span>
                      <span className="text-[11px] text-stitch-secondary">· Verified compliant</span>
                    </div>
                    <span className="material-symbols-outlined text-stitch-secondary">
                      {okExpanded ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                  {!okExpanded ? (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {ok.slice(0, 4).map((row, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 bg-surface-container-lowest px-2 py-0.5 rounded font-mono text-[11px]"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-surface-tint" />
                          {row.category_name || row.category_code}
                        </span>
                      ))}
                      {ok.length > 4 ? (
                        <span className="text-[11px] text-stitch-secondary self-center">+{ok.length - 4} more</span>
                      ) : null}
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-1 border-t border-surface-container pt-2">
                      {ok.map((row, idx) => (
                        <li
                          key={idx}
                          className="flex items-center justify-between py-1.5 px-2 bg-surface-container-lowest rounded text-sm"
                        >
                          <span>{row.category_name || row.category_code}</span>
                          <span className="font-mono text-[11px] text-stitch-secondary">Compliant</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : null}
            </div>

            <div className="shrink-0 p-6 border-t border-surface-container bg-surface-container-lowest flex flex-col gap-2">
              {recordHandler ? (
                <Button
                  type="button"
                  className="w-full h-11 gap-2 font-semibold"
                  onClick={() => recordHandler(vehicle.vehicleId)}
                >
                  <span className="material-symbols-outlined text-[20px]">add_task</span>
                  Record Maintenance Event
                </Button>
              ) : null}
              <div className="flex items-center justify-between text-[11px] text-stitch-secondary font-mono px-1">
                <span>Vehicle ID: {vehicle.fleetUnitId ?? vehicle.vehicleId}</span>
                <span>{vehicle.homeBase ?? "—"}</span>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
