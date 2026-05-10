import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import { Loader2, RefreshCw, MapPin, Copy, ClipboardList } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
export interface StationGateEvidenceRow {
  id: string;
  date?: string;
  time?: string;
  driverName?: string;
  driverId?: string;
  amount?: number;
  vendor?: string;
  description?: string;
  holdReason?: string;
  gateReason?: string;
  locationStatus?: string;
  learntLocationId?: string;
  hasGps?: boolean;
  lat?: number;
  lng?: number;
  accuracy?: number;
}

export function EvidenceInboxTab() {
  const [rows, setRows] = useState<StationGateEvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvidence = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getStationGateEvidence({ limit: 5000 });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('[EvidenceInbox]', e);
      toast.error('Could not load station gate evidence.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvidence();
  }, [fetchEvidence]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    if (dateStr.includes('-') && dateStr.length === 10) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString();
    }
    return new Date(dateStr).toLocaleDateString();
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Transaction ID copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const notesPreview = (row: StationGateEvidenceRow) => {
    const parts = [row.gateReason, row.holdReason].filter(Boolean);
    return parts.join(' · ') || '—';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
        <p className="text-sm text-slate-500 font-medium">Loading station gate queue…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 bg-sky-50 border border-sky-100 p-4 rounded-lg">
        <div className="flex gap-3">
          <div className="bg-sky-100 p-2 rounded-full h-fit">
            <ClipboardList className="h-5 w-5 text-sky-700" />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-sky-950">Evidence inbox — gate-held fuel</h4>
            <p className="text-sm text-sky-900/90 leading-relaxed max-w-3xl">
              These are <span className="font-medium">pending fuel reimbursements</span> blocked because the stop is not linked to a
              verified station yet. This list is <span className="font-medium">not</span> the same as <span className="font-medium">Learnt
              (STAGING)</span> — a row can exist here with GPS but <span className="font-medium">no</span> Learnt staging ID. Use it to
              see what is stuck before promoting stations elsewhere.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 border-sky-200" onClick={() => fetchEvidence()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Vendor / notes</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Learnt staging</TableHead>
              <TableHead className="max-w-[220px]">Why blocked</TableHead>
              <TableHead className="font-mono text-xs">Transaction ID</TableHead>
              <TableHead className="text-right w-[100px]">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-32 text-center text-slate-500">
                  No pending fuel transactions are on station hold right now.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-slate-50/60">
                  <TableCell className="font-medium text-sm whitespace-nowrap">
                    <div>{formatDate(row.date)}</div>
                    {row.time ? <div className="text-[10px] text-slate-400 font-normal">{row.time}</div> : null}
                  </TableCell>
                  <TableCell className="text-sm">{row.driverName || '—'}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    ${Math.abs(Number(row.amount) || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <span className="text-sm line-clamp-2">{row.vendor || row.description || '—'}</span>
                  </TableCell>
                  <TableCell>
                    {row.hasGps && row.lat != null && row.lng != null ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[11px] text-slate-700">
                          {row.lat.toFixed(6)}, {row.lng.toFixed(6)}
                        </span>
                        {row.accuracy != null ? (
                          <Badge variant="outline" className="text-[9px] w-fit bg-emerald-50 text-emerald-800 border-emerald-100">
                            ±{Math.round(row.accuracy)} m
                          </Badge>
                        ) : null}
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-100">
                        No GPS
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.learntLocationId ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-mono text-[10px] text-slate-700 cursor-default">
                            {row.learntLocationId.length > 14
                              ? `${row.learntLocationId.slice(0, 8)}…${row.learntLocationId.slice(-4)}`
                              : row.learntLocationId}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs font-mono text-[10px] break-all">{row.learntLocationId}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-slate-400">None</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="text-xs text-slate-600 line-clamp-2 cursor-help">{notesPreview(row)}</p>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-sm text-xs">
                        {notesPreview(row)}
                        {row.locationStatus ? (
                          <span className="block mt-1 text-slate-500">locationStatus: {row.locationStatus}</span>
                        ) : null}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-slate-600">
                    <div className="flex items-center gap-1">
                      <span className="truncate max-w-[72px]" title={row.id}>
                        {row.id.slice(0, 8)}…
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        title="Copy full transaction ID"
                        onClick={() => copyId(row.id)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {row.hasGps && row.lat != null && row.lng != null ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        asChild
                      >
                        <a href={`https://www.google.com/maps?q=${row.lat},${row.lng}`} target="_blank" rel="noopener noreferrer">
                          <MapPin className="h-3.5 w-3.5 mr-1" />
                          Map
                        </a>
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {rows.length > 0 ? (
        <p className="text-[11px] text-slate-400 text-center">
          Showing {rows.length} row{rows.length !== 1 ? 's' : ''} (recent transactions scanned, capped server-side).
        </p>
      ) : null}
    </div>
  );
}
