/**
 * Fleet Operations → Fleet Financials
 * Confirm Uber bank amounts actually received. Does NOT change Cash Returned / Settlement.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, addDays } from 'date-fns';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import {
  aggregateExpectedBankByDriverWeek,
  mergeBankReceiveConfirms,
  type FleetBankReceiveRow,
} from '../../utils/fleetBankReceive';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { cn } from '../ui/utils';
import { BankStatementImport } from './BankStatementImport';

const MONEY = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

async function fetchAllPayoutBankEvents(startDate?: string, endDate?: string) {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 500;
  for (let i = 0; i < 40; i++) {
    const page = await api.getCanonicalLedgerEvents({
      eventTypes: 'payout_bank',
      startDate,
      endDate,
      limit,
      offset,
    });
    const chunk = page.data || [];
    all.push(...chunk);
    if (!page.hasMore || chunk.length === 0) break;
    offset += limit;
  }
  return all;
}

export function FleetFinancialsPage() {
  const fleetTz = useFleetTimezone();
  const queryClient = useQueryClient();
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unconfirmed' | 'confirmed'>('unconfirmed');
  const [weekFrom, setWeekFrom] = useState('');
  const [weekTo, setWeekTo] = useState('');
  const [enterRow, setEnterRow] = useState<FleetBankReceiveRow | null>(null);
  const [enterAmount, setEnterAmount] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const driversQuery = useQuery({
    queryKey: ['drivers', 'fleet-financials'],
    queryFn: () => api.getDrivers(),
  });

  const bankQuery = useQuery({
    queryKey: ['fleet-bank-expected', weekFrom || null, weekTo || null],
    queryFn: () => fetchAllPayoutBankEvents(weekFrom || undefined, weekTo || undefined),
  });

  const confirmsQuery = useQuery({
    queryKey: ['fleet-bank-confirms'],
    queryFn: () => api.getFleetBankConfirms(),
  });

  const driverNameById = useMemo(() => {
    const map: Record<string, string> = {};
    const list = Array.isArray(driversQuery.data) ? driversQuery.data : driversQuery.data?.data || [];
    for (const d of list) {
      const id = String(d?.id || d?.roamId || '').trim();
      if (!id) continue;
      map[id] = d?.name || d?.fullName || id;
    }
    return map;
  }, [driversQuery.data]);

  const rows = useMemo(() => {
    const expected = aggregateExpectedBankByDriverWeek(
      bankQuery.data,
      driverNameById,
      fleetTz,
    );
    return mergeBankReceiveConfirms(expected, confirmsQuery.data?.data);
  }, [bankQuery.data, confirmsQuery.data, driverNameById, fleetTz]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => (driverFilter === 'all' ? true : r.driverId === driverFilter))
      .filter((r) => (statusFilter === 'all' ? true : r.status === statusFilter))
      .filter((r) => (!weekFrom ? true : r.weekStartYmd >= weekFrom))
      .filter((r) => (!weekTo ? true : r.weekStartYmd <= weekTo))
      .sort((a, b) => {
        // Unconfirmed first, then newest week
        if (a.status !== b.status) return a.status === 'unconfirmed' ? -1 : 1;
        if (a.weekStartYmd !== b.weekStartYmd) return b.weekStartYmd.localeCompare(a.weekStartYmd);
        return a.driverName.localeCompare(b.driverName);
      });
  }, [rows, driverFilter, statusFilter, weekFrom, weekTo]);

  const driverOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) seen.set(r.driverId, r.driverName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const loading = driversQuery.isLoading || bankQuery.isLoading || confirmsQuery.isLoading;

  async function saveConfirm(row: FleetBankReceiveRow, amountReceived: number) {
    const key = `${row.driverId}|${row.weekStartYmd}`;
    setSavingKey(key);
    try {
      await api.upsertFleetBankConfirm({
        driverId: row.driverId,
        weekStartYmd: row.weekStartYmd,
        amountReceived,
        expectedAmount: row.expected,
      });
      await queryClient.invalidateQueries({ queryKey: ['fleet-bank-confirms'] });
      toast.success('Bank amount saved');
      setEnterRow(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Fleet Financials</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-xl">
            Confirm Uber bank amounts actually received. Driver Cash Wallet is collection only; who owes whom stays on Financials → Settlement. This desk never changes Cash Returned.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            bankQuery.refetch();
            confirmsQuery.refetch();
          }}
          disabled={loading}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Week from (Monday)</label>
          <Input type="date" value={weekFrom} onChange={(e) => setWeekFrom(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Week to (Monday)</label>
          <Input type="date" value={weekTo} onChange={(e) => setWeekTo(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Driver</label>
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All drivers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All drivers</SelectItem>
              {driverOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Status</label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unconfirmed">Unconfirmed first</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <BankStatementImport
        expectedRows={rows}
        onConfirmed={() => {
          void queryClient.invalidateQueries({ queryKey: ['fleet-bank-confirms'] });
        }}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-16 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading bank payouts…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 text-sm">
          No Uber bank payout data found. Import or load the ledger — amounts are not invented here.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Expected (Uber bank)</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-500 py-8">
                    No rows match filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const key = `${row.driverId}|${row.weekStartYmd}`;
                  const weekEnd = addDays(parseISO(row.weekStartYmd), 6);
                  const busy = savingKey === key;
                  return (
                    <TableRow key={key}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {format(parseISO(row.weekStartYmd), 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="font-medium">{row.driverName}</TableCell>
                      <TableCell className="text-right tabular-nums">{MONEY(row.expected)}</TableCell>
                      <TableCell className="text-right tabular-nums">{MONEY(row.amountReceived)}</TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          row.variance != null && row.variance !== 0 && 'text-amber-700 dark:text-amber-400',
                        )}
                      >
                        {row.variance == null
                          ? '—'
                          : `${row.variance > 0 ? '+' : ''}${MONEY(row.variance)}`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'confirmed' ? 'default' : 'secondary'}>
                          {row.status === 'confirmed' ? 'Confirmed' : 'Unconfirmed'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2 whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => saveConfirm(row, row.expected)}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setEnterRow(row);
                            setEnterAmount(
                              String(row.amountReceived ?? row.expected ?? ''),
                            );
                          }}
                        >
                          Enter amount
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!enterRow} onOpenChange={(open) => !open && setEnterRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter amount received</DialogTitle>
          </DialogHeader>
          {enterRow && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-500">
                {enterRow.driverName} · week of {enterRow.weekStartYmd}
              </p>
              <p>
                Expected from Uber:{' '}
                <span className="font-medium tabular-nums">{MONEY(enterRow.expected)}</span>
              </p>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Amount received</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={enterAmount}
                  onChange={(e) => setEnterAmount(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnterRow(null)}>
              Cancel
            </Button>
            <Button
              disabled={!enterRow || savingKey != null}
              onClick={() => {
                if (!enterRow) return;
                const n = Number(enterAmount);
                if (!Number.isFinite(n) || n < 0) {
                  toast.error('Enter a valid amount');
                  return;
                }
                void saveConfirm(enterRow, n);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
