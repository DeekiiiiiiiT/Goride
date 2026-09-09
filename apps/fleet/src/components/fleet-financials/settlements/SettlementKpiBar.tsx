import { cn } from '../../ui/utils';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'owed' | 'pay' | 'pending' | 'paid';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
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
      <KpiTile label="Driver owes (after share)" value={a.value} sub={a.sub} tone="owed" />
      <KpiTile label="Cash held (before share)" value={b.value} sub={b.sub} tone="pending" />
      <KpiTile label="Fleet owes (after share)" value={c.value} sub={c.sub} tone="pay" />
      <KpiTile
        label={directionLabels?.awaiting || 'Awaiting bank clear'}
        value={d.value}
        sub={d.sub}
        tone="pending"
      />
      <KpiTile
        label={directionLabels?.cleared || 'Cleared since Monday'}
        value={e.value}
        sub={e.sub}
        tone="paid"
      />
    </div>
  );
}
