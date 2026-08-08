import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
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
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import { FuelCard, FuelEntry } from '../../types/fuel';
import type { StationProfile } from '../../types/station';
import { fuelService } from '../../services/fuelService';
import { getCustomerFacingFuelProvider } from '../../utils/fuelCardDisplay';
import { normalizeFuelCardCode } from '../../utils/fuelCardMatch';
import { currentFuelWeekRange } from '../../utils/fuelWeekPeriod';
import { isJaaStatementLedgerRow } from '../../utils/jaaFuelStatementMatcher';
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

  if (!isMatched) return kindBadge;

  return (
    <div className="flex flex-col gap-1 items-start">
      {kindBadge}
      <Badge
        variant="outline"
        className="bg-sky-50 text-sky-800 border-sky-200"
        title="Linked to a driver Gas Card log"
      >
        Matched
      </Badge>
    </div>
  );
}

export function FuelCardTransactionsSheet({
  card,
  open,
  onOpenChange,
  getDriverName,
  getVehicleName,
  isRoamManaged = false,
}: FuelCardTransactionsSheetProps) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [entryById, setEntryById] = useState<Map<string, FuelEntry>>(new Map());
  const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    const range = currentFuelWeekRange();
    return { from: range.from, to: range.to };
  });
  const [sheetTab, setSheetTab] = useState<'transactions' | 'assignments'>('transactions');

  useEffect(() => {
    if (!open) return;
    const range = currentFuelWeekRange();
    setDateRange({ from: range.from, to: range.to });
    setSheetTab('transactions');
  }, [open, card?.id]);

  useEffect(() => {
    if (!open || !card) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fuelService.getFuelEntries({ limit: 3000 }),
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
        const mine = all
          .filter((e) => {
            // Card Inventory shows statement ledger only — driver Gas Card logs stay in Transaction Logs
            if (!isJaaStatementLedgerRow(e)) return false;
            if (e.cardId && e.cardId === card.id) return true;
            const code = normalizeFuelCardCode(String(meta(e).jaaCardCode || ''));
            return !!needle && !!code && code === needle;
          })
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
  }, [open, card?.id]);

  const periodStart = dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined;
  const periodEnd = dateRange?.to
    ? format(dateRange.to, 'yyyy-MM-dd')
    : periodStart;

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
    return {
      spend: approved.reduce((s, e) => s + (Number(e.amount) || 0), 0),
      liters: approved.reduce((s, e) => s + (Number(e.liters) || 0), 0),
      count: filteredEntries.length,
    };
  }, [filteredEntries]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,96vw)]"
      >
        <div className="shrink-0 border-b border-slate-100 px-6 pt-6 pb-0">
          <SheetHeader className="space-y-1 text-left pb-3">
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
            <div className="shrink-0 border-b border-slate-100 px-6 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[220px] max-w-sm flex-1">
                  <PeriodWeekDropdown
                    selectedStart={periodStart}
                    selectedEnd={periodEnd}
                    placeholder="Select week period"
                    buttonClassName="h-9 w-full text-xs justify-between"
                    allowCustomRange
                    onSelect={(period) => {
                      const [sy, sm, sd] = period.startDate.split('-').map(Number);
                      const [ey, em, ed] = period.endDate.split('-').map(Number);
                      setDateRange({
                        from: new Date(sy, sm - 1, sd),
                        to: new Date(ey, em - 1, ed),
                      });
                    }}
                  />
                </div>
                <div className="grid flex-1 grid-cols-3 gap-2 text-center min-w-[240px]">
                  <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">Rows</p>
                    <p className="text-base font-bold text-slate-800">{totals.count}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">Fuel spend</p>
                    <p className="text-base font-bold text-slate-800">${totals.spend.toFixed(0)}</p>
                  </div>
                  <div className="rounded-lg border bg-slate-50 px-2 py-1.5">
                    <p className="text-[10px] uppercase text-slate-400 font-bold">Liters</p>
                    <p className="text-base font-bold text-slate-800">{totals.liters.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="rounded-md border py-16 text-center text-sm text-slate-500">
                  {entries.length === 0
                    ? 'No transactions linked to this card yet.'
                    : 'No transactions in this period.'}
                </div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="w-max min-w-full">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80">
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap" title="When it happened">
                          Date
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap">
                          Kind
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap text-right" title="Money on the statement">
                          Amount
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap" title="Approved vs declined / limit hit">
                          Response
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap" title="Gas station (real merchant)">
                          Station
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap" title="Fee / issuer description">
                          Description
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap" title="Fuel grade">
                          Fuel type
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap text-right" title="Fuel $ (vs fees)">
                          Fuel $
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap text-right" title="Liters">
                          Liters
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap" title="Unique JAA transaction id">
                          Receipt
                        </TableHead>
                        <TableHead className="text-[11px] uppercase tracking-wide whitespace-nowrap">
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
                            <TableCell className="text-xs whitespace-nowrap align-top">
                              <div>{entryYmd(entry)}</div>
                              {entry.time ? (
                                <div className="text-[10px] text-slate-400">{entry.time}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="align-top">{rowKindBadge(entry)}</TableCell>
                            <TableCell className="text-right text-xs font-medium tabular-nums whitespace-nowrap align-top">
                              {m.awaitingCardStatement ? '—' : money(entry.amount)}
                            </TableCell>
                            <TableCell
                              className="text-xs max-w-[160px] truncate align-top"
                              title={String(m.jaaResponse || '')}
                            >
                              {String(m.jaaResponse || '—')}
                            </TableCell>
                            <TableCell
                              className={`text-xs max-w-[160px] truncate align-top ${
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
                              className="text-xs max-w-[160px] truncate align-top"
                              title={String(m.jaaDescription || '')}
                            >
                              {String(m.jaaDescription || '—')}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap align-top">
                              {String(m.jaaFuelType || '—')}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums whitespace-nowrap align-top">
                              {fuelAmt != null && fuelAmt > 0 ? money(fuelAmt) : '—'}
                            </TableCell>
                            <TableCell className="text-right text-xs tabular-nums whitespace-nowrap align-top">
                              {liters(entry.liters)}
                            </TableCell>
                            <TableCell
                              className="font-mono text-[11px] whitespace-nowrap align-top"
                              title={String(m.jaaReceiptNumber || '')}
                            >
                              {String(m.jaaReceiptNumber || '—')}
                            </TableCell>
                            <TableCell
                              className="text-xs max-w-[140px] truncate text-slate-500 align-top"
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
          <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
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
