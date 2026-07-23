/**
 * Fleet maintenance service ledger UI — outstanding work + history (ops truth, not money).
 */
import React, { useCallback, useEffect, useState } from "react";
import { History, Loader2, AlertTriangle } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Label } from "../ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import type { MaintenanceServiceLedgerEntry } from "../../types/maintenance";

type FleetVehicleOption = {
  vehicleId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string;
};

function vehicleLabel(row: FleetVehicleOption): string {
  const name = [row.make, row.model, row.year ? `(${row.year})` : ""].filter(Boolean).join(" ").trim();
  const plate = row.licensePlate?.trim();
  if (name && plate) return `${name} · ${plate}`;
  if (plate) return plate;
  if (name) return name;
  return row.vehicleId;
}

type OutstandingItem = {
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  position: string | null;
  status: "pending" | "overdue";
  lastPerformedDate: string | null;
  lastPerformedMiles: number | null;
  nextDueMiles: number | null;
  nextDueDate: string | null;
};

export function MaintenanceServiceLedgerPanel({
  vehicles,
}: {
  vehicles: FleetVehicleOption[];
}) {
  const [tab, setTab] = useState<"outstanding" | "history">("outstanding");
  const [vehicleId, setVehicleId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [outstanding, setOutstanding] = useState<OutstandingItem[]>([]);
  const [history, setHistory] = useState<MaintenanceServiceLedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicleId && vehicles[0]?.vehicleId) {
      setVehicleId(vehicles[0].vehicleId);
    }
  }, [vehicles, vehicleId]);

  const load = useCallback(async () => {
    if (!vehicleId) {
      setOutstanding([]);
      setHistory([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [out, hist] = await Promise.all([
        api.getMaintenanceOutstanding(vehicleId),
        api.getMaintenanceServiceLedger(vehicleId, 150),
      ]);
      setOutstanding(out.items || []);
      setHistory(hist.items || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load service ledger");
      setOutstanding([]);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-4 h-4 text-amber-600" />
            Service ledger
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            What’s still due vs what was done — by component and corner. Not expense books.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1 min-w-[200px]">
            <Label className="text-xs">Vehicle</Label>
            <Select value={vehicleId || undefined} onValueChange={setVehicleId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.vehicleId} value={v.vehicleId}>
                    {vehicleLabel(v)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="px-4 py-2 text-sm text-red-700 bg-red-50 dark:bg-red-950/30 border-b border-red-200">
          {error}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "outstanding" | "history")} className="px-2 pt-2">
        <TabsList className="mb-2">
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="outstanding" className="mt-0 pb-3">
          <div className="overflow-auto max-h-[320px] rounded-lg border border-slate-100 dark:border-slate-800 mx-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Component</TableHead>
                  <TableHead>Corner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next due</TableHead>
                  <TableHead>Last done</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                      <Loader2 className="w-5 h-5 animate-spin inline-block" />
                    </TableCell>
                  </TableRow>
                ) : outstanding.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                      Nothing outstanding for this vehicle.
                    </TableCell>
                  </TableRow>
                ) : (
                  outstanding.map((row) => (
                    <TableRow key={`${row.categoryId}-${row.position ?? "all"}`}>
                      <TableCell className="font-medium">{row.categoryName}</TableCell>
                      <TableCell>{row.position || "—"}</TableCell>
                      <TableCell>
                        <span
                          className={
                            row.status === "overdue"
                              ? "text-red-600 inline-flex items-center gap-1"
                              : "text-amber-700"
                          }
                        >
                          {row.status === "overdue" ? (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          ) : null}
                          {row.status === "overdue" ? "Overdue" : "Due soon"}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {[
                          row.nextDueMiles != null ? `${Number(row.nextDueMiles).toLocaleString()} km` : null,
                          row.nextDueDate,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {[
                          row.lastPerformedDate,
                          row.lastPerformedMiles != null
                            ? `@ ${Number(row.lastPerformedMiles).toLocaleString()} km`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value="history" className="mt-0 pb-3">
          <div className="overflow-auto max-h-[320px] rounded-lg border border-slate-100 dark:border-slate-800 mx-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Component</TableHead>
                  <TableHead>Corner</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Odometer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                      <Loader2 className="w-5 h-5 animate-spin inline-block" />
                    </TableCell>
                  </TableRow>
                ) : history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                      No service history yet. Log a service to start the ledger.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.performedAtDate}</TableCell>
                      <TableCell className="font-medium">
                        {row.categoryName || row.categoryCode || "—"}
                      </TableCell>
                      <TableCell>{row.position || "—"}</TableCell>
                      <TableCell className="capitalize">{row.action || "—"}</TableCell>
                      <TableCell>
                        {row.performedAtMiles != null
                          ? Number(row.performedAtMiles).toLocaleString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
