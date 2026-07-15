/**
 * Fleet Operations → Fleet Financials
 * Confirm Uber bank amounts actually received by the FLEET org (not a driver).
 * Does NOT change Cash Returned / Settlement math.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, addDays } from 'date-fns';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import {
  aggregateExpectedBankByWeek,
  mergeBankReceiveConfirms,
  type FleetBankReceiveRow,
} from '../../utils/fleetBankReceive';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import { useAuth } from '../auth/AuthContext';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { cn } from '../ui/utils';
import { BankStatementImport } from './BankStatementImport';

type DeskTab = 'outstanding' | 'completed';

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

function BankReceiveTable({
  rows,
  mode,
  emptyLabel,
  savingKey,
  onConfirm,
  onEnterAmount,
  onUnconfirm,
}: {
  rows: FleetBankReceiveRow[];
  mode: DeskTab;
  emptyLabel: string;
  savingKey: string | null;
  onConfirm: (row: FleetBankReceiveRow) => void;
  onEnterAmount: (row: FleetBankReceiveRow) => void;
  onUnconfirm?: (row: FleetBankReceiveRow) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Week</TableHead>
            <TableHead className="text-right">Expected (fleet bank)</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Variance</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const key = row.weekStartYmd;
              const weekEnd = addDays(parseISO(row.weekStartYmd), 6);
              const busy = savingKey === key;
              return (
                <TableRow key={key}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(parseISO(row.weekStartYmd), 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
                  </TableCell>
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
                    {mode === 'outstanding' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => onConfirm(row)}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => onEnterAmount(row)}
                    >
                      {mode === 'completed' ? 'Edit amount' : 'Enter amount'}
                    </Button>
                    {mode === 'completed' && onUnconfirm && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        className="text-slate-600 hover:text-rose-700"
                        onClick={() => onUnconfirm(row)}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Unconfirm'}
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

export function FleetFinancialsPage() {
  const fleetTz = useFleetTimezone();
  const { organizationId } = useAuth();
  const queryClient = useQueryClient();
  const [deskTab, setDeskTab] = useState<DeskTab>('outstanding');
  const [weekFrom, setWeekFrom] = useState('');
  const [weekTo, setWeekTo] = useState('');
  const [enterRow, setEnterRow] = useState<FleetBankReceiveRow | null>(null);
  const [enterAmount, setEnterAmount] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const bankQuery = useQuery({
    queryKey: ['fleet-bank-expected', weekFrom || null, weekTo || null],
    queryFn: () => fetchAllPayoutBankEvents(weekFrom || undefined, weekTo || undefined),
  });

  const confirmsQuery = useQuery({
    queryKey: ['fleet-bank-confirms'],
    queryFn: () => api.getFleetBankConfirms(),
  });

  const orgSettingsQuery = useQuery({
    queryKey: ['organization-settings', organizationId],
    queryFn: () => api.getOrganizationSettings(organizationId || undefined),
    enabled: Boolean(organizationId),
  });
  const [uberOrgUuidDraft, setUberOrgUuidDraft] = useState('');
  const [roamOrgUuidDraft, setRoamOrgUuidDraft] = useState('');
  const [savingOrgSettings, setSavingOrgSettings] = useState(false);

  React.useEffect(() => {
    const d = orgSettingsQuery.data?.data;
    if (!d) return;
    setUberOrgUuidDraft(d.uberOrganizationUuid || '');
    setRoamOrgUuidDraft(d.roamOrganizationUuid || '');
  }, [orgSettingsQuery.data?.data]);

  async function saveOrgPlatformIds() {
    setSavingOrgSettings(true);
    try {
      await api.upsertOrganizationSettings({
        organizationId: organizationId || undefined,
        uberOrganizationUuid: uberOrgUuidDraft.trim() || null,
        roamOrganizationUuid: roamOrgUuidDraft.trim() || null,
        inDriveOrganizationUuid: null,
      });
      await queryClient.invalidateQueries({ queryKey: ['organization-settings', organizationId] });
      toast.success('Fleet platform IDs saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save platform IDs');
    } finally {
      setSavingOrgSettings(false);
    }
  }

  const rows = useMemo(() => {
    const expected = aggregateExpectedBankByWeek(bankQuery.data, fleetTz);
    return mergeBankReceiveConfirms(expected, confirmsQuery.data?.data, organizationId);
  }, [bankQuery.data, confirmsQuery.data, fleetTz, organizationId]);

  const scopedByFilters = useMemo(() => {
    return rows
      .filter((r) => (!weekFrom ? true : r.weekStartYmd >= weekFrom))
      .filter((r) => (!weekTo ? true : r.weekStartYmd <= weekTo));
  }, [rows, weekFrom, weekTo]);

  const outstandingRows = useMemo(() => {
    return scopedByFilters
      .filter((r) => r.status === 'unconfirmed')
      .sort((a, b) => b.weekStartYmd.localeCompare(a.weekStartYmd));
  }, [scopedByFilters]);

  const completedRows = useMemo(() => {
    return scopedByFilters
      .filter((r) => r.status === 'confirmed')
      .sort((a, b) => b.weekStartYmd.localeCompare(a.weekStartYmd));
  }, [scopedByFilters]);

  const loading = bankQuery.isLoading || confirmsQuery.isLoading;

  async function saveConfirm(row: FleetBankReceiveRow, amountReceived: number) {
    const key = row.weekStartYmd;
    setSavingKey(key);
    try {
      await api.upsertFleetBankConfirm({
        organizationId: organizationId || undefined,
        weekStartYmd: row.weekStartYmd,
        amountReceived,
        expectedAmount: row.expected,
      });
      await queryClient.invalidateQueries({ queryKey: ['fleet-bank-confirms'] });
      toast.success('Fleet bank amount saved');
      setEnterRow(null);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSavingKey(null);
    }
  }

  async function unconfirm(row: FleetBankReceiveRow) {
    const key = row.weekStartYmd;
    setSavingKey(key);
    try {
      await api.deleteFleetBankConfirm({
        organizationId: organizationId || undefined,
        weekStartYmd: row.weekStartYmd,
      });
      await queryClient.invalidateQueries({ queryKey: ['fleet-bank-confirms'] });
      toast.success('Moved back to Outstanding');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to unconfirm');
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
            Confirm Uber bank deposits into the fleet account (org week). Drivers do not receive this wire —
            Cash Wallet stays collection-only; who owes whom stays on Financials → Settlement.
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
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Fleet platform IDs</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Organization UUIDs identify the fleet bank account. Drivers are separate — even if the owner also drives.
            InDrive has no fleet program yet.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1 min-w-[280px] flex-1">
            <label className="text-xs text-slate-500">Uber Organization UUID</label>
            <Input
              value={uberOrgUuidDraft}
              onChange={(e) => setUberOrgUuidDraft(e.target.value)}
              placeholder="From payments_organization.csv"
            />
          </div>
          <div className="space-y-1 min-w-[280px] flex-1">
            <label className="text-xs text-slate-500">Roam Organization UUID</label>
            <Input
              value={roamOrgUuidDraft}
              onChange={(e) => setRoamOrgUuidDraft(e.target.value)}
              placeholder="Native fleet identity"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savingOrgSettings || !organizationId}
            onClick={() => void saveOrgPlatformIds()}
          >
            {savingOrgSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save IDs'}
          </Button>
        </div>
      </div>

      <BankStatementImport
        expectedRows={rows}
        organizationId={organizationId}
        onConfirmed={() => {
          void queryClient.invalidateQueries({ queryKey: ['fleet-bank-confirms'] });
        }}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-16 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading fleet bank payouts…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 text-sm">
          No Uber bank payout data found. Import payments_organization (and driver statements) — amounts are
          not invented here.
        </div>
      ) : (
        <Tabs
          value={deskTab}
          onValueChange={(v) => setDeskTab(v as DeskTab)}
          className="space-y-4"
        >
          <TabsList>
            <TabsTrigger value="outstanding">
              Outstanding
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {outstandingRows.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="completed">
              Completed
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {completedRows.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outstanding" className="mt-0">
            <BankReceiveTable
              rows={outstandingRows}
              mode="outstanding"
              emptyLabel="Nothing outstanding — all visible weeks are confirmed."
              savingKey={savingKey}
              onConfirm={(row) => void saveConfirm(row, row.expected)}
              onEnterAmount={(row) => {
                setEnterRow(row);
                setEnterAmount(String(row.amountReceived ?? row.expected ?? ''));
              }}
            />
          </TabsContent>

          <TabsContent value="completed" className="mt-0">
            <BankReceiveTable
              rows={completedRows}
              mode="completed"
              emptyLabel="No confirmed weeks yet for these filters."
              savingKey={savingKey}
              onConfirm={(row) => void saveConfirm(row, row.expected)}
              onEnterAmount={(row) => {
                setEnterRow(row);
                setEnterAmount(String(row.amountReceived ?? row.expected ?? ''));
              }}
              onUnconfirm={(row) => void unconfirm(row)}
            />
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!enterRow} onOpenChange={(open) => !open && setEnterRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter amount received</DialogTitle>
          </DialogHeader>
          {enterRow && (
            <div className="space-y-3 text-sm">
              <p className="text-slate-500">Fleet bank · week of {enterRow.weekStartYmd}</p>
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
