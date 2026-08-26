/**
 * Rate card history: who published what, what was in force on any given day,
 * and exactly which prices moved between two cards.
 *
 * Published cards are immutable, so the only way to correct a mistake is to
 * publish another one. That makes "what did this cost back then" a question the
 * finance team has to be able to answer without reading the database.
 */
import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { ArrowDown, ArrowUp, CalendarDays, Minus, User } from 'lucide-react';
import type { TollRateScheduleVersion } from '../../types/tollRateSchedule';
import { isoToDisplayDate, selectScheduleVersion, toIsoDateKey } from '../../utils/officialTollRate';
import { diffRateVersions } from '../../utils/tollRateVersionDiff';
import { formatJMD, formatJMDDelta } from '../../utils/formatJMD';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: TollRateScheduleVersion[];
  currentVersionId?: string;
}

function versionLabel(v: TollRateScheduleVersion): string {
  return `From ${isoToDisplayDate(v.effectiveFrom)}`;
}

function publishedLine(v: TollRateScheduleVersion): string {
  const who = v.createdBy || 'unknown';
  if (!v.createdAt) return `Published by ${who}`;
  return `Published by ${who} on ${new Date(v.createdAt).toLocaleString()}`;
}

export function TollRateHistoryDialog({ open, onOpenChange, versions, currentVersionId }: Props) {
  const ordered = useMemo(
    () => [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [versions],
  );

  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [diffFromId, setDiffFromId] = useState<string>(() => ordered[1]?.id || ordered[0]?.id || '');
  const [diffToId, setDiffToId] = useState<string>(() => ordered[0]?.id || '');

  const asOfVersion = useMemo(() => {
    if (versions.length === 0) return null;
    return selectScheduleVersion({ current: ordered[0], versions }, toIsoDateKey(asOf));
  }, [versions, ordered, asOf]);

  const diff = useMemo(() => {
    const from = versions.find(v => v.id === diffFromId);
    const to = versions.find(v => v.id === diffToId);
    if (!from || !to) return null;
    return diffRateVersions(from, to);
  }, [versions, diffFromId, diffToId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rate card history</DialogTitle>
          <DialogDescription>
            Every published card, the rates in force on any date, and what changed between two cards.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="versions">
          <TabsList>
            <TabsTrigger value="versions">Versions ({versions.length})</TabsTrigger>
            <TabsTrigger value="asof">Rates as of a date</TabsTrigger>
            <TabsTrigger value="diff">Compare two cards</TabsTrigger>
          </TabsList>

          <TabsContent value="versions" className="mt-4 space-y-2">
            {ordered.length === 0 && (
              <p className="text-sm text-slate-500">No published versions yet.</p>
            )}
            {ordered.map(v => (
              <div
                key={v.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="font-medium text-sm">{versionLabel(v)}</span>
                    {v.id === currentVersionId && (
                      <Badge className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-none text-xs">
                        In force
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <User className="h-3 w-3" />
                    {publishedLine(v)}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 shrink-0">
                  <div>{v.plazas?.length || 0} plazas</div>
                  <div>{v.routeRateGroups?.reduce((n, g) => n + (g.segments?.length || 0), 0) || 0} route segments</div>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="asof" className="mt-4 space-y-4">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-xs">Show rates in force on</Label>
                <Input
                  type="date"
                  value={asOf}
                  onChange={e => setAsOf(e.target.value)}
                  className="w-[170px] h-9"
                />
              </div>
              {asOfVersion && (
                <p className="text-sm text-slate-600 dark:text-slate-400 pb-2">
                  Card {versionLabel(asOfVersion)} — {publishedLine(asOfVersion)}
                </p>
              )}
            </div>
            {asOfVersion && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plaza</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">T-Tag</TableHead>
                    <TableHead className="text-right">Cash</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(asOfVersion.plazas || []).flatMap(plaza =>
                    Object.entries(plaza.rates || {}).map(([classId, rate]) => (
                      <TableRow key={`${plaza.plazaId || plaza.plazaName}-${classId}`}>
                        <TableCell className="font-medium">{plaza.plazaName}</TableCell>
                        <TableCell className="text-slate-500">{classId}</TableCell>
                        <TableCell className="text-right">{formatJMD(rate.withTag)}</TableCell>
                        <TableCell className="text-right">{formatJMD(rate.withoutTag)}</TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="diff" className="mt-4 space-y-4">
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-xs">From</Label>
                <Select value={diffFromId} onValueChange={setDiffFromId}>
                  <SelectTrigger className="w-[190px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ordered.map(v => (
                      <SelectItem key={v.id} value={v.id}>{versionLabel(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">To</Label>
                <Select value={diffToId} onValueChange={setDiffToId}>
                  <SelectTrigger className="w-[190px] h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ordered.map(v => (
                      <SelectItem key={v.id} value={v.id}>{versionLabel(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {diff?.identical && (
              <p className="text-sm text-slate-500">These two cards price identically.</p>
            )}

            {diff && !diff.identical && (
              <>
                {(diff.plazasAdded.length > 0 || diff.plazasRemoved.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {diff.plazasAdded.map(p => (
                      <Badge key={`a-${p}`} className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-none text-xs">
                        Added {p}
                      </Badge>
                    ))}
                    {diff.plazasRemoved.map(p => (
                      <Badge key={`r-${p}`} className="bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-none text-xs">
                        Removed {p}
                      </Badge>
                    ))}
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plaza / route</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Before</TableHead>
                      <TableHead className="text-right">After</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.rows.map((row, i) => (
                      <TableRow key={`${row.plazaKey}-${row.classId}-${row.paymentMethod}-${i}`}>
                        <TableCell className="font-medium">{row.plazaLabel}</TableCell>
                        <TableCell className="text-slate-500">{row.classId}</TableCell>
                        <TableCell className="text-slate-500">
                          {row.scope === 'route' ? 'Route' : row.paymentMethod === 'withTag' ? 'T-Tag' : 'Cash'}
                        </TableCell>
                        <TableCell className="text-right">{row.from === null ? '—' : formatJMD(row.from)}</TableCell>
                        <TableCell className="text-right">{row.to === null ? '—' : formatJMD(row.to)}</TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              row.delta > 0
                                ? 'inline-flex items-center gap-1 text-rose-600'
                                : row.delta < 0
                                  ? 'inline-flex items-center gap-1 text-emerald-600'
                                  : 'inline-flex items-center gap-1 text-slate-500'
                            }
                          >
                            {row.delta > 0 ? <ArrowUp className="h-3 w-3" /> : row.delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                            {formatJMDDelta(row.delta)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
