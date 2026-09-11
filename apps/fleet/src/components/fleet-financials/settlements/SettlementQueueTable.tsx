import { useMemo, useState } from 'react';
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
import { resolvePayQueueOwed } from '../../../utils/driverSettlementsPayAmount';
import {
  isSettlementPeriodEnded,
  settlementPeriodOpenMessage,
} from '../../../utils/settlementPeriodGate';
import type { SettlementQueueRow } from '../../../hooks/useSettlementQueue';
import { useWindowedRows } from './useWindowedRows';

function weekActionable(r: Pick<SettlementQueueRow, 'periodAnchor' | 'periodEnd'>): boolean {
  return isSettlementPeriodEnded({
    periodAnchor: r.periodAnchor,
    periodEnd: r.periodEnd,
  });
}

function weekOpenTitle(r: Pick<SettlementQueueRow, 'periodAnchor' | 'periodEnd'>): string | undefined {
  if (weekActionable(r)) return undefined;
  return settlementPeriodOpenMessage({
    periodAnchor: r.periodAnchor,
    periodEnd: r.periodEnd,
  });
}

/** Reconciliation gate — fail closed when unlock flag is missing (C-5). */
function collectGateBlocked(r: Pick<SettlementQueueRow, 'moneyUnlocked'>): boolean {
  return r.moneyUnlocked !== true;
}

/** Close Week freeze — no money movements until reopen. */
function periodFrozenBlocked(r: Pick<SettlementQueueRow, 'periodFrozen'>): boolean {
  return r.periodFrozen === true;
}

const GATE_TITLE = 'Not yet reconciled — fuel must be finalized and tolls clear before Collect.';
const FROZEN_TITLE = 'Week closed — reopen on Close Week to change money';
const SEAL_BROKEN_TITLE =
  'Seal broken — close hash no longer matches; reopen on Close Week before Pay/Collect';

/** Short action-oriented chip labels — what to do, not only state. */
const CHIP_OPEN = 'Week still open — act after it ends';
const CHIP_LOCKED = 'Reconcile fuel/tolls before Collect';
const CHIP_CLOSED = 'Reopen on Close Week';
const CHIP_SEAL_BROKEN = 'Seal broken — reopen';

function sealBroken(r: Pick<SettlementQueueRow, 'sealBroken'>): boolean {
  return r.sealBroken === true;
}

/** Row block reason shown as visible helper text (U-5), not only title tooltips. */
export function settlementRowBlockReason(
  r: Pick<
    SettlementQueueRow,
    'periodAnchor' | 'periodEnd' | 'moneyUnlocked' | 'periodFrozen' | 'sealBroken'
  >,
  mode: 'collect' | 'pay',
): string | undefined {
  return actionTitle(r, mode);
}

function actionTitle(
  r: Pick<
    SettlementQueueRow,
    'periodAnchor' | 'periodEnd' | 'moneyUnlocked' | 'periodFrozen' | 'sealBroken'
  >,
  mode: 'collect' | 'pay',
): string | undefined {
  if (sealBroken(r)) return SEAL_BROKEN_TITLE;
  if (periodFrozenBlocked(r)) return FROZEN_TITLE;
  if (mode === 'collect' && collectGateBlocked(r)) return GATE_TITLE;
  return weekOpenTitle(r);
}

function blockReasonChip(
  r: Pick<
    SettlementQueueRow,
    'periodAnchor' | 'periodEnd' | 'moneyUnlocked' | 'periodFrozen' | 'sealBroken'
  >,
  mode: 'collect' | 'pay',
): { label: string; className: string } | undefined {
  if (!weekActionable(r)) {
    return { label: CHIP_OPEN, className: 'text-amber-700' };
  }
  if (sealBroken(r)) {
    return { label: CHIP_SEAL_BROKEN, className: 'text-rose-800' };
  }
  if (periodFrozenBlocked(r)) {
    return { label: CHIP_CLOSED, className: 'text-slate-600' };
  }
  if (mode === 'collect' && collectGateBlocked(r)) {
    return { label: CHIP_LOCKED, className: 'text-rose-700' };
  }
  return undefined;
}

/** U-3: Closed / Seal broken badge before Pay fails. */
function sealHealthBadge(
  r: Pick<SettlementQueueRow, 'periodFrozen' | 'sealBroken'>,
): { label: string; className: string } | undefined {
  if (sealBroken(r)) {
    return {
      label: 'Seal broken',
      className: 'bg-rose-100 text-rose-900 border border-rose-200',
    };
  }
  if (periodFrozenBlocked(r)) {
    return {
      label: 'Closed',
      className: 'bg-slate-100 text-slate-700 border border-slate-200',
    };
  }
  return undefined;
}

