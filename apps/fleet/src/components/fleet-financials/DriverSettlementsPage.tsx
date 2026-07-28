/**
 * Business Finance → Driver Settlements
 * Fleet-wide Collect (Log Cash) + Pay (Record Payout) queue — same txs as Cash Wallet.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Download,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import {
  isClearedDriverCashPayment,
  isDriverCashPaymentTransaction,
  isDriverPayoutTransaction,
} from '../../utils/driverCashPayment';
import {
  buildCashCollectionTx,
  buildDriverPayoutTx,
} from '../../utils/driverSettlementTx';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import {
  RecordPayoutModal,
  type RecordPayoutSavePayload,
} from '../drivers/RecordPayoutModal';
import { LogCashPaymentModal } from '../drivers/LogCashPaymentModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Label } from '../ui/label';
import { cn } from '../ui/utils';
import type { FinancialTransaction } from '../../types/data';

type Direction = 'collect' | 'pay';
type DeskTab = 'outstanding' | 'awaiting' | 'done';

type PeriodRow = {
  driverId: string;
  driverName?: string;
  periodAnchor: string;
  periodEnd: string;
  settlementAmount: number;
  settlementPaid?: number;
  cashCollected: number;
  cashReturned?: number;
  cashStillHeld?: number;
  amountOwed?: number;
  tripCount: number;
  settlementStatus: string;
  fuelFinalized?: boolean;
  /** collect queue source */
  collectKind?: 'driver_owes' | 'cash_held';
};

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

function rowKey(r: Pick<PeriodRow, 'driverId' | 'periodAnchor'>) {
  return `${r.driverId}|${r.periodAnchor}`;
}

function collectAmount(r: PeriodRow) {
  return Math.max(0, Number(r.amountOwed ?? Math.abs(r.settlementAmount) || 0));
}

