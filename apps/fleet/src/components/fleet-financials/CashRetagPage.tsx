/**
 * Business Finance → Cash Retag
 * Preview then apply Settlement Week tags on historical Log Cash. Uses saveTransaction path only.
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, addDays } from 'date-fns';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import { useAuth } from '../auth/AuthContext';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import {
  listCashRetagCandidates,
  buildCashRetagPreview,
  buildCashRetagSavePayload,
  type CashRetagCandidate,
} from '../../utils/cashRetag';
import type { FinancialTransaction } from '../../types/data';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
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
import { FleetBusyProvider, useFleetBusy } from '../shared/FleetBusyLock';
import { useLockedDialog } from '../shared/useLockedDialog';

const MONEY = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });

export function CashRetagPage(props: {
  onBackToBusinessFinance?: () => void;
} = {}) {
  return (
    <FleetBusyProvider>
      <CashRetagPageInner {...props} />
    </FleetBusyProvider>
  );
}

function CashRetagPageInner({
  onBackToBusinessFinance,
}: {
  onBackToBusinessFinance?: () => void;
} = {}) {
  const fleetTz = useFleetTimezone();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { runExclusive, setMessage } = useFleetBusy();
  const [driverFilter, setDriverFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [includeTagged, setIncludeTagged] = useState(false);
  const [allowReplace, setAllowReplace] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [weekOverrideById, setWeekOverrideById] = useState<Record<string, string>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const {
    onOpenChange: lockedPreviewOpenChange,
    contentProps: lockedPreviewContentProps,
  } = useLockedDialog(previewOpen, setPreviewOpen, applying);

  const driversQuery = useQuery({
    queryKey: ['drivers', 'cash-retag'],
    queryFn: () => api.getDrivers(),
  });

  const driverList = useMemo(() => {
    const raw = driversQuery.data;
    return Array.isArray(raw) ? raw : raw?.data || [];
  }, [driversQuery.data]);

  const driverIds = useMemo(
    () => driverList.map((d: any) => String(d?.id || d?.roamId || '').trim()).filter(Boolean),
    [driverList],
  );

  const driverNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of driverList) {
      const id = String(d?.id || d?.roamId || '').trim();
      if (id) map[id] = d?.name || d?.fullName || id;
    }
    return map;
  }, [driverList]);

  const txQuery = useQuery({
    queryKey: ['cash-retag-transactions', driverIds.join(',')],
    enabled: driverIds.length > 0,
    queryFn: () => api.getAllTransactionsForDrivers(driverIds),
  });

  const txById = useMemo(() => {
    const map = new Map<string, FinancialTransaction>();
    for (const t of txQuery.data || []) {
      if (t?.id) map.set(String(t.id), t);
    }
    return map;
  }, [txQuery.data]);

  const candidates = useMemo(
    () =>
      listCashRetagCandidates(txQuery.data || [], driverNameById, {
        timezone: fleetTz,
        includeTagged,
        driverId: driverFilter === 'all' ? undefined : driverFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    [txQuery.data, driverNameById, fleetTz, includeTagged, driverFilter, dateFrom, dateTo],
  );

  const selected = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds],
  );

  const { preview, blocked } = useMemo(
    () =>
      buildCashRetagPreview(
        selected,
        Object.fromEntries(
          selected.map((c) => [c.id, weekOverrideById[c.id] || c.suggestedWeekYmd]),
        ),
        allowReplace,
      ),
    [selected, weekOverrideById, allowReplace],
  );

  const loading = driversQuery.isLoading || txQuery.isLoading;

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible(on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of candidates) {
        if (on) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  async function applyPreview() {
    if (preview.length === 0) {
      toast.error('Nothing to apply — check selection or enable replace for tagged rows');
      return;
    }
    setApplying(true);
    const by = user?.email || user?.id || 'ops';
    let ok = 0;
    let fail = 0;
    const locked = await runExclusive(`Tagging ${preview.length} payments…`, async () => {
    try {
      for (let i = 0; i < preview.length; i++) {
        const row = preview[i];
        setMessage(`Tagging payment ${i + 1} of ${preview.length}…`);
        const original = txById.get(row.id);
        if (!original) {
          fail++;
          continue;
        }
        try {
          const payload = buildCashRetagSavePayload(original, row.newWeekYmd, by);
          await api.saveTransaction(payload);
          ok++;
        } catch {
          fail++;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['cash-retag-transactions'] });
      setSelectedIds(new Set());
      lockedPreviewOpenChange(false);
      if (ok) toast.success(`Tagged ${ok} payment${ok === 1 ? '' : 's'}`);
      if (fail) toast.error(`${fail} failed to save`);
      return true;
    } finally {
      setApplying(false);
    }
    });
    if (locked === undefined) {
      setApplying(false);
      toast.message('Another action is still running — try again when it finishes.');
    }
  }

  return (
    <div className="space-y-6">
      {onBackToBusinessFinance && (
        <BusinessFinanceDeskChrome deskLabel="Cash Retag" onBack={onBackToBusinessFinance} />
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Cash Retag</h1>
          <p className="mt-1 text-sm text-slate-500 max-w-2xl">
            Tag historical Log Cash to a Settlement Week so it counts as Cash Returned. Preview first — no silent overwrite of existing tags unless you allow replace.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => txQuery.refetch()}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Driver</label>
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All drivers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All drivers</SelectItem>
              {driverList.map((d: any) => {
                const id = String(d?.id || d?.roamId || '');
                return (
                  <SelectItem key={id} value={id}>
                    {d?.name || d?.fullName || id}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Date from</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Date to</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
          <Checkbox checked={includeTagged} onCheckedChange={(v) => setIncludeTagged(v === true)} />
          Include already tagged
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
          <Checkbox checked={allowReplace} onCheckedChange={(v) => setAllowReplace(v === true)} />
          Allow replace existing tag
        </label>
      </div>

      <div className="flex gap-2">
        <Button
          disabled={selected.length === 0}
          onClick={() => setPreviewOpen(true)}
        >
          Preview {selected.length > 0 ? `(${selected.length})` : ''}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toggleAllVisible(true)}>
          Select all visible
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
          Clear selection
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-16 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading cash payments…
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-10 text-center text-slate-500 text-sm">
          No cash payments match. Untagged cleared Log Cash appears here by default.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Current week</TableHead>
                <TableHead>New week (Monday)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates.map((c) => (
                <CandidateRow
                  key={c.id}
                  c={c}
                  checked={selectedIds.has(c.id)}
                  weekValue={weekOverrideById[c.id] || c.suggestedWeekYmd}
                  onToggle={() => toggleId(c.id)}
                  onWeekChange={(ymd) =>
                    setWeekOverrideById((prev) => ({ ...prev, [c.id]: ymd }))
                  }
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={previewOpen} onOpenChange={lockedPreviewOpenChange}>
        <DialogContent className="max-w-lg" hideCloseButton={applying} {...lockedPreviewContentProps}>
          <DialogHeader>
            <DialogTitle>Preview retag</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm max-h-80 overflow-y-auto">
            <p className="text-slate-500">
              {preview.length} will apply
              {blocked.length > 0 ? ` · ${blocked.length} blocked (enable replace for tagged)` : ''}
            </p>
            {preview.map((p) => (
              <div key={p.id} className="flex justify-between gap-2 border-b border-slate-100 py-2">
                <span>
                  {p.driverName} · {MONEY(p.amount)}
                  {p.willReplaceExistingTag && (
                    <span className="text-amber-600 text-xs ml-1">(replace)</span>
                  )}
                </span>
                <span className="tabular-nums text-slate-600">
                  {p.currentWeekYmd || '—'} → {p.newWeekYmd}
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => lockedPreviewOpenChange(false)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={() => void applyPreview()} disabled={applying || preview.length === 0}>
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : `Apply ${preview.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CandidateRow({
  c,
  checked,
  weekValue,
  onToggle,
  onWeekChange,
}: {
  c: CashRetagCandidate;
  checked: boolean;
  weekValue: string;
  onToggle: () => void;
  onWeekChange: (ymd: string) => void;
}) {
  const weekEnd = /^\d{4}-\d{2}-\d{2}$/.test(weekValue)
    ? format(addDays(parseISO(weekValue), 6), 'MMM d')
    : '';
  return (
    <TableRow>
      <TableCell>
        <Checkbox checked={checked} onCheckedChange={() => onToggle()} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm">{c.date}</TableCell>
      <TableCell className="font-medium">{c.driverName}</TableCell>
      <TableCell className="text-right tabular-nums">{MONEY(c.amount)}</TableCell>
      <TableCell className="text-sm text-slate-500">{c.currentWeekYmd || 'Untagged'}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            className="w-40"
            value={weekValue}
            onChange={(e) => onWeekChange(e.target.value)}
          />
          {weekEnd && <span className="text-xs text-slate-400">to {weekEnd}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}
