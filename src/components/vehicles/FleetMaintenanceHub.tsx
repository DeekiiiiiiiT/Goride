import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Wrench } from "lucide-react";
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

export function FleetMaintenanceHub({ onNavigate }: FleetMaintenanceHubProps) {
  const [loading, setLoading] = useState(true);
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
    }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getMaintenanceFleetSummary();
      setItems(res.items || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

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
        <Button type="button" variant="outline" onClick={load} disabled={loading} className="shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

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
                <TableHead className="text-right">Next due (km)</TableHead>
                <TableHead className="text-right">Schedule rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-12">
                    No vehicles or no schedule data yet. Match vehicles to the motor catalog and bootstrap schedules from the vehicle profile.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
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
                              : "text-emerald-600"
                        }
                      >
                        {row.fleetStatus}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.nextDueOdometer != null ? row.nextDueOdometer.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">{row.scheduleRowCount}</TableCell>
                  </TableRow>
                ))
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
