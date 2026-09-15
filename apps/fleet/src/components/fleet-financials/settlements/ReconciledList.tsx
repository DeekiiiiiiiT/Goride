import { format, parseISO } from 'date-fns';
import { Loader2, PenLine } from 'lucide-react';
import { MONEY_EPS } from '@roam/finance-core';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import {
  OVERPAID_BADGE_TOOLTIP,
  overpaidBadgeLabel,
  settledSignedLabel,
} from '../../../utils/settlementDeskUx';
import type { ReconciledTableRow } from './ReconciledTable';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function weekLabel(anchor: string, end: string) {
  try {
    return `${format(parseISO(`${anchor}T12:00:00`), 'MMM d')} – ${format(parseISO(`${end}T12:00:00`), 'MMM d, yyyy')}`;
  } catch {
    return `${anchor} – ${end}`;
  }
}

function rowOverpaidAmount(r: {
  overpaidAmount?: number;
  metadata?: Record<string, unknown> | null;
}): number {
  const direct = Number(r.overpaidAmount) || 0;
  if (direct > MONEY_EPS) return direct;
  const fc = (r.metadata?.financeCore || {}) as Record<string, unknown>;
  return Number(fc.overpaidAmount) || 0;
}

export type ReconciledListProps = {
  rows: ReconciledTableRow[];
  loading?: boolean;
  onOpenDriver?: (driverId: string) => void;
  onOpenPeriod?: (row: ReconciledTableRow) => void;
  onOpenCloseWeek?: (weekKey: string) => void;
};

/** Mobile cards for reconciled weeks. */
export function ReconciledList({
  rows,
  loading,
  onOpenDriver,
  onOpenPeriod,
  onOpenCloseWeek,
}: ReconciledListProps) {
  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading reconciled weeks…
      </div>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
        <p className="text-sm font-medium text-slate-900">No reconciled weeks in view</p>
        <p className="mt-1 text-xs text-slate-500">Closed weeks will appear here after Close Week.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const overpaid = rowOverpaidAmount(r);
        const key = `${r.driverId}|${r.periodAnchor}`;
        return (
          <li
            key={key}
            className="rounded-xl border border-slate-200 bg-white border-l-4 border-l-indigo-500 px-3 py-3 shadow-sm"
          >
            <button
              type="button"
              className="w-full text-left"
              onClick={() => onOpenPeriod?.(r)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">
                    {r.driverName || r.driverId}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {weekLabel(r.periodAnchor, r.periodEnd)}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-semibold tabular-nums text-slate-900">
                  {MONEY(r.payoutNet)}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="font-normal">
                  {settledSignedLabel(Boolean(r.periodFrozen))}
                </Badge>
                {overpaid > MONEY_EPS ? (
                  <Badge
                    variant="secondary"
                    className="font-normal bg-violet-50 text-violet-800"
                    title={OVERPAID_BADGE_TOOLTIP}
                  >
                    {overpaidBadgeLabel(overpaid)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Cash collected {MONEY(r.cashCollected)} · Fleet share {MONEY(r.fleetShare)}
              </p>
            </button>
            <div className="mt-2 flex flex-wrap gap-2">
              {onOpenDriver ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => onOpenDriver(r.driverId)}
                >
                  Driver
                </Button>
              ) : null}
              {onOpenCloseWeek ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => onOpenCloseWeek(r.periodAnchor)}
                >
                  <PenLine className="mr-1 h-3.5 w-3.5" />
                  Close Week
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
