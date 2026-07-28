/**
 * Business Finance → Driver Payouts
 * Fleet-wide queue for company_owes Settlement Weeks + Record Payout / batch pay / CSV.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import {
  Banknote,
  Download,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import { isDriverPayoutTransaction } from '../../utils/driverCashPayment';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import {
  RecordPayoutModal,
  type RecordPayoutSavePayload,
} from '../drivers/RecordPayoutModal';
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

type DeskTab = 'outstanding' | 'awaiting' | 'paid';

type CompanyOwesRow = {
  driverId: string;
  driverName?: string;
  periodAnchor: string;
  periodEnd: string;
  settlementAmount: number;
  settlementPaid: number;
  cashCollected: number;
  tripCount: number;
  settlementStatus: string;
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

function rowKey(r: Pick<CompanyOwesRow, 'driverId' | 'periodAnchor'>) {
  return `${r.driverId}|${r.periodAnchor}`;
}

export function DriverPayoutsPage({
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

  const owesQuery = useQuery({
    queryKey: ['companyOwesPeriods', weekFrom, weekTo, minAmount],
    queryFn: async () => {
      const res = await api.getCompanyOwesPeriods({
        periodStart: weekFrom,
        periodEnd: weekTo,
        minAmount: minAmount ? Number(minAmount) : undefined,
        limit: 1000,
      });
      return {
        rows: (res?.data || []) as CompanyOwesRow[],
        summary: res?.summary as { totalOwed?: number; rowCount?: number; driverCount?: number } | undefined,
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
        rows: (res?.data || []) as CompanyOwesRow[],
        summary: res?.summary as { totalPaid?: number; rowCount?: number } | undefined,
      };
    },
  });

  const txsQuery = useQuery({
    queryKey: ['driverPayoutTransactions'],
    queryFn: async () => {
      const page = await api.getTransactions(undefined, { limit: 5000, offset: 0 });
      const all = (Array.isArray(page) ? page : page?.data || []) as FinancialTransaction[];
      return all.filter((t) => isDriverPayoutTransaction(t));
    },
  });

  const outstandingRows = useMemo(() => {
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

  const awaitingRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (txsQuery.data || []).filter((t) => {
      if (String(t.status || '').toLowerCase() !== 'pending') return false;
      if (!q) return true;
      return (
        String(t.driverName || '').toLowerCase().includes(q) ||
        String(t.driverId || '').toLowerCase().includes(q) ||
        String(t.metadata?.workPeriodStart || '').includes(q)
      );
    });
  }, [txsQuery.data, search]);

  const paidRows = useMemo(() => {
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

  const awaitingTotal = awaitingRows.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const paidThisWeek = (txsQuery.data || [])
    .filter((t) => {
      const st = String(t.status || '').toLowerCase();
      if (st !== 'completed' && st !== 'verified') return false;
      const d = String(t.date || '').slice(0, 10);
      return d >= thisMonday;
    })
    .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  useEffect(() => {
    setSelected(new Set());
  }, [deskTab, weekFrom, weekTo, search]);

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
  const selectedTotal = selectedRows.reduce((s, r) => s + (Number(r.settlementAmount) || 0), 0);

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['companyOwesPeriods'] });
    void qc.invalidateQueries({ queryKey: ['settlementPaidPeriods'] });
    void qc.invalidateQueries({ queryKey: ['driverPayoutTransactions'] });
  };

  const exportCsv = () => {
    const rows = selectedRows.length > 0 ? selectedRows : outstandingRows;
    if (rows.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    const header = [
      'driver_id',
      'driver_name',
      'period_start',
      'period_end',
      'amount_owed',
      'passenger_cash',
      'already_paid',
    ];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
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
    a.download = `driver-payouts-${weekFrom}-to-${weekTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length !== 1 ? 's' : ''}`);
  };

  const saveSinglePayout = async (payload: RecordPayoutSavePayload) => {
    const pm = payload.paymentMethod || 'Cash';
    const isInstant = pm === 'Cash';
    const newTx: Partial<FinancialTransaction> = {
      driverId: payoutModal.driverId,
      driverName: payoutModal.driverName,
      amount: payload.amount,
      date: payload.date,
      description: payload.notes
        ? `Driver payout (${pm}): ${payload.notes}`
        : `Driver payout via ${pm}`,
      category: 'Driver Payouts',
      type: 'Payout',
      paymentMethod: pm as FinancialTransaction['paymentMethod'],
      status: isInstant ? 'Completed' : 'Pending',
      isReconciled: isInstant,
      referenceNumber: payload.referenceNumber,
      time: new Date().toLocaleTimeString(),
      metadata: {
        workPeriodStart: payload.workPeriodStart,
        workPeriodEnd: payload.workPeriodEnd,
      },
    };
    await api.saveTransaction(newTx);
    refreshAll();
  };

  const runBatchPay = async () => {
    if (selectedRows.length === 0) return;
    const needsRef =
      batchMethod === 'Bank Transfer' ||
      batchMethod === 'Mobile Money' ||
      batchMethod === 'Check';
    if (needsRef && !batchRef.trim()) {
      toast.error('Reference number is required for bank / mobile payouts');
      return;
    }
    setBatchBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      const isInstant = batchMethod === 'Cash';
      for (const row of selectedRows) {
        try {
          await api.saveTransaction({
            driverId: row.driverId,
            driverName: row.driverName || row.driverId,
            amount: Math.round((Number(row.settlementAmount) || 0) * 100) / 100,
            date: batchDate,
            description: `Driver payout via ${batchMethod} (batch)`,
            category: 'Driver Payouts',
            type: 'Payout',
            paymentMethod: batchMethod as FinancialTransaction['paymentMethod'],
            status: isInstant ? 'Completed' : 'Pending',
            isReconciled: isInstant,
            referenceNumber: batchRef.trim() || undefined,
            time: new Date().toLocaleTimeString(),
            metadata: {
              workPeriodStart: row.periodAnchor,
              workPeriodEnd: row.periodEnd,
            },
          });
          ok++;
        } catch {
          fail++;
        }
      }
      if (ok > 0) toast.success(`Recorded ${ok} payout${ok !== 1 ? 's' : ''}`);
      if (fail > 0) toast.error(`${fail} payout${fail !== 1 ? 's' : ''} failed`);
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
      toast.success('Payout verified');
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message || 'Verify failed');
    }
  };

  const loading = owesQuery.isLoading || paidQuery.isLoading || txsQuery.isLoading;

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-[1400px] mx-auto">
      <BusinessFinanceDeskChrome deskLabel="Driver Payouts" onBack={onBackToBusinessFinance} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-700" />
            Driver Payouts
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Pay drivers when Settlement shows Fleet owes — after passenger cash, fuel, and tolls.
            Does not change Cash Returned.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={refreshAll}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Company owes"
          value={MONEY(owesQuery.data?.summary?.totalOwed ?? 0)}
          sub={`${owesQuery.data?.summary?.driverCount ?? 0} drivers`}
          tone="owed"
        />
        <Kpi
          label="Open weeks"
          value={String(owesQuery.data?.summary?.rowCount ?? 0)}
          sub="company_owes periods"
        />
        <Kpi
          label="Awaiting bank clear"
          value={MONEY(awaitingTotal)}
          sub={`${awaitingRows.length} pending`}
          tone="pending"
        />
        <Kpi
          label="Paid this week"
          value={MONEY(paidThisWeek)}
          sub="cleared payouts since Mon"
          tone="paid"
        />
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
              className="h-9 bg-emerald-700 hover:bg-emerald-800"
              disabled={selectedRows.length === 0}
              onClick={() => setBatchOpen(true)}
            >
              Pay selected ({selectedRows.length})
            </Button>
          </div>
        )}
      </div>

      <Tabs value={deskTab} onValueChange={(v) => setDeskTab(v as DeskTab)}>
        <TabsList>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="awaiting">Awaiting clear</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
        </TabsList>

        <TabsContent value="outstanding" className="mt-4">
          <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        outstandingRows.length > 0 && selected.size === outstandingRows.length
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Settlement Week</TableHead>
                  <TableHead className="text-right">Passenger cash</TableHead>
                  <TableHead className="text-right">Already paid</TableHead>
                  <TableHead className="text-right">Fleet owes</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owesQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : outstandingRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                      No company-owes weeks in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  outstandingRows.map((r) => {
                    const key = rowKey(r);
                    return (
                      <TableRow key={key}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(key)}
                            onCheckedChange={() => toggleSelect(key)}
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
                        <TableCell className="text-right tabular-nums text-slate-500">
                          {MONEY(r.settlementPaid)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-emerald-800">
                          {MONEY(r.settlementAmount)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            className="h-8 bg-emerald-700 hover:bg-emerald-800"
                            onClick={() =>
                              setPayoutModal({
                                isOpen: true,
                                driverId: r.driverId,
                                driverName: r.driverName || r.driverId,
                                workPeriodStart: r.periodAnchor,
                                workPeriodEnd: r.periodEnd,
                                maxAmount: Number(r.settlementAmount) || 0,
                              })
                            }
                          >
                            Pay
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="awaiting" className="mt-4">
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
                {awaitingRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                      No pending bank / mobile payouts.
                    </TableCell>
                  </TableRow>
                ) : (
                  awaitingRows.map((tx) => (
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
                        <Button size="sm" variant="outline" className="h-8" onClick={() => verifyPending(tx)}>
                          Verify
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="paid" className="mt-4">
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
                {paidRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-slate-500">
                      No paid settlement weeks in this range.
                    </TableCell>
                  </TableRow>
                ) : (
                  paidRows.map((r) => (
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
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                          Settled
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
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

      <Dialog open={batchOpen} onOpenChange={(o) => !o && !batchBusy && setBatchOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pay selected drivers</DialogTitle>
            <DialogDescription>
              Records a full outstanding payout for each selected week ({selectedRows.length}{' '}
              row{selectedRows.length !== 1 ? 's' : ''}, {MONEY(selectedTotal)} total).
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
              className="bg-emerald-700 hover:bg-emerald-800"
              onClick={runBatchPay}
              disabled={batchBusy}
            >
              {batchBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Paying…
                </>
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

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'owed' | 'pending' | 'paid';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums mt-1',
          tone === 'owed' && 'text-emerald-800',
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
