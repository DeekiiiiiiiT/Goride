import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import type { CanonicalBatchAuditSnapshot, ImportBatch } from '../../types/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

function fpShort(fp: string | undefined): string {
  if (!fp) return '—';
  return fp.length <= 14 ? fp : `${fp.slice(0, 12)}…`;
}

export function ImportBatchAuditPanel() {
  const { data: batches, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.getBatches(),
  });

  const [auditById, setAuditById] = useState<Record<string, CanonicalBatchAuditSnapshot>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    return [...(batches ?? [])].sort(
      (a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime(),
    );
  }, [batches]);

  const recent = sorted.slice(0, 12);

  const verify = async (batchId: string) => {
    setVerifyingId(batchId);
    try {
      const snap = await api.getCanonicalBatchAudit(batchId);
      setAuditById((prev) => ({ ...prev, [batchId]: snap }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const recountNote = (b: ImportBatch, snap: CanonicalBatchAuditSnapshot | undefined) => {
    if (!snap) return null;
    if (b.canonicalEventsInserted == null && b.canonicalEventsSkipped == null) {
      return 'No stored append totals on this batch record.';
    }
    return (
      `Last append reported +${b.canonicalEventsInserted ?? 0} inserted, ${b.canonicalEventsSkipped ?? 0} skipped` +
      ((b.canonicalEventsFailed ?? 0) > 0 ? `, ${b.canonicalEventsFailed} failed` : '') +
      '. Live count is rows with this batchId in KV.'
    );
  };

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-2">
            <ClipboardList className="h-5 w-5 text-slate-500 mt-0.5 shrink-0" />
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Import batch audit
              </CardTitle>
              <CardDescription className="text-sm text-slate-500 mt-1">
                Recent server batches, fingerprint, and optional live recount of canonical ledger rows.
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 h-8 text-xs"
            disabled={isLoading || isFetching}
            onClick={() => refetch()}
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading && !batches?.length ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading batches…
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No import batches yet.</p>
        ) : (
          <div className="rounded-md border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-slate-600 w-[28%]">File</TableHead>
                  <TableHead className="text-xs font-medium text-slate-600">Period</TableHead>
                  <TableHead className="text-xs font-medium text-slate-600">Fingerprint</TableHead>
                  <TableHead className="text-xs font-medium text-slate-600 text-right">Append</TableHead>
                  <TableHead className="text-xs font-medium text-slate-600 w-[120px] text-right">
                    Verify
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((b) => {
                  const snap = auditById[b.id];
                  const hint = recountNote(b, snap);
                  return (
                    <React.Fragment key={b.id}>
                      <TableRow className="text-sm">
                        <TableCell className="align-top py-3">
                          <div className="font-medium text-slate-800 truncate max-w-[220px]" title={b.fileName}>
                            {b.fileName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5" title={b.id}>
                            {b.id.slice(0, 8)}…
                          </div>
                          {b.uploadedBy && (
                            <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={b.uploadedBy}>
                              {b.uploadedBy}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-top py-3 text-xs text-slate-600 whitespace-nowrap">
                          {b.periodStart && b.periodEnd
                            ? `${b.periodStart} → ${b.periodEnd}`
                            : '—'}
                        </TableCell>
                        <TableCell className="align-top py-3 text-xs font-mono text-slate-600">
                          {fpShort(b.contentFingerprint)}
                        </TableCell>
                        <TableCell className="align-top py-3 text-right text-xs text-slate-600 whitespace-nowrap">
                          {b.canonicalAppendCompletedAt ? (
                            <span>
                              +{b.canonicalEventsInserted ?? 0} / ↺{b.canonicalEventsSkipped ?? 0}
                              {(b.canonicalEventsFailed ?? 0) > 0 && (
                                <span className="text-amber-700"> / ✕{b.canonicalEventsFailed}</span>
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="align-top py-3 text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={verifyingId === b.id}
                            onClick={() => verify(b.id)}
                          >
                            {verifyingId === b.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              'Recount'
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {snap && (
                        <TableRow className="bg-slate-50/80 hover:bg-slate-50/80">
                          <TableCell colSpan={5} className="py-3 text-xs text-slate-600">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="text-[10px] font-normal">
                                Live: {snap.total} canonical events
                              </Badge>
                              <span className="text-slate-500">
                                {Object.keys(snap.byDriver).length} drivers ·{' '}
                                {Object.keys(snap.byEventType).length} event types
                              </span>
                              {hint && (
                                <span className="text-slate-500 border-l border-slate-200 pl-2 ml-1">
                                  {hint}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
