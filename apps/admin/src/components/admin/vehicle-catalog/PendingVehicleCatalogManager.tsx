// Stitch: dominion-redesign/ef714e333eec49e382bcc40f69bc5293
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Check,
  Link2,
  XCircle,
  MessageSquareWarning,
} from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import {
  approveExistingPendingVehicleCatalogRequest,
  approvePendingVehicleCatalogRequest,
  listPendingVehicleCatalogRequests,
  rejectPendingVehicleCatalogRequest,
  requestInfoOnPendingVehicleCatalogRequest,
} from "../../../services/pendingVehicleCatalogService";
import type { VehicleCatalogPendingRequest } from "../../../types/vehicleCatalogPending";
import { toast } from "sonner";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "../maintenance-templates/plainUi";
import { PendingPartsCatalogTab, PendingPartsQueueCount } from "./pending-parts/PendingPartsCatalogTab";
import { PendingCatalogShell, type PendingCatalogTabId } from "./pending-parts/PendingCatalogShell";
import { PendingVehiclesCatalogTab } from "./pending-parts/PendingVehiclesCatalogTab";
import { AutoMatchConflictsTab } from "./pending-parts/AutoMatchConflictsTab";
import { ResearchSettingsPage } from "./pending-parts/ResearchSettingsPage";
import { fetchAutoMatchConflicts } from "../../../services/partsAutoMatchApi";
import { PendingVehicleReviewDrawer } from "./pending-parts/PendingVehicleReviewDrawer";
import "./pending-parts/pendingParts.css";

type QueueFilter = "all_pending" | "needs_info";

function readCatalogTabFromUrl(): PendingCatalogTabId {
  if (typeof window === "undefined") return "parts";
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "vehicles") return "vehicles";
  if (tab === "conflicts") return "conflicts";
  if (tab === "settings") return "settings";
  return "parts";
}

function writeCatalogTabToUrl(tab: PendingCatalogTabId) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "pending-motor-vehicles");
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
}

function syncSecondsAgo(syncedAt: number | null): number {
  if (!syncedAt) return 4;
  return Math.max(0, Math.round((Date.now() - syncedAt) / 1000));
}

