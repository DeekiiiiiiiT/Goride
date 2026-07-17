/**
 * Fleet Operations → Fleet Financials → Bank Deposits
 * Confirm Uber bank amounts actually received by the FLEET org (not a driver).
 * Does NOT change Cash Returned / Settlement math.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, addDays } from 'date-fns';
import { CalendarRange, ChevronRight, Landmark, Loader2, RefreshCw, Settings2, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import {
  aggregateExpectedBankByWeek,
  mergeBankReceiveConfirms,
  fleetBankDisplayStatus,
  fleetBankDisplayStatusLabel,
  fleetBankPlatformLabel,
  type FleetBankDisplayStatus,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { cn } from '../ui/utils';
import { BankStatementImport } from './BankStatementImport';
import { BankDepositsSummaryCards } from './BankDepositsSummaryCards';

type DeskTab = 'outstanding' | 'completed';
type StatusFilter = 'all' | FleetBankDisplayStatus;

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

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

function StatusCell({ row }: { row: FleetBankReceiveRow }) {
  const display = fleetBankDisplayStatus(row);
  const hasVariance = row.variance != null && Math.abs(row.variance) > 0.005;
  return (
    <div className="space-y-1 min-w-[140px]">
      <div className="flex flex-wrap gap-1.5 items-center">
        <Badge
          variant={display === 'needs_statement' ? 'secondary' : 'default'}
          className={cn(
            display === 'needs_statement' && 'bg-amber-100 text-amber-900 hover:bg-amber-100',
            display === 'statement_matched' && 'bg-emerald-600 hover:bg-emerald-600',
            display === 'manual_confirmed' && 'bg-slate-700 hover:bg-slate-700',
          )}
        >
          {fleetBankDisplayStatusLabel(display)}
        </Badge>
        {hasVariance && (
          <Badge variant="outline" className="border-amber-300 text-amber-800">
            Variance
          </Badge>
        )}
      </div>
      {row.statementFileName ? (
        <p className="text-[11px] text-slate-400 truncate max-w-[180px]" title={row.statementFileName}>
          {row.statementFileName}
        </p>
      ) : null}
    </div>
  );
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
            <TableHead>Platform</TableHead>
            <TableHead className="text-right">Expected (fleet bank)</TableHead>
            <TableHead className="text-right">Received</TableHead>
            <TableHead className="text-right">Variance</TableHead>
            <TableHead>Bank date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-slate-500 py-8">
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
                  <TableCell>
                    <Badge variant="outline">{fleetBankPlatformLabel(row.platform)}</Badge>
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
                  <TableCell className="whitespace-nowrap text-sm text-slate-600">
                    {row.bankDateYmd
                      ? format(parseISO(row.bankDateYmd), 'MMM d, yyyy')
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusCell row={row} />
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

  const statusCounts = useMemo(() => {
    const counts = {
      all: scopedByFilters.length,
      needs_statement: 0,
      statement_matched: 0,
      manual_confirmed: 0,
    };
    for (const r of scopedByFilters) {
      counts[fleetBankDisplayStatus(r)] += 1;
    }
    return counts;
  }, [scopedByFilters]);

  const filteredByStatus = useMemo(() => {
    if (statusFilter === 'all') return scopedByFilters;
    return scopedByFilters.filter((r) => fleetBankDisplayStatus(r) === statusFilter);
  }, [scopedByFilters, statusFilter]);

  const outstandingRows = useMemo(() => {
    return filteredByStatus
      .filter((r) => r.status === 'unconfirmed')
      .sort((a, b) => b.weekStartYmd.localeCompare(a.weekStartYmd));
  }, [filteredByStatus]);

  const completedRows = useMemo(() => {
    return filteredByStatus
      .filter((r) => r.status === 'confirmed')
      .sort((a, b) => b.weekStartYmd.localeCompare(a.weekStartYmd));
  }, [filteredByStatus]);

  const outstandingTotal = useMemo(
    () => scopedByFilters.filter((r) => r.status === 'unconfirmed').length,
    [scopedByFilters],
  );
  const completedTotal = useMemo(
    () => scopedByFilters.filter((r) => r.status === 'confirmed').length,
    [scopedByFilters],
  );

  const loading = bankQuery.isLoading || confirmsQuery.isLoading;

  async function saveConfirm(
    row: FleetBankReceiveRow,
    amountReceived: number,
    method: 'manual' | 'statement' = 'manual',
  ) {
    const key = row.weekStartYmd;
    setSavingKey(key);
    // Editing a statement-matched row keeps statement audit trail unless ops forces manual.
    const effectiveMethod =
      method === 'manual' && row.confirmMethod === 'statement' && row.status === 'confirmed'
        ? 'statement'
        : method;
    try {
      await api.upsertFleetBankConfirm({
        organizationId: organizationId || undefined,
        weekStartYmd: row.weekStartYmd,
        amountReceived,
        expectedAmount: row.expected,
        confirmMethod: effectiveMethod,
        bankDateYmd:
          effectiveMethod === 'statement' ? row.bankDateYmd || undefined : undefined,
        statementFileName:
          effectiveMethod === 'statement' ? row.statementFileName || undefined : undefined,
        platform: row.platform,
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

  const filterChips: Array<{ id: StatusFilter; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'needs_statement', label: 'Needs statement' },
    { id: 'statement_matched', label: 'Statement' },
    { id: 'manual_confirmed', label: 'Manual' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950 p-2.5 mt-0.5">
            <Landmark className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Bank Deposits</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-xl">
              Confirm Uber bank deposits into the fleet account (org week). Drivers do not receive this wire —
              Cash Wallet stays collection-only; who owes whom stays on Financials → Settlement.
            </p>
          </div>
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

      {/* KPI dashboard — respects the week filter below */}
      <BankDepositsSummaryCards rows={scopedByFilters} />

      {/* Week range toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 pb-2">
            <CalendarRange className="h-4 w-4 text-slate-400" />
            Week range
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">From (Monday)</label>
            <Input type="date" value={weekFrom} onChange={(e) => setWeekFrom(e.target.value)} className="w-44 h-9" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">To (Monday)</label>
            <Input type="date" value={weekTo} onChange={(e) => setWeekTo(e.target.value)} className="w-44 h-9" />
          </div>
          {(weekFrom || weekTo) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-slate-500"
              onClick={() => {
                setWeekFrom('');
                setWeekTo('');
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Fleet platform IDs — settings, collapsed by default */}
      <Collapsible className="group/platform-ids rounded-lg border border-slate-200 dark:border-slate-800">
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-4 py-3 text-left cursor-pointer">
            <Settings2 className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Fleet platform IDs</span>
            <span className="text-xs text-slate-500 hidden sm:inline">
              — Organization UUIDs identify the fleet bank account
            </span>
            <ChevronRight className="ml-auto h-4 w-4 text-slate-400 transition-transform duration-200 group-data-[state=open]/platform-ids:rotate-90" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
            <p className="text-xs text-slate-500">
              Organization UUIDs identify the fleet bank account. Drivers are separate — even if the owner also drives.
              InDrive has no fleet program yet.
            </p>
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
        </CollapsibleContent>
      </Collapsible>

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="outstanding">
                Outstanding
                <Badge variant="secondary" className="ml-2 tabular-nums">
                  {outstandingTotal}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="completed">
                Completed
                <Badge variant="secondary" className="ml-2 tabular-nums">
                  {completedTotal}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-wrap gap-1.5">
              {filterChips.map((chip) => (
                <Button
                  key={chip.id}
                  type="button"
                  size="sm"
                  variant={statusFilter === chip.id ? 'default' : 'outline'}
                  className="h-8"
                  onClick={() => setStatusFilter(chip.id)}
                >
                  {chip.label}
                  <span className="ml-1.5 tabular-nums text-xs opacity-80">
                    {statusCounts[chip.id]}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <TabsContent value="outstanding" className="mt-0">
            <BankReceiveTable
              rows={outstandingRows}
              mode="outstanding"
              emptyLabel="Nothing outstanding for this filter."
              savingKey={savingKey}
              onConfirm={(row) => void saveConfirm(row, row.expected, 'manual')}
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
              emptyLabel="No confirmed weeks for this filter."
              savingKey={savingKey}
              onConfirm={(row) => void saveConfirm(row, row.expected, 'manual')}
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
              <p className="text-slate-500">
                {fleetBankPlatformLabel(enterRow.platform)} · week of {enterRow.weekStartYmd}
              </p>
              <p>
                Expected:{' '}
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
              <p className="text-xs text-slate-400">
                Saves as Manual confirm (use Upload PDF/CSV Accept for statement-matched).
              </p>
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
                void saveConfirm(enterRow, n, 'manual');
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
