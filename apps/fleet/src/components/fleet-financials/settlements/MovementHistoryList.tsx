import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Trash2 } from 'lucide-react';
import { periodEndForAnchor } from '@roam/finance-core';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import type { SettlementMovementRow } from './MovementHistoryTable';
import type { WeekCashSummary } from '../../../utils/settlementWeekCashSummary';
import { WeekCashStatsLine } from './WeekCashStatsLine';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function dateLabel(value?: string) {
  if (!value) return '—';
  try {
    return format(parseISO(`${String(value).slice(0, 10)}T12:00:00`), 'MMM d, yyyy');
  } catch {
    return String(value).slice(0, 10);
  }
}

function weekLabel(anchor: string, end: string) {
  try {
    return `${format(parseISO(`${anchor}T12:00:00`), 'MMM d')} – ${format(parseISO(`${end}T12:00:00`), 'MMM d, yyyy')}`;
  } catch {
    return `${anchor} – ${end}`;
  }
}

export type MovementHistoryListProps = {
  rows: SettlementMovementRow[];
  mode?: 'collect' | 'pay' | 'all';
  onOpenDriver?: (driverId: string) => void;
  onVerify?: (row: SettlementMovementRow) => void;
  onRequestUndo?: (row: SettlementMovementRow) => void;
  emptyTitle?: string;
  emptyHint?: string;
  /** Collect: passenger / returned / held by week. */
  weekCashByAnchor?: Record<string, WeekCashSummary>;
};

/** Mobile card list for Awaiting / Cash logged / Paid out. */
export function MovementHistoryList({
  rows,
  mode = 'all',
  onOpenDriver,
  onVerify,
  onRequestUndo,
  emptyTitle = 'Nothing here yet',
  emptyHint = 'Movements will show up after you Collect or Pay.',
  weekCashByAnchor,
}: MovementHistoryListProps) {
  const weekOrder = useMemo(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      const a = String(row.periodAnchor || '').slice(0, 10);
      if (a) keys.add(a);
    }
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-medium text-slate-900">{emptyTitle}</p>
        <p className="mt-1 text-xs text-slate-500">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {mode === 'collect' && weekOrder.length > 0 ? (
        <ul className="space-y-2">
          {weekOrder.map((anchor) => {
            const cash = weekCashByAnchor?.[anchor];
            if (!cash) return null;
            const end = periodEndForAnchor(anchor);
            return (
              <li
                key={`cash:${anchor}`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-800">{weekLabel(anchor, end)}</p>
                <WeekCashStatsLine cash={cash} />
              </li>
            );
          })}
        </ul>
      ) : null}
    <ul className="space-y-3">
      {rows.map((row) => (
        <li
          key={row.id}
          className="rounded-xl border border-slate-200 bg-white border-l-4 border-l-slate-300 px-3 py-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              className="min-w-0 text-left"
              onClick={() => row.driverId && onOpenDriver?.(row.driverId)}
              disabled={!row.driverId}
            >
              <p className="truncate font-semibold text-slate-900">
                {row.driverName || row.driverId || 'Unknown driver'}
              </p>
              <p className="text-[11px] text-slate-500">{dateLabel(row.date)}</p>
            </button>
            <p className="shrink-0 text-lg font-semibold tabular-nums text-slate-900">
              {MONEY(row.amount)}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-normal capitalize">
              {String(row.kind || 'movement').replace(/_/g, ' ')}
            </Badge>
            {row.status ? (
              <Badge variant="outline" className="font-normal capitalize">
                {row.status}
              </Badge>
            ) : null}
            {row.method ? (
              <span className="text-[11px] text-slate-500">{row.method}</span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {onVerify && String(row.status || '').toLowerCase() === 'pending' ? (
              <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => onVerify(row)}>
                Verify clear
              </Button>
            ) : null}
            {onRequestUndo ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-rose-700"
                onClick={() => onRequestUndo(row)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Undo
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
    </div>
  );
}
