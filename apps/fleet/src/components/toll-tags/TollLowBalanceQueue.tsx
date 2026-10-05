import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { api } from '../../services/api';
import { TollTag } from '../../types/vehicle';
import { formatJMD } from '../../utils/formatJMD';
import { tollErrorMessage } from '../../services/tollApiError';
import { TollLoadError } from './TollLoadError';
import { LogTollTopupModal } from '../vehicles/LogTollTopupModal';
import { toast } from 'sonner';

type QueueFilter = 'attention' | 'empty' | 'low' | 'unknown';

interface QueueItem {
  id: string;
  tagNumber: string;
  provider: string;
  vehicleLabel: string;
  assignedVehicleId?: string | null;
  balance: number | null;
  balanceKnown: boolean;
  threshold: number;
  ring: string;
  shortfall: number | null;
  daysToEmpty: number | null;
  tripsRemaining: number | null;
  balanceAsOf: string | null;
  stale: boolean;
  topupRequestedAt: string | null;
  updatedAt: string | null;
}

function money(value: number | null) {
  return value == null ? '—' : formatJMD(value, 2);
}

function ageLabel(asOf: string | null, stale: boolean) {
  if (!asOf) return 'Not calculated';
  const when = new Date(asOf).toLocaleString();
  return stale ? `Stale · as of ${when}` : `As of ${when}`;
}

