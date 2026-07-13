import React, { useEffect, useState } from 'react';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Fuel, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { fuelService } from '../../services/fuelService';
import type { FuelScenario } from '../../types/fuel';

/** Read-only fuel policy badge for Driver Detail (assign policies on Fleet Policy). */
export function DriverFuelPolicySelect({
  driver,
  driverId,
}: {
  driver?: any;
  driverId?: string;
  onDriverUpdated?: (next: any) => void;
}) {
  const resolvedId = driverId || driver?.id;
  const [scenarios, setScenarios] = useState<FuelScenario[]>([]);
  const [liveDriver, setLiveDriver] = useState<any>(driver || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fuelService.getFuelScenarios().then(setScenarios).catch(() => setScenarios([]));
  }, []);

  useEffect(() => {
    if (!resolvedId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const all = await api.getDrivers();
        const fresh =
          (all || []).find((d: any) => d.id === resolvedId || d.driverId === resolvedId) ||
          driver ||
          null;
        if (!cancelled) setLiveDriver(fresh);
      } catch {
        if (!cancelled) setLiveDriver(driver || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedId]);

  if (!resolvedId) return null;

  const policyId = liveDriver?.fuelScenarioId;
  const assigned = policyId ? scenarios.find((s) => s.id === policyId) : undefined;
  const defaultScenario = scenarios.find((s) => s.isDefault);
  const label = assigned?.name || defaultScenario?.name || 'Default';
  const isCustom = Boolean(assigned && !assigned.isDefault);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
        <Fuel className="h-3.5 w-3.5" />
        Fuel Policy
      </Label>
      {loading ? (
        <div className="flex h-8 items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : (
        <Badge
          variant="outline"
          className={
            isCustom
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700 font-medium'
              : 'border-slate-200 bg-slate-50 text-slate-600 font-medium'
          }
        >
          {label}
          {!isCustom && !policyId ? ' (default)' : ''}
        </Badge>
      )}
    </div>
  );
}
