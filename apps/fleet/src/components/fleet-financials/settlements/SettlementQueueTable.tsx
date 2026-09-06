import React, { useMemo, useState } from 'react';
import { Ban, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Checkbox } from '../../ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { cn } from '../../ui/utils';
import { agingBucket, daysOverdue, type AgingBucket } from '../../../utils/settlementAging';
import { payOutstandingAmount } from '../../../utils/driverSettlementsPayAmount';
import type { SettlementQueueRow } from '../../../hooks/useSettlementQueue';
import { useWindowedRows } from './useWindowedRows';

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

function rowKey(r: Pick<SettlementQueueRow, 'driverId' | 'periodAnchor'>) {
  return `${r.driverId}|${r.periodAnchor}`;
}

function owedMajor(r: SettlementQueueRow, mode: 'collect' | 'pay'): number {
  if (r.amountOwed != null && Number.isFinite(r.amountOwed)) return Math.max(0, Number(r.amountOwed));
  if (r.amountOwedMinor != null) return Math.max(0, (Number(r.amountOwedMinor) || 0) / 100);
  if (mode === 'pay') return payOutstandingAmount(r);
  return Math.max(0, Math.abs(Number(r.settlementAmount) || 0));
}

const AGING_TONE: Record<AgingBucket, string> = {
  '0-30': 'bg-emerald-100 text-emerald-800',
  '31-60': 'bg-amber-100 text-amber-900',
  '61-90': 'bg-orange-100 text-orange-900',
  '90+': 'bg-rose-100 text-rose-900',
};

type DriverRollup = {
  driverId: string;
  driverName?: string;
  owed: number;
  oldestPeriodEnd: string;
  oldestPeriodAnchor: string;
  weekCount: number;
  aging: AgingBucket;
  weeks: SettlementQueueRow[];
};

function buildDriverRollups(rows: SettlementQueueRow[], mode: 'collect' | 'pay'): DriverRollup[] {
  const map = new Map<string, DriverRollup>();
  for (const r of rows) {
    const owed = owedMajor(r, mode);
    let g = map.get(r.driverId);
    if (!g) {
      g = {
        driverId: r.driverId,
        driverName: r.driverName,
        owed: 0,
        oldestPeriodEnd: r.periodEnd,
        oldestPeriodAnchor: r.periodAnchor,
        weekCount: 0,
        aging: agingBucket(r.periodEnd),
        weeks: [],
      };
      map.set(r.driverId, g);
    }
    g.owed += owed;
    g.weekCount += 1;
    g.weeks.push(r);
    if (String(r.periodEnd) < String(g.oldestPeriodEnd)) {
      g.oldestPeriodEnd = r.periodEnd;
      g.oldestPeriodAnchor = r.periodAnchor;
      g.aging = agingBucket(r.periodEnd);
    }
    if (!g.driverName && r.driverName) g.driverName = r.driverName;
  }
  for (const g of map.values()) {
    g.weeks.sort((a, b) => String(b.periodAnchor).localeCompare(String(a.periodAnchor)));
  }
  return [...map.values()].sort((a, b) => {
    const age = daysOverdue(b.oldestPeriodEnd) - daysOverdue(a.oldestPeriodEnd);
    if (age) return age;
    return (a.driverName || a.driverId).localeCompare(b.driverName || b.driverId, undefined, {
      sensitivity: 'base',
    });
  });
}

export type SettlementQueueTableProps = {
  rows: SettlementQueueRow[];
  mode: 'collect' | 'pay';
  loading?: boolean;
  selected: Set<string>;
  onToggle: (key: string) => void;
  onToggleAll: () => void;
  onCollect?: (row: SettlementQueueRow) => void;
  onPay?: (row: SettlementQueueRow) => void;
  onWriteOff?: (row: SettlementQueueRow) => void;
  onOpenDriver?: (driverId: string) => void;
  /** Default true — one row per driver with expandable weeks. */
  groupByDriver?: boolean;
  /** Totals for “showing N of M · $X of $Y”. */
  showingCount?: number;
  totalCount?: number;
  showingAmount?: number;
  totalAmount?: number;
};

