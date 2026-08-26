import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { api } from '../../services/api';
import { TollTag } from '../../types/vehicle';
import { formatJMD } from '../../utils/formatJMD';
import { buildLowBalanceQueue } from '../../utils/tollLowBalanceQueue';
import { toast } from 'sonner';

export function TollLowBalanceQueue({
  onOpenTag,
}: {
  onOpenTag?: (tag: TollTag) => void;
}) {
  const [tags, setTags] = useState<TollTag[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getTollTags();
      setTags(data || []);
    } catch (e) {
      console.error(e);
      toast.error('Could not load toll tags');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const queue = useMemo(
    () =>
      buildLowBalanceQueue(
        tags.map((t) => ({
          id: t.id,
          tagNumber: t.tagNumber,
          provider: t.provider,
          status: t.status,
          assignedVehicleId: t.assignedVehicleId,
          assignedVehicleName: t.assignedVehicleName,
          balance: t.lastCalculatedBalance ?? 0,
          lowBalanceThreshold: t.lowBalanceThreshold,
        })),
      ),
    [tags],
  );

  const emptyCount = queue.filter((q) => q.ring === 'empty').length;
  const lowCount = queue.length - emptyCount;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Low balance tags</h1>
          <p className="text-sm text-slate-500 mt-1">
            Tags that need a top-up before drivers get stuck at a plaza.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Needs attention</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{queue.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Empty</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-rose-600">{emptyCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Below alert</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-amber-600">{lowCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-amber-500" />
            Top-up queue
          </CardTitle>
          <CardDescription>
            Sorted emptiest first. Balances use the last calculated figure from Tag Inventory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : queue.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <AlertTriangle className="h-8 w-8 opacity-30" />
              <p className="text-sm">Every active tag is above its alert threshold.</p>
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
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((row) => {
                    const tag = tags.find((t) => t.id === row.id);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{row.tagNumber}</span>
                            <Badge
                              variant="outline"
                              className={
                                row.ring === 'empty'
                                  ? 'bg-red-50 text-red-700 border-red-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }
                            >
                              {row.ring === 'empty' ? 'Empty' : 'Low'}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{row.provider}</p>
                        </TableCell>
                        <TableCell className="text-sm">{row.vehicleLabel}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatJMD(row.balance, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums text-slate-500">{formatJMD(row.threshold)}</TableCell>
                        <TableCell className="text-right tabular-nums text-amber-700">{formatJMD(row.shortfall, 2)}</TableCell>
                        <TableCell className="text-right">
                          {onOpenTag && tag ? (
                            <Button variant="ghost" size="sm" onClick={() => onOpenTag(tag)}>
                              Open
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
