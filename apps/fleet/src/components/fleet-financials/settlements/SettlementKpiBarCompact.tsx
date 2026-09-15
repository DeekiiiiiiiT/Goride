import { useState } from 'react';
import { Info } from 'lucide-react';
import { cn } from '../../ui/utils';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../../ui/sheet';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

export const SETTLEMENT_KPI_HELP = {
  driverOwes:
    'How much drivers still need to pay the fleet for the weeks in view. This is the leftover balance after each driver’s share of earnings has already been counted (for example cash trips, fees, or adjustments that leave them owing you). Tap Collect on a row when you take that money in.',
  cashHeld:
    'Passenger cash drivers are still physically holding from the road — before anyone splits shares. Think of it as float sitting with the driver that has not been brought to the office yet. Collecting it brings the cash in so the week can settle cleanly.',
  fleetOwes:
    'How much the fleet still needs to pay drivers for the weeks in view. This is the net amount owed to them after their share is calculated and deductions are applied. Tap Pay when you are ready to send that money out.',
  awaiting:
    'Money you already logged as collected from or paid to a driver, but the bank has not confirmed it cleared yet. These sit under “Awaiting clear” until the deposit or transfer settles. Until then they are not finished business.',
  cleared:
    'How much has fully cleared the bank since this Monday. This number ignores the Period filter on purpose, so you always see this week’s cleared activity at a glance (collections when you are collecting, payouts when you are paying).',
} as const;

type TileId = keyof typeof SETTLEMENT_KPI_HELP;

type CompactTile = {
  id: TileId;
  label: string;
  value: number | null | undefined;
  error?: boolean;
  tone?: 'owed' | 'pay' | 'pending' | 'paid';
};

export type SettlementKpiBarCompactProps = {
  direction: 'collect' | 'pay';
  settledOwes: number | null | undefined;
  cashHeld: number | null | undefined;
  fleetOwes: number | null | undefined;
  awaiting: number | null | undefined;
  cleared: number | null | undefined;
  loading?: boolean;
  settledOwesError?: boolean;
  cashHeldError?: boolean;
  fleetOwesError?: boolean;
  awaitingError?: boolean;
  clearedError?: boolean;
};

function displayValue(
  n: number | null | undefined,
  error: boolean | undefined,
  loading: boolean | undefined,
): string {
  if (error) return '—';
  if (loading && (n == null || !Number.isFinite(n))) return '—';
  return MONEY(n);
}

/** Mobile hero KPIs — direction-aware, help via bottom sheet. */
export function SettlementKpiBarCompact({
  direction,
  settledOwes,
  cashHeld,
  fleetOwes,
  awaiting,
  cleared,
  loading,
  settledOwesError,
  cashHeldError,
  fleetOwesError,
  awaitingError,
  clearedError,
}: SettlementKpiBarCompactProps) {
  const [helpId, setHelpId] = useState<TileId | null>(null);

  const tiles: CompactTile[] =
    direction === 'collect'
      ? [
          { id: 'driverOwes', label: 'Driver owes', value: settledOwes, error: settledOwesError, tone: 'owed' },
          { id: 'cashHeld', label: 'Cash held', value: cashHeld, error: cashHeldError, tone: 'pending' },
          { id: 'awaiting', label: 'Awaiting clear', value: awaiting, error: awaitingError, tone: 'pending' },
        ]
      : [
          { id: 'fleetOwes', label: 'Fleet owes', value: fleetOwes, error: fleetOwesError, tone: 'pay' },
          { id: 'awaiting', label: 'Awaiting clear', value: awaiting, error: awaitingError, tone: 'pending' },
          { id: 'cleared', label: 'Cleared since Mon', value: cleared, error: clearedError, tone: 'paid' },
        ];

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-live="polite">
        {tiles.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rounded-lg border border-slate-200 bg-white px-3 py-3',
              t.tone === 'owed' && 'border-l-4 border-l-rose-600',
              t.tone === 'pay' && 'border-l-4 border-l-emerald-600',
              t.tone === 'pending' && 'border-l-4 border-l-amber-500',
              t.tone === 'paid' && 'border-l-4 border-l-slate-400',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t.label}</p>
              <button
                type="button"
                className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                aria-label={`About ${t.label}`}
                onClick={() => setHelpId(t.id)}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold tabular-nums',
                t.tone === 'owed' && 'text-rose-700',
                t.tone === 'pay' && 'text-emerald-800',
                t.tone === 'pending' && 'text-amber-700',
                t.tone === 'paid' && 'text-slate-900',
              )}
            >
              {displayValue(t.value, t.error, loading)}
            </p>
          </div>
        ))}
      </div>

      <Sheet open={helpId != null} onOpenChange={(open) => !open && setHelpId(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>
              {helpId === 'driverOwes'
                ? 'Driver owes'
                : helpId === 'cashHeld'
                  ? 'Cash held'
                  : helpId === 'fleetOwes'
                    ? 'Fleet owes'
                    : helpId === 'awaiting'
                      ? 'Awaiting bank clear'
                      : 'Cleared since Monday'}
            </SheetTitle>
            <SheetDescription className="text-left text-sm leading-relaxed text-slate-600">
              {helpId ? SETTLEMENT_KPI_HELP[helpId] : null}
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </>
  );
}
