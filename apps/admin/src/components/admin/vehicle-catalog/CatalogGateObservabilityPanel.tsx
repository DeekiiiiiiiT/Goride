import React, { useCallback, useEffect, useMemo, useState } from "react";
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

const NOISE_REASONS = new Set(["extractor_miss"]);
const NOISE_VEHICLE_IDS = new Set(["_none", "_empty"]);

function isActionableVehicleId(id: string | undefined): boolean {
  if (!id) return false;
  if (NOISE_VEHICLE_IDS.has(id)) return false;
  if (id.startsWith("_")) return false;
  return true;
}

export function CatalogGateObservabilityPanel() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [loading, setLoading] = useState(false);
  const [enforcing, setEnforcing] = useState(true);
  const [events, setEvents] = useState<GateEvent[]>([]);
  const [hideNoise, setHideNoise] = useState(true);

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

  const visible = useMemo(() => {
    if (!hideNoise) return events;
    return events.filter((e) => {
      if (e.reason && NOISE_REASONS.has(e.reason)) return false;
      if (e.vehicleId && NOISE_VEHICLE_IDS.has(e.vehicleId)) return false;
      return true;
    });
  }, [events, hideNoise]);

  const noiseCount = events.length - visible.length;

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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={hideNoise ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setHideNoise((v) => !v)}
          >
            {hideNoise ? "Noise hidden" : "Showing noise"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      {!enforcing && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
          ENFORCE_VEHICLE_CATALOG_GATE is not enforcing. Unmatched vehicles can still receive operational writes.
        </p>
      )}
      {hideNoise && noiseCount > 0 && (
        <p className="text-xs text-slate-500">
          Hiding {noiseCount} instrumentation event(s) (extractor_miss / empty vehicle id).
        </p>
      )}
      {visible.length === 0 ? (
        <p className="text-xs text-slate-500">
          {events.length === 0 ? "No recent gate events." : "No actionable gate events (noise filtered)."}
        </p>
      ) : (
        <ul className="max-h-40 overflow-y-auto space-y-1 text-xs font-mono">
          {visible.map((e, i) => (
            <li key={`${e.timestamp}-${i}`} className="flex flex-wrap gap-x-2 gap-y-0.5 text-slate-600 dark:text-slate-300">
              <span className="text-slate-400">{e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}</span>
              <Badge variant="secondary" className="text-[10px]">
                {e.reason || "?"}
              </Badge>
              <span className="truncate">{e.route}</span>
              {isActionableVehicleId(e.vehicleId) ? (
                <a
                  className="text-sky-700 underline underline-offset-2"
                  href={`#fleet-vehicle:${e.vehicleId}`}
                  title="Open pending catalog / rematch this vehicle"
                >
                  {e.vehicleId}
                </a>
              ) : (
                <span>{e.vehicleId}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
