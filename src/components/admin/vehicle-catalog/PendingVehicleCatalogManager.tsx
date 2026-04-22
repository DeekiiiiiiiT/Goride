import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Check, Link2, XCircle, RefreshCw, MessageSquareWarning } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import {
  approveExistingPendingVehicleCatalogRequest,
  approvePendingVehicleCatalogRequest,
  getPendingVehicleCatalogRequest,
  listPendingVehicleCatalogRequests,
  rejectPendingVehicleCatalogRequest,
  requestInfoOnPendingVehicleCatalogRequest,
} from "../../../services/pendingVehicleCatalogService";
import { formatCatalogProductionWindow } from "../../../types/vehicleCatalog";
import type { VehicleCatalogPendingRequest } from "../../../types/vehicleCatalogPending";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";
import { toast } from "sonner@2.0.3";
import { Badge } from "../../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";

const STATUS_FILTER_OPTIONS = [
  { value: "open", label: "Open (pending + needs info)" },
  { value: "pending", label: "Pending" },
  { value: "needs_info", label: "Needs info" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "superseded", label: "Superseded" },
] as const;

export function PendingVehicleCatalogManager() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [items, setItems] = useState<VehicleCatalogPendingRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selected, setSelected] = useState<VehicleCatalogPendingRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [fleetSnap, setFleetSnap] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [productionStartYear, setProductionStartYear] = useState("");
  const [productionEndYear, setProductionEndYear] = useState("");
  const [existingId, setExistingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [requestInfoMessage, setRequestInfoMessage] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listPendingVehicleCatalogRequests(token, { status: statusFilter, limit: 100 });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: VehicleCatalogPendingRequest) => {
    if (!token) return;
    setSelected(row);
    setMake(row.proposed_make);
    setModel(row.proposed_model);
    setProductionStartYear(String(row.proposed_production_start_year));
    setProductionEndYear(
      row.proposed_production_end_year == null ? "" : String(row.proposed_production_end_year),
    );
    setExistingId("");
    setRejectReason("");
    setRequestInfoMessage("");
    setDetailOpen(true);
    setDetailLoading(true);
    setFleetSnap(null);
    try {
      const d = await getPendingVehicleCatalogRequest(token, row.id);
      setFleetSnap(d.fleetVehicle);
    } catch {
      toast.error("Failed to load detail");
    } finally {
      setDetailLoading(false);
    }
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
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pending motor vehicles</h1>
          <p className="text-sm text-slate-600 mt-1">
            Fleet-submitted make/model and production years queued until added to the motor catalog or linked to an existing entry.
          </p>
          <p className="text-xs text-slate-500 mt-2">
            <span className="font-medium text-slate-700">Request changes</span> asks the customer to pick a catalog match.
            <span className="font-medium text-slate-700"> Reject</span> closes the request without prompting them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Org</TableHead>
                <TableHead>Fleet vehicle id</TableHead>
                <TableHead>Proposed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-12">
                    No pending requests.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate" title={row.organization_id}>
                      {row.organization_id}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{row.fleet_vehicle_id}</TableCell>
                    <TableCell>
                      {row.proposed_make} {row.proposed_model}{" "}
                      {formatCatalogProductionWindow({
                        production_start_year: row.proposed_production_start_year,
                        production_end_year: row.proposed_production_end_year,
                        production_start_month: row.proposed_production_start_month ?? undefined,
                        production_end_month: row.proposed_production_end_month ?? undefined,
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === "needs_info" ? "default" : "secondary"}
                        className={
                          row.status === "needs_info"
                            ? "bg-amber-100 text-amber-900 hover:bg-amber-100 border-amber-200"
                            : ""
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => void openDetail(row)}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-slate-500">Total matching filter (reported): {total}</p>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex max-h-[min(90vh,880px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <div className="shrink-0 space-y-2 border-b px-6 pt-6 pb-4 pr-14">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle>Review pending request</DialogTitle>
              <DialogDescription className="text-pretty">
                Approve creates a motor catalog row and links the fleet vehicle. Link existing skips catalog creation.
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
                      <p className="text-xs font-medium text-muted-foreground">Organization ID</p>
                      <p className="break-all font-mono text-xs text-foreground">{selected.organization_id}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Fleet vehicle ID</p>
                      <p className="break-all font-mono text-xs text-foreground">{selected.fleet_vehicle_id}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Request ID</p>
                      <p className="break-all font-mono text-xs text-foreground">{selected.id}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium text-muted-foreground">Source</p>
                      <p className="text-foreground">{selected.source}</p>
                    </div>
                    {(selected.proposed_trim_series || selected.proposed_body_type) && (
                      <>
                        <div className="space-y-0.5 sm:col-span-2">
                          <p className="text-xs font-medium text-muted-foreground">Proposed trim / body (from request)</p>
                          <p className="text-foreground">
                            {[selected.proposed_trim_series, selected.proposed_body_type].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                      </>
                    )}
                    {selected.status === "needs_info" && selected.info_request_message && (
                      <div className="space-y-0.5 sm:col-span-2 rounded-md border border-amber-200 bg-amber-50/80 p-3">
                        <p className="text-xs font-medium text-amber-900">Message to fleet</p>
                        <p className="text-sm text-amber-950 whitespace-pre-wrap">{selected.info_request_message}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-foreground">Fleet vehicle snapshot (JSON)</Label>
                  <div className="max-h-[min(42vh,320px)] overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-words">
                    {fleetSnap ? JSON.stringify(fleetSnap, null, 2) : "No fleet vehicle snapshot"}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Catalog values to create (editable)</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                      <Link2 className="h-4 w-4 mr-1" />
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
                    <MessageSquareWarning className="h-4 w-4 mr-2" />
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
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button onClick={() => void handleApproveNew()} disabled={actionBusy}>
                {actionBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Approve (new catalog row)
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
