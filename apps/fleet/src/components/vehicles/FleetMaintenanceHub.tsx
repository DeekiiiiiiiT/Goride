import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { Loader2, Wrench, Car, History, Package, ClipboardList, CalendarRange, Clock } from "lucide-react";
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
import { LogMaintenanceServiceDialog, type AddToInspectionTarget } from "./LogMaintenanceServiceDialog";
import { MaintenanceNightlyStatusLine } from "./maintenance-logging/MaintenanceNightlyStatusLine";
import { MaintenanceDueItemsDrawer } from "./maintenance-logging/MaintenanceDueItemsDrawer";
import { MaintenanceOverviewPanel } from "./maintenance-logging/MaintenanceOverviewPanel";
import { MaintenanceHubKpiCards } from "./maintenance-logging/MaintenanceHubKpiCards";
import {
  MaintenanceHubEmptyState,
  MaintenanceHubErrorState,
  MaintenanceHubLoadingState,
} from "./maintenance-logging/MaintenanceHubStates";
import { MaintenanceServiceHistoryPanel } from "./maintenance-logging/MaintenanceServiceHistoryPanel";
import { LogOdometerDialog } from "./maintenance-logging/LogOdometerDialog";
import { OdometerHistoryDrawer } from "./maintenance-logging/OdometerHistoryDrawer";
import { LogServiceWhichCarDialog } from "./maintenance-logging/log-service";
import type { LogServiceVehicleStrip } from "./maintenance-logging/log-service";
import {
  formatMaintenanceDisplayDate,
} from "../../utils/maintenanceDisplayFormat";
import { catalogOptionsFromScheduleRows, scheduleRowsWithPackages } from "../../utils/maintenanceCatalogOptions";
import type {
  CatalogMaintenanceTaskOption,
  FoundWorkCounts,
  FoundWorkItem,
  MaintenanceLog,
  VehicleMaintenanceScheduleRowApi,
} from "../../types/maintenance";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FindPartsTab } from "./find-parts/FindPartsTab";
import { MaintenanceRequestsTab } from "./maintenance-logging/MaintenanceRequestsTab";
import { WorkOrdersTab } from "./maintenance-logging/work-orders/WorkOrdersTab";
import { ServiceHistoryViewDialog } from "./maintenance-logging/ServiceHistoryRowDialogs";
import { FoundByInspectionSection, type AddToInspectionRequest } from "./maintenance-logging/FoundByInspection";
import { MaintenanceScheduleTab } from "./maintenance-logging/MaintenanceScheduleTab";
import { usePermissions } from "../../hooks/usePermissions";

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
  work_order_id?: string | null;
  /** Version of the request's draft work order (edits send it back). */
  version?: number;
};

type FleetHubVehicleRow = {
  vehicleId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string;
  fleetUnitId?: string;
  homeBase?: string;
  vin?: string;
  odometer: number;
  odometerMeta?: {
    reading: number;
    recordedAt: string;
    source: string;
    sourceLabel: string;
  } | null;
  fleetStatus: string;
  nextDueOdometer: number | null;
  nextDueSummary?: string | null;
  worstDueTaskName?: string | null;
  scheduleRowCount: number;
  maxCalendarDaysOverdue: number | null;
  maxKmOverdue: number | null;
  lastService?: { date: string; miles: number | null } | null;
  dueCounts?: { overdue: number; dueSoon: number };
  servicesAttention: Array<{ taskName: string; kind: "overdue" | "due_soon" }>;
  servicesAttentionTruncated: boolean;
  doNotDrive?: boolean;
  doNotDriveReason?: string | null;
  doNotDriveSetAt?: string | null;
  dominionScheduleStatus?: "roam_policy" | "maker_manual" | "needs_checking" | "waiting_odometer";
  severeDuty?: boolean;
};

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