function blockReasonDomId(scope: string, key: string): string {
  return `sq-block-${scope}-${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Collect is allowed only when the calendar week ended AND the money is unlocked AND not frozen. */
function canCollect(
  r: Pick<
    SettlementQueueRow,
    'periodAnchor' | 'periodEnd' | 'moneyUnlocked' | 'periodFrozen' | 'sealBroken'
  >,
): boolean {
  return (
    weekActionable(r) &&
    !collectGateBlocked(r) &&
    !periodFrozenBlocked(r) &&
    !sealBroken(r)
  );
}

function canPay(
  r: Pick<SettlementQueueRow, 'periodAnchor' | 'periodEnd' | 'periodFrozen' | 'sealBroken'>,
): boolean {
  return weekActionable(r) && !periodFrozenBlocked(r) && !sealBroken(r);
}

/** Row label: before-share float vs residual after share (driver-share-first). */
function collectKindLabel(r: Pick<SettlementQueueRow, 'collectKind'>): string {
  return r.collectKind === 'cash_held' ? 'Cash held (before share)' : 'Driver owes (after share)';
}

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
  // Pay: settlementAmount is already residual — ignore amountOwed so a bad queue cannot understate.
  if (mode === 'pay') return resolvePayQueueOwed(r);
  if (r.amountOwed != null && Number.isFinite(r.amountOwed)) return Math.max(0, Number(r.amountOwed));
  if (r.amountOwedMinor != null) return Math.max(0, (Number(r.amountOwedMinor) || 0) / 100);
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
  /** Total exposure (driverOwes + cashHeld in collect; fleet owes in pay). */
  owed: number;
  /** Collect: residual after share. */
  driverOwes: number;
  /** Collect: passenger cash still with driver (before share). */
  cashHeld: number;
  oldestPeriodEnd: string;
  oldestPeriodAnchor: string;
  weekCount: number;
  /** Collect week counts by kind (U-2). */
  collectWeekCount: number;
  cashHeldWeekCount: number;
  aging: AgingBucket;
  weeks: SettlementQueueRow[];
};

function isCashHeldRow(r: Pick<SettlementQueueRow, 'collectKind'>): boolean {
  return r.collectKind === 'cash_held';
}

/** U-2: "6 collect · 2 cash held" when kinds mix. */
function weeksCountLabel(g: DriverRollup, mode: 'collect' | 'pay'): string {
  if (mode !== 'collect') return String(g.weekCount);
  const a = g.collectWeekCount;
  const b = g.cashHeldWeekCount;
  if (a > 0 && b > 0) return `${a} collect · ${b} cash held`;
  if (b > 0 && a === 0) return `${b} cash held`;
  if (a > 0) return `${a} collect`;
  return String(g.weekCount);
}

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
        driverOwes: 0,
        cashHeld: 0,
        oldestPeriodEnd: r.periodEnd,
        oldestPeriodAnchor: r.periodAnchor,
        weekCount: 0,
        collectWeekCount: 0,
        cashHeldWeekCount: 0,
        aging: agingBucket(r.periodEnd),
        weeks: [],
      };
      map.set(r.driverId, g);
    }
    g.owed += owed;
    g.weekCount += 1;
    if (mode === 'collect') {
      if (isCashHeldRow(r)) {
        g.cashHeld += owed;
        g.cashHeldWeekCount += 1;
      } else {
        g.driverOwes += owed;
        g.collectWeekCount += 1;
      }
    } else {
      g.driverOwes += owed;
    }
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
    const exposure = (b.driverOwes + b.cashHeld) - (a.driverOwes + a.cashHeld);
    if (mode === 'collect' && exposure) return exposure;
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
  /** Frozen week — open Close Week guidance instead of Pay/Collect. */
  onWeekClosed?: (row: SettlementQueueRow) => void;
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
  onWeekClosed,
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

  const actionableRows = useMemo(
    () => rows.filter((r) => (mode === 'collect' ? canCollect(r) : canPay(r))),
    [rows, mode],
  );
  const weekKeys = useMemo(() => actionableRows.map(rowKey), [actionableRows]);
  const allSelected = weekKeys.length > 0 && weekKeys.every((k) => selected.has(k));
  const someSelected = weekKeys.some((k) => selected.has(k)) && !allSelected;

  const footerOwed = useMemo(
    () => rows.reduce((s, r) => s + owedMajor(r, mode), 0),
    [rows, mode],
  );
  const footerDriverOwes = useMemo(
    () =>
      mode === 'collect'
        ? rows.reduce((s, r) => s + (isCashHeldRow(r) ? 0 : owedMajor(r, mode)), 0)
        : footerOwed,
    [rows, mode, footerOwed],
  );
  const footerCashHeld = useMemo(
    () =>
      mode === 'collect'
        ? rows.reduce((s, r) => s + (isCashHeldRow(r) ? owedMajor(r, mode) : 0), 0)
        : 0,
    [rows, mode],
  );

  const flatWindow = useWindowedRows(groupByDriver ? [] : rows);
  // P-5: flatten expanded rollups into a single row list, then window (fixed 52px rows).
  type FlatRollupItem =
    | { kind: 'header'; rollup: DriverRollup }
    | { kind: 'week'; rollupId: string; row: SettlementQueueRow };

  const flatRollupItems = useMemo((): FlatRollupItem[] => {
    if (!groupByDriver || !rollups?.length) return [];
    const out: FlatRollupItem[] = [];
    for (const g of rollups) {
      out.push({ kind: 'header', rollup: g });
      if (expanded.has(g.driverId)) {
        for (const r of g.weeks) out.push({ kind: 'week', rollupId: g.driverId, row: r });
      }
    }
    return out;
  }, [groupByDriver, rollups, expanded]);

  const rollupWindow = useWindowedRows(flatRollupItems);
  const windowed = groupByDriver ? rollupWindow : flatWindow;
  // Collect adds Cash held column (C-4 / U-1).
  const amountCols = mode === 'collect' ? 2 : 1;
  const colSpan = (groupByDriver ? 7 : 5) + amountCols;

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
              {mode === 'collect' ? (
                <>
                  <TableHead className="text-right">Driver owes</TableHead>
                  <TableHead className="text-right">Cash held</TableHead>
                </>
              ) : (
                <TableHead className="text-right">Fleet owes</TableHead>
              )}
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
                {rollupWindow.visible.map((item) => {
                  if (item.kind === 'header') {
                    const g = item.rollup;
                    const open = expanded.has(g.driverId);
                    const actionableWeeks = g.weeks.filter((w) =>
                      mode === 'collect' ? canCollect(w) : canPay(w),
                    );
                    const weekKeysForDriver = actionableWeeks.map(rowKey);
                    const firstActionable = actionableWeeks[0] || null;
                    const firstCollectable = actionableWeeks.find((w) => canCollect(w)) || null;
                    const frozenSample =
                      g.weeks.find((w) => sealBroken(w) || periodFrozenBlocked(w)) || null;
                    const parentSeal = sealHealthBadge(
                      frozenSample || { periodFrozen: false, sealBroken: false },
                    );
                    const driverAllSelected =
                      weekKeysForDriver.length > 0 &&
                      weekKeysForDriver.every((k) => selected.has(k));
                    const parentOpenTitle = firstActionable
                      ? undefined
                      : actionTitle(
                          frozenSample ||
                            g.weeks[0] || { periodAnchor: '', periodEnd: g.oldestPeriodEnd },
                          mode,
                        );
                    const headerReasonId = blockReasonDomId('h', g.driverId);
                    const headerBlocked = Boolean(parentOpenTitle);
                    const showWeekClosed =
                      Boolean(frozenSample) &&
                      (mode === 'collect' ? !firstCollectable : !firstActionable);
                    return (
                      <TableRow
                        key={`h:${g.driverId}`}
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
                            disabled={weekKeysForDriver.length === 0}
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
                            aria-describedby={
                              weekKeysForDriver.length === 0 && headerBlocked
                                ? headerReasonId
                                : undefined
                            }
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
                          <div className="flex flex-wrap items-center gap-1.5">
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
                            {parentSeal ? (
                              <Badge
                                className={cn('font-normal text-[10px]', parentSeal.className)}
                              >
                                {parentSeal.label}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {weekLabel(g.oldestPeriodAnchor, g.oldestPeriodEnd)}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-slate-600">
                          {weeksCountLabel(g, mode)}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn('font-normal', AGING_TONE[g.aging])}>{g.aging}</Badge>
                        </TableCell>
                        {mode === 'collect' ? (
                          <>
                            <TableCell className="text-right tabular-nums font-semibold text-rose-700">
                              {MONEY(g.driverOwes)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold text-amber-800">
                              {MONEY(g.cashHeld)}
                            </TableCell>
                          </>
                        ) : (
                          <TableCell className="text-right tabular-nums font-semibold text-emerald-800">
                            {MONEY(g.owed)}
                          </TableCell>
                        )}
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {showWeekClosed && frozenSample ? (
                            <div className="flex flex-col items-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                aria-describedby={headerBlocked ? headerReasonId : undefined}
                                onClick={() => onWeekClosed?.(frozenSample)}
                              >
                                {sealBroken(frozenSample) ? 'Seal broken' : 'Week closed'}
                              </Button>
                              {parentOpenTitle ? (
                                <p
                                  id={headerReasonId}
                                  className="max-w-[11rem] text-right text-[11px] leading-snug text-amber-800"
                                >
                                  {parentOpenTitle}
                                </p>
                              ) : null}
                            </div>
                          ) : mode === 'collect' ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex flex-wrap gap-1 justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 bg-rose-700 hover:bg-rose-800"
                                  disabled={!firstCollectable}
                                  aria-describedby={
                                    !firstCollectable && headerBlocked ? headerReasonId : undefined
                                  }
                                  onClick={() => firstCollectable && onCollect?.(firstCollectable)}
                                >
                                  Collect
                                </Button>
                              </div>
                              {parentOpenTitle ? (
                                <p
                                  id={headerReasonId}
                                  className="max-w-[11rem] text-right text-[11px] leading-snug text-amber-800"
                                >
                                  {parentOpenTitle}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 bg-emerald-700 hover:bg-emerald-800"
                                disabled={!firstActionable}
                                aria-describedby={
                                  !firstActionable && headerBlocked ? headerReasonId : undefined
                                }
                                onClick={() => firstActionable && onPay?.(firstActionable)}
                              >
                                Pay
                              </Button>
                              {parentOpenTitle ? (
                                <p
                                  id={headerReasonId}
                                  className="max-w-[11rem] text-right text-[11px] leading-snug text-amber-800"
                                >
                                  {parentOpenTitle}
                                </p>
                              ) : null}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  // item.kind === 'week' — sibling row in the flat window list
                  const r = item.row;
                  const k = rowKey(r);
                  const bucket = agingBucket(r.periodEnd);
                  const amt = owedMajor(r, mode);
                  const held = mode === 'collect' && isCashHeldRow(r);
                  const canAct = mode === 'collect' ? canCollect(r) : canPay(r);
                  const openTitle = actionTitle(r, mode);
                  const chip = blockReasonChip(r, mode);
                  const seal = sealHealthBadge(r);
                  const reasonId = blockReasonDomId('w', k);
                  const frozenOrBroken = periodFrozenBlocked(r) || sealBroken(r);
                  return (
                    <TableRow key={`w:${item.rollupId}:${k}`} className="bg-white">
                      <TableCell>
                        <Checkbox
                          checked={selected.has(k)}
                          disabled={!canAct}
                          onCheckedChange={() => canAct && onToggle(k)}
                          aria-label={`Select ${r.driverName} ${r.periodAnchor}`}
                          aria-describedby={!canAct && openTitle ? reasonId : undefined}
                        />
                      </TableCell>
                      <TableCell />
                      <TableCell className="text-sm text-slate-500 pl-6">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {mode === 'collect' ? collectKindLabel(r) : 'Week'}
                          {seal ? (
                            <Badge className={cn('font-normal text-[10px]', seal.className)}>
                              {seal.label}
                            </Badge>
                          ) : null}
                          {chip && !seal ? (
                            <span
                              className={cn(
                                'text-[10px] font-medium uppercase tracking-wide',
                                chip.className,
                              )}
                            >
                              {chip.label}
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {weekLabel(r.periodAnchor, r.periodEnd)}
                      </TableCell>
                      <TableCell />
                      <TableCell>
                        <Badge className={cn('font-normal', AGING_TONE[bucket])}>{bucket}</Badge>
                      </TableCell>
                      {mode === 'collect' ? (
                        <>
                          <TableCell className="text-right tabular-nums font-semibold text-rose-700">
                            {held ? '—' : MONEY(amt)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-amber-800">
                            {held ? MONEY(amt) : '—'}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell className="text-right tabular-nums font-semibold text-emerald-800">
                          {MONEY(amt)}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex flex-wrap gap-1 justify-end">
                            {frozenOrBroken ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                aria-describedby={reasonId}
                                onClick={() => onWeekClosed?.(r)}
                              >
                                {sealBroken(r) ? 'Seal broken' : 'Week closed'}
                              </Button>
                            ) : mode === 'collect' ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 bg-rose-700 hover:bg-rose-800"
                                  disabled={!canCollect(r)}
                                  aria-describedby={
                                    !canCollect(r) && openTitle ? reasonId : undefined
                                  }
                                  onClick={() => canCollect(r) && onCollect?.(r)}
                                >
                                  Collect
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  disabled={!canAct}
                                  aria-describedby={!canAct && openTitle ? reasonId : undefined}
                                  onClick={() => canAct && onWriteOff?.(r)}
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
                                disabled={!canAct}
                                aria-describedby={!canAct && openTitle ? reasonId : undefined}
                                onClick={() => canAct && onPay?.(r)}
                              >
                                Pay
                              </Button>
                            )}
                          </div>
                          {openTitle ? (
                            <p
                              id={reasonId}
                              className="text-[11px] text-slate-500 text-right max-w-[220px] leading-snug"
                            >
                              {openTitle}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
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
                const held = mode === 'collect' && isCashHeldRow(r);
                const canAct = mode === 'collect' ? canCollect(r) : canPay(r);
                const openTitle = actionTitle(r, mode);
                const chip = blockReasonChip(r, mode);
                const seal = sealHealthBadge(r);
                const reasonId = blockReasonDomId('f', k);
                const frozenOrBroken = periodFrozenBlocked(r) || sealBroken(r);
                return (
                  <TableRow key={k}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(k)}
                        disabled={!canAct}
                        onCheckedChange={() => canAct && onToggle(k)}
                        aria-label={`Select ${r.driverName}`}
                        aria-describedby={!canAct && openTitle ? reasonId : undefined}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="text-left font-medium text-slate-900 hover:text-indigo-600"
                          onClick={() => onOpenDriver?.(r.driverId)}
                        >
                          {r.driverName || r.driverId}
                        </button>
                        {seal ? (
                          <Badge className={cn('font-normal text-[10px]', seal.className)}>
                            {seal.label}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {weekLabel(r.periodAnchor, r.periodEnd)}
                      {chip && !seal ? (
                        <span
                          className={cn(
                            'ml-2 text-[10px] font-medium uppercase tracking-wide',
                            chip.className,
                          )}
                        >
                          {chip.label}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn('font-normal', AGING_TONE[bucket])}>{bucket}</Badge>
                    </TableCell>
                    {mode === 'collect' ? (
                      <>
                        <TableCell className="text-right tabular-nums font-semibold text-rose-700">
                          {held ? '—' : MONEY(amt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-amber-800">
                          {held ? MONEY(amt) : '—'}
                        </TableCell>
                      </>
                    ) : (
                      <TableCell className="text-right tabular-nums font-semibold text-emerald-800">
                        {MONEY(amt)}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {frozenOrBroken ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8"
                              aria-describedby={reasonId}
                              onClick={() => onWeekClosed?.(r)}
                            >
                              {sealBroken(r) ? 'Seal broken' : 'Week closed'}
                            </Button>
                          ) : mode === 'collect' ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 bg-rose-700 hover:bg-rose-800"
                                disabled={!canCollect(r)}
                                aria-describedby={
                                  !canCollect(r) && openTitle ? reasonId : undefined
                                }
                                onClick={() => canCollect(r) && onCollect?.(r)}
                              >
                                Collect
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={!canAct}
                                aria-describedby={!canAct && openTitle ? reasonId : undefined}
                                onClick={() => canAct && onWriteOff?.(r)}
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
                              disabled={!canAct}
                              aria-describedby={!canAct && openTitle ? reasonId : undefined}
                              onClick={() => canAct && onPay?.(r)}
                            >
                              Pay
                            </Button>
                          )}
                        </div>
                        {openTitle ? (
                          <p
                            id={reasonId}
                            className="text-[11px] text-slate-500 text-right max-w-[220px] leading-snug"
                          >
                            {openTitle}
                          </p>
                        ) : null}
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
                <TableCell
                  colSpan={groupByDriver ? 6 : 4}
                  className="text-slate-600"
                >
                  Totals ({rows.length} week{rows.length !== 1 ? 's' : ''})
                </TableCell>
                {mode === 'collect' ? (
                  <>
                    <TableCell className="text-right tabular-nums text-rose-700">
                      {MONEY(footerDriverOwes)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-amber-800">
                      {MONEY(footerCashHeld)}
                    </TableCell>
                  </>
                ) : (
                  <TableCell className="text-right tabular-nums text-emerald-800">
                    {MONEY(footerOwed)}
                  </TableCell>
                )}
                <TableCell />
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
    </div>
  );
}