export function SettlementQueueTable({
  rows,
  mode,
  loading,
  selected,
  onToggle,
  onToggleAll,
  onCollect,
  onPay,
  onWriteOff,
  onOpenDriver,
  groupByDriver = true,
  showingCount,
  totalCount,
  showingAmount,
  totalAmount,
}: SettlementQueueTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const rollups = useMemo(
    () => (groupByDriver ? buildDriverRollups(rows, mode) : null),
    [rows, mode, groupByDriver],
  );

  const weekKeys = useMemo(() => rows.map(rowKey), [rows]);
  const allSelected = weekKeys.length > 0 && weekKeys.every((k) => selected.has(k));
  const someSelected = weekKeys.some((k) => selected.has(k)) && !allSelected;

  const footerOwed = useMemo(
    () => rows.reduce((s, r) => s + owedMajor(r, mode), 0),
    [rows, mode],
  );

  const flatWindow = useWindowedRows(groupByDriver ? [] : rows);
  const rollupWindow = useWindowedRows(rollups || []);
  const windowed = groupByDriver ? rollupWindow : flatWindow;
  const colSpan = groupByDriver ? 8 : 6;

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showN = showingCount ?? rows.length;
  const showM = totalCount ?? rows.length;
  const showX = showingAmount ?? footerOwed;
  const showY = totalAmount ?? footerOwed;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500 tabular-nums">
        showing {showN} of {showM} · {MONEY(showX)} of {MONEY(showY)}
      </p>
      <div
        className={`rounded-lg border border-slate-200 overflow-auto bg-white ${windowed.maxHeightClass}`}
        onScroll={windowed.windowed ? windowed.onScroll : undefined}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-50 shadow-sm">
            <TableRow className="bg-slate-50">
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={onToggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              {groupByDriver ? <TableHead className="w-10" /> : null}
              <TableHead>Driver</TableHead>
              <TableHead>{groupByDriver ? 'Oldest week' : 'Settlement Week'}</TableHead>
              {groupByDriver ? <TableHead className="text-right">Weeks</TableHead> : null}
              <TableHead>Aging</TableHead>
              <TableHead className="text-right">
                {mode === 'collect' ? 'Driver owes' : 'Fleet owes'}
              </TableHead>
              <TableHead className={mode === 'collect' ? 'w-[220px]' : 'w-[120px]'} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="h-24 text-center text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="h-24 text-center text-slate-500">
                  No outstanding {mode === 'collect' ? 'collections' : 'payouts'} in this range.
                </TableCell>
              </TableRow>
            ) : groupByDriver && rollups ? (
              <>
                {rollupWindow.padTop > 0 ? (
                  <TableRow aria-hidden>
                    <TableCell
                      colSpan={colSpan}
                      style={{ height: rollupWindow.padTop, padding: 0, border: 0 }}
                    />
                  </TableRow>
                ) : null}
                {rollupWindow.visible.map((g) => {
                const open = expanded.has(g.driverId);
                const weekKeysForDriver = g.weeks.map(rowKey);
                const driverAllSelected =
                  weekKeysForDriver.length > 0 && weekKeysForDriver.every((k) => selected.has(k));
                return (
                  <React.Fragment key={g.driverId}>
                    <TableRow
                      className="bg-slate-50/80 hover:bg-slate-100"
                      tabIndex={0}
                      aria-expanded={open}
                      onClick={() => toggleExpand(g.driverId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpand(g.driverId);
                        }
                      }}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={driverAllSelected}
                          onCheckedChange={() => {
                            const allOn = weekKeysForDriver.every((k) => selected.has(k));
                            for (const k of weekKeysForDriver) {
                              if (allOn) {
                                if (selected.has(k)) onToggle(k);
                              } else if (!selected.has(k)) {
                                onToggle(k);
                              }
                            }
                          }}
                          aria-label={`Select all weeks for ${g.driverName || g.driverId}`}
                        />
                      </TableCell>
                      <TableCell className="w-10 pr-0">
                        {open ? (
                          <ChevronDown className="h-4 w-4 text-slate-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500" />
                        )}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium text-slate-900 hover:text-indigo-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDriver?.(g.driverId);
                          }}
                        >
                          {g.driverName || g.driverId}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {weekLabel(g.oldestPeriodAnchor, g.oldestPeriodEnd)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-slate-600">
                        {g.weekCount}
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('font-normal', AGING_TONE[g.aging])}>{g.aging}</Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums font-semibold',
                          mode === 'collect' ? 'text-rose-700' : 'text-emerald-800',
                        )}
                      >
                        {MONEY(g.owed)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {mode === 'collect' ? (
                          <div className="flex flex-wrap gap-1 justify-end">
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 bg-rose-700 hover:bg-rose-800"
                              onClick={() => g.weeks[0] && onCollect?.(g.weeks[0])}
                            >
                              Collect
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 bg-emerald-700 hover:bg-emerald-800"
                            onClick={() => g.weeks[0] && onPay?.(g.weeks[0])}
                          >
                            Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {open
                      ? g.weeks.map((r) => {
                          const k = rowKey(r);
                          const bucket = agingBucket(r.periodEnd);
                          const amt = owedMajor(r, mode);
                          return (
                            <TableRow key={k} className="bg-white">
                              <TableCell>
                                <Checkbox
                                  checked={selected.has(k)}
                                  onCheckedChange={() => onToggle(k)}
                                  aria-label={`Select ${r.driverName} ${r.periodAnchor}`}
                                />
                              </TableCell>
                              <TableCell />
                              <TableCell className="text-sm text-slate-500 pl-6">
                                {r.collectKind === 'cash_held' ? 'Cash held' : 'Week'}
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">
                                {weekLabel(r.periodAnchor, r.periodEnd)}
                              </TableCell>
                              <TableCell />
                              <TableCell>
                                <Badge className={cn('font-normal', AGING_TONE[bucket])}>
                                  {bucket}
                                </Badge>
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'text-right tabular-nums font-semibold',
                                  mode === 'collect' ? 'text-rose-700' : 'text-emerald-800',
                                )}
                              >
                                {MONEY(amt)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 justify-end">
                                  {mode === 'collect' ? (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="h-8 bg-rose-700 hover:bg-rose-800"
                                        onClick={() => onCollect?.(r)}
                                      >
                                        Collect
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8"
                                        onClick={() => onWriteOff?.(r)}
                                      >
                                        <Ban className="h-3.5 w-3.5 mr-1" />
                                        Write off
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-8 bg-emerald-700 hover:bg-emerald-800"
                                      onClick={() => onPay?.(r)}
                                    >
                                      Pay
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      : null}
                  </React.Fragment>
                );
              })}
                {rollupWindow.padBottom > 0 ? (
                  <TableRow aria-hidden>
                    <TableCell
                      colSpan={colSpan}
                      style={{ height: rollupWindow.padBottom, padding: 0, border: 0 }}
                    />
                  </TableRow>
                ) : null}
              </>
            ) : (
              <>
                {flatWindow.padTop > 0 ? (
                  <TableRow aria-hidden>
                    <TableCell
                      colSpan={colSpan}
                      style={{ height: flatWindow.padTop, padding: 0, border: 0 }}
                    />
                  </TableRow>
                ) : null}
                {flatWindow.visible.map((r) => {
                const k = rowKey(r);
                const bucket = agingBucket(r.periodEnd);
                const amt = owedMajor(r, mode);
                return (
                  <TableRow key={k}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(k)}
                        onCheckedChange={() => onToggle(k)}
                        aria-label={`Select ${r.driverName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left font-medium text-slate-900 hover:text-indigo-600"
                        onClick={() => onOpenDriver?.(r.driverId)}
                      >
                        {r.driverName || r.driverId}
                      </button>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {weekLabel(r.periodAnchor, r.periodEnd)}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('font-normal', AGING_TONE[bucket])}>{bucket}</Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums font-semibold',
                        mode === 'collect' ? 'text-rose-700' : 'text-emerald-800',
                      )}
                    >
                      {MONEY(amt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {mode === 'collect' ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              className="h-8 bg-rose-700 hover:bg-rose-800"
                              onClick={() => onCollect?.(r)}
                            >
                              Collect
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8"
                              onClick={() => onWriteOff?.(r)}
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              Write off
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 bg-emerald-700 hover:bg-emerald-800"
                            onClick={() => onPay?.(r)}
                          >
                            Pay
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
                {flatWindow.padBottom > 0 ? (
                  <TableRow aria-hidden>
                    <TableCell
                      colSpan={colSpan}
                      style={{ height: flatWindow.padBottom, padding: 0, border: 0 }}
                    />
                  </TableRow>
                ) : null}
              </>
            )}
          </TableBody>
          {rows.length > 0 ? (
            <TableFooter>
              <TableRow className="bg-slate-50 font-medium">
                <TableCell colSpan={groupByDriver ? 6 : 4} className="text-slate-600">
                  Totals ({rows.length} week{rows.length !== 1 ? 's' : ''})
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    mode === 'collect' ? 'text-rose-700' : 'text-emerald-800',
                  )}
                >
                  {MONEY(footerOwed)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
