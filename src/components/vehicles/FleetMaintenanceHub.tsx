import React, { useCallback, useEffect, useState } from "react";
import { Loader2, ListChecks, Package, Plus, Wrench } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { LogMaintenanceServiceDialog } from "./LogMaintenanceServiceDialog";
import { catalogOptionsFromScheduleRows } from "../../utils/maintenanceCatalogOptions";
import type {
  CatalogMaintenanceTaskOption,
  VehicleMaintenanceScheduleRowApi,
} from "../../types/maintenance";
import { toast } from "sonner@2.0.3";
import type { CompatiblePartsResponse } from "../../types/partSourcing";

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

function vehicleLabel(row: {
  vehicleId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string;
}): string {
  const name = [row.make, row.model, row.year ? `(${row.year})` : ""].filter(Boolean).join(" ").trim();
  const plate = row.licensePlate?.trim();
  if (name && plate) return `${name} · ${plate}`;
  if (plate) return plate;
  if (name) return name;
  return row.vehicleId;
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

  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [pickerVehicleId, setPickerVehicleId] = useState<string>("");
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logVehicleId, setLogVehicleId] = useState<string>("");
  const [catalogForLog, setCatalogForLog] = useState<CatalogMaintenanceTaskOption[]>([]);
  const [defaultOdoForLog, setDefaultOdoForLog] = useState<number | undefined>(undefined);

  const [partsDialogOpen, setPartsDialogOpen] = useState(false);
  const [partsVehicleId, setPartsVehicleId] = useState<string>("");
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsData, setPartsData] = useState<CompatiblePartsResponse | null>(null);

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

  const prepareLogForVehicle = useCallback(
    async (vehicleId: string) => {
      if (!vehicleId) return;
      setScheduleLoading(true);
      try {
        const sch = await api.getMaintenanceSchedule(vehicleId);
        const rows = Array.isArray(sch.schedule)
          ? (sch.schedule as VehicleMaintenanceScheduleRowApi[])
          : [];
        setCatalogForLog(catalogOptionsFromScheduleRows(rows));
        const odo = items.find((i) => i.vehicleId === vehicleId)?.odometer;
        setDefaultOdoForLog(Number.isFinite(odo) ? odo : undefined);
        setLogVehicleId(vehicleId);
        setLogDialogOpen(true);
      } catch (e: unknown) {
        console.error(e);
        toast.error("Could not load maintenance schedule; using default checklists.");
        setCatalogForLog([]);
        const odo = items.find((i) => i.vehicleId === vehicleId)?.odometer;
        setDefaultOdoForLog(Number.isFinite(odo) ? odo : undefined);
        setLogVehicleId(vehicleId);
        setLogDialogOpen(true);
      } finally {
        setScheduleLoading(false);
      }
    },
    [items],
  );

  const handleOpenVehiclePicker = useCallback(() => {
    setPickerVehicleId(items[0]?.vehicleId ?? "");
    setVehiclePickerOpen(true);
  }, [items]);

  const handleContinueFromPicker = useCallback(async () => {
    if (!pickerVehicleId) {
      toast.error("Select a vehicle");
      return;
    }
    setVehiclePickerOpen(false);
    await prepareLogForVehicle(pickerVehicleId);
  }, [pickerVehicleId, prepareLogForVehicle]);

  const handleLogSaved = useCallback(() => {
    void load();
  }, [load]);

  const handleOpenPartsDialog = useCallback(() => {
    setPartsVehicleId(items[0]?.vehicleId ?? "");
    setPartsData(null);
    setPartsDialogOpen(true);
  }, [items]);

  const handleLoadCompatibleParts = useCallback(async () => {
    if (!partsVehicleId) {
      toast.error("Select a vehicle");
      return;
    }
    setPartsLoading(true);
    try {
      const res = await api.getCompatibleParts(partsVehicleId);
      setPartsData(res);
      if (!res.catalogMatched && res.message) {
        toast.info(res.message);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load parts");
      setPartsData(null);
    } finally {
      setPartsLoading(false);
    }
  }, [partsVehicleId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="w-7 h-7 text-amber-600" />
            Fleet maintenance
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Overview of service status by vehicle. Log new services here; open a vehicle from{" "}
            <strong>Vehicles</strong> to view full profile and history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="default"
            onClick={handleOpenVehiclePicker}
            disabled={loading || items.length === 0}
            className="shrink-0 gap-2"
            title={items.length === 0 ? "No vehicles in fleet" : undefined}
          >
            <Plus className="w-4 h-4" />
            Log new service
          </Button>
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
          <Button
            type="button"
            variant="outline"
            onClick={handleOpenPartsDialog}
            disabled={loading || items.length === 0}
            className="shrink-0 gap-2"
            title="Parts from Super Admin catalog (requires motor catalog link on the vehicle)"
          >
            <Package className="w-4 h-4" />
            Compatible parts
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

      <Dialog open={vehiclePickerOpen} onOpenChange={setVehiclePickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log new service</DialogTitle>
            <DialogDescription>Choose which vehicle this service is for.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="fleet-log-vehicle">Vehicle</Label>
            <Select value={pickerVehicleId} onValueChange={setPickerVehicleId}>
              <SelectTrigger id="fleet-log-vehicle" className="w-full">
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                {items.map((row) => (
                  <SelectItem key={row.vehicleId} value={row.vehicleId}>
                    {vehicleLabel(row)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVehiclePickerOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleContinueFromPicker()} disabled={!pickerVehicleId || scheduleLoading}>
              {scheduleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={partsDialogOpen} onOpenChange={setPartsDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Compatible parts</DialogTitle>
            <DialogDescription>
              Lists parts configured in Super Admin that fit this fleet vehicle’s linked motor catalog row (and optional
              chassis/engine gates).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 shrink-0">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <Label htmlFor="parts-veh">Vehicle</Label>
                <Select value={partsVehicleId} onValueChange={setPartsVehicleId}>
                  <SelectTrigger id="parts-veh">
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((row) => (
                      <SelectItem key={row.vehicleId} value={row.vehicleId}>
                        {vehicleLabel(row)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={() => void handleLoadCompatibleParts()} disabled={!partsVehicleId || partsLoading}>
                {partsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load"}
              </Button>
            </div>
            {partsData && !partsData.catalogMatched && (
              <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                {partsData.message ?? "This vehicle is not linked to the motor catalog yet."}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>OEM</TableHead>
                  <TableHead>Suppliers / price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!partsData?.items?.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-500 py-8">
                      {partsData?.catalogMatched ? "No matching parts in catalog." : "Choose a vehicle and tap Load."}
                    </TableCell>
                  </TableRow>
                ) : (
                  partsData.items.map((row) => {
                    const cat = row.part?.part_category?.label ?? "—";
                    const offers = row.offers ?? [];
                    const offerLine = offers.length
                      ? offers
                          .map((o: { supplier?: { name?: string }; unit_price?: number; currency?: string }) =>
                            `${o.supplier?.name ?? "?"}: ${o.currency ?? ""} ${Number(o.unit_price ?? 0).toFixed(2)}`,
                          )
                          .join(" · ")
                      : "—";
                    return (
                      <TableRow key={row.fitmentId}>
                        <TableCell className="font-medium">{row.part?.name ?? "—"}</TableCell>
                        <TableCell className="text-sm text-slate-600 dark:text-slate-400">{cat}</TableCell>
                        <TableCell className="text-sm font-mono">{row.part?.oem_part_number ?? "—"}</TableCell>
                        <TableCell className="text-sm max-w-md">{offerLine}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setPartsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {logVehicleId ? (
        <LogMaintenanceServiceDialog
          open={logDialogOpen}
          onOpenChange={(o) => {
            setLogDialogOpen(o);
            if (!o) setLogVehicleId("");
          }}
          vehicleId={logVehicleId}
          catalogTemplates={catalogForLog}
          defaultOdo={defaultOdoForLog}
          onSaved={handleLogSaved}
        />
      ) : null}

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
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-slate-500 py-12">
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
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => void prepareLogForVehicle(row.vehicleId)}
                          disabled={scheduleLoading}
                        >
                          Log
                        </Button>
                      </TableCell>
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
