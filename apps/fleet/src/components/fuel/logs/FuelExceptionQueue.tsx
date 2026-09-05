import React, { useMemo, useState } from 'react';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type { FuelCycle } from '../../../types/fuel';

/**
 * Phase 5 — exception queue. Surfaces cycles that need a human look:
 * low efficiency (< 8 km/L), anomaly status, exception signal tier, or an
 * odometer regression (end <= start). Notes are local state; the parent wires
 * onAssign to persist (kept out of this presentational component).
 */

const LOW_EFFICIENCY_KM_PER_L = 8;

export type FuelException = {
  cycle: FuelCycle;
  reasons: string[];
};

export function detectCycleExceptions(cycles: FuelCycle[]): FuelException[] {
  const out: FuelException[] = [];
  for (const cycle of cycles) {
    const reasons: string[] = [];
    if (cycle.status === 'Anomaly') reasons.push('Anomaly status');
    if (cycle.signalTier === 'exception') reasons.push('Exception signal');
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
    if (reasons.length) out.push({ cycle, reasons });
  }
  return out;
}

export type FuelExceptionQueueProps = {
  cycles: FuelCycle[];
  /** Optional persistence hook — receives the cycle id and the typed note. */
  onAssign?: (cycleId: string, note: string) => void;
};

export function FuelExceptionQueue({ cycles, onAssign }: FuelExceptionQueueProps) {
  const exceptions = useMemo(() => detectCycleExceptions(cycles), [cycles]);
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!exceptions.length) {
    return (
      <Card className="p-4 text-sm text-slate-500">No fuel exceptions in this period.</Card>
    );
  }

  return (
    <div className="space-y-3">
      {exceptions.map(({ cycle, reasons }) => (
        <Card key={cycle.id} className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-slate-800">
              {cycle.vehicleId} · {cycle.startDate?.split('T')[0]} → {cycle.endDate?.split('T')[0]}
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

          <div className="mt-3 flex items-center gap-2">
            <Input
              value={notes[cycle.id] || ''}
              placeholder="Assign note…"
              onChange={(e) => setNotes((prev) => ({ ...prev, [cycle.id]: e.target.value }))}
              className="h-8"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!notes[cycle.id]?.trim()}
              onClick={() => onAssign?.(cycle.id, (notes[cycle.id] || '').trim())}
            >
              Assign
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default FuelExceptionQueue;