function fleetOrgDisplayName(): string | undefined {
  try {
    return localStorage.getItem("roam_fleet_name")?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function FleetMaintenanceHub({ onNavigate }: FleetMaintenanceHubProps) {
  const { user } = useAuth();
  const { can, canAny } = usePermissions();
  const canViewParts = can("vehicles.view");
  const canClearDoNotDrive = canAny("vehicles.edit", "maintenance.approve");
  const canEditMaintenance = can("vehicles.edit");
  const orgName = fleetOrgDisplayName();

  const [mobileCompact, setMobileCompact] = useState(false);
  useEffect(() => {
    const check = () => setMobileCompact(window.innerWidth <= 390);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FleetHubVehicleRow[]>([]);
  const [telemetryMissingCount, setTelemetryMissingCount] = useState(0);
  const [nextScheduledWindow, setNextScheduledWindow] = useState<{ date: string; site: string } | null>(
    null,
  );
  const [nextScheduledDateLine, setNextScheduledDateLine] = useState<string | null>(null);
  const [partsRequisition, setPartsRequisition] = useState<{ status: string; detail: string } | null>(
    null,
  );
  // Step 7: parts nobody has dated (counted on their own, never as Overdue).
  const [historyUnknown, setHistoryUnknown] = useState<{ parts: number; cars: number } | null>(null);
  const [kpiMonth, setKpiMonth] = useState<{
    costPerKmApprox?: number;
    pmOnTimePct?: number;
  } | null>(null);

  const [servicesDueView, setServicesDueView] = useState<FleetHubVehicleRow | null>(null);
  const [nightlyRun, setNightlyRun] = useState<Record<string, unknown> | null>(null);
  const [logOdometerVehicle, setLogOdometerVehicle] = useState<FleetHubVehicleRow | null>(null);
  const [odometerHistoryVehicle, setOdometerHistoryVehicle] = useState<FleetHubVehicleRow | null>(null);

  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logVehicleId, setLogVehicleId] = useState<string>("");
  const [catalogForLog, setCatalogForLog] = useState<CatalogMaintenanceTaskOption[]>([]);
  const [defaultOdoForLog, setDefaultOdoForLog] = useState<number | undefined>(undefined);
  const [initialLogForComplete, setInitialLogForComplete] = useState<Partial<MaintenanceLog> | null>(null);
  /** Inspection findings: open found-job counts (null = switch off or not loaded) and the job "Log it now" opened. */
  const [foundCounts, setFoundCounts] = useState<FoundWorkCounts | null>(null);
  const [fromFoundWork, setFromFoundWork] = useState<FoundWorkItem | null>(null);
  /** Step 11: a request's "Open work order" opens that work order's panel on the Work orders tab. */
  const [openWorkOrderId, setOpenWorkOrderId] = useState<string | null>(null);
  const [viewingService, setViewingService] = useState<{ workOrderId: string; label: string } | null>(null);
  /** Step 10: "Log this" on a due line opens Log service on that part. */
  const [startOnPart, setStartOnPart] = useState<{ categoryId: string } | null>(null);
  /** LC-14: Log service opened to add jobs to a saved inspection. */
  const [addToInspection, setAddToInspection] = useState<AddToInspectionTarget | null>(null);

  const [driverRequests, setDriverRequests] = useState<DriverRequestRow[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [hubTab, setHubTab] = useState<
    "by-vehicle" | "service-ledger" | "work-orders" | "find-parts" | "not-done-yet" | "requests" | "schedule"
  >(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "find-parts") return "find-parts";
    if (tab === "service-ledger") return "service-ledger";
    // Step 11 (MER-15): Work orders is its own tab again. Inspections still land on Not done yet (LC-11).
    if (tab === "work-orders") return "work-orders";
    if (tab === "not-done-yet" || tab === "inspections") return "not-done-yet";
    if (tab === "requests") return "requests";
    if (tab === "schedule") return "schedule";
    return "by-vehicle";
  });

  const overviewAttentionCount = useMemo(
    () =>
      items.filter((i) => {
        const s = i.fleetStatus.toLowerCase();
        return s.includes("overdue") || s.includes("odometer");
      }).length,
    [items],
  );

  const overdueCount = useMemo(
    () => items.filter((i) => i.fleetStatus.toLowerCase().includes("overdue")).length,
    [items],
  );

  // A failed page load says nothing about the nightly job; only judge it when the data loaded.
  const nightlyMissed = !loading && !error && !nightlyRun?.success;

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

  /** Found-job counts load on their own: a failure (or the switch off) only hides the card and chips. */
  const loadFoundCounts = useCallback(async () => {
    try {
      setFoundCounts(await api.foundWorkCounts());
    } catch {
      setFoundCounts(null);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    void loadFoundCounts();
    try {
      const res = await api.getMaintenanceFleetSummary();
      setNightlyRun((res as { nightlyRun?: Record<string, unknown> }).nightlyRun ?? null);
      setTelemetryMissingCount(Number((res as { telemetryMissingCount?: number }).telemetryMissingCount ?? 0));
      setNextScheduledWindow(
        (res as { nextScheduledWindow?: { date: string; site: string } | null }).nextScheduledWindow ?? null,
      );
      setNextScheduledDateLine(
        (res as { nextScheduledDateLine?: string | null }).nextScheduledDateLine ?? null,
      );
      setPartsRequisition(
        (res as { partsRequisition?: { status: string; detail: string } | null }).partsRequisition ?? null,
      );
      {
        const hu = res as { historyUnknownParts?: number; historyUnknownCars?: number };
        setHistoryUnknown(
          hu.historyUnknownParts != null
            ? { parts: Number(hu.historyUnknownParts), cars: Number(hu.historyUnknownCars ?? 0) }
            : null,
        );
      }
      try {
        const kpiRes = await api.getMaintenanceKpiMonthly();
        const first = (kpiRes.items || [])[0] as Record<string, unknown> | undefined;
        if (first) {
          setKpiMonth({
            costPerKmApprox: Number(first.cost_per_km_approx ?? first.costPerKmApprox ?? 0),
            pmOnTimePct: Number(first.pm_on_time_pct ?? first.pmOnTimePct ?? 0),
          });
        } else {
          setKpiMonth(null);
        }
      } catch {
        setKpiMonth(null);
      }
      setItems(
        ((res.items || []) as FleetHubVehicleRow[]).map((row) => ({
          ...row,
          maxCalendarDaysOverdue: row.maxCalendarDaysOverdue ?? null,
          maxKmOverdue: row.maxKmOverdue ?? null,
          servicesAttention: row.servicesAttention ?? [],
          servicesAttentionTruncated: Boolean(row.servicesAttentionTruncated),
          dominionScheduleStatus: row.dominionScheduleStatus ?? "roam_policy",
        })),
      );
      setServicesDueView((prev) => {
        if (!prev) return prev;
        const fresh = ((res.items || []) as FleetHubVehicleRow[]).find((r) => r.vehicleId === prev.vehicleId);
        return fresh ? { ...fresh, dominionScheduleStatus: fresh.dominionScheduleStatus ?? "roam_policy" } : prev;
      });
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [loadRequests, loadFoundCounts]);

  useEffect(() => {
    load();
  }, [load]);

  const prepareLogForVehicle = useCallback(
    async (
      vehicleId: string,
      initial?: Partial<MaintenanceLog> | null,
      fromFound?: FoundWorkItem | null,
      addTo?: AddToInspectionTarget | null,
    ) => {
      if (!vehicleId) return;
      setScheduleLoading(true);
      try {
        const sch = await api.getMaintenanceSchedule(vehicleId);
        setCatalogForLog(catalogOptionsFromScheduleRows(scheduleRowsWithPackages(sch)));
        const odo = items.find((i) => i.vehicleId === vehicleId)?.odometer;
        setDefaultOdoForLog(initial?.odo ?? (Number.isFinite(odo) ? odo : undefined));
        setInitialLogForComplete(initial ?? null);
        setFromFoundWork(fromFound ?? null);
        setAddToInspection(addTo ?? null);
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vehicleId = params.get("vehicle_id");
    if (!vehicleId || loading || items.length === 0) return;
    setHubTab("by-vehicle");
    void prepareLogForVehicle(vehicleId);
    params.delete("vehicle_id");
    const url = new URL(window.location.href);
    url.search = params.toString();
    window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
  }, [items, loading, prepareLogForVehicle]);

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
        version: row.version,
        workOrderId:
          row.work_order_id
          ?? (typeof row.payload_json?.workOrderId === "string" ? row.payload_json.workOrderId : undefined)
          ?? undefined,
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
          ...(typeof row.version === "number" ? { expectedVersion: row.version } : {}),
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
    setVehiclePickerOpen(true);
  }, []);

  const handleContinueFromPicker = useCallback(
    async (vehicleId: string) => {
      setVehiclePickerOpen(false);
      await prepareLogForVehicle(vehicleId);
    },
    [prepareLogForVehicle],
  );

  /** Reloads the Not done yet tab after a save (Log it now takes a job off it). */
  const [foundListKey, setFoundListKey] = useState(0);
  const handleLogSaved = useCallback(() => {
    void load();
    setFoundListKey((k) => k + 1);
  }, [load]);
  const carLabelOf = useCallback(
    (vehicleId: string) => {
      const v = items.find((i) => i.vehicleId === vehicleId);
      if (!v) return null;
      return [[v.make, v.model].filter(Boolean).join(" "), v.licensePlate].filter(Boolean).join(" · ") || null;
    },
    [items],
  );


  /** LC-14: "Add a job" on an inspection → the Log service window in add-to-inspection mode. */
  const openAddToInspection = useCallback(
    (t: AddToInspectionRequest) => {
      setServicesDueView(null);
      void prepareLogForVehicle(t.vehicleId, null, null, {
        workOrderId: t.workOrderId,
        inspectionLine: t.inspectionLine,
        editLine: t.editLine ?? null,
      });
    },
    [prepareLogForVehicle],
  );

  const findPartsActive = hubTab === "find-parts";

  const logVehicleStrip = useMemo((): LogServiceVehicleStrip | undefined => {
    if (!logVehicleId) return undefined;
    const v = items.find((i) => i.vehicleId === logVehicleId);
    if (!v) return { vehicleLabel: logVehicleId };
    const name = [v.make, v.model, v.year ? `(${v.year})` : "", v.licensePlate]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      vehicleLabel: name || v.licensePlate || logVehicleId,
      odometerKm: v.odometerMeta?.reading ?? v.odometer,
      odometerDateLabel: v.odometerMeta?.recordedAt
        ? formatMaintenanceDisplayDate(v.odometerMeta.recordedAt)
        : null,
      sourceLabel: v.odometerMeta?.sourceLabel ?? v.odometerMeta?.source ?? null,
      homeBase: v.homeBase ?? null,
    };
  }, [items, logVehicleId]);

  return (
    <div className="space-y-4 max-[390px]:px-2 max-[390px]:space-y-3">
      {nightlyMissed && !findPartsActive ? (
        <section className="w-full bg-error-container text-on-error-container px-4 py-3 rounded-lg shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-error text-on-error flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[18px]">warning</span>
            </div>
            <div>
              <p className="font-semibold text-sm">Nightly check didn&apos;t run last night.</p>
              <p className="text-sm opacity-90">Due items may be out of date across fleet asset registries.</p>
            </div>
          </div>
          <Button type="button" size="sm" className="gap-1 shrink-0" onClick={() => void load()}>
            <span className="material-symbols-outlined text-[16px]">sync</span>
            Refresh
          </Button>
        </section>
      ) : null}

      {!findPartsActive && (
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600">
                <Wrench className="w-5 h-5" />
              </div>
              <h1 className="text-2xl font-bold text-on-surface tracking-tight">Fleet maintenance</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end max-[390px]:w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => void load()}
              disabled={loading}
              className="shrink-0 gap-2 bg-surface-container-lowest"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <span className="material-symbols-outlined text-[16px]">sync</span>
              )}
              Refresh
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleOpenVehiclePicker}
              disabled={loading || items.length === 0}
              className="shrink-0 gap-2 max-[390px]:w-full"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Log service
            </Button>
          </div>
        </div>
      )}

      {!findPartsActive && !loading && error ? (
        <MaintenanceHubErrorState message={error} onRetry={() => void load()} />
      ) : null}

      {!findPartsActive && !loading && !error ? (
        <MaintenanceHubKpiCards
          overdueCount={overdueCount}
          telemetryMissingCount={telemetryMissingCount}
          fleetTotal={items.length}
          nextScheduledWindow={nextScheduledWindow}
          nextScheduledDateLine={nextScheduledDateLine}
          partsRequisition={partsRequisition}
          costPerKmApprox={kpiMonth?.costPerKmApprox}
          pmOnTimePct={kpiMonth?.pmOnTimePct}
          foundByInspection={foundCounts}
          onOpenFound={() => setHubTab("not-done-yet")}
          historyUnknownParts={historyUnknown?.parts}
          historyUnknownCars={historyUnknown?.cars}
        />
      ) : null}

      <Tabs
        value={hubTab}
        onValueChange={(v) => {
          const next = v as "by-vehicle" | "service-ledger" | "find-parts";
          setHubTab(next);
          const url = new URL(window.location.href);
          if (next === "by-vehicle") url.searchParams.delete("tab");
          else url.searchParams.set("tab", next);
          window.history.replaceState(null, "", url);
        }}
        className="space-y-4"
      >
        <div
          className={
            findPartsActive
              ? "fleet-am-s4f-hub-head flex flex-col gap-4 w-full pb-2 border-b border-outline-variant/30"
              : ""
          }
        >
          {findPartsActive ? (
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <nav className="flex items-center gap-1.5 text-caption text-on-surface-variant" aria-label="Breadcrumb">
                <span>Fleet</span>
                <span>/</span>
                <span>Maintenance</span>
                <span>/</span>
                <span className="font-medium text-on-surface">Find parts</span>
              </nav>
            </div>
          ) : null}
          <TabsList className={`h-10 bg-surface-container p-1 ${findPartsActive ? "shrink-0 self-end" : ""}`}>
            <TabsTrigger value="by-vehicle" className="gap-1.5 px-4" data-maintenance-tab="by-vehicle">
              <Car className="w-4 h-4" />
              {findPartsActive ? "By vehicle" : "Overview"}
              {overviewAttentionCount > 0 ? (
                <span className="bg-surface-container-high text-on-surface-variant font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-0.5">
                  {overviewAttentionCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="service-ledger" className="gap-1.5 px-4" data-maintenance-tab="service-ledger">
              <History className="w-4 h-4" />
              {findPartsActive ? "Service ledger" : "Service history"}
            </TabsTrigger>
            <TabsTrigger value="work-orders" className="gap-1.5 px-4" data-maintenance-tab="work-orders">
              <Wrench className="w-4 h-4" />
              Work orders
            </TabsTrigger>
            {canViewParts ? (
              <TabsTrigger value="find-parts" className="gap-1.5 px-4" data-maintenance-tab="find-parts">
                <Package className="w-4 h-4" />
                Find parts
              </TabsTrigger>
            ) : null}
            {foundCounts ? (
              <TabsTrigger value="not-done-yet" className="gap-1.5 px-3" data-maintenance-tab="not-done-yet">
                <Clock className="w-4 h-4" />
                Not done yet
                {foundCounts.total > 0 ? (
                  <span className="bg-amber-100 text-amber-900 font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-0.5">
                    {foundCounts.total}
                  </span>
                ) : null}
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="requests" className="gap-1.5 px-3" data-maintenance-tab="requests">
              <ClipboardList className="w-4 h-4" />
              Requests
              {driverRequests.length > 0 ? (
                <span className="bg-amber-100 text-amber-900 font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-0.5">
                  {driverRequests.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="schedule" className="gap-1.5 px-3" data-maintenance-tab="schedule">
              <CalendarRange className="w-4 h-4" />
              Schedule
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="service-ledger" className="mt-0 space-y-4">
          {loading ? <MaintenanceHubLoadingState /> : <MaintenanceServiceHistoryPanel vehicles={items} onAddToInspection={openAddToInspection} />}
        </TabsContent>

        <TabsContent value="find-parts" className="mt-0">
          {canViewParts ? (
            <FindPartsTab
              cars={items}
              canView={canViewParts}
              onUseInService={(id, componentId, partName) => {
                void prepareLogForVehicle(id, {
                  vehicleId: id,
                  lines: [{ categoryId: componentId, categoryCode: "", categoryName: partName }],
                });
              }}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="not-done-yet" className="mt-0">
          {foundCounts ? (
            <FoundByInspectionSection
              key={foundListKey}
              canEdit={canEditMaintenance}
              carLabel={carLabelOf}
              phone={mobileCompact}
              onLogItNow={(item) => void prepareLogForVehicle(item.vehicleId, null, item)}
              onChanged={() => void loadFoundCounts()}
              onAddToInspection={openAddToInspection}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="work-orders" className="mt-0">
          {hubTab === "work-orders" ? (
            <WorkOrdersTab
              canEdit={canEditMaintenance}
              openWorkOrderId={openWorkOrderId}
              onOpenedWorkOrder={() => setOpenWorkOrderId(null)}
              onMarkDone={(card) => {
                if (!card.request) return;
                void handleCompleteRequest({
                  id: card.request.recordId,
                  vehicle_id: card.vehicleId,
                  service_type: card.request.type,
                  notes: card.request.text,
                  performed_at_date: card.request.performedAtDate ?? new Date().toISOString().slice(0, 10),
                  performed_at_miles: card.request.odometer ?? 0,
                  status: card.request.recordStatus,
                  work_order_id: card.id,
                  payload_json: { workOrderId: card.id },
                  version: card.request.version ?? undefined,
                });
              }}
              onViewService={(card) =>
                setViewingService({
                  workOrderId: card.id,
                  label: [card.plate, [card.make, card.model].filter(Boolean).join(" ")].filter(Boolean).join(" · "),
                })
              }
            />
          ) : null}
        </TabsContent>

        <TabsContent value="requests" className="mt-0">
          <MaintenanceRequestsTab
            vehicles={items}
            onApproved={() => void loadRequests()}
            onOpenWorkOrder={(id) => {
              setOpenWorkOrderId(id);
              setHubTab("work-orders");
            }}
          />
        </TabsContent>


        <TabsContent value="schedule" className="mt-0">
          <MaintenanceScheduleTab vehicles={items} />
        </TabsContent>

        <TabsContent value="by-vehicle" className="mt-0 space-y-4 max-w-full overflow-x-hidden">
          {loading ? (
            <MaintenanceHubLoadingState />
          ) : error ? null : items.length === 0 ? (
            <MaintenanceHubEmptyState onGoToVehicles={onNavigate ? () => onNavigate("vehicles") : undefined} />
          ) : (
            <MaintenanceOverviewPanel
              items={items}
              orgName={orgName}
              onLogService={(id) => void prepareLogForVehicle(id)}
              onLogOdometer={(id) => {
                const row = items.find((i) => i.vehicleId === id);
                if (row) setLogOdometerVehicle(row);
              }}
              onOpenDueDrawer={(id) => {
                const row = items.find((i) => i.vehicleId === id);
                if (row) setServicesDueView(row);
              }}
              onOdometerHistory={(id) => {
                const row = items.find((i) => i.vehicleId === id);
                if (row) setOdometerHistoryVehicle(row);
              }}
              onGoToVehicles={onNavigate ? () => onNavigate("vehicles") : undefined}
              canClearDoNotDrive={canClearDoNotDrive}
              foundByVehicle={foundCounts?.byVehicle ?? null}
              onClearDoNotDrive={async (vehicleId, reason) => {
                try {
                  await api.clearVehicleDoNotDrive(vehicleId, reason);
                  toast.success("Do not drive cleared");
                  await load();
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : "Could not clear do not drive");
                  throw e;
                }
              }}
            />
          )}
        </TabsContent>
      </Tabs>

      <MaintenanceDueItemsDrawer
        open={!!servicesDueView}
        onOpenChange={(open) => {
          if (!open) setServicesDueView(null);
        }}
        vehicle={servicesDueView}
        onLogService={(id) => {
          setServicesDueView(null);
          void prepareLogForVehicle(id);
        }}
        onRecordMaintenanceEvent={(id) => {
          setServicesDueView(null);
          void prepareLogForVehicle(id);
        }}
        onLogOdometer={(id) => {
          const row = items.find((r) => r.vehicleId === id);
          if (row) setLogOdometerVehicle(row);
        }}
        mobileCompact={mobileCompact}
        canEditMaintenance={canEditMaintenance}
        onLogFoundWork={(item) => {
          setServicesDueView(null);
          void prepareLogForVehicle(item.vehicleId, null, item);
        }}
        onLogThis={(vehicleId, categoryId) => {
          setServicesDueView(null);
          setStartOnPart({ categoryId });
          void prepareLogForVehicle(vehicleId);
        }}
        onFoundChanged={() => void loadFoundCounts()}
        onAddToInspection={openAddToInspection}
      />

      <ServiceHistoryViewDialog
        workOrderId={viewingService?.workOrderId ?? null}
        vehicleLabel={viewingService?.label ?? ""}
        onClose={() => setViewingService(null)}
      />

      <OdometerHistoryDrawer
        open={!!odometerHistoryVehicle}
        onOpenChange={(open) => {
          if (!open) setOdometerHistoryVehicle(null);
        }}
        vehicle={odometerHistoryVehicle}
        onChanged={() => void load()}
      />

      <LogOdometerDialog
        open={!!logOdometerVehicle}
        onOpenChange={(open) => {
          if (!open) setLogOdometerVehicle(null);
        }}
        vehicleId={logOdometerVehicle?.vehicleId ?? ""}
        vehicleLabel={logOdometerVehicle ? vehicleLabel(logOdometerVehicle) : ""}
        licensePlate={logOdometerVehicle?.licensePlate}
        vin={logOdometerVehicle?.vin}
        hasReading={(logOdometerVehicle?.odometerMeta?.reading ?? logOdometerVehicle?.odometer ?? 0) > 0}
        onSaved={() => void load()}
      />

      <LogServiceWhichCarDialog
        open={vehiclePickerOpen}
        onOpenChange={setVehiclePickerOpen}
        vehicles={items}
        loading={scheduleLoading}
        onContinue={(id) => void handleContinueFromPicker(id)}
      />

      {logVehicleId ? (
        <LogMaintenanceServiceDialog
          open={logDialogOpen}
          onOpenChange={(o) => {
            setLogDialogOpen(o);
            if (!o) {
              setLogVehicleId("");
              setInitialLogForComplete(null);
              setFromFoundWork(null);
              setStartOnPart(null);
              setAddToInspection(null);
            }
          }}
          vehicleId={logVehicleId}
          catalogTemplates={catalogForLog}
          defaultOdo={defaultOdoForLog}
          vehicleStrip={logVehicleStrip}
          initialLog={initialLogForComplete}
          draftUserId={user?.id}
          onSaved={handleLogSaved}
          fromFoundWork={fromFoundWork}
          startOnPart={startOnPart}
          addToInspection={addToInspection}
        />
      ) : null}
    </div>
  );
}
