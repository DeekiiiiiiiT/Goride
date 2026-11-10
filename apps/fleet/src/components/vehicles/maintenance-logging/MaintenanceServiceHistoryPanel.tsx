import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Eye, Loader2, Trash2 } from "lucide-react";
import { groupJobsPreview, groupServiceHistoryRows } from "./serviceHistoryGroups";
import {
  ServiceHistoryDeleteDialog,
  ServiceHistoryViewDialog,
  type DeleteJobTarget,
} from "./ServiceHistoryRowDialogs";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import {
  formatMaintenanceServiceDateLabel,
} from "../../../utils/maintenanceDisplayFormat";

type HistoryRow = Record<string, unknown>;

type VehicleOption = {
  vehicleId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string;
};

function vehicleLabel(row: VehicleOption): string {
  const name = [row.make, row.model, row.year ? `(${row.year})` : ""].filter(Boolean).join(" ").trim();
  const plate = row.licensePlate?.trim();
  if (name && plate) return `${name} · ${plate}`;
  if (plate) return plate;
  if (name) return name;
  return row.vehicleId;
}

function formatMoney(currency: string | undefined, amount: unknown): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const cur = currency?.trim() || "JMD";
  return `${cur === "JMD" ? "J$" : cur} ${n.toLocaleString()}`;
}

function formatDate(iso: unknown, dateUnknown?: boolean): string {
  if (dateUnknown) return formatMaintenanceServiceDateLabel(null, true);
  return formatMaintenanceServiceDateLabel(String(iso ?? "").slice(0, 10) || null, false);
}

