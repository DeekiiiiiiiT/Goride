import React from 'react';
import { format, parseISO } from 'date-fns';
import { Loader2, PenLine } from 'lucide-react';
import { MONEY_EPS } from '@roam/finance-core';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { OVERPAID_BADGE_TOOLTIP, overpaidBadgeLabel, SETTLED_NOT_SIGNED_TOOLTIP, settledSignedLabel } from '../../../utils/settlementDeskUx';
import { useWindowedRows } from './useWindowedRows';
import { cn } from '../../ui/utils';

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

function rowKey(r: Pick<ReconciledTableRow, 'driverId' | 'periodAnchor'>) {
  return `${r.driverId}|${r.periodAnchor}`;
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

function OverpaidBadge({ amount }: { amount: number }) {
  if (amount <= MONEY_EPS) return null;
  return (
    <Badge
      variant="secondary"
      className="font-normal bg-violet-50 text-violet-800"
      title={OVERPAID_BADGE_TOOLTIP}
    >
      {overpaidBadgeLabel(amount)}
    </Badge>
  );
}

export type ReconciledTableRow = {
  driverId: string;
  driverName?: string;
  periodAnchor: string;
  periodEnd: string;
  earningsGross: number;
  fleetShare: number;
  driverShare: number;
  tipsPaidToDriver?: number;
  tipsWithheld?: number;
  payoutNet: number;
  cashCollected: number;
  cashReturned?: number;
  tripCount: number;
  overpaidAmount?: number;
  cashSourceMismatch?: number;
  /** Close Week freeze — Settled · signed vs Settled · not signed. */
  periodFrozen?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type ReconciledTableProps = {
  rows: ReconciledTableRow[];
  loading: boolean;
  onOpenDriver?: (id: string) => void;
  onOpenPeriod: (r: ReconciledTableRow) => void;
  /** Settled · not signed → Close Week for that period. */
  onOpenCloseWeek?: (periodAnchor: string) => void;
};

const COL_SPAN = 13;

export function ReconciledTable({
  rows,
  loading,
  onOpenDriver,
  onOpenPeriod,
  onOpenCloseWeek,
}: ReconciledTableProps) {
  const { visible, padTop, padBottom, windowed, onScroll, maxHeightClass } = useWindowedRows(rows);

  return (
    <div
      className={`rounded-lg border border-slate-200 overflow-auto bg-white ${maxHeightClass}`}
      onScroll={windowed ? onScroll : undefined}
    >
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-sm">
          <TableRow className="bg-slate-50">
            <TableHead>Driver</TableHead>
            <TableHead>Settlement Week</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Fleet share</TableHead>
            <TableHead className="text-right">Driver share</TableHead>
            <TableHead className="text-right">Tips paid</TableHead>
            <TableHead className="text-right">Tips withheld</TableHead>
            <TableHead className="text-right">Net payout</TableHead>
            <TableHead className="text-right">Passenger cash</TableHead>
            <TableHead className="text-right">Cash returned</TableHead>
            <TableHead className="text-right">Trips</TableHead>
            <TableHead className="text-right">Overpaid</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={COL_SPAN} className="h-24 text-center text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COL_SPAN} className="h-24 text-center text-slate-500">
                No reconciled weeks in this range.
              </TableCell>
            </TableRow>
          ) : (
            <>
              {padTop > 0 ? (
                <TableRow aria-hidden>
                  <TableCell colSpan={COL_SPAN} style={{ height: padTop, padding: 0, border: 0 }} />
                </TableRow>
              ) : null}
              {visible.map((r) => {
                const overpaid = rowOverpaidAmount(r);
                return (
                  <TableRow
                    key={rowKey(r)}
                    className="cursor-pointer hover:bg-slate-50/80"
                    onClick={() => onOpenPeriod(r)}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium text-slate-900 hover:underline"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDriver?.(r.driverId);
                        }}
                      >
                        {r.driverName || r.driverId}
                      </button>
                    </TableCell>
                    <TableCell className="text-slate-600 whitespace-nowrap">
                      {weekLabel(r.periodAnchor, r.periodEnd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{MONEY(r.earningsGross)}</TableCell>
                    <TableCell className="text-right tabular-nums text-indigo-700">
                      {MONEY(r.fleetShare)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700">
                      {MONEY(r.driverShare)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-700">
                      {MONEY(r.tipsPaidToDriver || 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-800">
                      {MONEY(r.tipsWithheld || 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {MONEY(r.payoutNet)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{MONEY(r.cashCollected)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {MONEY(r.cashReturned || 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {r.tripCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-violet-800">
                      {overpaid > MONEY_EPS ? MONEY(overpaid) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {r.periodFrozen ? (
                          <Badge
                            variant="secondary"
                            className="font-normal bg-emerald-50 text-emerald-800 border border-emerald-100"
                          >
                            {settledSignedLabel(true)}
                          </Badge>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            title={SETTLED_NOT_SIGNED_TOOLTIP}
                            className={cn(
                              'h-8 gap-1.5 rounded-md border border-amber-400/80 bg-amber-100 px-2.5 text-xs font-semibold text-amber-950',
                              'shadow-[0_2px_0_0_rgb(217,119,6)] hover:bg-amber-200 hover:shadow-[0_3px_0_0_rgb(180,83,9)]',
                              'active:translate-y-[1px] active:shadow-[0_1px_0_0_rgb(180,83,9)]',
                              'focus-visible:ring-2 focus-visible:ring-amber-500/40',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenCloseWeek?.(r.periodAnchor);
                            }}
                          >
                            <PenLine className="size-3.5 shrink-0" aria-hidden />
                            {settledSignedLabel(false)}
                          </Button>
                        )}
                        <OverpaidBadge amount={overpaid} />
                        {Math.abs(Number(r.cashSourceMismatch) || 0) > 0.5 ? (
                          <span className="text-[10px] text-amber-700">
                            Cash source mismatch {MONEY(r.cashSourceMismatch)} — does not block Pay;
                            accept on Close Week before freeze
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {padBottom > 0 ? (
                <TableRow aria-hidden>
                  <TableCell colSpan={COL_SPAN} style={{ height: padBottom, padding: 0, border: 0 }} />
                </TableRow>
              ) : null}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
