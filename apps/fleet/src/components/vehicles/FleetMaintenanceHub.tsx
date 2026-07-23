import React, { useCallback, useEffect, useState } from "react";
import { Loader2, ListChecks, Package, Plus, Wrench, Car, History } from "lucide-react";
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
import { MaintenanceServiceLedgerPanel } from "./MaintenanceServiceLedgerPanel";
import { catalogOptionsFromScheduleRows } from "../../utils/maintenanceCatalogOptions";
import type {
  CatalogMaintenanceTaskOption,
  MaintenanceLog,
  VehicleMaintenanceScheduleRowApi,
} from "../../types/maintenance";
import { toast } from "sonner@2.0.3";
import type { CompatiblePartsResponse } from "../../types/partSourcing";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export interface FleetMaintenanceHubProps {
  onNavigate?: (page: string) => void;
}

type DriverRequestRow = {
  id: string;
  vehicle_id: string;
  service_type: string | null;
  notes: string | null;
  performed_at_date: string;
  performed_at_miles: number;
  status: string;
  payload_json?: Record<string, unknown> | null;
};

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
  const [initialLogForComplete, setInitialLogForComplete] = useState<Partial<MaintenanceLog> | null>(null);

  const [driverRequests, setDriverRequests] = useState<DriverRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [partsDialogOpen, setPartsDialogOpen] = useState(false);
  const [partsVehicleId, setPartsVehicleId] = useState<string>("");
  const [partsLoading, setPartsLoading] = useState(false);
  const [partsData, setPartsData] = useState<CompatiblePartsResponse | null>(null);
  const [hubTab, setHubTab] = useState<"by-vehicle" | "service-ledger">("by-vehicle");

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true);
    try {
      const res = await api.getMaintenanceRequests("Requested");
      setDriverRequests((res.data || []) as DriverRequestRow[]);
    } catch (e) {
      console.error(e);
      setDriverRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

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
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [loadRequests]);

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
    async (vehicleId: string, initial?: Partial<MaintenanceLog> | null) => {
      if (!vehicleId) return;
      setScheduleLoading(true);
      try {
        const sch = await api.getMaintenanceSchedule(vehicleId);
        const rows = Array.isArray(sch.schedule)
          ? (sch.schedule as VehicleMaintenanceScheduleRowApi[])
          : [];
        setCatalogForLog(catalogOptionsFromScheduleRows(rows));
        const odo = items.find((i) => i.vehicleId === vehicleId)?.odometer;
        setDefaultOdoForLog(
          initial?.odo ?? (Number.isFinite(odo) ? odo : undefined),
        );
        setInitialLogForComplete(initial ?? null);
        setLogVehicleId(vehicleId);
        setLogDialogOpen(true);
      } catch (e: unknown) {
        console.error(e);
        toast.error(e instanceof Error ? e.message : "Failed to open log dialog");
      } finally {
        setScheduleLoading(false);
      }
    },
    [items],
  );

  const handleCompleteRequest = useCallback(
    async (row: DriverRequestRow) => {
      await prepareLogForVehicle(row.vehicle_id, {
        id: row.id,
        vehicleId: row.vehicle_id,
        date: row.performed_at_date,
        type: row.service_type || "Maintenance",
        notes: row.notes || "",
        odo: row.performed_at_miles,
        cost: 0,
        provider: "",
        status: "Completed",
        currency: "JMD",
      });
    },
    [prepareLogForVehicle],
  );

  const handleDismissRequest = useCallback(
    async (row: DriverRequestRow) => {
      try {
        await api.updateMaintenanceLog(row.vehicle_id, row.id, {
          status: "Cancelled",
          cost: null,
        });
        toast.success("Request dismissed");
        await loadRequests();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to dismiss");
      }
    },
    [loadRequests],
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
            By vehicle status and the service ledger for what’s due vs done. Log services here or from{" "}
            <strong>Vehicles</strong>.
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

      <Tabs
        value={hubTab}
        onValueChange={(v) => setHubTab(v as "by-vehicle" | "service-ledger")}
        className="space-y-4"
      >
        <TabsList className="h-10 bg-slate-100 dark:bg-slate-800/80 p-1">
          <TabsTrigger value="by-vehicle" className="gap-1.5 px-4">
            <Car className="w-4 h-4" />
            By vehicle
          </TabsTrigger>
          <TabsTrigger value="service-ledger" className="gap-1.5 px-4">
            <History className="w-4 h-4" />
            Service ledger
          </TabsTrigger>
        </TabsList>

        <TabsContent value="service-ledger" className="mt-0 space-y-4">
          <MaintenanceServiceLedgerPanel vehicles={items} />
        </TabsContent>

        <TabsContent value="by-vehicle" className="mt-0 space-y-4">
      {(driverRequests.length > 0 || requestsLoading) && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Driver requests</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Open issues from drivers — complete with cost to post to books, or dismiss.
              </p>
            </div>
            {requestsLoading ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" /> : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[200px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500 py-6 text-sm">
                    No open driver requests.
                  </TableCell>
                </TableRow>
              ) : (
                driverRequests.map((row) => {
                  const veh = items.find((i) => i.vehicleId === row.vehicle_id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap">{row.performed_at_date}</TableCell>
                      <TableCell>{veh ? vehicleLabel(veh) : row.vehicle_id}</TableCell>
                      <TableCell>{row.service_type || "—"}</TableCell>
                      <TableCell className="max-w-xs truncate" title={row.notes || undefined}>
                        {row.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-8"
                          onClick={() => void handleCompleteRequest(row)}
                          disabled={scheduleLoading}
                        >
                          Complete
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => void handleDismissRequest(row)}
                        >
                          Dismiss
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
        </TabsContent>
      </Tabs>

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
            if (!o) {
              setLogVehicleId("");
              setInitialLogForComplete(null);
            }
          }}
          vehicleId={logVehicleId}
          catalogTemplates={catalogForLog}
          defaultOdo={defaultOdoForLog}
          initialLog={initialLogForComplete}
          onSaved={handleLogSaved}
        />
      ) : null}
    </div>
  );
}
