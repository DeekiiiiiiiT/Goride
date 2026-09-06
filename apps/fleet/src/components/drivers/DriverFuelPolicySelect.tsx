import React from 'react';
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
  // Shared RQ cache — avoids a duplicate /scenarios (+ wasted getDrivers) on every detail open.
  const { scenarios, loading } = useFuelScenarios(Boolean(resolvedId));

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
