import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { cn } from '../../ui/utils';
import {
  Loader2,
  RefreshCw,
  MapPin,
  Copy,
  ExternalLink,
  ShieldCheck,
  Link2,
  Trash2,
  Search,
  Check,
  Merge,
  Zap,
  XCircle,
  MoreHorizontal,
  Navigation,
  ArrowUpDown,
  Inbox,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../../ui/dropdown-menu';
import { StationProfile } from '../../../types/station';
import { buildUnresolvedStopRows, filterUnresolvedRows } from './buildUnresolvedStopRows';
import type { LearntLocationDto, UnresolvedFilter, UnresolvedStopRow } from './resolutionQueueTypes';
import type { StationGateEvidenceRow } from './EvidenceInboxTab';
import {
  formatQueueDate,
  fullBlockedDetail,
  rowCoords,
  rowDisplayName,
  rowHasGps,
  shortBlockedReason,
  useUnresolvedStopActions,
} from './unresolvedStopActions';

export interface UnresolvedStopsTabProps {
  onPromoted?: () => void;
  onVerifyLocation?: (learntLocation: any) => void;
}

const LINKAGE_LABELS: Record<string, { label: string; className: string }> = {
  linked: { label: 'Linked', className: 'bg-sky-50 text-sky-800 border-sky-200' },
  payment_only: { label: 'Payment blocked', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  location_only: { label: 'Location only', className: 'bg-violet-50 text-violet-800 border-violet-200' },
};

export function UnresolvedStopsTab({ onPromoted, onVerifyLocation }: UnresolvedStopsTabProps) {
  const [loading, setLoading] = useState(true);
  const [learntLocations, setLearntLocations] = useState<LearntLocationDto[]>([]);
  const [evidenceRows, setEvidenceRows] = useState<StationGateEvidenceRow[]>([]);
  const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
  const [unverifiedStations, setUnverifiedStations] = useState<StationProfile[]>([]);
  const [filter, setFilter] = useState<UnresolvedFilter>('all');
  const [rescanning, setRescanning] = useState(false);
  const [rescanRadius, setRescanRadius] = useState(150);
  const [pendingMatches, setPendingMatches] = useState<any[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [learntData, evidenceData, stationData] = await Promise.all([
        api.getLearntLocations(),
        api.getStationGateEvidence({ limit: 5000 }),
        api.getStations(),
      ]);
      setLearntLocations(Array.isArray(learntData) ? learntData : []);
      setEvidenceRows(Array.isArray(evidenceData) ? evidenceData : []);
      setVerifiedStations(stationData.filter((s: StationProfile) => s.status === 'verified'));
      setUnverifiedStations(stationData.filter((s: StationProfile) => s.status === 'unverified'));
    } catch (e) {
      console.error('[UnresolvedStops]', e);
      toast.error('Could not load resolution queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const allRows = useMemo(
    () => buildUnresolvedStopRows(learntLocations, evidenceRows),
    [learntLocations, evidenceRows],
  );
  const displayRows = useMemo(() => filterUnresolvedRows(allRows, filter), [allRows, filter]);

  const actions = useUnresolvedStopActions({
    verifiedStations,
    unverifiedStations,
    onRefresh: loadData,
    onPromoted,
    onVerifyLocation,
  });

  const handleRescan = async () => {
    try {
      setRescanning(true);
      const result = await api.rescanLearntLocations(rescanRadius);
      if (result.autoCleanedLearnt > 0) {
        const cleanedNames = (result.cleanupDetails || [])
          .map((d: { learntName?: string; stationName?: string }) => `"${d.learntName}" → ${d.stationName}`)
          .join(', ');
        toast.success(`Auto-resolved ${result.autoCleanedLearnt} learnt location(s)`, {
          description: cleanedNames || 'These transactions were already matched to verified stations.',
          duration: 8000,
        });
        await loadData();
      }
      if (result.matches?.length > 0) {
        setPendingMatches(result.matches);
        setIsReviewModalOpen(true);
      } else if (result.autoCleanedLearnt === 0) {
        toast.info(`Analysis complete. No potential matches found within ${rescanRadius}m.`);
      }
    } catch {
      toast.error('Analysis failed');
    } finally {
      setRescanning(false);
    }
  };

  const handleBulkApprove = async () => {
    try {
      setRescanning(true);
      let count = 0;
      let skippedCsv = 0;
      for (const match of pendingMatches) {
        // Never bulk-merge into CSV Unverified shelf
        if (match.matchedStationStatus && match.matchedStationStatus !== 'verified') {
          skippedCsv++;
          continue;
        }
        await api.mergeLearntLocation(match.learntId, match.matchedStationId);
        count++;
      }
      toast.success(
        skippedCsv > 0
          ? `Merged ${count} into GOD list. Skipped ${skippedCsv} CSV reference match(es).`
          : `Handshake Complete: Merged ${count} matched locations into GOD list.`,
      );
      setIsReviewModalOpen(false);
      setPendingMatches([]);
      await loadData();
      onPromoted?.();
    } catch {
      toast.error('Failed to complete bulk merge');
    } finally {
      setRescanning(false);
    }
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('ID copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  const rowActionKey = (row: UnresolvedStopRow) => row.evidence?.id || row.learnt?.id || row.rowKey;

  const renderActionsMenu = (row: UnresolvedStopRow) => {
    const nearby = actions.nearestWithin150(row);
    const nearbyStatus = nearby?.status || 'unverified';
    const hasGps = rowHasGps(row);
    const key = rowActionKey(row);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-slate-200">
            {actions.actionId === key ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
            ) : (
              <MoreHorizontal className="h-4 w-4 text-slate-500" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            Resolve
          </DropdownMenuLabel>

          <DropdownMenuItem
            className="gap-2.5 text-blue-700 focus:text-blue-800 focus:bg-blue-50 font-medium items-start py-2"
            onClick={() => void actions.handlePromote(row)}
            disabled={!hasGps}
          >
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium">Secure Ledger</div>
              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                Promote to Verified Master Ledger as a new station.
              </div>
            </div>
          </DropdownMenuItem>

          {onVerifyLocation && (
            <DropdownMenuItem
              className="gap-2.5 text-violet-700 focus:text-violet-800 focus:bg-violet-50 items-start py-2"
              onClick={() => void actions.openVerifyFlow(row)}
              disabled={!hasGps}
            >
              <Navigation className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Verify Location (GOD list)</div>
                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                  Primary path — create Verified station from your pin. CSV is never copied.
                </div>
              </div>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            className="gap-2.5 text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 items-start py-2"
            onClick={() => {
              actions.setLinkingRow(row);
              actions.setLinkSearch('');
              actions.setSelectedLinkStation(null);
              actions.setLinkSortBy('distance');
              actions.setIsLinkDialogOpen(true);
            }}
            disabled={!hasGps}
          >
            <Link2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium">Link to GOD Station</div>
              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                Merge into an existing Verified station only.
              </div>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2.5 text-slate-700 focus:text-slate-800 focus:bg-slate-50 items-start py-2"
            onClick={() => {
              actions.setMergingRow(row);
              actions.setMergeSearch('');
              actions.setIsMergeDialogOpen(true);
            }}
            disabled={!hasGps}
          >
            <Merge className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium">Merge into GOD Station</div>
              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                Search Verified stations only — CSV shelf is not offered.
              </div>
            </div>
          </DropdownMenuItem>

          {nearby && nearbyStatus === 'verified' && (
            <DropdownMenuItem
              className="gap-2.5 text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 font-medium items-start py-2"
              onClick={() => void actions.handleMergeToStation(row, nearby.id)}
            >
              <Zap className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Quick Merge GOD ({nearby.distance}m)</div>
                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                  One-click merge into {nearby.name}.
                </div>
              </div>
            </DropdownMenuItem>
          )}

          {nearby && nearbyStatus !== 'verified' && (
            <DropdownMenuItem
              className="gap-2.5 text-amber-800 focus:text-amber-900 focus:bg-amber-50 font-medium items-start py-2"
              onClick={() => void actions.handleDeleteCsvReference(nearby.id)}
            >
              <Trash2 className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="text-sm font-medium">Delete CSV reference ({nearby.distance}m)</div>
                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                  Remove {nearby.name} from Unverified shelf, then Verify Location.
                </div>
              </div>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            Discard
          </DropdownMenuLabel>

          <DropdownMenuItem
            className="gap-2.5 text-red-600 focus:text-red-700 focus:bg-red-50 items-start py-2"
            onClick={() => {
              actions.setSelectedRow(row);
              actions.setIsRejectDialogOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium">Reject as Anomaly</div>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2.5 text-red-700 focus:text-red-800 focus:bg-red-50 font-medium items-start py-2"
            onClick={() => {
              actions.setSelectedRow(row);
              actions.setIsDeleteDialogOpen(true);
            }}
          >
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium">Delete Permanently</div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="text-sm text-slate-500 font-medium">Loading unresolved stops…</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 rounded-lg border border-indigo-200 bg-indigo-50/80 p-4">
        <div className="flex gap-3">
          <div className="bg-indigo-100 p-2 rounded-full h-fit">
            <Inbox className="h-5 w-5 text-indigo-700" />
          </div>
          <div className="space-y-1 max-w-3xl">
            <h4 className="font-semibold text-indigo-950">Unresolved stops</h4>
            <p className="text-sm text-indigo-900/90 leading-relaxed">
              Combined queue for <span className="font-medium">unknown fuel stop locations</span> and{' '}
              <span className="font-medium">blocked reimbursements</span>. Primary fix:{' '}
              <span className="font-medium">Verify Location</span> into your GOD list. Nearby CSV Unverified rows are
              reference only — delete them or ignore; never merge CSV into GOD. Merge/Link only targets Verified stations.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            className="text-xs bg-white border border-indigo-200 rounded px-2 py-1.5"
            value={rescanRadius}
            onChange={(e) => setRescanRadius(Number(e.target.value))}
            aria-label="Matching sensitivity"
          >
            <option value={75}>Strict (75m)</option>
            <option value={150}>Standard (150m)</option>
            <option value={300}>Relaxed (300m)</option>
            <option value={600}>Enterprise (600m)</option>
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-indigo-200"
            onClick={() => void handleRescan()}
            disabled={rescanning || learntLocations.length === 0}
          >
            {rescanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            Re-scan
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-indigo-200" onClick={() => void loadData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', `All (${allRows.length})`],
            ['linked', `Linked (${allRows.filter((r) => r.linkage === 'linked').length})`],
            ['payment_only', `Payment blocked (${allRows.filter((r) => r.linkage === 'payment_only').length})`],
            ['location_only', `Location only (${allRows.filter((r) => r.linkage === 'location_only').length})`],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            className={cn('h-8 text-xs', filter === value ? 'bg-indigo-600 hover:bg-indigo-700' : '')}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Link</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Vendor / location</TableHead>
              <TableHead>GPS</TableHead>
              <TableHead>Why blocked</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                  No unresolved stops in this filter.
                </TableCell>
              </TableRow>
            ) : (
              displayRows.map((row) => {
                const coords = rowCoords(row);
                const linkMeta = LINKAGE_LABELS[row.linkage];
                const nearby = actions.nearestWithin150(row);
                const nearbyIsGod = nearby?.status === 'verified';
                return (
                  <TableRow key={row.rowKey} className="hover:bg-slate-50/60">
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[9px]', linkMeta.className)}>
                        {linkMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      <div>{formatQueueDate(row.evidence?.date || row.learnt?.timestamp || row.learnt?.firstSeen)}</div>
                      {row.evidence?.time ? (
                        <div className="text-[10px] text-slate-400">{row.evidence.time}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{row.evidence?.driverName || '—'}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {row.evidence ? `$${Math.abs(Number(row.evidence.amount) || 0).toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm">{rowDisplayName(row)}</span>
                        {nearby && nearbyIsGod && (
                          <Badge variant="outline" className="text-[9px] w-fit bg-emerald-50 text-emerald-700 border-emerald-200">
                            <MapPin className="h-2.5 w-2.5 mr-0.5" />
                            Near GOD: {nearby.name} ({nearby.distance}m)
                          </Badge>
                        )}
                        {nearby && !nearbyIsGod && (
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="outline" className="text-[9px] w-fit bg-amber-50 text-amber-800 border-amber-200">
                              <MapPin className="h-2.5 w-2.5 mr-0.5" />
                              CSV ref: {nearby.name} ({nearby.distance}m)
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px] text-amber-800 hover:bg-amber-50"
                              onClick={() => void actions.handleDeleteCsvReference(nearby.id)}
                              disabled={actions.actionId === nearby.id}
                            >
                              Delete ref
                            </Button>
                          </div>
                        )}
                        {row.learnt?.id && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            Staging: {row.learnt.id.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {coords ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-[11px] text-slate-700">
                            {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                          </span>
                          {coords.accuracy != null ? (
                            <Badge variant="outline" className="text-[9px] w-fit bg-emerald-50 text-emerald-800 border-emerald-100">
                              ±{Math.round(coords.accuracy)} m
                            </Badge>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-800 border-amber-100">
                          No GPS
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-xs text-slate-600 line-clamp-2 cursor-help">{shortBlockedReason(row)}</p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm text-xs">
                          {fullBlockedDetail(row)}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end items-center gap-1.5">
                        {coords && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => window.open(`https://www.google.com/maps?q=${coords.lat},${coords.lng}`, '_blank')}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {row.evidence?.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Copy transaction ID"
                            onClick={() => void copyId(row.evidence!.id)}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {renderActionsMenu(row)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Rescan review modal */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-600" />
              Evidence Bridge Review
            </DialogTitle>
            <DialogDescription>
              Found {pendingMatches.length} potential matches. Only <span className="font-medium">Verified GOD</span> targets
              will merge — CSV Unverified matches are skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-slate-50 rounded-lg border overflow-hidden mt-4 max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learnt</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead className="text-center">List</TableHead>
                  <TableHead className="text-center">Distance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMatches.map((match, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm font-medium">{match.learntName}</TableCell>
                    <TableCell className="text-sm text-blue-700">{match.matchedStationName}</TableCell>
                    <TableCell className="text-center text-xs">
                      {match.matchedStationStatus === 'verified' ? (
                        <Badge variant="outline" className="text-[9px] bg-emerald-50 text-emerald-700 border-emerald-200">GOD</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-800 border-amber-200">CSV (skip)</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs">{match.distance}m</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => void handleBulkApprove()} disabled={rescanning}>
              {rescanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Approve GOD merges only
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge dialog */}
      <Dialog
        open={actions.isMergeDialogOpen}
        onOpenChange={(open) => {
          actions.setIsMergeDialogOpen(open);
          if (!open) {
            actions.setMergingRow(null);
            actions.setMergeSearch('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-4 w-4" />
              Merge into Verified GOD Station
            </DialogTitle>
            <DialogDescription className="text-xs">
              CSV Unverified stations are not listed. Merge only attaches this stop to your company GOD list.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search stations..."
              className="pl-8 h-8 text-xs"
              value={actions.mergeSearch}
              onChange={(e) => actions.setMergeSearch(e.target.value)}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto border rounded-lg">
            {actions.filteredStations.map((station) => (
              <button
                key={station.id}
                type="button"
                className="w-full text-left p-2.5 hover:bg-blue-50 border-b last:border-0"
                onClick={() => {
                  if (actions.mergingRow) {
                    void actions.handleMergeToStation(actions.mergingRow, station.id);
                    actions.setIsMergeDialogOpen(false);
                  }
                }}
              >
                <div className="text-sm font-semibold">{station.name}</div>
                <div className="text-[10px] text-slate-500">{station.brand}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Link dialog */}
      <Dialog
        open={actions.isLinkDialogOpen}
        onOpenChange={(open) => {
          actions.setIsLinkDialogOpen(open);
          if (!open) {
            actions.setLinkingRow(null);
            actions.setSelectedLinkStation(null);
            actions.setLinkSearch('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Link to Existing Station</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <Input
              placeholder="Search stations..."
              className="h-9 text-xs"
              value={actions.linkSearch}
              onChange={(e) => actions.setLinkSearch(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => actions.setLinkSortBy((p) => (p === 'distance' ? 'name' : 'distance'))}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto border rounded-lg min-h-0 max-h-[350px]">
            {actions.linkStationsWithDistance.map((station) => (
              <button
                key={station.id}
                type="button"
                className={cn(
                  'w-full text-left p-3 flex items-center gap-3 border-b last:border-0',
                  actions.selectedLinkStation === station.id ? 'bg-emerald-50' : 'hover:bg-slate-50',
                )}
                onClick={() => actions.setSelectedLinkStation(station.id)}
              >
                <span className="text-sm font-semibold flex-1">{station.name}</span>
                <Badge variant="outline" className={actions.distanceColor(station._distance)}>
                  {actions.formatDistance(station._distance)}
                </Badge>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => actions.setIsLinkDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!actions.selectedLinkStation}
              onClick={() => void actions.handleLinkConfirm()}
            >
              Link &amp; Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={actions.isRejectDialogOpen} onOpenChange={actions.setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Reject as Anomaly</DialogTitle>
          </DialogHeader>
          <Input value={actions.rejectReason} onChange={(e) => actions.setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => actions.setIsRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void actions.handleReject()}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={actions.isDeleteDialogOpen} onOpenChange={actions.setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-700">Permanently Delete</DialogTitle>
            <DialogDescription>This may remove linked transactions and learnt staging.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => actions.setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void actions.handleDelete()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
