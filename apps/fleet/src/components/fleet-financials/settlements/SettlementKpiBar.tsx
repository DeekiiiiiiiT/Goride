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
  error?: boolean;
  settledOwesSub?: string;
  cashHeldSub?: string;
  fleetOwesSub?: string;
  awaitingSub?: string;
  clearedSub?: string;
  /** Direction-aware labels for awaiting / cleared tiles. */
  directionLabels?: {
    awaiting?: string;
    cleared?: string;
  };
};

/**
 * KPI strip for Driver Settlements. On error shows "—" never $0.00 (S3-5).
 */
export function SettlementKpiBar({
  settledOwes,
  cashHeld,
  fleetOwes,
  awaiting,
  cleared,
  loading,
  error,
  settledOwesSub,
  cashHeldSub,
  fleetOwesSub,
  awaitingSub,
  clearedSub,
  directionLabels,
}: SettlementKpiBarProps) {
  const display = (n: number | null | undefined) => {
    if (error) return '—';
    if (loading && (n == null || !Number.isFinite(n))) return '—';
    return MONEY(n);
  };

  const failSub = error ? 'Failed to load' : undefined;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" aria-live="polite">
      <KpiTile
        label="Driver owes (settled)"
        value={display(settledOwes)}
        sub={failSub ?? settledOwesSub}
        tone="owed"
      />
      <KpiTile
        label="Cash held (not finalized)"
        value={display(cashHeld)}
        sub={failSub ?? cashHeldSub}
        tone="pending"
      />
      <KpiTile
        label="Fleet owes"
        value={display(fleetOwes)}
        sub={failSub ?? fleetOwesSub}
        tone="pay"
      />
      <KpiTile
        label={directionLabels?.awaiting || 'Awaiting bank clear'}
        value={display(awaiting)}
        sub={failSub ?? awaitingSub}
        tone="pending"
      />
      <KpiTile
        label={directionLabels?.cleared || 'Cleared this week'}
        value={display(cleared)}
        sub={failSub ?? clearedSub}
        tone="paid"
      />
    </div>
  );
}