export function MaintenanceServiceHistoryPanel({ vehicles }: { vehicles: VehicleOption[] }) {
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [partFilter, setPartFilter] = useState("");
  const [fromMonths, setFromMonths] = useState("12");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  /** Row the user opened: the whole service (work order) it belongs to. */
  const [viewing, setViewing] = useState<{ workOrderId: string; label: string } | null>(null);
  /** The one job (row) the user clicked delete on. */
  const [deleting, setDeleting] = useState<DeleteJobTarget | null>(null);

  const fromDate = useMemo(() => {
    const months = Number(fromMonths) || 12;
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  }, [fromMonths]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMaintenanceServiceHistory({
        vehicleId: vehicleFilter === "all" ? undefined : vehicleFilter,
        part: partFilter.trim() || undefined,
        from: fromDate,
        q: keyword.trim() || undefined,
        page,
      });
      setRows(res.items || []);
      setTotal(Number(res.total ?? 0));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load service history");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [vehicleFilter, partFilter, fromDate, keyword, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One group per date + car; the arrow opens its jobs. */
  const groups = useMemo(() => groupServiceHistoryRows(rows), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const vehicleById = useMemo(() => {
    const m = new Map<string, VehicleOption>();
    for (const v of vehicles) m.set(v.vehicleId, v);
    return m;
  }, [vehicles]);

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col max-[390px]:rounded-lg">
      <div className="p-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-on-surface tracking-tight">Maintenance Audit Trail</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Every service that was done, grouped by date. Press the arrow to see each job.
            </p>
          </div>
          <div className="flex items-center gap-1 font-mono text-[11px] text-stitch-secondary">
            <span className="material-symbols-outlined text-[14px]">lock_reset</span>
            Immutable Ledger
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch lg:items-end justify-between gap-3 bg-surface-container-low p-3 rounded-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 flex-1">
            <div className="min-w-[160px] flex-1 space-y-1">
              <Label className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider">
                Vehicle
              </Label>
              <Select
                value={vehicleFilter}
                onValueChange={(v) => {
                  setVehicleFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 bg-surface-container-lowest">
                  <SelectValue placeholder="All cars" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All cars</SelectItem>
                  {vehicles.map((v) => (
                    <SelectItem key={v.vehicleId} value={v.vehicleId}>
                      {vehicleLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[160px] flex-1 space-y-1">
              <Label className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider">
                Part
              </Label>
              <Input
                className="h-9 bg-surface-container-lowest"
                placeholder="All parts"
                value={partFilter}
                onChange={(e) => {
                  setPartFilter(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="min-w-[160px] flex-1 space-y-1">
              <Label className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider">
                Timeline
              </Label>
              <Select
                value={fromMonths}
                onValueChange={(v) => {
                  setFromMonths(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 bg-surface-container-lowest">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Last 3 months</SelectItem>
                  <SelectItem value="6">Last 6 months</SelectItem>
                  <SelectItem value="12">Last 12 months</SelectItem>
                  <SelectItem value="24">Last 24 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[180px] flex-1 space-y-1">
              <Label className="text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider">
                Keyword
              </Label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-[16px] text-stitch-secondary">
                  search
                </span>
                <Input
                  className="h-9 pl-8 bg-surface-container-lowest"
                  placeholder="Search provider or note"
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" className="gap-1 shrink-0" disabled>
            <span className="material-symbols-outlined text-[16px]">download</span>
            Export CSV
          </Button>
        </div>
      </div>

      {error ? (
        <div className="px-4 pb-4 text-sm text-error">{error}</div>
      ) : null}

      <div className="overflow-x-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-stitch-secondary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center py-12 text-sm text-stitch-secondary">No completed service lines in this range.</p>
        ) : (
          <table className="w-full text-left border-collapse min-w-[880px]">
            <thead>
              <tr className="bg-surface-container-low text-stitch-secondary text-[11px] uppercase tracking-wider">
                <th className="py-2 px-4 font-semibold">Date</th>
                <th className="py-2 px-4 font-semibold">Vehicle</th>
                <th className="py-2 px-4 font-semibold">Part</th>
                <th className="py-2 px-4 font-semibold">Action</th>
                <th className="py-2 px-4 font-semibold">Odometer</th>
                <th className="py-2 px-4 font-semibold">Provider</th>
                <th className="py-2 px-4 font-semibold text-right">Cost</th>
                <th className="py-2 px-4 font-semibold text-center">Invoice</th>
                <th className="py-2 px-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-surface-container">
              {groups.map((g) => {
                const open = expanded.has(g.key);
                const gVeh = vehicleById.get(g.vehicleId);
                const gPlate = gVeh?.licensePlate ?? "";
                const gName = gVeh ? [gVeh.make, gVeh.model].filter(Boolean).join(" ") : g.vehicleId;
                const kmLabel =
                  g.minKm == null
                    ? "—"
                    : g.minKm === g.maxKm
                      ? `${g.minKm.toLocaleString()} km`
                      : `${g.minKm.toLocaleString()}–${(g.maxKm ?? g.minKm).toLocaleString()} km`;
                return (
                  <React.Fragment key={g.key}>
                    <tr
                      className={`cursor-pointer ${open ? "bg-surface-container-low" : "hover:bg-surface-container-low/60"}`}
                      onClick={() => toggleGroup(g.key)}
                    >
                      <td className="py-3 px-4 whitespace-nowrap font-semibold">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={open ? "Hide jobs" : "Show jobs"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGroup(g.key);
                          }}
                          className="inline-flex items-center gap-2"
                        >
                          <span className="w-7 h-7 rounded-lg border border-outline-variant/50 bg-surface-container-lowest flex items-center justify-center">
                            <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
                          </span>
                          {formatDate(g.date, false)}
                        </button>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{gName || "—"}</span>
                          {gPlate ? (
                            <span className="font-mono text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded font-bold tracking-widest">
                              {gPlate}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 px-4" colSpan={2}>
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary text-on-primary mr-2">
                          {g.rows.length} job{g.rows.length === 1 ? "" : "s"}
                        </span>
                        <span className="text-on-surface-variant">{groupJobsPreview(g.jobNames)}</span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-stitch-secondary">{kmLabel}</td>
                      <td className="py-3 px-4 whitespace-nowrap">{g.providers.join(", ") || "—"}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-semibold">
                        {formatMoney(g.currency, g.total)}
                      </td>
                      <td className="py-3 px-4 text-center text-stitch-secondary">
                        {g.invoiceCount ? `${g.invoiceCount}` : "—"}
                      </td>
                      <td className="py-3 px-4" />
                    </tr>
                    {open
                      ? g.rows.map((row, idx) => {
                const vid = String(row.vehicle_id ?? row.vehicleId ?? "");
                const veh = vehicleById.get(vid);
                const plate = veh?.licensePlate ?? "";
                const vehName = veh ? [veh.make, veh.model].filter(Boolean).join(" ") : vid;
                const currency = String(row.currency ?? "JMD");
                const lineTotal = row.line_total ?? row.lineTotal;
                const invoice = String(row.invoice_url ?? row.invoiceUrl ?? "").trim();
                const dateUnknown =
                  row.date_unknown === true
                  || (row.payload_json as { dateUnknown?: boolean } | undefined)?.dateUnknown === true;
                const workOrderId = String(row.work_order_id ?? row.workOrderId ?? "").trim();
                const lineId = String(row.line_id ?? row.lineId ?? "").trim();
                const jobName = String(row.category_name ?? row.categoryName ?? "this job");
                const rowLabel = [
                  formatDate(row.performed_at_date ?? row.performedAtDate, dateUnknown),
                  [vehName, plate].filter(Boolean).join(" "),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr
                    key={String(row.line_id ?? row.lineId ?? idx)}
                    className="bg-surface-container-lowest hover:bg-surface-container-low/60"
                  >
                    <td className="py-3 pl-14 pr-4 whitespace-nowrap text-stitch-secondary text-xs">
                      {formatDate(row.performed_at_date ?? row.performedAtDate, dateUnknown)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{vehName || "—"}</span>
                        {plate ? (
                          <span className="font-mono text-[10px] bg-surface-container-high px-1.5 py-0.5 rounded font-bold tracking-widest">
                            {plate}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-medium">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {String(row.category_name ?? row.categoryName ?? "—")}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-0.5 rounded text-[11px] bg-surface-container-high">
                        {String(row.action ?? "Service")}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-stitch-secondary">
                      {row.performed_at_miles != null
                        ? `${Number(row.performed_at_miles).toLocaleString()} km${
                          (row.payload_json as { odometerEstimated?: boolean } | undefined)?.odometerEstimated
                          || (row as { odometerEstimated?: boolean }).odometerEstimated
                            ? " est."
                            : ""
                        }`
                        : "—"}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{String(row.provider ?? "—")}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-semibold">
                      {formatMoney(currency, lineTotal)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {invoice ? (
                        <a
                          href={invoice}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex w-8 h-8 rounded bg-surface-container-high items-center justify-center hover:bg-surface-container-highest"
                        >
                          <span className="material-symbols-outlined text-[18px]">description</span>
                        </a>
                      ) : (
                        <span className="text-stitch-secondary">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        {workOrderId ? (
                          <button
                            type="button"
                            title="View service"
                            aria-label="View service"
                            onClick={() => setViewing({ workOrderId, label: rowLabel })}
                            className="w-8 h-8 rounded-lg border border-outline-variant/50 bg-surface-container-lowest flex items-center justify-center text-on-surface hover:bg-surface-container"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        ) : null}
                        {lineId ? (
                          <button
                            type="button"
                            title={`Delete ${jobName}`}
                            aria-label={`Delete ${jobName}`}
                            onClick={() =>
                              setDeleting({
                                lineId,
                                jobName,
                                costLabel: formatMoney(currency, lineTotal),
                                summary: rowLabel,
                              })
                            }
                            className="w-8 h-8 rounded-lg bg-error text-on-error flex items-center justify-center hover:bg-error/90"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
                        })
                      : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {total > 50 ? (
        <div className="p-4 flex items-center justify-between border-t border-surface-container text-sm">
          <span className="text-stitch-secondary font-mono text-[11px]">
            Page {page} · {total} lines
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page * 50 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <ServiceHistoryViewDialog
        workOrderId={viewing?.workOrderId ?? null}
        vehicleLabel={viewing?.label ?? ""}
        onClose={() => setViewing(null)}
      />
      <ServiceHistoryDeleteDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          void load();
        }}
      />
    </div>
  );
}
