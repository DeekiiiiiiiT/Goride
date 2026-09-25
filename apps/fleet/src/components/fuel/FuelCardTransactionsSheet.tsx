import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useIsMobile } from '../ui/use-mobile';
import { cn } from '../ui/utils';
import { FuelCard, FuelEntry } from '../../types/fuel';
import type { StationProfile } from '../../types/station';
import { fuelService } from '../../services/fuelService';
import { getCustomerFacingFuelProvider } from '../../utils/fuelCardDisplay';
import { normalizeFuelCardCode } from '../../utils/fuelCardMatch';
import {
  currentFuelWeekRange,
  fuelListWindow,
  generateFuelWeekOptions,
  toEntryYmd,
} from '../../utils/fuelWeekPeriod';
import { isJaaStatementLedgerRow, computeGasCardStatementDriftSummary, isUnlinkedCardCharge } from '../../utils/jaaFuelStatementMatcher';
import { resolveCardTransactionStation } from '../../utils/jaaStationDisplay';
import { FuelCardAssignmentHistoryList } from './FuelCardAssignmentHistoryList';

interface FuelCardTransactionsSheetProps {
  card: FuelCard | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getDriverName: (id?: string) => string;
  getVehicleName: (id?: string) => string;
  isRoamManaged?: boolean;
}

