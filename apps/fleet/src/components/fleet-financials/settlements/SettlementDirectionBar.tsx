import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Plus } from 'lucide-react';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';

export type SettlementDeskMode = 'collect' | 'pay' | 'reconciled';

export type SettlementDirectionBarProps = {
  deskMode: SettlementDeskMode;
  onDeskModeChange: (mode: SettlementDeskMode) => void;
  /** Opens Log cash picker overlay (Collect lane only). */
  onLogCash?: () => void;
  /** Mobile: hide Reconciled / Log cash (moved to More). */
  compact?: boolean;
  className?: string;
};

/** Collect / Pay / Reconciled / Log cash — shared chrome for cash desk. */
export function SettlementDirectionBar({
  deskMode,
  onDeskModeChange,
  onLogCash,
  compact = false,
  className,
}: SettlementDirectionBarProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('flex flex-wrap gap-2 items-center')}>
        <Button
          type="button"
          size="sm"
          variant={deskMode === 'collect' ? 'default' : 'outline'}
          className={cn('h-9', deskMode === 'collect' && 'bg-rose-700 hover:bg-rose-800')}
          onClick={() => onDeskModeChange('collect')}
          title="Money drivers owe you"
        >
          <ArrowDownLeft className="h-4 w-4 mr-1.5" />
          Collect
        </Button>
        <Button
          type="button"
          size="sm"
          variant={deskMode === 'pay' ? 'default' : 'outline'}
          className={cn('h-9', deskMode === 'pay' && 'bg-emerald-700 hover:bg-emerald-800')}
          onClick={() => onDeskModeChange('pay')}
          title="Money you owe drivers"
        >
          <ArrowUpRight className="h-4 w-4 mr-1.5" />
          Pay
        </Button>
        {!compact ? (
          <>
            <Button
              type="button"
              size="sm"
              variant={deskMode === 'reconciled' ? 'default' : 'outline'}
              className={cn('h-9', deskMode === 'reconciled' && 'bg-indigo-700 hover:bg-indigo-800')}
              onClick={() => onDeskModeChange('reconciled')}
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Reconciled
            </Button>
            {deskMode === 'collect' && onLogCash ? (
              <Button type="button" size="sm" variant="outline" className="h-9" onClick={onLogCash}>
                <Plus className="h-4 w-4 mr-1.5" />
                Log cash
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
      {(deskMode === 'collect' || deskMode === 'pay') && !compact ? (
        <p className="text-xs text-slate-500">
          {deskMode === 'collect'
            ? 'Collect = money drivers owe you'
            : 'Pay = money you owe drivers'}
        </p>
      ) : null}
    </div>
  );
}

/** Mobile segmented Collect | Pay control. */
export function SettlementCollectPaySegment({
  direction,
  onChange,
  className,
}: {
  direction: 'collect' | 'pay';
  onChange: (d: 'collect' | 'pay') => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900',
        className,
      )}
      role="tablist"
      aria-label="Cash desk direction"
    >
      <button
        type="button"
        role="tab"
        aria-selected={direction === 'collect'}
        className={cn(
          'min-h-10 rounded-md text-sm font-semibold transition-colors',
          direction === 'collect'
            ? 'bg-rose-700 text-white shadow-sm'
            : 'text-slate-600 hover:text-slate-900',
        )}
        onClick={() => onChange('collect')}
      >
        Collect
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={direction === 'pay'}
        className={cn(
          'min-h-10 rounded-md text-sm font-semibold transition-colors',
          direction === 'pay'
            ? 'bg-emerald-700 text-white shadow-sm'
            : 'text-slate-600 hover:text-slate-900',
        )}
        onClick={() => onChange('pay')}
      >
        Pay
      </button>
    </div>
  );
}
