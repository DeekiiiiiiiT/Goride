import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Check, Link2, XCircle, RefreshCw } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import {
  approveExistingPendingVehicleCatalogRequest,
  approvePendingVehicleCatalogRequest,
  getPendingVehicleCatalogRequest,
  listPendingVehicleCatalogRequests,
  rejectPendingVehicleCatalogRequest,
} from "../../../services/pendingVehicleCatalogService";
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

export function PendingVehicleCatalogManager() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [items, setItems] = useState<VehicleCatalogPendingRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VehicleCatalogPendingRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [fleetSnap, setFleetSnap] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [existingId, setExistingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listPendingVehicleCatalogRequests(token, { status: "pending", limit: 100 });
      setItems(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (row: VehicleCatalogPendingRequest) => {
    if (!token) return;
    setSelected(row);
    setMake(row.proposed_make);
    setModel(row.proposed_model);
    setYear(String(row.proposed_year));
    setExistingId("");
    setRejectReason("");
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
      await approvePendingVehicleCatalogRequest(token, selected.id, {
        make,
        model,
        year: parseInt(year, 10),
      });
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pending motor vehicles</h1>
          <p className="text-sm text-slate-600 mt-1">
            Fleet-submitted make/model/year queued until added to the motor catalog or linked to an existing entry.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
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
                      {row.proposed_make} {row.proposed_model} {row.proposed_year}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{row.status}</Badge>
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

      <p className="text-xs text-slate-500">Total pending (reported): {total}</p>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review pending request</DialogTitle>
            <DialogDescription>
              Approve creates a motor catalog row and links the fleet vehicle. Link existing skips catalog creation.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md bg-slate-50 border p-3 text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto">
                {fleetSnap ? JSON.stringify(fleetSnap, null, 2) : "No fleet vehicle snapshot"}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Make</Label>
                  <Input value={make} onChange={(e) => setMake(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Model</Label>
                  <Input value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Year</Label>
                  <Input value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label>Link to existing catalog (UUID)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="vehicle_catalog id"
                    value={existingId}
                    onChange={(e) => setExistingId(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <Button type="button" variant="secondary" onClick={() => void handleApproveExisting()} disabled={actionBusy}>
                    <Link2 className="h-4 w-4 mr-1" />
                    Link
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <Label>Reject reason (optional)</Label>
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            <Button variant="ghost" onClick={() => void handleReject()} disabled={actionBusy}>
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
            <Button onClick={() => void handleApproveNew()} disabled={actionBusy}>
              {actionBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Approve (new catalog row)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
