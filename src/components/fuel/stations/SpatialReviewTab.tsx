import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Loader2, RefreshCw, MapPin, AlertCircle, ChevronDown, Eye, Link2, Copy } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type { StationProfile } from '../../../types/station';

export interface SpatialReviewItem {
  recordType: 'fuel_entry' | 'transaction';
  id: string;
  date?: string;
  vehicleId?: string;
  driverId?: string;
  vendor?: string;
  location?: string;
  lat?: number;
  lng?: number;
  metadata?: {
    ambiguityReason?: string;
    matchDistance?: number;
    matchConfidence?: string;
  };
}

interface SpatialReviewTabProps {
  onResolved?: () => void;
}

export function SpatialReviewTab({ onResolved }: SpatialReviewTabProps) {
  const [items, setItems] = useState<SpatialReviewItem[]>([]);
  const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SpatialReviewItem | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queue, stations] = await Promise.all([
        api.getSpatialReviewQueue(),
        api.getStations(),
      ]);
      setItems(queue.items || []);
      setVerifiedStations((stations || []).filter((s: StationProfile) => s.status === 'verified'));
    } catch (e) {
      console.error('[SpatialReview]', e);
      toast.error('Could not load spatial review queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sortedStations = useMemo(
    () => [...verifiedStations].sort((a, b) => a.name.localeCompare(b.name)),
    [verifiedStations]
  );

  const openAssign = (row: SpatialReviewItem) => {
    setSelectedItem(row);
    setSelectedStationId('');
    setAssignOpen(true);
  };

  const openView = (row: SpatialReviewItem) => {
    setSelectedItem(row);
    setViewOpen(true);
  };

  const openAssignFromView = () => {
    if (!selectedItem) return;
    setViewOpen(false);
    setSelectedStationId('');
    setAssignOpen(true);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Copy failed');
    }
  };

  const mapsHref =
    selectedItem?.lat != null &&
    selectedItem?.lng != null &&
    Number.isFinite(selectedItem.lat) &&
    Number.isFinite(selectedItem.lng)
      ? `https://www.google.com/maps?q=${selectedItem.lat},${selectedItem.lng}`
      : null;

  const confirmAssign = async () => {
    if (!selectedItem || !selectedStationId) {
      toast.error('Choose a verified station.');
      return;
    }
    setSubmitting(true);
    try {
      await api.bulkAssignStation([selectedItem.id], selectedStationId);
      toast.success('Station assigned', {
        description: 'The log is linked to the Master Verified Ledger.',
      });
      setAssignOpen(false);
      setSelectedItem(null);
      await load();
      onResolved?.();
    } catch (e: any) {
      toast.error(e.message || 'Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex justify-center items-center py-24 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin mr-2" />
        Loading queue…
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1 max-w-2xl">
          <h4 className="text-sm font-semibold text-slate-900">Spatial review</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            These fuel logs have GPS near <span className="font-medium text-slate-700">multiple verified stations</span>{' '}
            at similar distances, so the system did not auto-pick one. Assign the correct station here.{' '}
            <span className="text-amber-700/90">
              This is not the Learnt tab — Learnt is for unknown locations with no confident station match.
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 text-center">
          <MapPin className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-600">No ambiguous GPS cases</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            When a driver’s coordinates sit between two or more verified stations, new rows will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/90">
                <TableHead className="text-[10px] uppercase tracking-wider">Date</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Source</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Vendor / note</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider text-right">Δ m</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider">Reason</TableHead>
                <TableHead className="text-[10px] uppercase tracking-wider w-[130px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={`${row.recordType}:${row.id}`} className="text-sm">
                  <TableCell className="text-slate-700 whitespace-nowrap">
                    {row.date ? new Date(row.date).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] font-normal border-slate-200 text-slate-600">
                      {row.recordType === 'fuel_entry' ? 'Fuel entry' : 'Transaction'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-slate-800" title={row.vendor || row.location}>
                    {row.vendor || row.location || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-600">
                    {row.metadata?.matchDistance != null && Number.isFinite(row.metadata.matchDistance)
                      ? `${Math.round(row.metadata.matchDistance)}m`
                      : '—'}
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-slate-500">
                    <span className="line-clamp-2" title={row.metadata?.ambiguityReason}>
                      {row.metadata?.ambiguityReason || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 border-slate-200">
                          Actions
                          <ChevronDown className="h-3 w-3 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => openView(row)}>
                          <Eye className="h-3.5 w-3.5" />
                          View details
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-xs cursor-pointer" onClick={() => openAssign(row)}>
                          <Link2 className="h-3.5 w-3.5" />
                          Assign station
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail overlay — full context for admin decision */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="sm:max-w-lg max-h-[min(90vh,720px)] flex flex-col gap-0 p-0 overflow-hidden border-slate-200">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-slate-100 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4 text-violet-600" />
              Spatial review — details
            </DialogTitle>
            <DialogDescription className="text-xs text-left">
              GPS could not pick a single verified station. Use this to compare distances and choose the correct station.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="px-4 py-3 space-y-4 overflow-y-auto flex-1 text-sm">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Record</p>
                  <p className="text-slate-800 font-medium">
                    {selectedItem.recordType === 'fuel_entry' ? 'Fuel entry' : 'Transaction'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded break-all text-slate-700">
                      {selectedItem.id}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title="Copy ID"
                      onClick={() => copyToClipboard(selectedItem.id, 'Record ID')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Date</p>
                    <p className="text-slate-800">
                      {selectedItem.date ? new Date(selectedItem.date).toLocaleString() : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Δ to nearest (m)</p>
                    <p className="text-slate-800 tabular-nums">
                      {selectedItem.metadata?.matchDistance != null &&
                      Number.isFinite(selectedItem.metadata.matchDistance)
                        ? `${Math.round(selectedItem.metadata.matchDistance)} m`
                        : '—'}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Vendor / note</p>
                  <p className="text-slate-800 break-words">{selectedItem.vendor || selectedItem.location || '—'}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Vehicle ID</p>
                    <p className="text-slate-800 font-mono text-xs">{selectedItem.vehicleId || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Driver ID</p>
                    <p className="text-slate-800 font-mono text-xs">{selectedItem.driverId || '—'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">GPS coordinates</p>
                  {selectedItem.lat != null && selectedItem.lng != null ? (
                    <div className="space-y-0.5">
                      <p className="text-slate-800 font-mono text-xs">
                        {Number(selectedItem.lat).toFixed(6)}, {Number(selectedItem.lng).toFixed(6)}
                      </p>
                      {mapsHref && (
                        <a
                          href={mapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          Open in Maps
                          <Link2 className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs">—</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Full system reason</p>
                    {selectedItem.metadata?.ambiguityReason && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[10px] px-2"
                        onClick={() =>
                          copyToClipboard(selectedItem.metadata!.ambiguityReason!, 'Reason text')
                        }
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    )}
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50/80 p-3 max-h-48 overflow-y-auto">
                    <pre className="text-[11px] text-slate-700 whitespace-pre-wrap break-words font-sans leading-relaxed">
                      {selectedItem.metadata?.ambiguityReason || 'No reason string stored.'}
                    </pre>
                  </div>
                </div>
                {selectedItem.metadata?.matchConfidence && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Match confidence</p>
                    <p className="text-slate-800">{selectedItem.metadata.matchConfidence}</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 shrink-0 flex-row justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setViewOpen(false)}>
              Close
            </Button>
            <Button size="sm" onClick={openAssignFromView}>
              Assign station…
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Assign verified station
            </DialogTitle>
            <DialogDescription className="text-xs text-left">
              Choose the station that matches this stop. The log will be marked verified and signed like a manual bulk assign.
            </DialogDescription>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-3 py-2">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-700">{selectedItem.vendor || selectedItem.location || 'Log'}</span>
                {' · '}
                {selectedItem.recordType === 'fuel_entry' ? 'Fuel entry' : 'Transaction'} ·{' '}
                <code className="text-[10px] bg-slate-100 px-1 rounded">{selectedItem.id.slice(0, 8)}…</code>
              </p>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Verified station</label>
                <Select value={selectedStationId} onValueChange={setSelectedStationId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select station…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {sortedStations.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={confirmAssign} disabled={submitting || !selectedStationId}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
