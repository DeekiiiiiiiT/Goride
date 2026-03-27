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
import { Loader2, RefreshCw, MapPin, AlertCircle } from 'lucide-react';
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
                <TableHead className="text-[10px] uppercase tracking-wider w-[120px]">Action</TableHead>
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
                    <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={() => openAssign(row)}>
                      Assign station
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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
