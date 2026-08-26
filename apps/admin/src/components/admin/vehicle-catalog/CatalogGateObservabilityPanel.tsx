import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Shield } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { API_ENDPOINTS } from "../../../services/apiConfig";
import { publicAnonKey } from "../../../utils/supabase/info";

type GateEvent = {
  reason?: string;
  route?: string;
  vehicleId?: string;
  timestamp?: string;
  organizationId?: string | null;
};

export function CatalogGateObservabilityPanel() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [loading, setLoading] = useState(false);
  const [enforcing, setEnforcing] = useState(true);
  const [events, setEvents] = useState<GateEvent[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_ENDPOINTS.admin}/admin/catalog-gate-events?limit=30`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: publicAnonKey,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents((data.items || []) as GateEvent[]);
      setEnforcing(data.enforcing !== false);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-semibold">Catalog gate activity</h2>
          {!enforcing && (
            <Badge className="bg-rose-100 text-rose-900 border-0 gap-1">
              <AlertTriangle className="w-3 h-3" />
              Enforcement OFF
            </Badge>
          )}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>
      {!enforcing && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          ENFORCE_VEHICLE_CATALOG_GATE is not enforcing. Unmatched vehicles can still receive operational writes.
        </p>
      )}
      {events.length === 0 ? (
        <p className="text-xs text-slate-500">No recent gate events.</p>
      ) : (
        <ul className="max-h-40 overflow-y-auto space-y-1 text-xs font-mono">
          {events.map((e, i) => (
            <li key={`${e.timestamp}-${i}`} className="flex flex-wrap gap-x-2 gap-y-0.5 text-slate-600 dark:text-slate-300">
              <span className="text-slate-400">{e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}</span>
              <Badge variant="secondary" className="text-[10px]">{e.reason || "?"}</Badge>
              <span className="truncate">{e.route}</span>
              <span>{e.vehicleId}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
