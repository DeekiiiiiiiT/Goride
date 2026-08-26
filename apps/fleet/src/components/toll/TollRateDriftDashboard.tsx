import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, RefreshCw, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import { useTollLogs } from '../../hooks/useTollLogs';
import { generatePeriodWeekOptions } from '../../utils/periodWeekOptions';
import { resolvePeriod, inPeriod, formatPeriodLabel } from '../business-finance/periodRange';
import type { PeriodPreset } from '../business-finance/types';
import { formatJMD, formatJMDDelta } from '../../utils/formatJMD';
import { excludeVoided } from '../../utils/tollLogStatus';
import { buildTollDriftDashboard } from '../../utils/tollDriftDashboard';
import { api } from '../../services/api';
import { migrateToVersionedStore } from '../../utils/officialTollRate';
import type { TollRateScheduleStore } from '../../types/tollRateSchedule';
import { useFleetTimezone } from '../../utils/timezoneDisplay';

function currentWeekBounds(timezone?: string): { start: string; end: string } {
  const [week] = generatePeriodWeekOptions(1, timezone);
  return { start: week?.startDate || '', end: week?.endDate || '' };
}

export function TollRateDriftDashboard() {
  const { logs, loading, refresh } = useTollLogs();
  const fleetTz = useFleetTimezone();
  const initialWeek = useMemo(() => currentWeekBounds(fleetTz), [fleetTz]);
  const [preset, setPreset] = useState<PeriodPreset>('custom');
  const [customStart, setCustomStart] = useState(initialWeek.start);
  const [customEnd, setCustomEnd] = useState(initialWeek.end);
  const [store, setStore] = useState<TollRateScheduleStore | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);

  useEffect(() => {
    const week = currentWeekBounds(fleetTz);
    setCustomStart((prev) => prev || week.start);
    setCustomEnd((prev) => prev || week.end);
  }, [fleetTz]);

  useEffect(() => {
    let cancelled = false;
    setStoreLoading(true);
    api.getTollInfo()
      .then((res: any) => {
        if (cancelled) return;
        const migrated = migrateToVersionedStore(res?.store || res);
        setStore(migrated);
      })
      .catch(() => {
        if (!cancelled) setStore(null);
      })
      .finally(() => {
        if (!cancelled) setStoreLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const period = useMemo(
    () => resolvePeriod(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );
  const periodLabel = useMemo(() => formatPeriodLabel(period), [period]);

  const periodLogs = useMemo(
    () => excludeVoided(logs.filter((l) => l.isUsage && inPeriod(String(l.date || '').slice(0, 10), period))),
    [logs, period],
  );

  const dash = useMemo(
    () =>
      buildTollDriftDashboard(
        periodLogs.map((l) => ({
          id: l.id,
          date: l.date,
          absAmount: l.absAmount,
          plazaId: l.plazaId,
          plazaName: l.plazaName,
          isUsage: true,
          isVoided: l.isVoided,
          classId: (l._raw as any)?.metadata?.tollClassId || (l._raw as any)?.metadata?.classId || 'class1',
          paymentMethod:
            String(l.paymentMethodDisplay || '').toLowerCase().includes('cash')
              ? 'withoutTag'
              : 'withTag',
        })),
        store,
      ),
    [periodLogs, store],
  );

  const busy = loading || storeLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Rate drift</h1>
          <p className="text-sm text-slate-500 mt-1">
            Where the tag charged a different amount than the official rate card for {periodLabel}.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-0.5">
            <label className="text-[11px] text-slate-500">Period</label>
            <PeriodWeekDropdown
              selectedStart={period.startYmd}
              selectedEnd={period.endYmd}
              placeholder="Select week period"
              allowCustomRange
              weekCount={26}
              timezone={fleetTz}
              buttonClassName="h-11 min-h-11 text-sm"
              onSelect={(week) => {
                setCustomStart(week.startDate);
                setCustomEnd(week.endDate);
                setPreset('custom');
              }}
            />
          </div>
          <Button variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {busy ? (
        <div className="flex justify-center py-16 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Off-tariff passages</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{dash.drifting.length}</p>
                <p className="text-xs text-slate-500 mt-1">of {periodLogs.length} priced against the card</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tag vs expected</p>
                <p className={`mt-1 text-3xl font-bold tabular-nums ${dash.totalDelta > 0 ? 'text-rose-600' : dash.totalDelta < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {formatJMDDelta(dash.totalDelta, 2)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Tag {formatJMD(dash.totalTagSpend)} · expected {formatJMD(dash.totalExpected)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">On official card</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">{dash.pricedCount}</p>
                <p className="text-xs text-slate-500 mt-1">{dash.unpricedCount} had no matching rate</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-indigo-500" />
                  Plazas charging off-tariff
                </CardTitle>
                <CardDescription>Ranked by how far the tag drifted from the card.</CardDescription>
              </CardHeader>
              <CardContent>
                {dash.byPlaza.length === 0 ? (
                  <p className="text-sm text-slate-500 py-8 text-center">No rate drift in this period.</p>
                ) : (
                  <div className="space-y-3">
                    {dash.byPlaza.map((p) => (
                      <div key={p.plazaName} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{p.plazaName}</p>
                          <p className="text-xs text-slate-500">{p.count} passage{p.count === 1 ? '' : 's'}</p>
                        </div>
                        <Badge variant="outline" className={p.totalDelta > 0 ? 'text-rose-700 border-rose-200 bg-rose-50' : 'text-emerald-700 border-emerald-200 bg-emerald-50'}>
                          {formatJMDDelta(p.totalDelta, 2)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-rose-500" />
                  Drifted passages
                </CardTitle>
                <CardDescription>Each row is a tag charge that does not match the official rate.</CardDescription>
              </CardHeader>
              <CardContent>
                {dash.drifting.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
                    <AlertTriangle className="h-8 w-8 opacity-30" />
                    <p className="text-sm">Nothing drifted this period.</p>
                  </div>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Plaza</TableHead>
                          <TableHead className="text-right">Tag</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Delta</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dash.drifting.slice(0, 50).map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="text-xs">{String(row.date).slice(0, 10)}</TableCell>
                            <TableCell className="text-sm">{row.plazaName}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{formatJMD(row.tagAmount, 2)}</TableCell>
                            <TableCell className="text-right tabular-nums text-sm">{formatJMD(row.expectedAmount, 2)}</TableCell>
                            <TableCell className={`text-right tabular-nums text-sm font-medium ${row.delta > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {formatJMDDelta(row.delta, 2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
