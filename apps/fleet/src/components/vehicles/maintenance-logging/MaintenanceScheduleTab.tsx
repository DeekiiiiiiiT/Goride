import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { toast } from "sonner";

export function MaintenanceScheduleTab({
  vehicles,
}: {
  vehicles: Array<{ vehicleId: string; licensePlate?: string; make?: string; model?: string }>;
}) {
  const [vehicleId, setVehicleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async (vid: string) => {
    if (!vid) return;
    setLoading(true);
    try {
      const res = await api.getMaintenanceDueItems(vid);
      setRows((res.items || []) as Array<Record<string, unknown>>);
    } catch {
      toast.error("Could not load schedule");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (vehicles[0]?.vehicleId && !vehicleId) setVehicleId(vehicles[0].vehicleId);
  }, [vehicles, vehicleId]);

  useEffect(() => {
    if (vehicleId) void load(vehicleId);
  }, [vehicleId, load]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const createWorkOrder = async () => {
    if (!vehicleId || selected.size === 0) return;
    const overdue = rows.filter((r) => String(r.due_status ?? r.dueStatus) === "overdue");
    const lines = overdue
      .filter((r) => selected.has(String(r.category_id ?? r.categoryId)))
      .map((r) => ({
        categoryId: String(r.category_id ?? r.categoryId),
        categoryName: String(r.category_name ?? r.categoryName ?? "Service"),
        action: "replace" as const,
      }));
    if (!lines.length) {
      toast.error("Select overdue rows");
      return;
    }
    await api.createWorkOrder({ vehicleId, status: "open", lines });
    toast.success("Work order created");
    setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold flex-1">Schedule</h2>
        <select
          className="h-9 rounded-md border px-2 text-sm"
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
        >
          {vehicles.map((v) => (
            <option key={v.vehicleId} value={v.vehicleId}>
              {[v.make, v.model, v.licensePlate].filter(Boolean).join(" ") || v.vehicleId}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" disabled={selected.size === 0} onClick={() => void createWorkOrder()}>
          Create work order ({selected.size})
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-left text-[11px] uppercase">
              <tr>
                <th className="p-2 w-10" />
                <th className="p-2">Component</th>
                <th className="p-2">Status</th>
                <th className="p-2">Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const cid = String(r.category_id ?? r.categoryId ?? idx);
                const status = String(r.due_status ?? r.dueStatus ?? "—");
                return (
                  <tr key={cid} className="border-t">
                    <td className="p-2">
                      {status === "overdue" ? (
                        <input type="checkbox" checked={selected.has(cid)} onChange={() => toggle(cid)} />
                      ) : null}
                    </td>
                    <td className="p-2">{String(r.category_name ?? r.categoryName ?? cid)}</td>
                    <td className="p-2">{status}</td>
                    <td className="p-2 font-mono text-xs">
                      {r.next_due_miles != null ? `${r.next_due_miles} km` : String(r.next_due_date ?? "—")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
