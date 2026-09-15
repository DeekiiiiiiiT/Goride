import { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { cn } from '../../ui/utils';
import type { AgingBucket } from '../../../utils/settlementAging';
import type { SettlementQueueRow } from '../../../hooks/useSettlementQueue';
import {
  buildDriverRollups,
  canCollect,
  canPay,
  settlementQueueOwedMajor,
  settlementRowBlockReason,
  settlementRowKey,
  settlementWeekLabel,
} from './SettlementQueueTable';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

const AGING_TONE: Record<AgingBucket, string> = {
  '0-30': 'bg-emerald-100 text-emerald-800',
  '31-60': 'bg-amber-100 text-amber-900',
  '61-90': 'bg-orange-100 text-orange-900',
  '90+': 'bg-rose-100 text-rose-900',
};

export type SettlementQueueListProps = {
  rows: SettlementQueueRow[];
  mode: 'collect' | 'pay';
  loading?: boolean;
  selected: Set<string>;
  selectMode: boolean;
  onSelectModeChange: (on: boolean) => void;
  onToggle: (key: string) => void;
  onToggleDriverWeeks: (keys: string[], select: boolean) => void;
  onCollect?: (row: SettlementQueueRow) => void;
  onPay?: (row: SettlementQueueRow) => void;
  onWriteOff?: (row: SettlementQueueRow) => void;
  onWeekClosed?: (row: SettlementQueueRow) => void;
  onOpenDriver?: (driverId: string) => void;
  showingCount?: number;
  totalCount?: number;
  showingAmount?: number;
  totalAmount?: number;
};

/** Mobile driver cards for Outstanding queue. */
export function SettlementQueueList({
  rows,
  mode,
  loading,
  selected,
  selectMode,
  onSelectModeChange,
  onToggle,
  onToggleDriverWeeks,
  onCollect,
  onPay,
  onWriteOff,
  onWeekClosed,
  onOpenDriver,
  showingCount,
  totalCount,
  showingAmount,
  totalAmount,
}: SettlementQueueListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const rollups = useMemo(() => buildDriverRollups(rows, mode), [rows, mode]);

  const footerOwed = useMemo(
    () => rows.reduce((s, r) => s + settlementQueueOwedMajor(r, mode), 0),
    [rows, mode],
  );
  const showN = showingCount ?? rows.length;
  const showM = totalCount ?? rows.length;
  const showX = showingAmount ?? footerOwed;
  const showY = totalAmount ?? footerOwed;

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading queue…
      </div>
    );
  }

  if (!loading && rollups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-medium text-slate-900">
          {mode === 'collect' ? 'No one owes you in this period' : 'You owe no drivers in this period'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Change the period or turn on All open if you expect open weeks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500 tabular-nums">
          showing {showN} of {showM} · {MONEY(showX)} of {MONEY(showY)}
        </p>
        <Button
          type="button"
          size="sm"
          variant={selectMode ? 'secondary' : 'outline'}
          className="h-8"
          onClick={() => onSelectModeChange(!selectMode)}
        >
          {selectMode ? (
            <>
              <Check className="mr-1 h-3.5 w-3.5" />
              Done
            </>
          ) : (
            'Select'
          )}
        </Button>
      </div>

      <ul className="space-y-3">
        {rollups.map((g) => {
          const actionable = g.weeks.filter((w) => (mode === 'collect' ? canCollect(w) : canPay(w)));
          const keys = actionable.map(settlementRowKey);
          const allSelected = keys.length > 0 && keys.every((k) => selected.has(k));
          const isOpen = expanded.has(g.driverId);
          const primaryWeek = actionable[0] || g.weeks[0];
          const accent =
            mode === 'collect'
              ? g.cashHeld > 0 && g.driverOwes <= 0
                ? 'border-l-amber-500'
                : 'border-l-rose-600'
              : 'border-l-emerald-600';

          return (
            <li
              key={g.driverId}
              className={cn(
                'overflow-hidden rounded-xl border border-slate-200 bg-white border-l-4 shadow-sm',
                accent,
              )}
            >
              <div className="flex gap-3 p-3">
                {selectMode ? (
                  <Checkbox
                    className="mt-1"
                    checked={allSelected}
                    disabled={keys.length === 0}
                    onCheckedChange={() => onToggleDriverWeeks(keys, !allSelected)}
                    aria-label={`Select ${g.driverName || g.driverId}`}
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => onOpenDriver?.(g.driverId)}
                    >
                      <p className="truncate font-semibold text-slate-900">
                        {g.driverName || g.driverId}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {settlementWeekLabel(g.oldestPeriodAnchor, g.oldestPeriodEnd)}
                        {' · '}
                        {g.weekCount} week{g.weekCount === 1 ? '' : 's'}
                      </p>
                    </button>
                    <Badge className={cn('shrink-0 font-normal', AGING_TONE[g.aging])}>{g.aging}</Badge>
                  </div>

                  {mode === 'collect' ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {g.driverOwes > 0 ? (
                        <span>
                          <span className="text-slate-500">Owes </span>
                          <span className="font-semibold tabular-nums text-rose-700">
                            {MONEY(g.driverOwes)}
                          </span>
                        </span>
                      ) : null}
                      {g.cashHeld > 0 ? (
                        <span>
                          <span className="text-slate-500">Held </span>
                          <span className="font-semibold tabular-nums text-amber-700">
                            {MONEY(g.cashHeld)}
                          </span>
                        </span>
                      ) : null}
                      {g.driverOwes <= 0 && g.cashHeld <= 0 ? (
                        <span className="font-semibold tabular-nums text-slate-700">{MONEY(0)}</span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xl font-semibold tabular-nums text-emerald-800">
                      {MONEY(g.owed)}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {!selectMode && primaryWeek ? (
                      mode === 'collect' ? (
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 bg-rose-700 hover:bg-rose-800"
                          disabled={!canCollect(primaryWeek)}
                          title={settlementRowBlockReason(primaryWeek, 'collect')}
                          onClick={() => {
                            if (primaryWeek.periodFrozen) {
                              onWeekClosed?.(primaryWeek);
                              return;
                            }
                            if (canCollect(primaryWeek)) onCollect?.(primaryWeek);
                          }}
                        >
                          <ArrowDownLeft className="mr-1 h-4 w-4" />
                          Collect
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 bg-emerald-700 hover:bg-emerald-800"
                          disabled={!canPay(primaryWeek)}
                          title={settlementRowBlockReason(primaryWeek, 'pay')}
                          onClick={() => {
                            if (primaryWeek.periodFrozen) {
                              onWeekClosed?.(primaryWeek);
                              return;
                            }
                            if (canPay(primaryWeek)) onPay?.(primaryWeek);
                          }}
                        >
                          <ArrowUpRight className="mr-1 h-4 w-4" />
                          Pay
                        </Button>
                      )
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-9 px-2"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(g.driverId)) next.delete(g.driverId);
                          else next.add(g.driverId);
                          return next;
                        })
                      }
                    >
                      {isOpen ? (
                        <ChevronDown className="mr-1 h-4 w-4" />
                      ) : (
                        <ChevronRight className="mr-1 h-4 w-4" />
                      )}
                      Weeks
                    </Button>
                  </div>
                </div>
              </div>

              {isOpen ? (
                <ul className="space-y-2 border-t border-slate-100 bg-slate-50/80 px-3 py-2">
                  {g.weeks.map((r) => {
                    const key = settlementRowKey(r);
                    const canAct = mode === 'collect' ? canCollect(r) : canPay(r);
                    const block = settlementRowBlockReason(r, mode);
                    const owed = settlementQueueOwedMajor(r, mode);
                    return (
                      <li
                        key={key}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2">
                          {selectMode ? (
                            <Checkbox
                              className="mt-0.5"
                              checked={selected.has(key)}
                              disabled={!canAct}
                              onCheckedChange={() => onToggle(key)}
                              aria-label={`Select week ${r.periodAnchor}`}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-800">
                              {settlementWeekLabel(r.periodAnchor, r.periodEnd)}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {r.collectKind === 'cash_held' ? 'Cash held' : mode === 'collect' ? 'Driver owes' : 'Fleet owes'}
                              {' · '}
                              <span className="font-semibold tabular-nums text-slate-800">
                                {MONEY(owed)}
                              </span>
                            </p>
                            {block ? (
                              <p className="mt-1 text-[11px] text-amber-700">{block}</p>
                            ) : null}
                            {!selectMode ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {mode === 'collect' ? (
                                  <>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-8 bg-rose-700 hover:bg-rose-800"
                                      disabled={!canAct}
                                      onClick={() => {
                                        if (r.periodFrozen) onWeekClosed?.(r);
                                        else if (canAct) onCollect?.(r);
                                      }}
                                    >
                                      Collect
                                    </Button>
                                    {onWriteOff ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8"
                                        disabled={!canAct}
                                        onClick={() => canAct && onWriteOff(r)}
                                      >
                                        <Ban className="mr-1 h-3.5 w-3.5" />
                                        Write off
                                      </Button>
                                    ) : null}
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 bg-emerald-700 hover:bg-emerald-800"
                                    disabled={!canAct}
                                    onClick={() => {
                                      if (r.periodFrozen) onWeekClosed?.(r);
                                      else if (canAct) onPay?.(r);
                                    }}
                                  >
                                    Pay
                                  </Button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
