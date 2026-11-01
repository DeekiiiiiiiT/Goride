import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { toast } from "sonner";

type RequestRow = {
  id: string;
  vehicle_id: string;
  service_type: string | null;
  notes: string | null;
  performed_at_date: string;
  payload_json?: Record<string, unknown> | null;
};

export function MaintenanceRequestsTab({
  vehicles,
  onApproved,
}: {
  vehicles: Array<{ vehicleId: string; licensePlate?: string; make?: string; model?: string }>;
  onApproved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getMaintenanceRequests("Requested");
      setRows((res.data || []) as RequestRow[]);
    } catch {
      toast.error("Could not load driver requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const vehicleLabel = (id: string) => {
    const v = vehicles.find((x) => x.vehicleId === id);
    return v ? [v.make, v.model, v.licensePlate].filter(Boolean).join(" · ") : id;
  };

  const workOrderIdFor = (row: RequestRow) => {
    const pj = row.payload_json || {};
    return String(pj.workOrderId ?? pj.work_order_id ?? "").trim();
  };

  const approve = async (row: RequestRow) => {
    const woId = workOrderIdFor(row);
    if (!woId) {
      toast.error("No linked work order");
      return;
    }
    await api.triageMaintenanceWorkOrder(woId, { action: "approve" });
    toast.success("Request approved");
    await load();
    onApproved?.();
  };

  const decline = async () => {
    if (!declineId || !declineReason.trim()) return;
    const row = rows.find((r) => r.id === declineId);
    const woId = row ? workOrderIdFor(row) : "";
    if (!woId) {
      toast.error("No linked work order");
      return;
    }
    await api.triageMaintenanceWorkOrder(woId, { action: "decline", reason: declineReason.trim() });
    toast.success("Request declined");
    setDeclineId(null);
    setDeclineReason("");
    await load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-stitch-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Driver requests</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-stitch-secondary py-8 text-center">No open requests.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const priority = String(row.payload_json?.priority ?? "Medium");
            const photo = String(row.payload_json?.photoUrl ?? row.payload_json?.photo_url ?? "").trim();
            return (
              <div key={row.id} className="rounded-xl border bg-surface-container-lowest p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{vehicleLabel(row.vehicle_id)}</div>
                  <div className="text-xs text-stitch-secondary">{row.service_type} · Priority: {priority}</div>
                  <p className="text-sm mt-1 truncate">{row.notes || "—"}</p>
                  {photo ? (
                    <a href={photo} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                      View photo
                    </a>
                  ) : null}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button type="button" size="sm" onClick={() => void approve(row)}>Approve</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setDeclineId(row.id)}>Decline</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {declineId ? (
        <div className="rounded-xl border p-4 space-y-2 bg-amber-50/50 dark:bg-amber-950/20">
          <p className="text-sm font-medium">Decline reason (required)</p>
          <Input value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Why are you declining?" />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" onClick={() => void decline()}>Confirm decline</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDeclineId(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
