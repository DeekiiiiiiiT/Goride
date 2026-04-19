import React, { useCallback, useEffect, useState } from "react";
import { Loader2, ListChecks, Wrench } from "lucide-react";
import { api } from "../../services/api";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

export interface FleetMaintenanceHubProps {
  onNavigate?: (page: string) => void;
}

function formatFleetOverdueLine(
  maxCal: number | null | undefined,
  maxKm: number | null | undefined,
): string {
  const c = maxCal ?? null;
  const k = maxKm ?? null;
  if (c != null && k != null) return `${c.toLocaleString()} d · ${k.toLocaleString()} km`;
  if (c != null) return `${c.toLocaleString()} d`;
  if (k != null) return `${k.toLocaleString()} km`;
  return "—";
}

function formatServicesAttentionLine(
  rows: Array<{ taskName: string; kind: "overdue" | "due_soon" }> | undefined,
  truncated?: boolean,
): { line: string; title: string } {
  const list = rows ?? [];
  if (list.length === 0) return { line: "—", title: "" };
  const parts = list.map(
    (r) => `${r.taskName} (${r.kind === "overdue" ? "overdue" : "due soon"})`,
  );
  const line = parts.join(", ") + (truncated ? "…" : "");
  const title =
    parts.join("\n") + (truncated ? "\n(Additional items not listed.)" : "");
  return { line, title };
}

export function FleetMaintenanceHub({ onNavigate }: FleetMaintenanceHubProps) {
  const [loading, setLoading] = useState(true);
  const [fleetBootstrapping, setFleetBootstrapping] = useState(false);
  const [fleetMessage, setFleetMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<
    Array<{
      vehicleId: string;
      licensePlate?: string;
      make?: string;
      model?: string;
      year?: string;
      odometer: number;
      fleetStatus: string;
      nextDueOdometer: number | null;
      scheduleRowCount: number;
      maxCalendarDaysOverdue: number | null;
      maxKmOverdue: number | null;
      servicesAttention: Array<{ taskName: string; kind: "overdue" | "due_soon" }>;
      servicesAttentionTruncated: boolean;
    }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMaintenanceFleetSummary();
      setItems(
        (res.items || []).map((row) => ({
          ...row,
          maxCalendarDaysOverdue: row.maxCalendarDaysOverdue ?? null,
          maxKmOverdue: row.maxKmOverdue ?? null,
          servicesAttention: row.servicesAttention ?? [],
          servicesAttentionTruncated: Boolean(row.servicesAttentionTruncated),
        })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBootstrapFleet = useCallback(async () => {
    setFleetBootstrapping(true);
    setFleetMessage(null);
    setError(null);
    try {
      const res = await api.bootstrapMaintenanceFleet();
      const touched = res.results.filter((r) => r.created > 0).length;
      setFleetMessage(
        `Bootstrap complete: ${res.totalCreated} schedule row(s) created across ${touched} vehicle(s).`,
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fleet bootstrap failed");
    } finally {
      setFleetBootstrapping(false);
    }
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-7 h-7 text-amber-600" />
            Fleet maintenance
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Overview of service status by vehicle. Open a vehicle from <strong>Vehicles</strong> to log services or view history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={handleBootstrapFleet}
            disabled={loading || fleetBootstrapping}
            className="shrink-0 gap-2"
            title="Create schedule rows from Super Admin templates for vehicles with a catalog match and no schedule yet"
          >
            {fleetBootstrapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListChecks className="w-4 h-4" />}
            Bootstrap schedules
          </Button>
          <Button type="button" variant="outline" onClick={load} disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      {fleetMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
          {fleetMessage}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 text-slate-400 animate-spin" />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vehicle</TableHead>
                <TableHead>Plate</TableHead>
                <TableHead className="text-right">Odometer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead>Services due</TableHead>
                <TableHead className="text-right">Next due (km)</TableHead>
                <TableHead className="text-right">Schedule rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-500 py-12">
                    No vehicles or no schedule data yet. Match vehicles to the motor catalog and bootstrap schedules from the vehicle profile.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => {
                  const svc = formatServicesAttentionLine(
                    row.servicesAttention,
                    row.servicesAttentionTruncated,
                  );
                  return (
                  <TableRow key={row.vehicleId}>
                    <TableCell className="font-medium">
                      {row.make} {row.model} {row.year ? `(${row.year})` : ""}
                    </TableCell>
                    <TableCell>{row.licensePlate ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.odometer.toLocaleString()}</TableCell>
                    <TableCell>
                      <span
                        className={
                          row.fleetStatus === "Overdue"
                            ? "text-red-600 font-medium"
                            : row.fleetStatus === "Due Soon"
                              ? "text-amber-600 font-medium"
                              : row.fleetStatus === "No schedule"
                                ? "text-slate-500 dark:text-slate-400"
                                : "text-emerald-600"
                        }
                      >
                        {row.fleetStatus}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-slate-700 dark:text-slate-300">
                      {formatFleetOverdueLine(row.maxCalendarDaysOverdue, row.maxKmOverdue)}
                    </TableCell>
                    <TableCell className="max-w-[min(28rem,55vw)]">
                      <span
                        className="line-clamp-2 text-sm text-slate-700 dark:text-slate-300"
                        title={svc.title || undefined}
                      >
                        {svc.line}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.nextDueOdometer != null ? row.nextDueOdometer.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">{row.scheduleRowCount}</TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {onNavigate && (
        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={() => onNavigate("vehicles")}>
            Go to Vehicles
          </Button>
        </div>
      )}
    </div>
  );
}