export function TollLowBalanceQueue({
  onOpenTag,
}: {
  onOpenTag?: (tag: TollTag) => void;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [justUpdated, setJustUpdated] = useState(false);
  const [filter, setFilter] = useState<QueueFilter>('attention');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [topup, setTopup] = useState<QueueItem | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setJustUpdated(false);
    try {
      const data = await api.getTollLowBalance();
      setItems(Array.isArray(data?.items) ? data.items : []);
      setRefreshedAt(data?.refreshedAt || new Date().toISOString());
      setJustUpdated(true);
    } catch (e) {
      console.error(e);
      setItems([]);
      const message = tollErrorMessage(e, 'Could not load toll tags');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const providers = useMemo(
    () => [...new Set(items.map((item) => item.provider).filter(Boolean))].sort(),
    [items],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === 'empty' && item.ring !== 'empty') return false;
      if (filter === 'low' && item.ring !== 'low') return false;
      if (filter === 'unknown' && item.ring !== 'unknown') return false;
      if (provider !== 'all' && item.provider !== provider) return false;
      if (!q) return true;
      return `${item.tagNumber} ${item.provider} ${item.vehicleLabel}`.toLowerCase().includes(q);
    });
  }, [items, filter, search, provider]);

  const emptyCount = items.filter((item) => item.ring === 'empty').length;
  const lowCount = items.filter((item) => item.ring === 'low').length;
  const unknownCount = items.filter((item) => item.ring === 'unknown').length;
  const dash = loading || error;

  const exportCsv = () => {
    const header = ['Tag', 'Provider', 'Vehicle', 'Balance', 'Alert at', 'Shortfall', 'Days left', 'Trips left', 'As of'];
    const lines = [header, ...visible.map((item) => [
      item.tagNumber,
      item.provider,
      item.vehicleLabel,
      item.balance == null ? '' : String(item.balance),
      String(item.threshold),
      item.shortfall == null ? '' : String(item.shortfall),
      item.daysToEmpty == null ? '' : String(item.daysToEmpty),
      item.tripsRemaining == null ? '' : String(item.tripsRemaining),
      item.balanceAsOf || '',
    ])];
    const csv = lines.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'low-balance-tags.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const markRequested = async (item: QueueItem) => {
    try {
      await api.markTollTopupRequested(item.id, item.updatedAt || undefined);
      toast.success('Marked as requested');
      await load();
    } catch (e) {
      toast.error(tollErrorMessage(e, 'Could not mark this tag as requested'));
    }
  };

  const tile = (id: QueueFilter, label: string, value: number, className = '') => {
    const active = filter === id;
    return (
      <button type="button" className="text-left" onClick={() => setFilter(active && id !== 'attention' ? 'attention' : id)}>
        <Card className={active ? 'ring-2 ring-slate-900' : ''}>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
            <p className={`mt-1 text-3xl font-bold tabular-nums ${className}`}>{dash ? '—' : value}</p>
          </CardContent>
        </Card>
      </button>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Low balance tags</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tags that need a top-up before drivers get stuck at a plaza.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {refreshedAt && !error ? `Last refreshed ${new Date(refreshedAt).toLocaleString()}` : 'Not refreshed yet'}
          </p>
        </div>
        <div className="flex gap-2 self-end">
          <Button variant="outline" onClick={exportCsv} disabled={!visible.length}>
            Export
          </Button>
          <Button variant="outline" aria-label="Refresh" onClick={() => void load()}>
            {justUpdated && !loading ? <Check className="h-4 w-4 sm:mr-2" /> : <RefreshCw className="h-4 w-4 sm:mr-2" />}
            <span className="hidden sm:inline">{justUpdated && !loading ? 'Updated' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {tile('attention', 'Needs attention', items.length)}
        {tile('empty', 'Empty', emptyCount, 'text-rose-600')}
        {tile('low', 'Below alert', lowCount, 'text-amber-600')}
        {tile('unknown', 'Unknown', unknownCount, 'text-slate-500')}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-500" />
            Top-up queue
          </CardTitle>
          <CardDescription>
            Sorted by how soon the tag runs dry. A missing balance stays Unknown until the server has calculated one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tag, vehicle, or provider"
              aria-label="Search tags"
            />
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={provider}
              aria-label="Provider"
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="all">All providers</option>
              {providers.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : error ? (
            <TollLoadError message={error} onRetry={() => void load()} />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <AlertTriangle className="h-8 w-8 opacity-30" />
              <p className="text-sm">
                {items.length === 0
                  ? 'Every active tag is above its alert threshold.'
                  : 'No tags match this filter.'}
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tag</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Alert at</TableHead>
                    <TableHead className="text-right">Shortfall</TableHead>
                    <TableHead className="text-right">Days left</TableHead>
                    <TableHead className="text-right">Trips left</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{row.tagNumber}</span>
                          <Badge variant="outline" className={
                            row.ring === 'empty'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : row.ring === 'unknown'
                                ? 'bg-slate-50 text-slate-600 border-slate-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                          }>
                            {row.ring === 'empty' ? 'Empty' : row.ring === 'unknown' ? 'Unknown' : 'Low'}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{row.provider}</p>
                        <p className="text-[11px] text-slate-400">{ageLabel(row.balanceAsOf, row.stale)}</p>
                      </TableCell>
                      <TableCell className="text-sm">{row.vehicleLabel}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{money(row.balance)}</TableCell>
                      <TableCell className="text-right tabular-nums text-slate-500">{formatJMD(row.threshold)}</TableCell>
                      <TableCell className="text-right tabular-nums text-amber-700">{money(row.shortfall)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.daysToEmpty == null ? '—' : row.daysToEmpty}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.tripsRemaining == null ? '—' : row.tripsRemaining}</TableCell>
                      <TableCell className="text-right space-x-1">
                        {onOpenTag ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              void api.getTollTag(row.id).then((tag: TollTag) => {
                                if (tag?.id) onOpenTag(tag);
                                else toast.error('That tag is no longer in the inventory');
                              }).catch((e) => toast.error(tollErrorMessage(e, 'Could not open this tag')));
                            }}
                          >
                            Open
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" disabled={!row.assignedVehicleId} onClick={() => setTopup(row)}>
                          Record top-up
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void markRequested(row)}>
                          {row.topupRequestedAt ? 'Requested' : 'Mark requested'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {topup?.assignedVehicleId ? (
        <LogTollTopupModal
          isOpen
          onClose={() => setTopup(null)}
          vehicleId={topup.assignedVehicleId}
          vehicleName={topup.vehicleLabel}
          tollTagId={topup.tagNumber}
          tollTagUuid={topup.id}
          onSuccess={() => {
            setTopup(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
