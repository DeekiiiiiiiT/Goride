import React, { useCallback, useEffect, useMemo, useState } from "react";
import { HighVoltageChip, NotUsualChip } from "./log-service/JobFitUi";
import { LS, LT } from "./log-service/logServiceStitch";
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
import type { LineItemDraft } from "../../../types/maintenance";
import { NotFinishedServices } from "./NotFinishedServices";
import { itemsUsedText } from "./serviceHistoryItems";
import type { AddToInspectionRequest } from "./FoundByInspection";

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

export function MaintenanceServiceHistoryPanel({
  vehicles,
  onAddToInspection,
}: {
  vehicles: VehicleOption[];
  /** LC-14: "Add a job to this inspection" in Service details opens Log service in add mode. */
  onAddToInspection?: (target: AddToInspectionRequest) => void;
}) {
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const partFilter = "";
  /** Stitch 08 search box: filters the loaded services by job, part number or shop. */
  const [search, setSearch] = useState("");
  const [fromMonths, setFromMonths] = useState("12");
  const keyword = "";
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

  // Stitch powertrain 08: filter bar, stat cards, "Recorded maintenance events" table whose rows open to
  // job cards. Dropped (invented): service health, YTD spend, audit sync, photos, hash, signed PDF.
  const q = search.trim().toLowerCase();
  const shownGroups = q
    ? groups.filter((g) =>
        [g.jobNames.join(" "), g.providers.join(" "), ...g.rows.map((r) => `${r.brand ?? ""} ${r.part_number ?? r.partNumber ?? ""}`)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : groups;
  const kmValues = rows.map((r) => Number(r.performed_at_miles)).filter((n) => Number.isFinite(n) && n > 0);
  const latestKm = kmValues.length ? Math.max(...kmValues) : null;
  const costRows = rows.map((r) => Number(r.line_total ?? r.lineTotal)).filter((n) => Number.isFinite(n));
  const avgCost = costRows.length ? costRows.reduce((a, b) => a + b, 0) / costRows.length : null;
  const cur = String(rows[0]?.currency ?? "JMD");
  const label = `uppercase mb-1 block ${LT.labelSm} ${LS.muted}`;
  const control = `h-10 rounded-lg border-0 ${LS.low} ${LS.text}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Filter bar */}
      <div className={`p-4 rounded-xl shadow-sm flex flex-col xl:flex-row items-stretch xl:items-end justify-between gap-4 ${LS.lowest}`}>
        <div className="flex flex-wrap items-end gap-3 flex-1">
          <div className="min-w-[260px] flex-1 sm:flex-initial">
            <Label className={label}>Car</Label>
            <Select
              value={vehicleFilter}
              onValueChange={(v) => {
                setVehicleFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className={control}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[#c76c00]" style={{ fontSize: 20 }}>directions_car</span>
                  <SelectValue placeholder="All cars" />
                </span>
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
          <div className="min-w-[170px]">
            <Label className={label}>Date window</Label>
            <Select
              value={fromMonths}
              onValueChange={(v) => {
                setFromMonths(v);
                setPage(1);
              }}
            >
              <SelectTrigger className={control}>
                <span className="flex items-center gap-1.5">
                  <span className={`material-symbols-outlined ${LS.muted}`} style={{ fontSize: 18 }}>calendar_today</span>
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Last 3 months</SelectItem>
                <SelectItem value="6">Last 6 months</SelectItem>
                <SelectItem value="12">Last 12 months</SelectItem>
                <SelectItem value="24">Last 24 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[200px] flex-1">
            <Label className={label}>Search logs</Label>
            <div className="relative flex items-center">
              <span className={`material-symbols-outlined absolute left-3 ${LS.muted}`} style={{ fontSize: 18 }}>search</span>
              <Input
                className={`${control} pl-9`}
                placeholder="Filter by job, part number, shop…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="service-history-stats">
        {[
          { icon: "speed", k: "Odometer reading", v: latestKm != null ? latestKm.toLocaleString() : "—", unit: latestKm != null ? "km" : "" },
          { icon: "construction", k: "Total logged jobs", v: String(total), unit: total === 1 ? "job" : "jobs" },
          { icon: "payments", k: "Average job cost", v: avgCost != null ? formatMoney(cur, Math.round(avgCost)) : "—", unit: "" },
        ].map((c) => (
          <div key={c.k} className={`p-4 rounded-xl shadow-sm flex items-center gap-4 ${LS.lowest}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${LS.low}`}>
              <span className={`material-symbols-outlined ${LS.text}`} style={{ fontSize: 24 }}>{c.icon}</span>
            </div>
            <div>
              <p className={`uppercase ${LT.labelSm} ${LS.muted}`}>{c.k}</p>
              <p className={`${LT.headlineMd} font-bold tabular-nums ${LS.text}`}>
                {c.v} {c.unit ? <span className={`${LT.bodySm} font-normal ${LS.muted}`}>{c.unit}</span> : null}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error ? <div className="text-sm text-error">{error}</div> : null}

      <NotFinishedServices
        vehicleId={vehicleFilter === "all" ? null : vehicleFilter}
        vehicleName={(id) => {
          const v = vehicleById.get(id);
          return v ? [v.make, v.model, v.licensePlate].filter(Boolean).join(" ") : id;
        }}
        onFinished={() => void load()}
        onView={(workOrderId, lbl) => setViewing({ workOrderId, label: lbl })}
      />

      {/* Recorded maintenance events */}
      <div className={`rounded-xl shadow-sm overflow-hidden ${LS.lowest}`}>
        <div className={`px-6 py-4 flex flex-wrap items-center justify-between gap-2 ${LS.low}`}>
          <div className="flex items-center gap-2">
            <h2 className={`${LT.titleMd} font-bold ${LS.text}`}>Recorded maintenance events</h2>
            <span className={`px-2 py-0.5 rounded-full ${LT.labelSm} ${LS.high} ${LS.muted}`}>
              {shownGroups.length} {shownGroups.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <span className={`${LT.labelMd} ${LS.muted}`}>Values in {cur === "JMD" ? "Jamaican dollars (J$)" : cur}</span>
        </div>
        <div className="overflow-x-auto w-full">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-stitch-secondary" />
            </div>
          ) : shownGroups.length === 0 ? (
            <p className={`text-center py-12 ${LT.bodyMd} ${LS.muted}`}>No completed services in this range.</p>
          ) : (
            <table className="w-full text-left border-collapse min-w-[820px]">
              <thead>
                <tr className={`uppercase tracking-wider ${LT.labelSm} ${LS.high} ${LS.muted}`}>
                  <th className="py-2 px-4 font-semibold">Date</th>
                  <th className="py-2 px-4 font-semibold">Mileage</th>
                  <th className="py-2 px-4 font-semibold">Service / jobs</th>
                  <th className="py-2 px-4 font-semibold">Provider / shop</th>
                  <th className="py-2 px-4 font-semibold text-right">Total cost</th>
                  <th className="py-2 px-4 font-semibold text-center">Status</th>
                  <th className="py-2 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shownGroups.map((g) => {
                  const open = expanded.has(g.key);
                  const gVeh = vehicleById.get(g.vehicleId);
                  const gName = gVeh ? [gVeh.make, gVeh.model, gVeh.licensePlate].filter(Boolean).join(" ") : g.vehicleId;
                  const kmLabel =
                    g.minKm == null
                      ? "—"
                      : g.minKm === g.maxKm
                        ? `${g.minKm.toLocaleString()} km`
                        : `${g.minKm.toLocaleString()}–${(g.maxKm ?? g.minKm).toLocaleString()} km`;
                  return (
                    <React.Fragment key={g.key}>
                      <tr
                        className={`cursor-pointer transition-colors ${open ? "bg-[#f4f2fd]/70 dark:bg-[#1c1d26]" : "hover:bg-[#f4f2fd]/40"}`}
                        onClick={() => toggleGroup(g.key)}
                      >
                        <td className={`py-4 px-4 whitespace-nowrap ${LT.titleSm} ${LS.text}`}>
                          <span className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${open ? "bg-[#006c4a]" : "bg-[#c9c5cd]"}`} />
                            {formatDate(g.date, false)}
                          </span>
                        </td>
                        <td className={`py-4 px-4 whitespace-nowrap tabular-nums ${LT.bodyMd} ${LS.text}`}>{kmLabel}</td>
                        <td className="py-4 px-4">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className={`${LT.titleSm} font-medium ${LS.text}`}>{groupJobsPreview(g.jobNames)}</span>
                            <span className={`px-2 py-0.5 rounded-full ${LT.labelSm} ${LS.high} ${LS.muted}`}>
                              {g.rows.length} job{g.rows.length === 1 ? "" : "s"}
                            </span>
                            {vehicleFilter === "all" ? <span className={`${LT.bodySm} ${LS.muted}`}>· {gName}</span> : null}
                          </span>
                        </td>
                        <td className={`py-4 px-4 whitespace-nowrap ${LT.bodyMd} ${LS.muted}`}>
                          <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>store</span>
                            {g.providers.join(", ") || "—"}
                          </span>
                        </td>
                        <td className={`py-4 px-4 whitespace-nowrap text-right tabular-nums font-bold ${LT.titleSm} ${LS.text}`}>
                          {formatMoney(g.currency, g.total)}
                        </td>
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full ${LT.labelMd} font-semibold bg-[#85f8c4] text-[#002114]`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-[#006c4a]" /> Completed
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={open ? "Hide jobs" : "Show jobs"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroup(g.key);
                            }}
                            className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition-colors ${LS.high} ${LS.text} ${LS.hoverMid}`}
                          >
                            <ChevronRight className={`w-4 h-4 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
                          </button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="bg-[#f4f2fd]/70 dark:bg-[#1c1d26]">
                          <td colSpan={7} className="px-4 pb-4">
                            <div className={`rounded-xl p-4 shadow-sm flex flex-col gap-4 ${LS.lowest}`}>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {g.rows.map((row, idx) => {
                                  const currency = String(row.currency ?? "JMD");
                                  const lineTotal = row.line_total ?? row.lineTotal;
                                  const invoice = String(row.invoice_url ?? row.invoiceUrl ?? "").trim();
                                  const dateUnknown =
                                    row.date_unknown === true ||
                                    (row.payload_json as { dateUnknown?: boolean } | undefined)?.dateUnknown === true;
                                  const workOrderId = String(row.work_order_id ?? row.workOrderId ?? "").trim();
                                  const lineId = String(row.line_id ?? row.lineId ?? "").trim();
                                  const jobName = String(row.category_name ?? row.categoryName ?? "this job");
                                  const rowLabel = [formatDate(row.performed_at_date ?? row.performedAtDate, dateUnknown), gName]
                                    .filter(Boolean)
                                    .join(" · ");
                                  const usedText = itemsUsedText(row.items as LineItemDraft[] | undefined, currency);
                                  const notUsual = row.fit_at_log === "no" || row.fitAtLog === "no";
                                  const hv = row.is_high_voltage === true || row.isHighVoltage === true;
                                  const partLine = [row.brand, row.part_number ?? row.partNumber].filter(Boolean).join(" ");
                                  return (
                                    <div
                                      key={String(row.line_id ?? row.lineId ?? idx)}
                                      className={`p-4 rounded-xl flex flex-col justify-between gap-2 ${LS.low}`}
                                      data-testid="service-history-job"
                                    >
                                      <div className="flex flex-col gap-1.5">
                                        <div className="flex items-start justify-between gap-2">
                                          <span className={`flex items-center gap-1.5 font-bold ${LT.titleSm} ${LS.text}`}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>car_repair</span>
                                            Job {idx + 1}: {jobName}
                                          </span>
                                          <span className={`font-bold tabular-nums ${LT.titleSm} ${LS.text}`}>{formatMoney(currency, lineTotal)}</span>
                                        </div>
                                        {notUsual || hv ? (
                                          <span className="flex flex-wrap gap-1">
                                            {notUsual ? <NotUsualChip /> : null}
                                            {hv ? <HighVoltageChip /> : null}
                                          </span>
                                        ) : null}
                                        <p className={`${LT.bodySm} ${LS.muted}`}>
                                          {String(row.action ?? "Service")}
                                        </p>
                                        {usedText ? (
                                          <p className={`${LT.bodySm} ${LS.muted}`} data-testid="service-history-items-used">
                                            <span className={`font-semibold ${LS.text}`}>Items used:</span> {usedText}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className={`flex items-center justify-between gap-2 px-2 py-1 rounded-lg ${LS.lowest}`}>
                                        <span className={`${LT.labelSm} font-mono ${LS.muted}`}>{partLine || "No part number"}</span>
                                        <span className="flex items-center gap-1">
                                          {invoice ? (
                                            <a
                                              href={invoice}
                                              target="_blank"
                                              rel="noreferrer"
                                              title="Invoice"
                                              aria-label="Invoice"
                                              className={`w-7 h-7 rounded-lg inline-flex items-center justify-center ${LS.mid} ${LS.hoverHigh}`}
                                            >
                                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>description</span>
                                            </a>
                                          ) : null}
                                          {workOrderId ? (
                                            <button
                                              type="button"
                                              title="View service"
                                              aria-label="View service"
                                              onClick={() => setViewing({ workOrderId, label: rowLabel })}
                                              className={`w-7 h-7 rounded-lg inline-flex items-center justify-center ${LS.mid} ${LS.hoverHigh} ${LS.text}`}
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
                                              className="w-7 h-7 rounded-lg inline-flex items-center justify-center bg-error text-on-error hover:bg-error/90"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          ) : null}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {g.discountAmount > 0 ? (
                                <div className={`flex flex-col gap-1 p-4 rounded-xl ${LS.mid}`}>
                                  <div className={`flex justify-between ${LT.bodyMd} ${LS.muted}`} data-testid="service-history-discount-row">
                                    <span>Discount</span>
                                    <span className="tabular-nums font-medium">
                                      −{g.currency === "JMD" ? "JMD" : g.currency} {g.discountAmount.toLocaleString()}
                                    </span>
                                  </div>
                                  <div className={`flex justify-between ${LT.titleSm} ${LS.text}`} data-testid="service-history-net-total-row">
                                    <span>Total</span>
                                    <span className="tabular-nums">{formatMoney(g.currency, g.total)}</span>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {total > 50 ? (
          <div className={`px-6 py-3 flex items-center justify-between ${LS.low} ${LT.bodySm}`}>
            <span className={LS.muted}>
              Page {page} · {total} jobs
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className={`px-3 py-1 rounded-lg disabled:opacity-40 ${LT.labelMd} ${LS.high} ${LS.text}`}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page * 50 >= total}
                onClick={() => setPage((p) => p + 1)}
                className={`px-3 py-1 rounded-lg disabled:opacity-40 ${LT.labelMd} ${LS.high} ${LS.text}`}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <ServiceHistoryViewDialog
        workOrderId={viewing?.workOrderId ?? null}
        vehicleLabel={viewing?.label ?? ""}
        onClose={() => setViewing(null)}
        onAddToInspection={
          onAddToInspection
            ? (t) => {
                setViewing(null);
                onAddToInspection(t);
              }
            : undefined
        }
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
