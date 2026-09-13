import React from 'react';
import { Card } from '../../ui/card';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { cn } from '../../ui/utils';
import type { CycleKpis, TransactionKpis } from '../../../utils/fuelLogKpiMetrics';

/**
 * Thin presentational KPI strip for Transaction Logs.
 * Pure display — callers pass already-computed KPI objects (no data fetching here).
 * Clickable tiles call onTileClick with the tile id (e.g. 'imbalanced').
 */

export type KpiTile = {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger' | 'success';
  /** When set, tile is a filter control. */
  filterable?: boolean;
  active?: boolean;
};

const toneClass: Record<NonNullable<KpiTile['tone']>, string> = {
  default: 'text-slate-900',
  warning: 'text-amber-600',
  danger: 'text-rose-600',
  success: 'text-emerald-600',
};

export function FuelLogKpiRow({
  tiles,
  onTileClick,
}: {
  tiles: KpiTile[];
  onTileClick?: (tileId: string) => void;
}) {
  if (!tiles.length) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-5">
      {tiles.map((t) => {
        const clickable = !!onTileClick && (t.filterable || t.id === 'imbalanced' || t.id === 'exceptions');
        return (
          <Card
            key={t.id}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-pressed={t.active || undefined}
            onClick={clickable ? () => onTileClick?.(t.id) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTileClick?.(t.id);
                    }
                  }
                : undefined
            }
            className={cn(
              // Card defaults to gap-6 — kill it so KPI chips stay compact on phones
              'gap-0 px-2 py-1 shadow-none transition-colors sm:px-2.5 sm:py-1.5',
              clickable && 'cursor-pointer hover:border-slate-300 hover:bg-slate-50/80',
              t.active && 'border-amber-300 ring-2 ring-amber-400',
            )}
          >
            <div className="truncate text-[9px] font-semibold uppercase leading-none tracking-wide text-slate-400 sm:text-[10px] sm:leading-tight">
              {t.label}
            </div>
            <div
              className={cn(
                'truncate text-sm font-bold leading-tight sm:text-base',
                toneClass[t.tone || 'default'],
              )}
            >
              {t.value}
            </div>
            {t.hint ? (
              <div
                className="mt-0.5 hidden truncate text-[10px] leading-tight text-slate-400 sm:block"
                title={t.hint}
              >
                {t.hint}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

/** Map Full Tanks CycleKpis to display tiles (clipped totals from trustedPeriodTotals preferred by caller). */
export function cycleKpisToTiles(
  kpis: CycleKpis,
  opts?: { distanceKm?: number; exceptionsActive?: boolean },
): KpiTile[] {
  const distance = opts?.distanceKm ?? kpis.totalDistance;
  return [
    { id: 'cycles', label: 'Cycles', value: String(kpis.totalCycles), hint: `${kpis.completed} done · ${kpis.active} active` },
    { id: 'distance', label: 'Period distance', value: `${Math.round(distance).toLocaleString()} km` },
    { id: 'fuel', label: 'Fuel', value: `${kpis.totalFuel.toLocaleString()} L` },
    {
      id: 'exceptions',
      label: 'Exceptions',
      value: String(kpis.exceptions),
      tone: kpis.exceptions > 0 ? 'danger' : 'success',
      filterable: kpis.exceptions > 0,
      active: opts?.exceptionsActive,
    },
  ];
}

/** Map Transaction KPIs to display tiles. */
export function transactionKpisToTiles(
  kpis: TransactionKpis,
  opts?: {
    distanceKm?: number;
    distanceHint?: string;
    integrityActive?: boolean;
    sourceHint?: string;
  },
): KpiTile[] {
  return [
    {
      id: 'fills',
      label: 'Fills',
      value: String(kpis.totalFills),
      hint: opts?.sourceHint,
    },
    { id: 'spend', label: 'Spend', value: formatFuelMoney(kpis.totalSpend, 0) },
    { id: 'volume', label: 'Volume', value: `${kpis.totalVolume.toLocaleString()} L` },
    {
      id: 'distance',
      label: 'Period distance',
      value: `${Math.round(opts?.distanceKm ?? kpis.totalKm).toLocaleString()} km`,
      hint: opts?.distanceHint,
    },
    {
      id: 'imbalanced',
      label: 'Imbalanced',
      value: String(kpis.imbalancedCount),
      tone: kpis.imbalancedCount > 0 ? 'warning' : 'default',
      hint: kpis.imbalancedCount > 0 ? 'Click to filter' : 'Ledger healthy',
      filterable: true,
      active: opts?.integrityActive,
    },
  ];
}

export default FuelLogKpiRow;
