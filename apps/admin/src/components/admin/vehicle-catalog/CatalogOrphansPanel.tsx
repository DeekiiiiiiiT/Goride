import React, { useCallback, useEffect, useState } from "react";
import { Link2Off, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import {
  listVehicleCatalogOrphans,
  type CatalogOrphanVehicle,
} from "../../../services/vehicleCatalogService";

/** Lists fleet vehicles whose vehicle_catalog_id no longer resolves. */
export function CatalogOrphansPanel() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CatalogOrphanVehicle[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await listVehicleCatalogOrphans(token);
      setItems(res.items);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2Off className="w-4 h-4 text-rose-600" />
          <h2 className="text-sm font-semibold">Catalog orphans</h2>
          <Badge variant="secondary" className="text-[10px]">
            {items.length}
          </Badge>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Fleet vehicles whose catalog id is missing or invalid. Rematch in Fleet Vehicles / Pending catalog.
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">No orphaned catalog links found.</p>
      ) : (
        <ul className="max-h-36 overflow-y-auto space-y-1 text-xs font-mono">
          {items.slice(0, 50).map((o) => (
            <li key={o.vehicleId} className="flex flex-wrap gap-x-2 text-slate-600 dark:text-slate-300">
              <span className="text-slate-900 dark:text-slate-100">{o.vehicleId}</span>
              <Badge variant="outline" className="text-[10px]">
                {o.reason}
              </Badge>
              <span className="truncate text-slate-400">{o.label || "—"}</span>
              <span className="text-slate-400">{o.vehicle_catalog_id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
