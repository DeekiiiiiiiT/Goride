import React, { useEffect, useState } from 'react';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Fuel, Loader2 } from 'lucide-react';
import { useFuelScenarios } from '../../hooks/useFuelScenarios';
import {
  mondayYmdForDate,
  resolveDriverVersionForWeek,
} from '../../utils/fuelPolicyVersion';

/** Read-only fuel policy badge for Driver Detail (assign on Fleet Policy → Schedule). */
export function DriverFuelPolicySelect({
  driver,
  driverId,
}: {
  driver?: any;
  driverId?: string;
  onDriverUpdated?: (next: any) => void;
}) {
  const resolvedId = driverId || driver?.id;
  // Defer /scenarios until after shell requests grab HTTP/1.1 slots (Fixes ROAM-FLEET-10).
  const [scenariosReady, setScenariosReady] = useState(false);
  useEffect(() => {
    if (!resolvedId) {
      setScenariosReady(false);
      return;
    }
    setScenariosReady(false);
    const t = window.setTimeout(() => setScenariosReady(true), 1800);
    return () => window.clearTimeout(t);
  }, [resolvedId]);
  const { scenarios, loading } = useFuelScenarios(Boolean(resolvedId) && scenariosReady);

  if (!resolvedId) return null;

  const thisMonday = mondayYmdForDate(new Date());
  const hit = resolveDriverVersionForWeek(scenarios, resolvedId, thisMonday);
  const label = hit?.scenario.name || 'Default';
  const isCustom = Boolean(hit && !hit.scenario.isDefault);

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
          {!isCustom ? ' (default)' : ''}
        </Badge>
      )}
    </div>
  );
}
