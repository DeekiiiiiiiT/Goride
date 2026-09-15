import { Info } from 'lucide-react';
import { cn } from '../../ui/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../ui/tooltip';
import { SETTLEMENT_KPI_HELP } from './SettlementKpiBarCompact';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

const KPI_TOOLTIPS = SETTLEMENT_KPI_HELP;

function KpiTile({
  label,
  tooltip,
  value,
  sub,
  tone,
}: {
  label: string;
  tooltip: string;
  value: string;
  sub?: string;
  tone?: 'owed' | 'pay' | 'pending' | 'paid';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="mt-0.5 shrink-0 rounded text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              aria-label={`About ${label}`}
            >
              <Info className="h-3.5 w-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-left leading-relaxed">
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums mt-1',
          tone === 'owed' && 'text-rose-700',
          tone === 'pay' && 'text-emerald-800',
          tone === 'pending' && 'text-amber-700',
          tone === 'paid' && 'text-slate-900',
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p> : null}
    </div>
  );
}

export type SettlementKpiBarProps = {
  settledOwes: number | null | undefined;
  cashHeld: number | null | undefined;
  fleetOwes: number | null | undefined;
  awaiting: number | null | undefined;
  cleared: number | null | undefined;
  loading?: boolean;
  /** @deprecated Prefer per-tile error flags — a single error blanked healthy KPIs. */
  error?: boolean;
  settledOwesError?: boolean;
  cashHeldError?: boolean;
  fleetOwesError?: boolean;
  awaitingError?: boolean;
  clearedError?: boolean;
  settledOwesSub?: string;
  cashHeldSub?: string;
  fleetOwesSub?: string;
  awaitingSub?: string;
  clearedSub?: string;
  directionLabels?: {
    awaiting?: string;
    cleared?: string;
  };
};

/**
 * KPI strip for Driver Settlements. On error shows "—" never $0.00 (S3-5).
 * Errors are per-tile so a failed tx history fetch does not blank Collect totals.
 */
export function SettlementKpiBar({
  settledOwes,
  cashHeld,
  fleetOwes,
  awaiting,
  cleared,
  loading,
  error,
  settledOwesError,
  cashHeldError,
  fleetOwesError,
  awaitingError,
  clearedError,
  settledOwesSub,
  cashHeldSub,
  fleetOwesSub,
  awaitingSub,
  clearedSub,
  directionLabels,
}: SettlementKpiBarProps) {
  const tile = (
    n: number | null | undefined,
    tileError: boolean | undefined,
    sub: string | undefined,
  ) => {
    const failed = Boolean(error || tileError);
    if (failed) return { value: '—', sub: 'Failed to load' };
    if (loading && (n == null || !Number.isFinite(n))) return { value: '—', sub };
    return { value: MONEY(n), sub };
  };

  const a = tile(settledOwes, settledOwesError, settledOwesSub);
  const b = tile(cashHeld, cashHeldError, cashHeldSub);
  const c = tile(fleetOwes, fleetOwesError, fleetOwesSub);
  const d = tile(awaiting, awaitingError, awaitingSub);
  const e = tile(cleared, clearedError, clearedSub);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" aria-live="polite">
      <KpiTile
        label="Driver owes"
        tooltip={KPI_TOOLTIPS.driverOwes}
        value={a.value}
        sub={a.sub}
        tone="owed"
      />
      <KpiTile
        label="Cash held"
        tooltip={KPI_TOOLTIPS.cashHeld}
        value={b.value}
        sub={b.sub}
        tone="pending"
      />
      <KpiTile
        label="Fleet owes"
        tooltip={KPI_TOOLTIPS.fleetOwes}
        value={c.value}
        sub={c.sub}
        tone="pay"
      />
      <KpiTile
        label={directionLabels?.awaiting || 'Awaiting bank clear'}
        tooltip={KPI_TOOLTIPS.awaiting}
        value={d.value}
        sub={d.sub}
        tone="pending"
      />
      <KpiTile
        label={directionLabels?.cleared || 'Cleared since Monday'}
        tooltip={KPI_TOOLTIPS.cleared}
        value={e.value}
        sub={e.sub}
        tone="paid"
      />
    </div>
  );
}
