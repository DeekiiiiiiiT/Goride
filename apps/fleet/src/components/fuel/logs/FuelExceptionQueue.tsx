import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type { FuelCycle } from '../../../types/fuel';
import {
  incompleteHistoryReason,
  isIncompleteMegaCycle,
  isUnclosedActiveOnClosedPeriod,
  type PeriodBoundsYmd,
  type PartitionOpts,
} from '../../../utils/fuelCycleTrust';
import { explainCycleAnomaly } from '../../../utils/fuelAnomalyExplain';

/**
 * Exception queue — incomplete mega / anomaly history for investigation.
 * Parent passes the partitioned exception list (not the trusted primary list).
 */

const LOW_EFFICIENCY_KM_PER_L = 8;

export type FuelExceptionAssignment = {
  note: string;
  at: string;
  by?: string;
};

export type FuelException = {
  cycle: FuelCycle;
  reasons: string[];
};

export function detectCycleExceptions(
  cycles: FuelCycle[],
  period?: PeriodBoundsYmd,
  opts?: PartitionOpts,
): FuelException[] {
  const out: FuelException[] = [];
  for (const cycle of cycles) {
    const reasons: string[] = [];
    if (isUnclosedActiveOnClosedPeriod(cycle, opts)) {
      reasons.push(incompleteHistoryReason(cycle, period || {}, opts));
    }
    if (period && isIncompleteMegaCycle(cycle, period, opts)) {
      reasons.push(incompleteHistoryReason(cycle, period, opts));
    }
    if (cycle.status === 'Anomaly' && !reasons.some((r) => /Anomaly|Incomplete|did not close/i.test(r))) {
      reasons.push('Anomaly status');
    }
    if (cycle.signalTier === 'exception' && !reasons.some((r) => /exception|Incomplete|did not close/i.test(r))) {
      reasons.push('Exception signal');
    }
    if (
      typeof cycle.efficiency === 'number' &&
      cycle.efficiency > 0 &&
      cycle.efficiency < LOW_EFFICIENCY_KM_PER_L
    ) {
      reasons.push(`Low efficiency (${cycle.efficiency.toFixed(1)} km/L)`);
    }
    if (
      typeof cycle.startOdometer === 'number' &&
      typeof cycle.endOdometer === 'number' &&
      cycle.endOdometer <= cycle.startOdometer
    ) {
      reasons.push('Odometer regression');
    }
    if (!reasons.length) reasons.push(incompleteHistoryReason(cycle, period || {}, opts));
    const explained = explainCycleAnomaly(cycle);
    if (explained && explained !== 'No anomaly explanation available.') {
      reasons.push(explained);
    }
    out.push({ cycle, reasons: [...new Set(reasons)] });
  }
  return out;
}

export type FuelExceptionQueueProps = {
  cycles: FuelCycle[];
  period?: PeriodBoundsYmd;
  isPeriodOpen?: boolean;
  onAssign?: (cycleId: string, note: string) => void;
  /** Persisted assignments keyed by cycle id (localStorage via parent). */
  assignments?: Record<string, FuelExceptionAssignment>;
};

export function FuelExceptionQueue({
  cycles,
  period,
  isPeriodOpen,
  onAssign,
  assignments = {},
}: FuelExceptionQueueProps) {
  const exceptions = useMemo(
    () => detectCycleExceptions(cycles, period, { isPeriodOpen }),
    [cycles, period, isPeriodOpen],
  );
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    // Prefill draft notes from persisted assignments when queue remounts / updates
    const next: Record<string, string> = {};
    for (const { cycle } of exceptions) {
      const a = assignments[cycle.id];
      if (a?.note) next[cycle.id] = a.note;
    }
    if (Object.keys(next).length) {
      setNotes((prev) => ({ ...next, ...prev }));
    }
  }, [exceptions, assignments]);

  if (!exceptions.length) {
    return (
      <Card className="p-4 text-sm text-slate-500">No fuel exceptions in this period.</Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">
        Incomplete tank history — often missing card import or capacity closes. Full km/L shown for
        investigation; excluded from period totals.
      </p>
      {exceptions.map(({ cycle, reasons }) => {
        const assigned = assignments[cycle.id];
        return (
          <Card key={cycle.id} className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                <span>
                  {cycle.vehicleId} · {cycle.startDate?.split('T')[0]} → {cycle.endDate?.split('T')[0]}
                </span>
                {assigned && (
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[11px]">
                    Assigned
                  </Badge>
                )}
              </div>
              <div className="text-xs text-slate-500">
                {cycle.distance?.toLocaleString()} km · {cycle.totalLiters?.toFixed(1)} L ·{' '}
                {formatFuelMoney(cycle.totalCost)}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <Badge key={r} variant="outline" className="text-rose-600">
                  {r}
                </Badge>
              ))}
            </div>

            {assigned?.note && (
              <p className="mt-2 text-[11px] text-indigo-700">
                Note: {assigned.note}
                {assigned.at ? (
                  <span className="text-slate-400"> · {new Date(assigned.at).toLocaleString()}</span>
                ) : null}
              </p>
            )}

            {onAssign ? (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={notes[cycle.id] || ''}
                  placeholder="Assign note…"
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [cycle.id]: e.target.value }))
                  }
                  className="h-8"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!notes[cycle.id]?.trim()}
                  onClick={() => onAssign(cycle.id, (notes[cycle.id] || '').trim())}
                >
                  Assign
                </Button>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

export default FuelExceptionQueue;