export function PendingVehicleCatalogManager() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [items, setItems] = useState<VehicleCatalogPendingRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all_pending");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [selected, setSelected] = useState<VehicleCatalogPendingRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [detailLoading, setDetailLoading] = useState(false);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [vehicleClass, setVehicleClass] = useState<"car" | "motorcycle">("car");
  const [productionStartYear, setProductionStartYear] = useState("");
  const [productionEndYear, setProductionEndYear] = useState("");
  const [existingId, setExistingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [requestInfoMessage, setRequestInfoMessage] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [catalogTab, setCatalogTab] = useState<PendingCatalogTabId>(() => readCatalogTabFromUrl());
  const [conflictsHeaderActions, setConflictsHeaderActions] = useState<React.ReactNode>(null);
  const [partsQueueCount, setPartsQueueCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [partsSyncSec, setPartsSyncSec] = useState(4);
  const [vehiclesSyncedAt, setVehiclesSyncedAt] = useState<number | null>(null);
  const [vehiclesSyncSec, setVehiclesSyncSec] = useState(4);

  const statusParam = queueFilter === "needs_info" ? "needs_info" : "open";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listPendingVehicleCatalogRequests(token, {
        status: statusParam,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total);
      setVehiclesSyncedAt(Date.now());
      setVehiclesSyncSec(4);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [token, statusParam, page]);

  useEffect(() => {
    setPage(0);
  }, [queueFilter]);

  useEffect(() => {
    if (catalogTab === "vehicles") void load();
  }, [load, catalogTab]);

  useEffect(() => {
    if (!token) return;
    void listPendingVehicleCatalogRequests(token, { status: "open", limit: 1, offset: 0 })
      .then((res) => setTotal((prev) => (catalogTab === "parts" ? res.total : prev)))
      .catch(() => {});
  }, [token, catalogTab, partsQueueCount]);

  useEffect(() => {
    if (!token) return;
    void fetchAutoMatchConflicts(token, { status: "open" })
      .then((res) => setConflictsCount(Number(res.totalsByStatus?.open ?? res.filteredCount ?? res.rows?.length ?? 0)))
      .catch(() => setConflictsCount(0));
  }, [token, catalogTab]);

  useEffect(() => {
    if (catalogTab !== "vehicles" || !vehiclesSyncedAt) return;
    const id = window.setInterval(() => {
      setVehiclesSyncSec(syncSecondsAgo(vehiclesSyncedAt));
    }, 1000);
    return () => window.clearInterval(id);
  }, [catalogTab, vehiclesSyncedAt]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((row) =>
      `${row.proposed_make} ${row.proposed_model}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const setCatalogTabPersisted = (tab: PendingCatalogTabId) => {
    setCatalogTab(tab);
    writeCatalogTabToUrl(tab);
  };

  const openDetail = async (row: VehicleCatalogPendingRequest) => {
    setSelected(row);
    setMake(row.proposed_make);
    setModel(row.proposed_model);
    setVehicleClass(row.proposed_vehicle_class === "motorcycle" ? "motorcycle" : "car");
    setProductionStartYear(String(row.proposed_production_start_year));
    setProductionEndYear(
      row.proposed_production_end_year == null ? "" : String(row.proposed_production_end_year),
    );
    setExistingId("");
    setRejectReason("");
    setRequestInfoMessage("");
    setReviewDrawerOpen(true);
    setDetailOpen(false);
    setDetailLoading(false);
  };

  const handleApproveNew = async () => {
    if (!token || !selected) return;
    setActionBusy(true);
    try {
      const ps = parseInt(productionStartYear, 10);
      const peTrim = productionEndYear.trim();
      const payload: Record<string, unknown> = {
        make,
        model,
        vehicle_class: vehicleClass,
        production_start_year: ps,
      };
      if (peTrim === "") payload.production_end_year = null;
      else payload.production_end_year = parseInt(peTrim, 10);
      await approvePendingVehicleCatalogRequest(token, selected.id, payload);
      toast.success("Created catalog entry and linked vehicle");
      setDetailOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleApproveExisting = async () => {
    if (!token || !selected || !existingId.trim()) {
      toast.error("Enter an existing motor catalog UUID");
      return;
    }
    setActionBusy(true);
    try {
      await approveExistingPendingVehicleCatalogRequest(token, selected.id, existingId.trim());
      toast.success("Linked to existing catalog entry");
      setDetailOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Link failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!token || !selected) return;
    setActionBusy(true);
    try {
      await rejectPendingVehicleCatalogRequest(token, selected.id, rejectReason || undefined);
      toast.success("Request rejected");
      setDetailOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActionBusy(false);
    }
  };

  const handleRequestInfo = async () => {
    if (!token || !selected) return;
    const msg = requestInfoMessage.trim();
    if (!msg) {
      toast.error("Enter a message for the fleet");
      return;
    }
    setActionBusy(true);
    try {
      await requestInfoOnPendingVehicleCatalogRequest(token, selected.id, msg);
      toast.success("Fleet will be asked to align with the catalog");
      setDetailOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActionBusy(false);
    }
  };

  const activeSyncSec = catalogTab === "parts" ? partsSyncSec : vehiclesSyncSec;

  return (
    <div className={`pending-parts-stitch min-h-[600px] flex-1${catalogTab === "conflicts" ? " auto-match-conflicts" : ""}`}>
      <PendingPartsQueueCount onCount={setPartsQueueCount} />
      <PendingCatalogShell
        catalogTab={catalogTab}
        onTabChange={setCatalogTabPersisted}
        vehiclesCount={total}
        partsCount={partsQueueCount}
        conflictsCount={conflictsCount}
        syncSeconds={activeSyncSec}
        conflictsHeaderActions={conflictsHeaderActions}
        onRefreshVehicles={() => void load()}
        vehiclesRefreshing={loading}
      >
        {catalogTab === "parts" ? (
          <PendingPartsCatalogTab onSyncSeconds={setPartsSyncSec} />
        ) : catalogTab === "conflicts" ? (
          <AutoMatchConflictsTab onHeaderActions={setConflictsHeaderActions} />
        ) : catalogTab === "settings" ? (
          <ResearchSettingsPage />
        ) : (
          <PendingVehiclesCatalogTab
            items={items}
            visible={visible}
            total={total}
            loading={loading}
            query={query}
            onQueryChange={setQuery}
            queueFilter={queueFilter}
            onQueueFilterChange={setQueueFilter}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            marketFilter={marketFilter}
            onMarketFilterChange={setMarketFilter}
            onOpenDetail={(row) => void openDetail(row)}
          />
        )}
      </PendingCatalogShell>

      <PendingVehicleReviewDrawer
        open={reviewDrawerOpen}
        accessToken={token || ""}
        row={selected}
        marketFilter={marketFilter}
        busy={actionBusy}
        onClose={() => setReviewDrawerOpen(false)}
        onApprove={() => {
          setReviewDrawerOpen(false);
          setDetailOpen(true);
        }}
        onReject={() => {
          setReviewDrawerOpen(false);
          void handleReject();
        }}
      />

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex max-h-[min(90vh,880px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="shrink-0 space-y-2 border-b px-6 pb-4 pr-14 pt-6">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle>Review pending request</DialogTitle>
              <DialogDescription className="text-pretty">
                Approve creates a catalog row and links the fleet vehicle. Vehicle class controls facets,
                Rides eligibility, and maintenance templates — set Motorcycle for two-wheelers. Link
                existing skips catalog creation.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
            {detailLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-5">
                {selected && (
                  <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Requested by</p>
                      <p className="text-foreground">
                        {Number((selected as { fleet_count?: number }).fleet_count ?? 1)} fleets
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Request ID</p>
                      <p className="break-all font-mono text-xs text-foreground">{selected.id}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Source</p>
                      <p className="text-foreground">{selected.source}</p>
                    </div>
                    {(() => {
                      const proposedRows: Array<{ label: string; value: string | null | undefined }> = [
                        {
                          label: "Vehicle class",
                          value:
                            selected.proposed_vehicle_class === "motorcycle"
                              ? "Motorcycle"
                              : selected.proposed_vehicle_class === "car"
                                ? "Car"
                                : selected.proposed_vehicle_class,
                        },
                        { label: "Trim / series", value: selected.proposed_trim_series },
                        { label: "Body type", value: selected.proposed_body_type },
                        { label: "Catalog trim", value: selected.proposed_catalog_trim },
                        { label: "Full model code", value: selected.proposed_full_model_code },
                        { label: "Emissions prefix", value: selected.proposed_emissions_prefix },
                        { label: "Trim suffix code", value: selected.proposed_trim_suffix_code },
                        { label: "Engine code", value: selected.proposed_engine_code },
                        { label: "Drivetrain", value: selected.proposed_drivetrain },
                        { label: "Transmission", value: selected.proposed_transmission },
                        { label: "Fuel type", value: selected.proposed_fuel_type },
                        { label: "Fuel category", value: selected.proposed_fuel_category },
                        { label: "Fuel grade", value: selected.proposed_fuel_grade },
                      ];
                      const proposedVisible = proposedRows.filter(
                        (r) => typeof r.value === "string" && r.value.trim() !== "",
                      );
                      if (proposedVisible.length === 0) return null;
                      return (
                        <div className="space-y-1 rounded-md border border-indigo-100 bg-indigo-50/60 p-3 sm:col-span-2">
                          <p className="text-xs font-medium text-indigo-900">
                            Proposed by fleet (from the catalog picker)
                          </p>
                          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                            {proposedVisible.map((row) => (
                              <div key={row.label} className="flex gap-1">
                                <dt className="text-indigo-700">{row.label}:</dt>
                                <dd className="text-indigo-950">{row.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      );
                    })()}
                    {selected.status === "needs_info" && selected.info_request_message && (
                      <div className="space-y-0.5 rounded-md border border-amber-200 bg-amber-50/80 p-3 sm:col-span-2">
                        <p className="text-xs font-medium text-amber-900">Message to fleet</p>
                        <p className="whitespace-pre-wrap text-sm text-amber-950">
                          {selected.info_request_message}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Catalog values to create (editable)</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="max-w-xs space-y-1.5 sm:col-span-3">
                      <Label>Vehicle class</Label>
                      <Select
                        value={vehicleClass}
                        onValueChange={(v) => setVehicleClass(v === "motorcycle" ? "motorcycle" : "car")}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="car">Car</SelectItem>
                          <SelectItem value="motorcycle">Motorcycle</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pending-make">Make</Label>
                      <Input id="pending-make" value={make} onChange={(e) => setMake(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pending-model">Model</Label>
                      <Input id="pending-model" value={model} onChange={(e) => setModel(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="pending-prod-start">Production start year</Label>
                      <Input
                        id="pending-prod-start"
                        value={productionStartYear}
                        onChange={(e) => setProductionStartYear(e.target.value)}
                        inputMode="numeric"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="pending-prod-end">Production end year (empty = ongoing)</Label>
                      <Input
                        id="pending-prod-end"
                        value={productionEndYear}
                        onChange={(e) => setProductionEndYear(e.target.value)}
                        inputMode="numeric"
                        placeholder="e.g. 2024 or leave blank"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <Label htmlFor="pending-existing-id" className="text-foreground">
                    Link to existing catalog (UUID)
                  </Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="pending-existing-id"
                      placeholder="vehicle_catalog id"
                      value={existingId}
                      onChange={(e) => setExistingId(e.target.value)}
                      className="font-mono text-sm sm:flex-1"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => void handleApproveExisting()}
                      disabled={actionBusy}
                    >
                      <Link2 className="mr-1 h-4 w-4" />
                      Link
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <Label htmlFor="pending-request-info" className="text-foreground">
                    Request changes (message to fleet)
                  </Label>
                  <Textarea
                    id="pending-request-info"
                    value={requestInfoMessage}
                    onChange={(e) => setRequestInfoMessage(e.target.value)}
                    rows={3}
                    className="min-h-[72px] resize-y"
                    placeholder="Explain what to fix or which catalog field is wrong..."
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => void handleRequestInfo()}
                    disabled={actionBusy}
                  >
                    <MessageSquareWarning className="mr-2 h-4 w-4" />
                    Request changes
                  </Button>
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <Label htmlFor="pending-reject" className="text-foreground">
                    Reject reason (optional)
                  </Label>
                  <Textarea
                    id="pending-reject"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    className="min-h-[72px] resize-y"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t bg-muted/20 px-6 py-4">
            <DialogFooter className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-3">
              <Button variant="ghost" onClick={() => void handleReject()} disabled={actionBusy}>
                <XCircle className="mr-1 h-4 w-4" />
                Reject
              </Button>
              <Button onClick={() => void handleApproveNew()} disabled={actionBusy}>
                {actionBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Approve (new catalog row)
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