function entryYmd(entry: FuelEntry): string {
  const raw = String(entry.date || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

function money(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `$${Number(n).toFixed(2)}`;
}

function liters(n: number | undefined | null): string {
  if (n == null || Number.isNaN(Number(n)) || Number(n) <= 0) return '—';
  return Number(n).toFixed(2);
}

function meta(entry: FuelEntry): Record<string, unknown> {
  return (entry.metadata || {}) as Record<string, unknown>;
}

function rowKindBadge(entry: FuelEntry) {
  const m = meta(entry);
  const kind = String(m.jaaRowKind || '');
  const isMatched = Boolean(m.jaaMatchedDriverEntryId || m.jaaMatchedStatementId);

  let kindBadge: React.ReactNode;
  if (kind === 'fee') {
    kindBadge = <Badge variant="outline" className="bg-slate-50 text-slate-600">Fee</Badge>;
  } else if (kind === 'declined') {
    kindBadge = (
      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Declined</Badge>
    );
  } else if (m.awaitingCardStatement) {
    kindBadge = (
      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
        Awaiting statement
      </Badge>
    );
  } else if (kind === 'approved_fuel') {
    kindBadge = (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Fuel</Badge>
    );
  } else if (entry.type === 'Card_Transaction') {
    kindBadge = (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Statement</Badge>
    );
  } else {
    kindBadge = <Badge variant="outline">Roam log</Badge>;
  }

  const isUnmatchedApproved =
    kind === 'approved_fuel' &&
    !isMatched &&
    !m.adoptionDismissedAt &&
    (Number(entry.amount) || 0) > 0;

  if (!isMatched && !isUnmatchedApproved) return kindBadge;

  return (
    <div className="flex flex-col gap-1 items-start">
      {kindBadge}
      {isMatched ? (
        <Badge
          variant="outline"
          className="bg-sky-50 text-sky-800 border-sky-200"
          title="Linked to a driver Gas Card log"
        >
          Matched
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="bg-amber-100 text-amber-800 border-amber-200"
          title="Approved card charge with no linked Transaction Log — review and Accept"
        >
          Unmatched
        </Badge>
      )}
    </div>
  );
}

function defaultWeekBounds(): { start: string; end: string } {
  const range = currentFuelWeekRange();
  return { start: toEntryYmd(range.from), end: toEntryYmd(range.to) };
}

export function FuelCardTransactionsSheet({
  card,
  open,
  onOpenChange,
  getDriverName,
  getVehicleName,
  isRoamManaged = false,
}: FuelCardTransactionsSheetProps) {
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  /** Statement + ops rows for this card in the loaded window (drift control). */
  const [cardPeriodEntries, setCardPeriodEntries] = useState<FuelEntry[]>([]);
  const [entryById, setEntryById] = useState<Map<string, FuelEntry>>(new Map());
  const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
  // YMD strings — avoid Date identity churn / custom portal picker inside Sheet (freezes UI)
  const [periodStart, setPeriodStart] = useState(() => defaultWeekBounds().start);
  const [periodEnd, setPeriodEnd] = useState(() => defaultWeekBounds().end);
  const [sheetTab, setSheetTab] = useState<'transactions' | 'assignments'>('transactions');

  const weekOptions = useMemo(() => generateFuelWeekOptions(12), []);

  useEffect(() => {
    if (!open) return;
    const bounds = defaultWeekBounds();
    setPeriodStart(bounds.start);
    setPeriodEnd(bounds.end);
    setSheetTab('transactions');
  }, [open, card?.id]);

  useEffect(() => {
    if (!open || !card || !periodStart || !periodEnd) return;
    let cancelled = false;
    setLoading(true);
    const win = fuelListWindow({
      startYmd: periodStart,
      endYmd: periodEnd,
    });
    Promise.all([
      fuelService.getFuelEntries({ ...win, limit: 500 }),
      fuelService.getStations().catch(() => [] as StationProfile[]),
    ])
      .then(([all, stations]) => {
        if (cancelled) return;
        setVerifiedStations(
          (stations || []).filter(
            (s) => !s.status || s.status === 'verified',
          ) as StationProfile[],
        );
        setEntryById(new Map(all.map((e) => [e.id, e])));
        const needle = normalizeFuelCardCode(card.cardNumber);
        const belongsToCard = (e: FuelEntry) => {
          if (e.cardId && e.cardId === card.id) return true;
          const code = normalizeFuelCardCode(String(meta(e).jaaCardCode || ''));
          return !!needle && !!code && code === needle;
        };
        const forCard = all.filter(belongsToCard);
        setCardPeriodEntries(forCard);
        const mine = forCard
          .filter((e) => isJaaStatementLedgerRow(e))
          .sort((a, b) => {
            const ad = new Date(a.date.includes('T') ? a.date : `${a.date}T12:00:00`).getTime();
            const bd = new Date(b.date.includes('T') ? b.date : `${b.date}T12:00:00`).getTime();
            return bd - ad;
          });
        setEntries(mine);
      })
      .catch((err) => {
        console.error('[FuelCardTransactionsSheet] load failed', err);
        if (!cancelled) {
          setEntries([]);
          setCardPeriodEntries([]);
          setEntryById(new Map());
          setVerifiedStations([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, card?.id, card?.cardNumber, periodStart, periodEnd]);

  const filteredEntries = useMemo(() => {
    if (!periodStart) return entries;
    const end = periodEnd || periodStart;
    return entries.filter((e) => {
      const d = entryYmd(e);
      return d >= periodStart && d <= end;
    });
  }, [entries, periodStart, periodEnd]);

  const totals = useMemo(() => {
    const approved = filteredEntries.filter((e) => {
      const m = meta(e);
      const kind = m.jaaRowKind;
      if (kind === 'fee' || kind === 'declined') return false;
      if (m.awaitingCardStatement) return false;
      if (m.countsInFuelSpend === false) return false;
      return (Number(e.amount) || 0) > 0;
    });
    const periodForCard = cardPeriodEntries.filter((e) => {
      if (!periodStart) return true;
      const end = periodEnd || periodStart;
      const d = entryYmd(e);
      return d >= periodStart && d <= end;
    });
    const drift = computeGasCardStatementDriftSummary(periodForCard);
    const unlinkedCount = periodForCard.filter((e) => isUnlinkedCardCharge(e)).length;
    return {
      spend: approved.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      liters: approved.reduce((s, e) => s + (Number(e.liters) || 0), 0),
      count: filteredEntries.length,
      statementFuelTotal: drift.statementFuelTotal,
      opsGasCardTotal: drift.opsGasCardTotal,
      unlinked: drift.unlinkedTotal,
      unlinkedCount,
    };
  }, [filteredEntries, cardPeriodEntries, periodStart, periodEnd]);

  const selectedWeekValue =
    weekOptions.find((w) => w.startDate === periodStart && w.endDate === periodEnd)?.id ??
    periodStart;

  const allowSheetOutside = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest('[data-period-week-menu]') ||
      target.closest('[data-period-week-backdrop]') ||
      target.closest('[data-slot="select-content"]')
    ) {
      event.preventDefault();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'flex flex-col gap-0 overflow-hidden p-0',
          isMobile
            ? 'inset-x-0 h-[58vh] max-h-[58vh] w-full rounded-t-2xl border-t safe-b'
            : 'w-full sm:max-w-[min(1100px,96vw)]',
        )}
        onPointerDownOutside={allowSheetOutside}
        onInteractOutside={allowSheetOutside}
        onFocusOutside={allowSheetOutside}
      >
        <div className={cn('shrink-0 border-b border-slate-100 pb-0', isMobile ? 'px-4 pt-3' : 'px-6 pt-6')}>
          <SheetHeader className="space-y-1 pb-3 text-left">
            <SheetTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Card details
            </SheetTitle>
            <SheetDescription>
              {card ? (
                <span className="font-mono text-slate-800">{card.cardNumber}</span>
              ) : null}
              {card ? ` · ${getCustomerFacingFuelProvider(card, isRoamManaged)}` : ''}
            </SheetDescription>
          </SheetHeader>

          <Tabs
            value={sheetTab}
            onValueChange={(v) => setSheetTab(v as 'transactions' | 'assignments')}
            className="w-full"
          >
            <TabsList className="mb-0 h-9 w-full justify-start gap-1 rounded-none border-0 bg-transparent p-0">
              <TabsTrigger
                value="transactions"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-1 data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Transactions
              </TabsTrigger>
              <TabsTrigger
                value="assignments"
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-1 data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Assignment history
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {sheetTab === 'transactions' ? (
          <>
            <div className={cn('shrink-0 border-b border-slate-100 py-3', isMobile ? 'px-4' : 'px-6 py-4')}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 max-w-sm flex-1 basis-full sm:basis-auto sm:min-w-[220px]">
                  <Select
                    value={selectedWeekValue}
                    onValueChange={(id) => {
                      const week = weekOptions.find((w) => w.id === id);
                      if (!week) return;
                      setPeriodStart(week.startDate);
                      setPeriodEnd(week.endDate);
                    }}
                  >
                    <SelectTrigger className="h-9 w-full text-xs">
                      <SelectValue placeholder="Select week period" />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[300]">
                      {weekOptions.map((week) => (
                        <SelectItem key={week.id} value={week.id} className="text-xs">
                          {week.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Rows</p>
                    <p className="text-base font-bold text-slate-800">{totals.count}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Fuel spend</p>
                    <p className="text-base font-bold text-slate-800">${totals.spend.toFixed(0)}</p>
                    <p className="mt-0.5 text-[10px] leading-tight text-slate-500">
                      ${totals.statementFuelTotal.toFixed(0)} statement · $
                      {totals.opsGasCardTotal.toFixed(0)} in logs
                      {totals.unlinked > 0.009 ? (
                        <span className="font-semibold text-amber-800">
                          {' '}
                          · ${totals.unlinked.toFixed(0)} unlinked
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Liters</p>
                    <p className="text-base font-bold text-slate-800">{totals.liters.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={cn('min-h-0 flex-1 overflow-auto py-3', isMobile ? 'px-4' : 'px-6 py-4')}>
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="rounded-md border py-16 text-center text-sm text-slate-500">
                  {entries.length === 0
                    ? 'No transactions linked to this card yet.'
                    : 'No transactions in this period.'}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border">
                  <Table className="w-max min-w-full">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide" title="When it happened">
                          Date
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide">
                          Kind
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-right text-[11px] uppercase tracking-wide" title="Money on the statement">
                          Amount
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide" title="Approved vs declined / limit hit">
                          Response
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide" title="Gas station (real merchant)">
                          Station
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide" title="Fee / issuer description">
                          Description
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide" title="Fuel grade">
                          Fuel type
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-right text-[11px] uppercase tracking-wide" title="Fuel $ (vs fees)">
                          Fuel $
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-right text-[11px] uppercase tracking-wide" title="Liters">
                          Liters
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide" title="Unique JAA transaction id">
                          Receipt
                        </TableHead>
                        <TableHead className="whitespace-nowrap text-[11px] uppercase tracking-wide">
                          Assigned
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((entry) => {
                        const m = meta(entry);
                        const driver =
                          getDriverName(entry.driverId) !== 'Unknown'
                            ? getDriverName(entry.driverId)
                            : '';
                        const vehicle =
                          getVehicleName(entry.vehicleId) !== 'Unknown'
                            ? getVehicleName(entry.vehicleId)
                            : '';
                        const assigned = [driver, vehicle].filter(Boolean).join(' · ') || '—';
                        const fuelAmt = m.jaaFuelAmount != null ? Number(m.jaaFuelAmount) : undefined;
                        const station = resolveCardTransactionStation(
                          entry,
                          verifiedStations,
                          entryById,
                        );
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="align-top whitespace-nowrap text-xs">
                              <div>{entryYmd(entry)}</div>
                              {entry.time ? (
                                <div className="text-[10px] text-slate-400">{entry.time}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top">{rowKindBadge(entry)}</TableCell>
                            <TableCell className="align-top whitespace-nowrap text-right text-xs font-medium tabular-nums">
                              {m.awaitingCardStatement ? '—' : money(entry.amount)}
                            </TableCell>
                            <TableCell
                              className="align-top max-w-[160px] truncate text-xs"
                              title={String(m.jaaResponse || '')}
                            >
                              {String(m.jaaResponse || '—')}
                            </TableCell>
                            <TableCell
                              className={`align-top max-w-[160px] truncate text-xs ${
                                station.fromVerified ? 'text-slate-800' : 'text-slate-600'
                              }`}
                              title={
                                station.fromVerified && station.jaaRaw
                                  ? `${station.label} (JAA: ${station.jaaRaw})`
                                  : station.label
                              }
                            >
                              {station.label}
                            </TableCell>
                            <TableCell
                              className="align-top max-w-[160px] truncate text-xs"
                              title={String(m.jaaDescription || '')}
                            >
                              {String(m.jaaDescription || '—')}
                            </TableCell>
                            <TableCell className="align-top whitespace-nowrap text-xs">
                              {String(m.jaaFuelType || '—')}
                            </TableCell>
                            <TableCell className="align-top whitespace-nowrap text-right text-xs tabular-nums">
                              {fuelAmt != null && fuelAmt > 0 ? money(fuelAmt) : '—'}
                            </TableCell>
                            <TableCell className="align-top whitespace-nowrap text-right text-xs tabular-nums">
                              {liters(entry.liters)}
                            </TableCell>
                            <TableCell
                              className="align-top whitespace-nowrap font-mono text-[11px]"
                              title={String(m.jaaReceiptNumber || '')}
                            >
                              {String(m.jaaReceiptNumber || '—')}
                            </TableCell>
                            <TableCell
                              className="align-top max-w-[140px] truncate text-xs text-slate-500"
                              title={assigned}
                            >
                              {assigned}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={cn('min-h-0 flex-1 overflow-auto py-3', isMobile ? 'px-4' : 'px-6 py-4')}>
            <p className="mb-3 text-xs text-slate-500">
              Who held this card over time. Vehicle is a snapshot at handoff — the driver may change cars while keeping the card.
            </p>
            <FuelCardAssignmentHistoryList
              history={card?.assignmentHistory}
              variant="panel"
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
