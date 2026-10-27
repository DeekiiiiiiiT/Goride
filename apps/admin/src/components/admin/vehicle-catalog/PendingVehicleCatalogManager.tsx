// Stitch: dominion-redesign/ef714e333eec49e382bcc40f69bc5293
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Check,
  Link2,
  XCircle,
  MessageSquareWarning,
  HelpCircle,
  Info,
  RefreshCw,
  Search,
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

type QueueFilter = "all_pending" | "needs_info";

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
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((row) =>
      `${row.proposed_make} ${row.proposed_model}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

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
    setDetailOpen(true);
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

  return (
    <div className="max-w-[1440px] flex-1 p-8 text-slate-900">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-slate-500">
        <span>Dominion</span>
        <span aria-hidden>›</span>
        <span>Master data</span>
        <span aria-hidden>›</span>
        <span>Vehicles</span>
        <span aria-hidden>›</span>
        <span className="font-semibold text-slate-900">Pending catalog</span>
      </nav>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pending catalog</h1>
          <p className="mt-1 text-sm text-slate-600">Catalog requests waiting for a decision.</p>
        </div>
        <button
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh queue
        </button>
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white p-4">
          <div className="relative min-w-[280px] max-w-md flex-1">
            <Search
              className="pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 text-slate-400"
              aria-hidden
            />
            <input
              className="w-full rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
              placeholder="Search pending requests..."
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs shadow-sm">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 ${
                  queueFilter === "all_pending"
                    ? "bg-slate-100 font-medium text-slate-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setQueueFilter("all_pending")}
              >
                All pending
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 ${
                  queueFilter === "needs_info"
                    ? "bg-slate-100 font-medium text-slate-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                onClick={() => setQueueFilter("needs_info")}
              >
                Needs info
              </button>
            </div>
            <span className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600">
              JMD-REGISTRY: ACTIVE
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  <th className="px-5 py-3">Make</th>
                  <th className="px-5 py-3">Model</th>
                  <th className="px-5 py-3 font-mono">Year</th>
                  <th className="px-5 py-3">Requested</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                      The data is not in yet.
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const needsInfo = row.status === "needs_info";
                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors hover:bg-slate-50/60 ${needsInfo ? "bg-amber-50/10" : ""}`}
                      >
                        <td className="px-5 py-4 font-semibold text-slate-900">{row.proposed_make}</td>
                        <td className="px-5 py-4 font-medium text-slate-800">{row.proposed_model}</td>
                        <td className="px-5 py-4 font-mono font-medium text-slate-700">
                          {row.proposed_production_start_year}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-medium text-slate-800">
                              {new Date(row.created_at).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <span className="text-[11px] text-slate-400">from {row.source}</span>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {needsInfo ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                              Needs info
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg bg-[#15803d] px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-800"
                              onClick={() => void openDetail(row)}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden />
                              Approve
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                              onClick={() => void openDetail(row)}
                            >
                              <Link2 className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                              Link to existing
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-[#b91c1c] transition-colors hover:bg-red-50"
                              onClick={() => void openDetail(row)}
                            >
                              <XCircle className="h-3.5 w-3.5" aria-hidden />
                              Reject
                            </button>
                            <button
                              type="button"
                              title="Ask for info"
                              aria-label="help_outline"
                              className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                              onClick={() => void openDetail(row)}
                            >
                              <HelpCircle className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-500">
          <div className="font-mono text-[11px]">
            Showing {visible.length} queued catalog item{visible.length === 1 ? "" : "s"}
            {total > visible.length ? ` (${total} total)` : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] disabled:opacity-40"
              disabled={loading || page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] disabled:opacity-40"
              disabled={loading || (page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-500">
            <Info className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-800">The data is not in yet.</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              Additional manufacturer spec sheets and tariff matrices will populate once synced.
            </div>
          </div>
        </div>
        <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 font-mono text-[11px] font-semibold text-slate-600">
          LOC: KINGSTON / PARISH REGISTRY JMD
        </span>
      </div>

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