export function DriverSettlementsPage({
  onBackToBusinessFinance,
  onOpenDriver,
}: {
  onBackToBusinessFinance?: () => void;
  onOpenDriver?: (driverId: string) => void;
}) {
  const qc = useQueryClient();
  const thisMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const [weekFrom, setWeekFrom] = useState(
    format(subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 8), 'yyyy-MM-dd'),
  );
  const [weekTo, setWeekTo] = useState(
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  );
  const [search, setSearch] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [direction, setDirection] = useState<Direction>('collect');
  const [deskTab, setDeskTab] = useState<DeskTab>('outstanding');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMethod, setBatchMethod] = useState('Cash');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchRef, setBatchRef] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  const [payoutModal, setPayoutModal] = useState<{
    isOpen: boolean;
    driverId: string;
    driverName: string;
    workPeriodStart: string;
    workPeriodEnd: string;
    maxAmount: number;
  }>({
    isOpen: false,
    driverId: '',
    driverName: '',
    workPeriodStart: '',
    workPeriodEnd: '',
    maxAmount: 0,
  });

  const [collectModal, setCollectModal] = useState<{
    isOpen: boolean;
    driverId: string;
    driverName: string;
    workPeriodStart: string;
    workPeriodEnd: string;
    maxAmount: number;
  }>({
    isOpen: false,
    driverId: '',
    driverName: '',
    workPeriodStart: '',
    workPeriodEnd: '',
    maxAmount: 0,
  });

  const rangeOpts = {
    periodStart: weekFrom,
    periodEnd: weekTo,
    minAmount: minAmount ? Number(minAmount) : undefined,
    limit: 1000,
  };

  const owesQuery = useQuery({
    queryKey: ['companyOwesPeriods', weekFrom, weekTo, minAmount],
    queryFn: async () => {
      const res = await api.getCompanyOwesPeriods(rangeOpts);
      return {
        rows: (res?.data || []) as PeriodRow[],
        summary: res?.summary as { totalOwed?: number; rowCount?: number; driverCount?: number },
      };
    },
  });

  const driverOwesQuery = useQuery({
    queryKey: ['driverOwesPeriods', weekFrom, weekTo, minAmount],
    queryFn: async () => {
      const res = await api.getDriverOwesPeriods(rangeOpts);
      return {
        rows: ((res?.data || []) as PeriodRow[]).map((r) => ({
          ...r,
          collectKind: 'driver_owes' as const,
          amountOwed: Number(r.amountOwed) || Math.abs(Number(r.settlementAmount) || 0),
        })),
        summary: res?.summary as { totalOwed?: number; rowCount?: number; driverCount?: number },
      };
    },
  });

  const cashHeldQuery = useQuery({
    queryKey: ['cashHeldPeriods', weekFrom, weekTo, minAmount],
    queryFn: async () => {
      const res = await api.getCashHeldPeriods(rangeOpts);
      return {
        rows: ((res?.data || []) as PeriodRow[]).map((r) => ({
          ...r,
          collectKind: 'cash_held' as const,
          amountOwed: Number(r.amountOwed) || Number(r.cashStillHeld) || 0,
        })),
        summary: res?.summary as { totalHeld?: number; rowCount?: number; driverCount?: number },
      };
    },
  });

  const paidQuery = useQuery({
    queryKey: ['settlementPaidPeriods', weekFrom, weekTo],
    queryFn: async () => {
      const res = await api.getSettlementPaidPeriods({
        periodStart: weekFrom,
        periodEnd: weekTo,
        limit: 500,
      });
      return {
        rows: (res?.data || []) as PeriodRow[],
        summary: res?.summary as { totalPaid?: number; rowCount?: number },
      };
    },
  });

  const txsQuery = useQuery({
    queryKey: ['driverSettlementsTransactions'],
    queryFn: async () => {
      const page = await api.getTransactions(undefined, { limit: 5000, offset: 0 });
      return (Array.isArray(page) ? page : page?.data || []) as FinancialTransaction[];
    },
  });

  const collectOutstanding = useMemo(() => {
    const byKey = new Map<string, PeriodRow>();
    // Prefer driver_owes over cash_held when both exist for same week
    for (const r of cashHeldQuery.data?.rows || []) {
      byKey.set(rowKey(r), r);
    }
    for (const r of driverOwesQuery.data?.rows || []) {
      byKey.set(rowKey(r), r);
    }
    const q = search.trim().toLowerCase();
    return [...byKey.values()]
      .filter((r) => collectAmount(r) > 0.005)
      .filter((r) => {
        if (!q) return true;
        return (
          String(r.driverName || '').toLowerCase().includes(q) ||
          String(r.driverId).toLowerCase().includes(q) ||
          r.periodAnchor.includes(q)
        );
      })
      .sort((a, b) => collectAmount(b) - collectAmount(a));
  }, [driverOwesQuery.data?.rows, cashHeldQuery.data?.rows, search]);

  const payOutstanding = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (owesQuery.data?.rows || []).filter((r) => {
      if (!q) return true;
      return (
        String(r.driverName || '').toLowerCase().includes(q) ||
        String(r.driverId).toLowerCase().includes(q) ||
        r.periodAnchor.includes(q)
      );
    });
  }, [owesQuery.data?.rows, search]);

  const outstandingRows = direction === 'collect' ? collectOutstanding : payOutstanding;

  const awaitingRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = txsQuery.data || [];
    const filtered =
      direction === 'collect'
        ? all.filter(
            (t) =>
              isDriverCashPaymentTransaction(t) &&
              String(t.status || '').toLowerCase() === 'pending',
          )
        : all.filter(
            (t) =>
              isDriverPayoutTransaction(t) &&
              String(t.status || '').toLowerCase() === 'pending',
          );
    return filtered.filter((t) => {
      if (!q) return true;
      return (
        String(t.driverName || '').toLowerCase().includes(q) ||
        String(t.driverId || '').toLowerCase().includes(q) ||
        String(t.metadata?.workPeriodStart || '').includes(q)
      );
    });
  }, [txsQuery.data, search, direction]);

  const donePayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (paidQuery.data?.rows || []).filter((r) => {
      if (!q) return true;
      return (
        String(r.driverName || '').toLowerCase().includes(q) ||
        String(r.driverId).toLowerCase().includes(q) ||
        r.periodAnchor.includes(q)
      );
    });
  }, [paidQuery.data?.rows, search]);

  const doneCollectRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (txsQuery.data || []).filter((t) => {
      if (!isClearedDriverCashPayment(t)) return false;
      const d = String(t.date || '').slice(0, 10);
      if (d < weekFrom || d > weekTo) return false;
      if (!q) return true;
      return (
        String(t.driverName || '').toLowerCase().includes(q) ||
        String(t.driverId || '').toLowerCase().includes(q) ||
        String(t.metadata?.workPeriodStart || '').includes(q)
      );
    });
  }, [txsQuery.data, weekFrom, weekTo, search]);

  const driverOwesTotal = collectOutstanding.reduce((s, r) => s + collectAmount(r), 0);
  const fleetOwesTotal = Number(owesQuery.data?.summary?.totalOwed) || 0;
  const awaitingTotal = awaitingRows.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const clearedThisWeek =
    direction === 'pay'
      ? (txsQuery.data || [])
          .filter((t) => {
            if (!isDriverPayoutTransaction(t)) return false;
            const st = String(t.status || '').toLowerCase();
            if (st !== 'completed' && st !== 'verified') return false;
            return String(t.date || '').slice(0, 10) >= thisMonday;
          })
          .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)
      : (txsQuery.data || [])
          .filter((t) => {
            if (!isClearedDriverCashPayment(t)) return false;
            return String(t.date || '').slice(0, 10) >= thisMonday;
          })
          .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  useEffect(() => {
    setSelected(new Set());
  }, [deskTab, direction, weekFrom, weekTo, search]);

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === outstandingRows.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(outstandingRows.map((r) => rowKey(r))));
  };

  const selectedRows = outstandingRows.filter((r) => selected.has(rowKey(r)));
  const selectedTotal = selectedRows.reduce(
    (s, r) =>
      s +
      (direction === 'collect'
        ? collectAmount(r)
        : Number(r.settlementAmount) || 0),
    0,
  );

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['companyOwesPeriods'] });
    void qc.invalidateQueries({ queryKey: ['driverOwesPeriods'] });
    void qc.invalidateQueries({ queryKey: ['cashHeldPeriods'] });
    void qc.invalidateQueries({ queryKey: ['settlementPaidPeriods'] });
    void qc.invalidateQueries({ queryKey: ['driverSettlementsTransactions'] });
  };

  const exportCsv = () => {
    const rows = selectedRows.length > 0 ? selectedRows : outstandingRows;
    if (rows.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    const header =
      direction === 'collect'
        ? ['driver_id', 'driver_name', 'period_start', 'period_end', 'amount_owed', 'kind', 'passenger_cash']
        : ['driver_id', 'driver_name', 'period_start', 'period_end', 'amount_owed', 'passenger_cash', 'already_paid'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        direction === 'collect'
          ? [
              r.driverId,
              `"${String(r.driverName || '').replace(/"/g, '""')}"`,
              r.periodAnchor,
              r.periodEnd,
              collectAmount(r).toFixed(2),
              r.collectKind || '',
              Number(r.cashCollected || 0).toFixed(2),
            ].join(',')
          : [
              r.driverId,
              `"${String(r.driverName || '').replace(/"/g, '""')}"`,
              r.periodAnchor,
              r.periodEnd,
              Number(r.settlementAmount || 0).toFixed(2),
              Number(r.cashCollected || 0).toFixed(2),
              Number(r.settlementPaid || 0).toFixed(2),
            ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-settlements-${direction}-${weekFrom}-to-${weekTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length !== 1 ? 's' : ''}`);
  };

  const saveSinglePayout = async (payload: RecordPayoutSavePayload) => {
    const newTx = buildDriverPayoutTx(payload, {
      driverId: payoutModal.driverId,
      driverName: payoutModal.driverName,
    });
    await api.saveTransaction(newTx);
    refreshAll();
  };

  const saveCollectPayment = async (payment: {
    id?: string;
    amount: number;
    date: string;
    notes: string;
    paymentMethod: string;
    referenceNumber?: string;
    transactionType: 'payment' | 'float' | 'adjustment';
    workPeriodStart?: string;
    workPeriodEnd?: string;
  }) => {
    const newTx = buildCashCollectionTx(
      {
        ...payment,
        workPeriodStart:
          payment.workPeriodStart ||
          `${collectModal.workPeriodStart}T12:00:00.000Z`,
        workPeriodEnd:
          payment.workPeriodEnd || `${collectModal.workPeriodEnd}T12:00:00.000Z`,
      },
      { driverId: collectModal.driverId, driverName: collectModal.driverName },
    );
    await api.saveTransaction(newTx);
    refreshAll();
  };

  const runBatch = async () => {
    if (selectedRows.length === 0) return;
    const needsRef =
      batchMethod === 'Bank Transfer' ||
      batchMethod === 'Mobile Money' ||
      batchMethod === 'Check';
    if (needsRef && !batchRef.trim()) {
      toast.error('Reference number is required for bank / mobile transfers');
      return;
    }
    setBatchBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const row of selectedRows) {
        try {
          if (direction === 'pay') {
            await api.saveTransaction(
              buildDriverPayoutTx(
                {
                  amount: Math.round((Number(row.settlementAmount) || 0) * 100) / 100,
                  date: batchDate,
                  paymentMethod: batchMethod,
                  referenceNumber: batchRef.trim() || undefined,
                  notes: 'Batch payout',
                  workPeriodStart: row.periodAnchor,
                  workPeriodEnd: row.periodEnd,
                },
                { driverId: row.driverId, driverName: row.driverName || row.driverId },
              ),
            );
          } else {
            await api.saveTransaction(
              buildCashCollectionTx(
                {
                  amount: Math.round(collectAmount(row) * 100) / 100,
                  date: batchDate,
                  notes: 'Batch cash collection',
                  paymentMethod: batchMethod,
                  referenceNumber: batchRef.trim() || undefined,
                  transactionType: 'payment',
                  workPeriodStart: `${row.periodAnchor}T12:00:00.000Z`,
                  workPeriodEnd: `${row.periodEnd}T12:00:00.000Z`,
                },
                { driverId: row.driverId, driverName: row.driverName || row.driverId },
              ),
            );
          }
          ok++;
        } catch {
          fail++;
        }
      }
      if (ok > 0) {
        toast.success(
          direction === 'pay'
            ? `Recorded ${ok} payout${ok !== 1 ? 's' : ''}`
            : `Logged ${ok} collection${ok !== 1 ? 's' : ''}`,
        );
      }
      if (fail > 0) toast.error(`${fail} failed`);
      setBatchOpen(false);
      setSelected(new Set());
      refreshAll();
    } finally {
      setBatchBusy(false);
    }
  };

  const verifyPending = async (tx: FinancialTransaction) => {
    try {
      await api.saveTransaction({ ...tx, status: 'Verified' });
      toast.success('Verified');
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message || 'Verify failed');
    }
  };

  const loading =
    owesQuery.isLoading ||
    driverOwesQuery.isLoading ||
    cashHeldQuery.isLoading ||
    paidQuery.isLoading ||
    txsQuery.isLoading;

  const collectPeriodForModal = collectModal.isOpen
    ? [
        {
          start: parseISO(`${collectModal.workPeriodStart}T12:00:00`),
          end: parseISO(`${collectModal.workPeriodEnd}T12:00:00`),
          amountOwed: collectModal.maxAmount,
          amountPaid: 0,
          balance: collectModal.maxAmount,
          status: 'Unpaid',
        },
      ]
    : [];

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-[1400px] mx-auto">
      <BusinessFinanceDeskChrome deskLabel="Driver Settlements" onBack={onBackToBusinessFinance} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-700" />
            Driver Settlements
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Collect cash drivers owe · Pay weeks the fleet owes. Same Log Cash / Record Payout
            actions as Cash Wallet — built for fleet-wide runs.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={refreshAll} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Driver owes" value={MONEY(driverOwesTotal)} sub={`${collectOutstanding.length} weeks`} tone="owed" />
        <Kpi label="Fleet owes" value={MONEY(fleetOwesTotal)} sub={`${owesQuery.data?.summary?.rowCount ?? 0} weeks`} tone="pay" />
        <Kpi
          label="Awaiting bank clear"
          value={MONEY(awaitingTotal)}
          sub={`${awaitingRows.length} pending (${direction})`}
          tone="pending"
        />
        <Kpi
          label="Cleared this week"
          value={MONEY(clearedThisWeek)}
          sub={direction === 'pay' ? 'Payouts since Mon' : 'Collections since Mon'}
          tone="paid"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={direction === 'collect' ? 'default' : 'outline'}
          className={cn('h-9', direction === 'collect' && 'bg-rose-700 hover:bg-rose-800')}
          onClick={() => setDirection('collect')}
        >
          <ArrowDownLeft className="h-4 w-4 mr-1.5" />
          Collect
        </Button>
        <Button
          type="button"
          size="sm"
          variant={direction === 'pay' ? 'default' : 'outline'}
          className={cn('h-9', direction === 'pay' && 'bg-emerald-700 hover:bg-emerald-800')}
          onClick={() => setDirection('pay')}
        >
          <ArrowUpRight className="h-4 w-4 mr-1.5" />
          Pay
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Week from</Label>
            <Input type="date" className="h-9 w-[150px]" value={weekFrom} onChange={(e) => setWeekFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Week to</Label>
            <Input type="date" className="h-9 w-[150px]" value={weekTo} onChange={(e) => setWeekTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Min amount</Label>
            <Input
              type="number"
              step="0.01"
              className="h-9 w-[110px]"
              placeholder="0"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="h-9 w-[200px] pl-8"
                placeholder="Driver or week…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {deskTab === 'outstanding' && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(
                'h-9',
                direction === 'collect' ? 'bg-rose-700 hover:bg-rose-800' : 'bg-emerald-700 hover:bg-emerald-800',
              )}
              disabled={selectedRows.length === 0}
              onClick={() => setBatchOpen(true)}
            >
              {direction === 'collect' ? 'Collect selected' : 'Pay selected'} ({selectedRows.length})
            </Button>
          </div>
        )}
      </div>

      <Tabs value={deskTab} onValueChange={(v) => setDeskTab(v as DeskTab)}>
        <TabsList>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="awaiting">Awaiting clear</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
        </TabsList>

        <TabsContent value="outstanding" className="mt-4">
          <OutstandingTable
            direction={direction}
            rows={outstandingRows}
            loading={loading}
            selected={selected}
            onToggle={toggleSelect}
            onToggleAll={toggleSelectAll}
            onOpenDriver={onOpenDriver}
            onPay={(r) =>
              setPayoutModal({
                isOpen: true,
                driverId: r.driverId,
                driverName: r.driverName || r.driverId,
                workPeriodStart: r.periodAnchor,
                workPeriodEnd: r.periodEnd,
                maxAmount: Number(r.settlementAmount) || 0,
              })
            }
            onCollect={(r) =>
              setCollectModal({
                isOpen: true,
                driverId: r.driverId,
                driverName: r.driverName || r.driverId,
                workPeriodStart: r.periodAnchor,
                workPeriodEnd: r.periodEnd,
                maxAmount: collectAmount(r),
              })
            }
          />
        </TabsContent>

        <TabsContent value="awaiting" className="mt-4">
          <PendingTable rows={awaitingRows} direction={direction} onOpenDriver={onOpenDriver} onVerify={verifyPending} />
        </TabsContent>

        <TabsContent value="done" className="mt-4">
          {direction === 'pay' ? (
            <DonePayTable rows={donePayRows} onOpenDriver={onOpenDriver} />
          ) : (
            <DoneCollectTable rows={doneCollectRows} onOpenDriver={onOpenDriver} />
          )}
        </TabsContent>
      </Tabs>

      <RecordPayoutModal
        isOpen={payoutModal.isOpen}
        onClose={() => setPayoutModal((s) => ({ ...s, isOpen: false }))}
        onSave={saveSinglePayout}
        driverName={payoutModal.driverName}
        maxAmount={payoutModal.maxAmount}
        workPeriodStart={payoutModal.workPeriodStart}
        workPeriodEnd={payoutModal.workPeriodEnd}
      />

      <LogCashPaymentModal
        isOpen={collectModal.isOpen}
        onClose={() => setCollectModal((s) => ({ ...s, isOpen: false }))}
        onSave={saveCollectPayment}
        driverName={collectModal.driverName}
        cashOwed={collectModal.maxAmount}
        initialWorkPeriodStart={
          collectModal.workPeriodStart
            ? `${collectModal.workPeriodStart}T12:00:00.000Z`
            : undefined
        }
        initialWorkPeriodEnd={
          collectModal.workPeriodEnd ? `${collectModal.workPeriodEnd}T12:00:00.000Z` : undefined
        }
        initialAmount={collectModal.maxAmount}
        periods={collectPeriodForModal}
      />

      <Dialog open={batchOpen} onOpenChange={(o) => !o && !batchBusy && setBatchOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {direction === 'collect' ? 'Collect from selected' : 'Pay selected drivers'}
            </DialogTitle>
            <DialogDescription>
              {selectedRows.length} week{selectedRows.length !== 1 ? 's' : ''}, {MONEY(selectedTotal)}{' '}
              total. Uses full outstanding per row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={batchMethod} onValueChange={setBatchMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(batchMethod === 'Bank Transfer' ||
              batchMethod === 'Mobile Money' ||
              batchMethod === 'Check') && (
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={batchRef} onChange={(e) => setBatchRef(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Effective date</Label>
              <Input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={batchBusy}>
              Cancel
            </Button>
            <Button
              className={
                direction === 'collect'
                  ? 'bg-rose-700 hover:bg-rose-800'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              }
              onClick={runBatch}
              disabled={batchBusy}
            >
              {batchBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : direction === 'collect' ? (
                `Log ${selectedRows.length} collection${selectedRows.length !== 1 ? 's' : ''}`
              ) : (
                `Record ${selectedRows.length} payout${selectedRows.length !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** @deprecated Use DriverSettlementsPage — kept for import aliases. */
export const DriverPayoutsPage = DriverSettlementsPage;

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'owed' | 'pay' | 'pending' | 'paid';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums mt-1',
          tone === 'owed' && 'text-rose-700',
          tone === 'pay' && 'text-emerald-800',
          tone === 'pending' && 'text-amber-700',
          tone === 'paid' && 'text-slate-900',
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p> : null}
    </div>
  );
}

function OutstandingTable({
  direction,
  rows,
  loading,
  selected,
  onToggle,
  onToggleAll,
  onOpenDriver,
  onPay,
  onCollect,
}: {
  direction: Direction;
  rows: PeriodRow[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (k: string) => void;
  onToggleAll: () => void;
  onOpenDriver?: (id: string) => void;
  onPay: (r: PeriodRow) => void;
  onCollect: (r: PeriodRow) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="w-10">
              <Checkbox
                checked={rows.length > 0 && selected.size === rows.length}
                onCheckedChange={onToggleAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Settlement Week</TableHead>
            <TableHead className="text-right">Passenger cash</TableHead>
            {direction === 'collect' ? (
              <TableHead>Status</TableHead>
            ) : (
              <TableHead className="text-right">Already paid</TableHead>
            )}
            <TableHead className="text-right">
              {direction === 'collect' ? 'Driver owes' : 'Fleet owes'}
            </TableHead>
            <TableHead className="w-[120px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                No outstanding {direction === 'collect' ? 'collections' : 'payouts'} in this range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const key = rowKey(r);
              return (
                <TableRow key={key}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(key)}
                      onCheckedChange={() => onToggle(key)}
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
                  <TableCell className="text-right tabular-nums text-slate-600">
                    {MONEY(r.cashCollected)}
                  </TableCell>
                  {direction === 'collect' ? (
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'font-normal',
                          r.collectKind === 'driver_owes'
                            ? 'bg-rose-50 text-rose-800'
                            : 'bg-amber-50 text-amber-800',
                        )}
                      >
                        {r.collectKind === 'driver_owes' ? 'Driver owes' : 'Cash held'}
                      </Badge>
                    </TableCell>
                  ) : (
                    <TableCell className="text-right tabular-nums text-slate-500">
                      {MONEY(r.settlementPaid)}
                    </TableCell>
                  )}
                  <TableCell
                    className={cn(
                      'text-right tabular-nums font-semibold',
                      direction === 'collect' ? 'text-rose-700' : 'text-emerald-800',
                    )}
                  >
                    {MONEY(direction === 'collect' ? collectAmount(r) : r.settlementAmount)}
                  </TableCell>
                  <TableCell>
                    {direction === 'collect' ? (
                      <Button
                        size="sm"
                        className="h-8 bg-rose-700 hover:bg-rose-800"
                        onClick={() => onCollect(r)}
                      >
                        Log Cash
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-700 hover:bg-emerald-800"
                        onClick={() => onPay(r)}
                      >
                        Pay
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function PendingTable({
  rows,
  direction,
  onOpenDriver,
  onVerify,
}: {
  rows: FinancialTransaction[];
  direction: Direction;
  onOpenDriver?: (id: string) => void;
  onVerify: (tx: FinancialTransaction) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Driver</TableHead>
            <TableHead>Settlement Week</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                No pending {direction === 'collect' ? 'collections' : 'payouts'}.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-medium text-slate-900 hover:text-indigo-600"
                    onClick={() => tx.driverId && onOpenDriver?.(tx.driverId)}
                  >
                    {tx.driverName || tx.driverId}
                  </button>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {tx.metadata?.workPeriodStart
                    ? weekLabel(
                        String(tx.metadata.workPeriodStart).slice(0, 10),
                        String(tx.metadata.workPeriodEnd || tx.metadata.workPeriodStart).slice(0, 10),
                      )
                    : '—'}
                </TableCell>
                <TableCell>{tx.paymentMethod || '—'}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">
                  {tx.referenceNumber || '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {MONEY(tx.amount)}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => onVerify(tx)}>
                    Verify
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function DonePayTable({
  rows,
  onOpenDriver,
}: {
  rows: PeriodRow[];
  onOpenDriver?: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Driver</TableHead>
            <TableHead>Settlement Week</TableHead>
            <TableHead className="text-right">Paid to driver</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                No paid settlement weeks in this range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={rowKey(r)}>
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
                <TableCell className="text-right tabular-nums font-semibold text-emerald-800">
                  {MONEY(r.settlementPaid)}
                </TableCell>
                <TableCell>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Settled</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function DoneCollectTable({
  rows,
  onOpenDriver,
}: {
  rows: FinancialTransaction[];
  onOpenDriver?: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Driver</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Settlement Week</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Cash returned</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-slate-500">
                No cleared collections in this range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-medium text-slate-900 hover:text-indigo-600"
                    onClick={() => tx.driverId && onOpenDriver?.(tx.driverId)}
                  >
                    {tx.driverName || tx.driverId}
                  </button>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {String(tx.date || '').slice(0, 10)}
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {tx.metadata?.workPeriodStart
                    ? weekLabel(
                        String(tx.metadata.workPeriodStart).slice(0, 10),
                        String(tx.metadata.workPeriodEnd || tx.metadata.workPeriodStart).slice(0, 10),
                      )
                    : '—'}
                </TableCell>
                <TableCell>{tx.paymentMethod || 'Cash'}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold text-emerald-700">
                  {MONEY(tx.amount)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
