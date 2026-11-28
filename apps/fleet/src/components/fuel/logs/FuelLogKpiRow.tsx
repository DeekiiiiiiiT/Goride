import React from 'react';
import { formatFuelMoney } from '../../../utils/formatFuelMoney';
import { cn } from '../../ui/utils';
import type { CycleKpis, TransactionKpis } from '../../../utils/fuelLogKpiMetrics';

/**
 * Summary tiles for Transaction Logs.
 * Look: Stitch docs/stitch/fuel-review-and-logs-fleet/transaction_logs_* (summary tiles).
 * Pure display — callers pass already-computed KPI objects (no data fetching here).
 * Clickable tiles call onTileClick with the tile id (e.g. 'imbalanced').
 */

export type KpiTile = {
  id: string;
  label: string;
  value: string;
  /** Small unit after the number ("km", "L"). */
  unit?: string;
  hint?: string;
  /** Material Symbols icon name for the round badge top-right. */
  icon?: string;
  /** Cash vs gas card lines under Spend. Shown only when they add up to the total. */
  split?: { cash: string; gasCard: string };
  tone?: 'default' | 'warning' | 'danger' | 'success';
  /** When set, tile is a filter control. */
  filterable?: boolean;
  active?: boolean;
};

type Tone = NonNullable<KpiTile['tone']>;

const toneCard: Record<Tone, string> = {
  default: 'bg-white dark:bg-[#2a2a2d]',
  warning: 'bg-[#fffbeb] dark:bg-[#451a03]',
  danger: 'bg-[#ffdad6] dark:bg-[#450a0a]',
  success: 'bg-white dark:bg-[#2a2a2d]',
};
const toneText: Record<Tone, string> = {
  default: 'text-[#47464c] dark:text-zinc-400',
  warning: 'text-[#b45309] dark:text-[#fbbf24]',
  danger: 'text-[#ba1a1a] dark:text-[#f87171]',
  success: 'text-[#069669] dark:text-[#34d399]',
};
const toneValue: Record<Tone, string> = {
  default: 'text-[#0d1c2e] dark:text-zinc-50',
  warning: 'text-[#b45309] dark:text-[#fbbf24]',
  danger: 'text-[#ba1a1a] dark:text-[#f87171]',
  success: 'text-[#069669] dark:text-[#34d399]',
};
const toneIcon: Record<Tone, string> = {
  default: 'bg-[#eff4ff] text-[#47464c] dark:bg-zinc-800 dark:text-zinc-300',
  warning: 'bg-[#fde68a]/60 text-[#b45309]',
  danger: 'bg-white text-[#ba1a1a]',
  success: 'bg-[#82f5c1] text-[#00714e]',
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
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        tiles.length <= 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4',
      )}
    >
      {tiles.map((t) => {
        const tone: Tone = t.tone || 'default';
        const clickable = !!onTileClick && (t.filterable || t.id === 'imbalanced' || t.id === 'exceptions');
        return (
          <div
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
              'flex flex-col gap-1 rounded-2xl p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)] transition-colors sm:p-6',
              toneCard[tone],
              clickable && 'cursor-pointer hover:ring-2 hover:ring-[#c9c5cd]',
              t.active && 'ring-2 ring-[#b45309]',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span className={cn('text-[12px] font-semibold uppercase tracking-wider', toneText[tone])}>{t.label}</span>
              {t.icon ? (
                <span
                  aria-hidden
                  className={cn(
                    'material-symbols-outlined flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[18px]',
                    toneIcon[tone],
                  )}
                >
                  {t.icon}
                </span>
              ) : null}
            </div>
            <div className={cn('truncate text-[24px] font-bold leading-tight tabular-nums sm:text-[32px]', toneValue[tone])}>
              {t.value}
              {t.unit ? <span className="ml-1.5 text-[15px] font-medium text-[#47464c] dark:text-zinc-400">{t.unit}</span> : null}
            </div>
            {t.split ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px] leading-tight">
                <span>
                  <span className="text-[#47464c] dark:text-zinc-400">Cash</span>{' '}
                  <span className="font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-100">{t.split.cash}</span>
                </span>
                <span>
                  <span className="text-[#47464c] dark:text-zinc-400">Gas Card</span>{' '}
                  <span className="font-semibold tabular-nums text-[#0d1c2e] dark:text-zinc-100">{t.split.gasCard}</span>
                </span>
              </div>
            ) : null}
            {t.hint ? (
              <div className={cn('truncate text-[13px] leading-tight', toneText[tone])} title={t.hint}>
                {t.hint}
              </div>
            ) : null}
          </div>
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
    {
      id: 'cycles',
      label: 'Full tanks',
      value: String(kpis.totalCycles),
      icon: 'local_gas_station',
      hint: `${kpis.completed} done · ${kpis.active} still filling`,
    },
    { id: 'distance', label: 'Distance', value: Math.round(distance).toLocaleString(), unit: 'km', icon: 'route' },
    {
      id: 'fuel',
      label: 'Fuel used',
      value: kpis.totalFuel.toLocaleString(),
      unit: 'L',
      icon: 'water_drop',
      hint: kpis.totalFuel > 0 && distance > 0 ? `${(distance / kpis.totalFuel).toFixed(1)} km a litre average` : undefined,
    },
    {
      id: 'exceptions',
      label: 'Needs a look',
      value: String(kpis.exceptions),
      icon: kpis.exceptions > 0 ? 'warning' : 'check',
      hint: kpis.exceptions > 0 ? 'Tap to see them' : 'Nothing to check',
      tone: kpis.exceptions > 0 ? 'warning' : 'success',
      filterable: kpis.exceptions > 0,
      active: opts?.exceptionsActive,
    },
  ];
}

/** Hide the split when it would not add up to the total on the card. */
function spendSplit(kpis: TransactionKpis): KpiTile['split'] {
  const cash = Number(kpis.cashSpend) || 0;
  const gas = Number(kpis.gasCardSpend) || 0;
  if (Math.abs(cash + gas - (Number(kpis.totalSpend) || 0)) > 0.05) return undefined;
  return {
    cash: formatFuelMoney(cash, 0),
    gasCard: formatFuelMoney(gas, 0),
  };
}

/** Map Transaction KPIs to display tiles. */
export function transactionKpisToTiles(
  kpis: TransactionKpis,
  opts?: {
    integrityActive?: boolean;
    sourceHint?: string;
  },
): KpiTile[] {
  return [
    {
      id: 'fills',
      label: 'Fills',
      value: String(kpis.totalFills),
      icon: 'local_gas_station',
      hint: opts?.sourceHint,
    },
    {
      id: 'spend',
      label: 'Spend',
      value: formatFuelMoney(kpis.totalSpend, 0),
      icon: 'payments',
      split: spendSplit(kpis),
    },
    {
      id: 'imbalanced',
      label: 'Needs fixing',
      value: String(kpis.imbalancedCount),
      icon: kpis.imbalancedCount > 0 ? 'warning' : 'check',
      tone: kpis.imbalancedCount > 0 ? 'warning' : 'success',
      hint: kpis.imbalancedCount > 0 ? 'Tap to show them' : 'All fills add up',
      filterable: true,
      active: opts?.integrityActive,
    },
  ];
}

export default FuelLogKpiRow;
