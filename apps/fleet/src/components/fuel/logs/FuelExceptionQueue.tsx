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
  /** Plate/name instead of the raw car id. */
  getVehicleName?: (id?: string) => string;
  cycles: FuelCycle[];
  period?: PeriodBoundsYmd;
  isPeriodOpen?: boolean;
  onAssign?: (cycleId: string, note: string) => void;
  /** Persisted assignments keyed by cycle id (server via useFuelExceptionAssignments). */
  assignments?: Record<string, FuelExceptionAssignment>;
};

export function FuelExceptionQueue({
  cycles,
  period,
  isPeriodOpen,
  onAssign,
  assignments = {},
  getVehicleName,
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

  // Stitch: transaction_logs_full_tanks "Needs a look" card — amber rows, plain words.
  const day = (iso?: string) => {
    const d = String(iso || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '—';
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  if (!exceptions.length) {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-white p-5 text-[15px] text-[#47464c] shadow-sm dark:bg-[#2a2a2d] dark:text-zinc-400">
        <span className="material-symbols-outlined flex h-9 w-9 items-center justify-center rounded-full bg-[#82f5c1] text-[18px] text-[#00714e]">check</span>
        No tanks need a look this week.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] dark:bg-[#2a2a2d]">
      <p className="text-[13px] text-[#47464c] dark:text-zinc-400">
        These tanks can&apos;t be measured yet — often a gas card statement or a full-tank fill is missing. They are left out of the totals.
      </p>
      {exceptions.map(({ cycle, reasons }) => {
        const assigned = assignments[cycle.id];
        return (
          <div key={cycle.id} className="rounded-xl bg-[#fffbeb] p-4 dark:bg-[#451a03]/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-[#0d1c2e] dark:text-zinc-50">
                <span className="rounded-md bg-[#fde68a]/60 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wider text-[#b45309]">
                  {getVehicleName ? getVehicleName(cycle.vehicleId) : cycle.vehicleId}
                </span>
                <span className="text-[#b45309]">
                  {day(cycle.startDate)} – {day(cycle.endDate)}
                </span>
                {assigned && (
                  <span className="rounded-full bg-[#e6eeff] px-2.5 py-0.5 text-[12px] font-semibold text-[#0d1c2e]">Assigned</span>
                )}
              </div>
              <div className="text-[13px] tabular-nums text-[#47464c] dark:text-zinc-400">
                {cycle.distance?.toLocaleString()} km · {cycle.totalLiters?.toFixed(1)} L · {formatFuelMoney(cycle.totalCost)}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <span key={r} className="rounded-full bg-white px-2.5 py-0.5 text-[12px] font-semibold text-[#b45309] dark:bg-zinc-900">
                  {r}
                </span>
              ))}
            </div>

            {assigned?.note && (
              <p className="mt-2 text-[13px] text-[#0d1c2e] dark:text-zinc-200">
                Note: {assigned.note}
                {assigned.at ? <span className="text-[#47464c]"> · {new Date(assigned.at).toLocaleString()}</span> : null}
              </p>
            )}

            {onAssign ? (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={notes[cycle.id] || ''}
                  placeholder="Add a note to assign it…"
                  onChange={(e) => setNotes((prev) => ({ ...prev, [cycle.id]: e.target.value }))}
                  className="h-11 rounded-xl border-0 bg-white shadow-sm dark:bg-zinc-900"
                />
                <Button
                  variant="outline"
                  className="min-h-[44px] rounded-xl border-0 bg-white px-5 text-[13px] font-medium shadow-sm ring-1 ring-[#c9c5cd] dark:bg-zinc-900"
                  disabled={!notes[cycle.id]?.trim()}
                  onClick={() => onAssign(cycle.id, (notes[cycle.id] || '').trim())}
                >
                  Assign
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default FuelExceptionQueue;
