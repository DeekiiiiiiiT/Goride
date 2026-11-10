import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { MaintenanceWorkOrderVendorPicker } from "./MaintenanceWorkOrderVendorPicker";
import type { MaintenanceWorkOrderStatus } from "../../../types/maintenance";

type WoRow = {
  id: string;
  vehicleId?: string;
  status?: string;
  priority?: string | null;
  provider?: string | null;
  vendorId?: string | null;
  totalCost?: number | null;
  openedAt?: string;
};

const BOARD_COLUMNS = ["draft", "open", "scheduled", "in_shop", "awaiting_parts"] as const;

export function MaintenanceWorkOrdersTab({
  vehicles,
  onRefreshHub,
}: {
  vehicles: Array<{ vehicleId: string; licensePlate?: string; make?: string; model?: string }>;
  onRefreshHub?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<WoRow[]>([]);
  const [view, setView] = useState<"board" | "list">("board");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listMaintenanceWorkOrders({ board: true });
      setItems((res.items || []) as WoRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load work orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const labelFor = useCallback(
    (vehicleId?: string) => {
      const v = vehicles.find((x) => x.vehicleId === vehicleId);
      if (!v) return vehicleId || "—";
      return [v.make, v.model, v.licensePlate].filter(Boolean).join(" · ") || v.vehicleId;
    },
    [vehicles],
  );

  const byStatus = useMemo(() => {
    const map = new Map<string, WoRow[]>();
    for (const col of BOARD_COLUMNS) map.set(col, []);
    for (const row of items) {
      const st = String(row.status || "draft");
      if (!map.has(st)) map.set(st, []);
      map.get(st)!.push(row);
    }
    return map;
  }, [items]);

  const transition = async (id: string, status: string) => {
    await api.updateWorkOrder(id, { status: status as MaintenanceWorkOrderStatus });
    await load();
    onRefreshHub?.();
  };

  const saveVendor = async (id: string, vendorId: string) => {
    await api.updateWorkOrder(id, { vendorId: vendorId.trim() || null });
    await load();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-stitch-secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-error/30 bg-error-container/20 p-4 text-sm">
        {error}
        <Button type="button" size="sm" variant="outline" className="ml-3" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-on-surface">Work orders</h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={view === "board" ? "default" : "outline"} onClick={() => setView("board")}>
            Board
          </Button>
          <Button type="button" size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>
            List
          </Button>
        </div>
      </div>
      {view === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {BOARD_COLUMNS.map((col) => (
            <div key={col} className="rounded-xl bg-surface-container-low p-3 min-h-[200px]">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-stitch-secondary mb-2">
                {col.replace(/_/g, " ")}
              </div>
              <div className="space-y-2">
                {(byStatus.get(col) || []).map((wo) => (
                  <div key={wo.id} className="rounded-lg bg-surface-container-lowest p-2 shadow-sm text-sm">
                    <div className="font-medium truncate">{labelFor(wo.vehicleId)}</div>
                    <div className="text-[11px] text-stitch-secondary truncate">{wo.provider || "—"}</div>
                    <div className="mt-1 space-y-0.5">
                      <div className="text-[10px] text-stitch-secondary">Vendor</div>
                      <MaintenanceWorkOrderVendorPicker
                        value={wo.vendorId}
                        onChange={(vendorId) => saveVendor(wo.id, vendorId ?? "")}
                      />
                    </div>
                    {col === "draft" ? (
                      <Button type="button" size="sm" className="mt-2 h-7 w-full" onClick={() => void transition(wo.id, "open")}>
                        Open
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low text-left text-[11px] uppercase">
              <tr>
                <th className="p-2">Vehicle</th>
                <th className="p-2">Status</th>
                <th className="p-2">Priority</th>
                <th className="p-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {items.map((wo) => (
                <tr key={wo.id} className="border-t">
                  <td className="p-2">{labelFor(wo.vehicleId)}</td>
                  <td className="p-2">{wo.status}</td>
                  <td className="p-2">{wo.priority || "—"}</td>
                  <td className="p-2 text-right font-mono">{wo.totalCost ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
