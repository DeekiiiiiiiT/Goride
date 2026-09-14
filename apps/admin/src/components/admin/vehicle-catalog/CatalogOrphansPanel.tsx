import React, { useCallback, useEffect, useState } from "react";
import { Link2Off, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import {
  listVehicleCatalogOrphans,
  type CatalogOrphanVehicle,
} from "../../../services/vehicleCatalogService";

/** Alert-only: hidden when there are no orphaned fleet → catalog links. */
export function CatalogOrphansPanel() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
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
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token || !loaded || items.length === 0) return null;

  return (
    <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/80 dark:bg-rose-950/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2Off className="w-4 h-4 text-rose-600" />
          <h2 className="text-sm font-semibold text-rose-900 dark:text-rose-100">Catalog orphans</h2>
          <Badge variant="secondary" className="text-[10px]">
            {items.length}
          </Badge>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>
      <p className="text-xs text-rose-800/80 dark:text-rose-200/80">
        Fleet vehicles whose catalog id is missing or invalid. Rematch in Fleet Vehicles / Pending catalog.
      </p>
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
    </div>
  );
}
