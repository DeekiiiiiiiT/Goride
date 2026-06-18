import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import {
  Loader2,
  RefreshCw,
  MapPin,
  Copy,
  ClipboardList,
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
import { Input } from '../../ui/input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../../ui/dropdown-menu';
import { cn } from '../../ui/utils';
import { StationProfile } from '../../../types/station';
import { calculateDistance } from '../../../utils/stationUtils';

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

export interface EvidenceInboxTabProps {
  onPromoted?: () => void;
  /** Same as Learnt tab — opens Add Station modal to verify/promote */
  onVerifyLocation?: (learntLocation: any) => void;
}

function evidenceRowToLearntShape(row: StationGateEvidenceRow, learntId: string, nearbyStation?: { id: string; name: string; distance: number } | null) {
  return {
    id: learntId,
    name: row.vendor || row.description || 'Unknown Merchant',
    location: {
      lat: row.lat ?? 0,
      lng: row.lng ?? 0,
      accuracy: row.accuracy,
    },
    timestamp: row.date || new Date().toISOString(),
    transactionId: row.id,
    nearbyStation: nearbyStation || undefined,
  };
}

export function EvidenceInboxTab({ onPromoted, onVerifyLocation }: EvidenceInboxTabProps) {
  const [rows, setRows] = useState<StationGateEvidenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
  const [unverifiedStations, setUnverifiedStations] = useState<StationProfile[]>([]);

  const [actionRowId, setActionRowId] = useState<string | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedEvidenceRow, setSelectedEvidenceRow] = useState<StationGateEvidenceRow | null>(null);
  const [rejectReason, setRejectReason] = useState('Incorrect GPS coordinates');

  const [mergeSearch, setMergeSearch] = useState('');
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergingRow, setMergingRow] = useState<StationGateEvidenceRow | null>(null);

  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingRow, setLinkingRow] = useState<StationGateEvidenceRow | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSortBy, setLinkSortBy] = useState<'distance' | 'name'>('distance');
  const [selectedLinkStation, setSelectedLinkStation] = useState<string | null>(null);

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

  const fetchStations = useCallback(async () => {
    try {
      const stationData = await api.getStations();
      setVerifiedStations(stationData.filter((s: any) => s.status === 'verified'));
      setUnverifiedStations(stationData.filter((s: any) => s.status === 'unverified'));
    } catch (e) {
      console.error('[EvidenceInbox] stations', e);
    }
  }, []);

  useEffect(() => {
    fetchEvidence();
    fetchStations();
  }, [fetchEvidence, fetchStations]);

  const filteredStations = [...verifiedStations, ...unverifiedStations].filter(
    (s) =>
      s.name?.toLowerCase().includes(mergeSearch.toLowerCase()) ||
      s.brand?.toLowerCase().includes(mergeSearch.toLowerCase()),
  );

  const linkStationsWithDistance = useMemo(() => {
    if (!linkingRow || linkingRow.lat == null || linkingRow.lng == null) return [];
    const locLat = linkingRow.lat;
    const locLng = linkingRow.lng;
    const allStations = [...verifiedStations, ...unverifiedStations];
    const enriched = allStations.map((station) => {
      const sLat = station.location?.lat ?? 0;
      const sLng = station.location?.lng ?? 0;
      const distM = sLat && sLng ? Math.round(calculateDistance(locLat, locLng, sLat, sLng)) : Infinity;
      return { ...station, _distance: distM };
    });
    const searchLower = linkSearch.toLowerCase();
    const filtered = searchLower
      ? enriched.filter(
          (s) =>
            s.name?.toLowerCase().includes(searchLower) ||
            s.brand?.toLowerCase().includes(searchLower) ||
            s.plusCode?.toLowerCase().includes(searchLower) ||
            s.address?.toLowerCase().includes(searchLower),
        )
      : enriched;
    if (linkSortBy === 'distance') {
      filtered.sort((a, b) => a._distance - b._distance);
    } else {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return filtered;
  }, [linkingRow, verifiedStations, unverifiedStations, linkSearch, linkSortBy]);

  const formatDistance = (m: number): string => {
    if (m === Infinity) return '—';
    if (m < 1000) return `${m}m`;
    return `${(m / 1000).toFixed(1)}km`;
  };

  const distanceColor = (m: number): string => {
    if (m <= 150) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (m <= 500) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-red-50 text-red-700 border-red-200';
  };

  const nearestWithin150 = useCallback(
    (row: StationGateEvidenceRow): { id: string; name: string; distance: number } | null => {
      if (row.lat == null || row.lng == null) return null;
      let best: { id: string; name: string; distance: number } | null = null;
      for (const s of [...verifiedStations, ...unverifiedStations]) {
        if (!s.location?.lat || !s.location?.lng) continue;
        const d = Math.round(calculateDistance(row.lat, row.lng, s.location.lat, s.location.lng));
        if (d <= 150 && (!best || d < best.distance)) {
          best = { id: s.id, name: s.name || s.id, distance: d };
        }
      }
      return best;
    },
    [verifiedStations, unverifiedStations],
  );

  const handlePromote = async (row: StationGateEvidenceRow) => {
    try {
      setActionRowId(row.id);
      const { learntId } = await api.ensureLearntForGateHeldTransaction(row.id);
      const stationData: Partial<StationProfile> = {
        name: row.vendor || 'New Verified Station',
        brand: 'Independent',
        address: 'Street Address Required',
        city: 'Kingston',
        parish: 'St. Andrew',
        country: 'Jamaica',
        status: 'verified',
        dataSource: 'manual',
        amenities: [],
        contactInfo: {},
        isPreferred: false,
        stats: {
          avgPrice: 0,
          lastPrice: 0,
          priceTrend: 'Stable',
          totalVisits: 1,
          rating: 0,
          lastUpdated: new Date().toISOString(),
        },
      };
      const promoteResult = await api.promoteLearntLocationToMaster({
        learntId,
        action: 'create',
        stationData,
      });
      if (promoteResult?.autoMerged) {
        const linked = promoteResult?.linkedEntries || 0;
        const mergedName = promoteResult?.data?.name || 'existing station';
        toast.success(`Duplicate detected! Auto-merged into "${mergedName}".`, {
          description: `${promoteResult.message}${linked > 0 ? ` ${linked} transaction${linked > 1 ? 's' : ''} linked.` : ''}`,
        });
      } else {
        toast.success('Location promoted to Verified Master Ledger');
      }
      await fetchEvidence();
      await fetchStations();
      onPromoted?.();
    } catch (error: any) {
      console.error('Promotion error:', error);
      toast.error(error?.message || 'Failed to promote location');
    } finally {
      setActionRowId(null);
    }
  };

  const handleMergeToStation = async (row: StationGateEvidenceRow, targetStationId: string) => {
    try {
      setActionRowId(row.id);
      await api.mergeGateHeldTransactionToStation(row.id, targetStationId);
      toast.success('Merged into station — gate-held transaction released.');
      await fetchEvidence();
      await fetchStations();
      onPromoted?.();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to merge');
    } finally {
      setActionRowId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedEvidenceRow) return;
    try {
      setActionRowId(selectedEvidenceRow.id);
      let learntId = selectedEvidenceRow.learntLocationId;
      if (!learntId) {
        const ensured = await api.ensureLearntForGateHeldTransaction(selectedEvidenceRow.id);
        learntId = ensured.learntId;
      }
      await api.rejectLearntLocation(learntId, rejectReason);
      toast.success('Location flagged as anomaly');
      setIsRejectDialogOpen(false);
      await fetchEvidence();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to reject');
    } finally {
      setActionRowId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedEvidenceRow) return;
    try {
      setActionRowId(selectedEvidenceRow.id);
      const result = await api.deleteGateHeldEvidence(selectedEvidenceRow.id);
      const msg = result.learntDeleted
        ? 'Gate-held transaction and learnt staging permanently deleted'
        : 'Gate-held transaction permanently deleted';
      toast.success(msg);
      setIsDeleteDialogOpen(false);
      setSelectedEvidenceRow(null);
      await fetchEvidence();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to delete gate-held transaction');
    } finally {
      setActionRowId(null);
    }
  };

  const handleLinkConfirm = async () => {
    if (!linkingRow || !selectedLinkStation) return;
    try {
      setActionRowId(linkingRow.id);
      await api.mergeGateHeldTransactionToStation(linkingRow.id, selectedLinkStation);
      const targetName = linkStationsWithDistance.find((s) => s.id === selectedLinkStation)?.name || 'station';
      toast.success(`Linked to "${targetName}" and merged successfully.`);
      setIsLinkDialogOpen(false);
      setLinkingRow(null);
      setSelectedLinkStation(null);
      setLinkSearch('');
      await fetchEvidence();
      await fetchStations();
      onPromoted?.();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to link to existing station.');
    } finally {
      setActionRowId(null);
    }
  };

  const openVerifyFlow = async (row: StationGateEvidenceRow) => {
    if (!onVerifyLocation) return;
    try {
      setActionRowId(row.id);
      const { learntId } = await api.ensureLearntForGateHeldTransaction(row.id);
      const nearby = nearestWithin150(row);
      onVerifyLocation(evidenceRowToLearntShape(row, learntId, nearby));
    } catch (e: any) {
      toast.error(e?.message || 'Cannot open verify flow — missing GPS or staging.');
    } finally {
      setActionRowId(null);
    }
  };

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

  /** Short label in the table (full server strings are verbose). */
  const shortBlockedReason = (row: StationGateEvidenceRow): string => {
    const combined = [row.gateReason, row.holdReason].filter(Boolean).join(' ');
    if (/unverified\s+station/i.test(combined)) return 'Unverified station';
    if (/no gps/i.test(combined)) return 'No GPS';
    const beforeDash = combined.split(/\s*[—–]\s*/)[0]?.trim();
    return beforeDash || combined || '—';
  };

  const fullBlockedDetail = (row: StationGateEvidenceRow) => {
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
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-200/30 dark:bg-sky-950/30">
        <div className="flex gap-3">
          <div className="bg-sky-100 p-2 rounded-full h-fit dark:bg-sky-900/50">
            <ClipboardList className="h-5 w-5 text-sky-700 dark:text-sky-300" />
          </div>
          <div className="space-y-1">
            <h4 className="font-semibold text-sky-950 dark:text-sky-100">Evidence inbox — gate-held fuel</h4>
            <p className="text-sm text-sky-900/90 dark:text-sky-200/90 leading-relaxed max-w-3xl">
              These are <span className="font-medium">pending fuel reimbursements</span> blocked because the stop is not linked to a
              verified station yet. Use the <span className="font-medium">Actions</span> menu for the same resolve flows as{' '}
              <span className="font-medium">Learnt (STAGING)</span> — merge to an existing station, promote, verify location, or discard.
              Rows without GPS must be handled from Learnt staging or other tools.
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
              <TableHead>GPS</TableHead>
              <TableHead>Learnt staging</TableHead>
              <TableHead className="max-w-[220px]">Why blocked</TableHead>
              <TableHead className="font-mono text-xs">Transaction ID</TableHead>
              <TableHead className="text-right w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                  No pending fuel transactions are on station hold right now.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const nearby = nearestWithin150(row);
                return (
                  <TableRow key={row.id} className="hover:bg-slate-50/60">
                    <TableCell className="font-medium text-sm whitespace-nowrap">
                      <div>{formatDate(row.date)}</div>
                      {row.time ? <div className="text-[10px] text-slate-400 font-normal">{row.time}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{row.driverName || '—'}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      ${Math.abs(Number(row.amount) || 0).toFixed(2)}
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
                          <p className="text-xs text-slate-600 line-clamp-2 cursor-help">{shortBlockedReason(row)}</p>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-sm text-xs">
                          {fullBlockedDetail(row)}
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
                    <TableCell>
                      <div className="flex justify-end items-center gap-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                              disabled={!row.hasGps || row.lat == null || row.lng == null}
                              onClick={() =>
                                window.open(`https://www.google.com/maps?q=${row.lat},${row.lng}`, '_blank')
                              }
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">View in Google Maps</TooltipContent>
                        </Tooltip>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-slate-200">
                              {actionRowId === row.id ? (
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
                              onClick={() => handlePromote(row)}
                              disabled={!row.hasGps}
                              title={!row.hasGps ? 'Requires GPS coordinates on this transaction' : undefined}
                            >
                              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                <div className="text-sm font-medium">Secure Ledger</div>
                                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                                  Promote directly to the Verified Master Ledger as a new station. Auto-merges if a duplicate is
                                  detected. Requires GPS.
                                </div>
                              </div>
                            </DropdownMenuItem>

                            {onVerifyLocation && (
                              <DropdownMenuItem
                                className="gap-2.5 text-violet-700 focus:text-violet-800 focus:bg-violet-50 items-start py-2"
                                onClick={() => openVerifyFlow(row)}
                                disabled={!row.hasGps}
                                title={!row.hasGps ? 'Requires GPS coordinates on this transaction' : undefined}
                              >
                                <Navigation className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                  <div className="text-sm font-medium">Verify Location</div>
                                  <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                                    Create a brand-new verified station from this coordinates. Requires GPS.
                                  </div>
                                </div>
                              </DropdownMenuItem>
                            )}

                            <DropdownMenuItem
                              className="gap-2.5 text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 items-start py-2"
                              onClick={() => {
                                setLinkingRow(row);
                                setLinkSearch('');
                                setSelectedLinkStation(null);
                                setLinkSortBy('distance');
                                setIsLinkDialogOpen(true);
                              }}
                              disabled={!row.hasGps}
                              title={!row.hasGps ? 'Requires GPS coordinates on this transaction' : undefined}
                            >
                              <Link2 className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                <div className="text-sm font-medium">Link to Station</div>
                                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                                  Link to an existing station — adds a GPS alias and releases this gate-held transaction (same as Learnt
                                  merge).
                                </div>
                              </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="gap-2.5 text-slate-700 focus:text-slate-800 focus:bg-slate-50 items-start py-2"
                              onClick={() => {
                                setMergingRow(row);
                                setMergeSearch('');
                                setIsMergeDialogOpen(true);
                              }}
                              disabled={!row.hasGps}
                              title={!row.hasGps ? 'Requires GPS coordinates on this transaction' : undefined}
                            >
                              <Merge className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                <div className="text-sm font-medium">Merge into Station</div>
                                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                                  Pick from a searchable list (same as Learnt tab).
                                </div>
                              </div>
                            </DropdownMenuItem>

                            {nearby && (
                              <DropdownMenuItem
                                className="gap-2.5 text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 font-medium items-start py-2"
                                onClick={() => handleMergeToStation(row, nearby.id)}
                              >
                                <Zap className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                  <div className="text-sm font-medium">Quick Merge ({nearby.distance}m)</div>
                                  <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                                    One-click merge into {nearby.name} ({nearby.distance}m away).
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
                                setSelectedEvidenceRow(row);
                                setIsRejectDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                <div className="text-sm font-medium">Reject as Anomaly</div>
                                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                                  Flags learnt staging as unreliable (ensure staging is created from GPS automatically when needed).
                                </div>
                              </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              className="gap-2.5 text-red-700 focus:text-red-800 focus:bg-red-50 font-medium items-start py-2"
                              onClick={() => {
                                setSelectedEvidenceRow(row);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                <div className="text-sm font-medium">Delete Permanently</div>
                                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">
                                  Removes this gate-held transaction from the inbox (works with or without GPS).
                                </div>
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {rows.length > 0 ? (
        <p className="text-[11px] text-slate-400 text-center">
          Showing {rows.length} row{rows.length !== 1 ? 's' : ''} (recent transactions scanned, capped server-side).
        </p>
      ) : null}

      {/* Merge into Station (simple list) */}
      <Dialog
        open={isMergeDialogOpen}
        onOpenChange={(open) => {
          setIsMergeDialogOpen(open);
          if (!open) {
            setMergingRow(null);
            setMergeSearch('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-4 w-4 text-slate-600" />
              Merge into Station
            </DialogTitle>
            <DialogDescription>
              Select a station to merge this gate-held transaction into (Evidence Inbox uses the same merge as Learnt STAGING).
            </DialogDescription>
          </DialogHeader>

          {mergingRow && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
              <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900 truncate">
                  {mergingRow.vendor || mergingRow.description || 'Fuel'}
                </p>
                <p className="text-[10px] text-amber-600 font-mono">
                  Tx {mergingRow.id.slice(0, 8)}…
                </p>
              </div>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search stations..."
              className="pl-8 h-8 text-xs"
              value={mergeSearch}
              onChange={(e) => setMergeSearch(e.target.value)}
            />
          </div>

          <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-lg">
            {filteredStations.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No stations found</div>
            ) : (
              filteredStations.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0"
                  onClick={() => {
                    if (mergingRow) {
                      handleMergeToStation(mergingRow, station.id);
                      setIsMergeDialogOpen(false);
                    }
                  }}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{station.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {station.brand} • {station.address}
                    </div>
                  </div>
                  <Badge
                    className={`text-[9px] h-4 px-1.5 ${
                      station.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {station.status === 'verified' ? 'Master' : 'Unverified'}
                  </Badge>
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMergeDialogOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to Existing Station */}
      <Dialog
        open={isLinkDialogOpen}
        onOpenChange={(open) => {
          setIsLinkDialogOpen(open);
          if (!open) {
            setLinkingRow(null);
            setSelectedLinkStation(null);
            setLinkSearch('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Link2 className="h-4 w-4 text-emerald-600" />
              </div>
              Link to Existing Station
            </DialogTitle>
            <DialogDescription>
              Select a station — GPS from this transaction is added as an alias and the gate-held fuel reimbursement is released (same
              outcome as Learnt → Link &amp; Merge).
            </DialogDescription>
          </DialogHeader>

          {linkingRow && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
              <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900 truncate">{linkingRow.vendor || 'Fuel'}</p>
                <p className="text-[10px] text-amber-600 font-mono">
                  {linkingRow.lat?.toFixed(6)}, {linkingRow.lng?.toFixed(6)}
                </p>
              </div>
              <Badge variant="outline" className="ml-auto bg-white border-amber-200 text-amber-700 text-[10px] shrink-0">
                Gate-held
              </Badge>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                placeholder="Search by name, brand, Plus Code, or address..."
                className="pl-8 h-9 text-xs"
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs gap-1.5 shrink-0"
              onClick={() => setLinkSortBy((prev) => (prev === 'distance' ? 'name' : 'distance'))}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {linkSortBy === 'distance' ? 'By Distance' : 'By Name'}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg min-h-0 max-h-[350px]">
            {linkStationsWithDistance.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-sm text-slate-500 font-medium">No stations found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {linkStationsWithDistance.map((station) => {
                  const isSelected = selectedLinkStation === station.id;
                  const isSuggested = station._distance <= 150;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      className={cn(
                        'w-full text-left p-3 transition-colors flex items-center gap-3',
                        isSelected ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent',
                      )}
                      onClick={() => setSelectedLinkStation(station.id)}
                    >
                      <div
                        className={cn(
                          'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                          isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300',
                        )}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('text-sm font-semibold truncate', isSelected ? 'text-emerald-800' : 'text-slate-900')}>
                            {station.name}
                          </span>
                          {isSuggested && (
                            <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[8px] px-1.5 py-0 h-4 shrink-0 font-bold uppercase tracking-wider">
                              Suggested
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-500">{station.brand || 'Unknown'}</span>
                          <span className="text-[10px] text-slate-300">•</span>
                          <span className="text-[10px] text-slate-500 truncate">{station.address || 'No address'}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className={cn('text-[10px] font-bold border tabular-nums', distanceColor(station._distance))}>
                          {formatDistance(station._distance)} away
                        </Badge>
                        <Badge
                          className={cn(
                            'text-[9px] h-4 px-1.5',
                            station.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {station.status === 'verified' ? 'Verified' : 'Unverified'}
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-4">
            <span className="text-xs text-slate-500">
              {linkStationsWithDistance.length} station{linkStationsWithDistance.length !== 1 ? 's' : ''} available
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                onClick={() => void handleLinkConfirm()}
                disabled={!selectedLinkStation || actionRowId !== null}
              >
                {actionRowId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
                Link &amp; Merge
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Reject Learnt Location
            </DialogTitle>
            <DialogDescription>
              Flag this coordinates staging as an anomaly. This uses the same learnt reject flow as the Learnt tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Rejection Reason</label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Incorrect GPS..." />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleReject()} disabled={actionRowId !== null}>
              {actionRowId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              Permanently Delete
            </DialogTitle>
            <DialogDescription>
              This uses the same delete flow as Learnt STAGING — it may remove the linked pending fuel transaction.
            </DialogDescription>
          </DialogHeader>

          {selectedEvidenceRow && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 text-sm">
              <div className="font-medium text-red-800">{selectedEvidenceRow.vendor || 'Fuel'}</div>
              <div className="text-red-600 text-xs font-mono">Transaction: {selectedEvidenceRow.id}</div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={actionRowId !== null}>
              {actionRowId ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
