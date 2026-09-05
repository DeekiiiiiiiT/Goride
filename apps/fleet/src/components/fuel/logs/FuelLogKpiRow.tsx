import React from 'react';
import { Card } from '../../ui/card';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import type { CycleKpis, TransactionKpis } from '../../../utils/fuelLogKpiMetrics';

/**
 * Thin presentational KPI strip for Transaction Logs.
 * Pure display — callers pass already-computed KPI objects (no data fetching here).
 */

export type KpiTile = {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
};

const toneClass: Record<NonNullable<KpiTile['tone']>, string> = {
  default: 'text-slate-900',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
  success: 'text-emerald-600',
};

export function FuelLogKpiRow({ tiles }: { tiles: KpiTile[] }) {
  if (!tiles.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <Card key={t.label} className="p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t.label}
          </div>
          <div className={`mt-1 text-lg font-semibold ${toneClass[t.tone || 'default']}`}>
            {t.value}
          </div>
          {t.hint ? <div className="mt-0.5 text-[11px] text-slate-400">{t.hint}</div> : null}
        </Card>
      ))}
    </div>
  );
}

/** Convenience: map Full Tanks CycleKpis to display tiles. */
export function cycleKpisToTiles(kpis: CycleKpis): KpiTile[] {
  return [
    { label: 'Cycles', value: String(kpis.totalCycles) },
    { label: 'Completed', value: String(kpis.completed), tone: 'success' },
    { label: 'Active', value: String(kpis.active) },
    {
      label: 'Exceptions',
      value: String(kpis.exceptions),
      tone: kpis.exceptions > 0 ? 'danger' : 'default',
    },
    {
      label: 'Avg km/L',
      value: kpis.avgEfficiency != null ? kpis.avgEfficiency.toFixed(2) : '—',
    },
    { label: 'Distance', value: `${kpis.totalDistance.toLocaleString()} km` },
    { label: 'Fuel', value: `${kpis.totalFuel.toLocaleString()} L` },
    { label: 'Spend', value: formatFuelMoney(kpis.totalSpend) },
  ];
}

/** Convenience: map Transaction KPIs to display tiles. */
export function transactionKpisToTiles(kpis: TransactionKpis): KpiTile[] {
  return [
    { label: 'Fills', value: String(kpis.totalFills) },
    { label: 'Spend', value: formatFuelMoney(kpis.totalSpend) },
    { label: 'Volume', value: `${kpis.totalVolume.toLocaleString()} L` },
    { label: 'Distance', value: `${kpis.totalKm.toLocaleString()} km` },
    {
      label: 'Imbalanced',
      value: String(kpis.imbalancedCount),
      tone: kpis.imbalancedCount > 0 ? 'warning' : 'default',
    },
  ];
}

export default FuelLogKpiRow;
