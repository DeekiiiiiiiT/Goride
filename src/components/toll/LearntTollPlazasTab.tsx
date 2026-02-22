import React, { useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { cn } from '../ui/utils';
import {
  Loader2,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Map,
  Clock,
  Link2,
  Trash2,
  Search,
  Navigation,
  ArrowUpDown,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { TollPlaza } from '../../types/toll';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';

// ─── Props ────────────────────────────────────────────────────────────────────
interface LearntTollPlazasTabProps {
  /** All learnt toll plazas (status === 'learnt') */
  learntPlazas: TollPlaza[];
  /** All verified plazas — used for Link to Plaza dialog */
  verifiedPlazas: TollPlaza[];
  /** All unverified plazas — also offered in Link dialog */
  unverifiedPlazas: TollPlaza[];
  /** Promote a learnt plaza to verified */
  onPromote: (plaza: TollPlaza) => Promise<void>;
  /** Delete / reject a learnt plaza */
  onDelete: (plaza: TollPlaza) => Promise<void>;
  /** Merge a learnt plaza into an existing one (by updating the target and deleting the learnt one) */
  onMerge?: (learntPlaza: TollPlaza, targetPlaza: TollPlaza) => Promise<void>;
  /** Callback after any mutation so parent can refresh */
  onRefresh: () => void;
  /** Whether data is currently loading */
  loading?: boolean;
}

// Haversine distance in meters
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Component ────────────────────────────────────────────────────────────────
export function LearntTollPlazasTab({
  learntPlazas,
  verifiedPlazas,
  unverifiedPlazas,
  onPromote,
  onDelete,
  onMerge,
  onRefresh,
  loading = false,
}: LearntTollPlazasTabProps) {
  const [actionId, setActionId] = useState<string | null>(null);

  // Reject dialog
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<TollPlaza | null>(null);

  // Link-to-plaza dialog
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingPlaza, setLinkingPlaza] = useState<TollPlaza | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSortBy, setLinkSortBy] = useState<'distance' | 'name'>('distance');
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);

  // ── Nearby detection (pre-computed) ──────────────────────────────────────
  const learntWithNearby = useMemo(() => {
    const allExisting = [...verifiedPlazas, ...unverifiedPlazas];
    return learntPlazas.map((lp) => {
      let nearest: { plaza: TollPlaza; distance: number } | null = null;
      for (const ep of allExisting) {
        if (!ep.location?.lat || !ep.location?.lng) continue;
        if (!lp.location?.lat || !lp.location?.lng) continue;
        const d = Math.round(calculateDistance(lp.location.lat, lp.location.lng, ep.location.lat, ep.location.lng));
        if (!nearest || d < nearest.distance) {
          nearest = { plaza: ep, distance: d };
        }
      }
      return { ...lp, _nearest: nearest };
    });
  }, [learntPlazas, verifiedPlazas, unverifiedPlazas]);

  // ── Link dialog — enriched station list ──────────────────────────────────
  const linkPlazasWithDistance = useMemo(() => {
    if (!linkingPlaza) return [];
    const locLat = linkingPlaza.location?.lat;
    const locLng = linkingPlaza.location?.lng;
    if (locLat == null || locLng == null) return [];

    const allExisting = [...verifiedPlazas, ...unverifiedPlazas];
    const enriched = allExisting.map((p) => {
      const pLat = p.location?.lat ?? 0;
      const pLng = p.location?.lng ?? 0;
      const distM = pLat && pLng ? Math.round(calculateDistance(locLat, locLng, pLat, pLng)) : Infinity;
      return { ...p, _distance: distM };
    });

    const searchLower = linkSearch.toLowerCase();
    const filtered = searchLower
      ? enriched.filter(
          (p) =>
            p.name?.toLowerCase().includes(searchLower) ||
            p.highway?.toLowerCase().includes(searchLower) ||
            p.plusCode?.toLowerCase().includes(searchLower) ||
            p.address?.toLowerCase().includes(searchLower)
        )
      : enriched;

    if (linkSortBy === 'distance') {
      filtered.sort((a, b) => a._distance - b._distance);
    } else {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return filtered;
  }, [linkingPlaza, verifiedPlazas, unverifiedPlazas, linkSearch, linkSortBy]);

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

  // ── Action handlers ──────────────────────────────────────────────────────
  const handlePromote = async (plaza: TollPlaza) => {
    try {
      setActionId(plaza.id);
      await onPromote(plaza);
    } catch {
      // parent handles toast
    } finally {
      setActionId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    try {
      setActionId(rejectTarget.id);
      await onDelete(rejectTarget);
      toast.success(`"${rejectTarget.name}" rejected and removed.`);
      setIsRejectDialogOpen(false);
      setRejectTarget(null);
      onRefresh();
    } catch {
      toast.error('Failed to reject location.');
    } finally {
      setActionId(null);
    }
  };

  const handleQuickMerge = async (learnt: TollPlaza & { _nearest: { plaza: TollPlaza; distance: number } | null }) => {
    if (!learnt._nearest || !onMerge) return;
    try {
      setActionId(learnt.id);
      await onMerge(learnt, learnt._nearest.plaza);
      toast.success(`Quick-merged into "${learnt._nearest.plaza.name}".`, {
        description: `GPS alias added. Transaction linked to existing plaza (${learnt._nearest.distance}m away).`,
      });
      onRefresh();
    } catch {
      toast.error('Quick merge failed. Try the full Link to Plaza dialog.');
    } finally {
      setActionId(null);
    }
  };

  const handleLinkConfirm = async () => {
    if (!linkingPlaza || !selectedLinkId || !onMerge) return;
    const target = [...verifiedPlazas, ...unverifiedPlazas].find((p) => p.id === selectedLinkId);
    if (!target) return;
    try {
      setActionId(linkingPlaza.id);
      await onMerge(linkingPlaza, target);
      toast.success(`Linked to "${target.name}" and merged successfully.`);
      setIsLinkDialogOpen(false);
      setLinkingPlaza(null);
      setSelectedLinkId(null);
      setLinkSearch('');
      onRefresh();
    } catch {
      toast.error('Failed to link to existing plaza.');
    } finally {
      setActionId(null);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-500 font-medium">Scanning for learnt toll locations...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
        {/* ── Evidence Bridge Banner ────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between bg-amber-50 border border-amber-100 p-4 rounded-lg gap-4">
          <div className="flex gap-3">
            <div className="bg-amber-100 p-2 rounded-full h-fit">
              <Map className="h-4 w-4 text-amber-600" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-amber-900">Evidence Bridge: Learnt Toll Locations</h4>
              <p className="text-xs text-amber-700 leading-relaxed max-w-2xl">
                These toll plaza coordinates were captured during transactions but do not match any verified plaza.
                Review, Promote, or Merge them to maintain the Master Toll Audit Ledger.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Badge variant="outline" className="bg-white border-amber-200 text-amber-700 h-6">
              {learntPlazas.length} Anomalies Detected
            </Badge>
          </div>
        </div>

        {/* ── Table ─────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Detected Name / Highway</TableHead>
                <TableHead>Coordinates (Lat, Lng)</TableHead>
                <TableHead>Last Transaction</TableHead>
                <TableHead>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted decoration-slate-400 underline-offset-4">
                        Accuracy
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[250px] text-center">
                      GPS accuracy of the device at the time of the transaction — the radius (in meters) within
                      which the true position lies. Lower is better.
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {learntWithNearby.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-slate-500 italic">
                    No learnt toll locations. All toll transaction coordinates match verified plazas.
                  </TableCell>
                </TableRow>
              ) : (
                learntWithNearby.map((loc) => (
                  <TableRow key={loc.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Name / Highway */}
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900">{loc.name || 'Unknown Toll Plaza'}</span>
                        <span className="text-[10px] text-slate-500">{loc.highway || 'Unknown Highway'}</span>
                        <span className="text-[10px] text-slate-400 font-mono uppercase">
                          ID: {loc.id.split('-')[0]}
                        </span>
                        {/* Nearby existing plaza indicator */}
                        {loc._nearest && loc._nearest.distance <= 500 && (
                          <div className="flex items-center gap-1 mt-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[9px] px-1.5 py-0 h-[18px] font-semibold gap-1 flex items-center',
                                loc._nearest.distance <= 100
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : loc._nearest.distance <= 300
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-red-50 text-red-700 border-red-200'
                              )}
                            >
                              <MapPin className="h-2.5 w-2.5" />
                              Near: {loc._nearest.plaza.name} ({loc._nearest.distance}m)
                            </Badge>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Coordinates */}
                    <TableCell>
                      <div className="flex items-center gap-2 text-slate-600 font-mono text-xs">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        {loc.location?.lat?.toFixed(6) ?? '—'}, {loc.location?.lng?.toFixed(6) ?? '—'}
                      </div>
                    </TableCell>

                    {/* Last Transaction */}
                    <TableCell>
                      <div className="flex flex-col text-xs text-slate-500">
                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {loc.stats?.lastTransactionDate
                            ? new Date(loc.stats.lastTransactionDate).toLocaleDateString()
                            : loc.updatedAt
                              ? new Date(loc.updatedAt).toLocaleDateString()
                              : '—'}
                        </div>
                        {loc.stats?.totalTransactions != null && (
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            {loc.stats.totalTransactions} transaction{loc.stats.totalTransactions !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Accuracy */}
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium text-[10px] px-1.5"
                      >
                        ±{(loc.location?.accuracy || 15).toFixed(0)}m
                      </Badge>
                    </TableCell>

                    {/* Actions */}
                    <TableCell>
                      <div className="flex justify-end items-center gap-2">
                        {/* View on Google Maps */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                              onClick={() =>
                                window.open(
                                  `https://www.google.com/maps?q=${loc.location.lat},${loc.location.lng}`,
                                  '_blank'
                                )
                              }
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">Open in Google Maps</TooltipContent>
                        </Tooltip>

                        {/* Quick Merge — only when nearby match within 150m */}
                        {loc._nearest && loc._nearest.distance <= 150 && onMerge && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                                disabled={actionId === loc.id}
                                onClick={() => handleQuickMerge(loc)}
                              >
                                {actionId === loc.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Zap className="h-3.5 w-3.5" />
                                    Quick Merge
                                  </>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[260px] text-center">
                              One-click merge into the nearby plaza ({loc._nearest.plaza.name},{' '}
                              {loc._nearest.distance}m away).
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {/* Verify / Promote */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300 bg-violet-50/50"
                              disabled={actionId === loc.id}
                              onClick={() => handlePromote(loc)}
                            >
                              {actionId === loc.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Verify
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[260px] text-center">
                            Promote this learnt location to a verified toll plaza in the Master Audit Ledger.
                          </TooltipContent>
                        </Tooltip>

                        {/* Link to Plaza */}
                        {onMerge && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300 bg-emerald-50/50"
                                onClick={() => {
                                  setLinkingPlaza(loc);
                                  setLinkSearch('');
                                  setSelectedLinkId(null);
                                  setLinkSortBy('distance');
                                  setIsLinkDialogOpen(true);
                                }}
                              >
                                <Link2 className="h-3.5 w-3.5" />
                                Link to Plaza
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[280px] text-center">
                              Link this transaction to an existing toll plaza. Adds a GPS alias and clears the
                              anomaly.
                            </TooltipContent>
                          </Tooltip>
                        )}

                        {/* Reject */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                              onClick={() => {
                                setRejectTarget(loc);
                                setIsRejectDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[220px] text-center">
                            Flag this location as an anomaly and remove it from the learnt list.
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Reject Confirmation Dialog ────────────────────────────────── */}
        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                Reject Learnt Location
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to reject <strong>"{rejectTarget?.name || 'Unknown'}"</strong>? This will
                remove it from the learnt locations list. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectConfirm}
                disabled={actionId === rejectTarget?.id}
                className="gap-2"
              >
                {actionId === rejectTarget?.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Reject & Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Link to Existing Plaza Dialog ─────────────────────────────── */}
        <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
          <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5 text-emerald-600" />
                Link to Existing Toll Plaza
              </DialogTitle>
              <DialogDescription>
                Merge <strong>"{linkingPlaza?.name || 'Unknown'}"</strong> into an existing toll plaza. The learnt
                entry will be removed and its coordinates added as a GPS alias on the target plaza.
              </DialogDescription>
            </DialogHeader>

            {/* Learnt plaza info card */}
            {linkingPlaza && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
                <div className="bg-amber-100 p-1.5 rounded-full">
                  <MapPin className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <div className="text-xs space-y-0.5">
                  <p className="font-semibold text-amber-900">{linkingPlaza.name || 'Unknown'}</p>
                  <p className="text-amber-700">{linkingPlaza.highway || 'Unknown Highway'}</p>
                  <p className="font-mono text-amber-600">
                    {linkingPlaza.location?.lat?.toFixed(6)}, {linkingPlaza.location?.lng?.toFixed(6)}
                  </p>
                </div>
              </div>
            )}

            {/* Search + sort */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search plazas..."
                  className="pl-8 h-9 text-sm"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs h-9 shrink-0"
                onClick={() => setLinkSortBy(linkSortBy === 'distance' ? 'name' : 'distance')}
              >
                <ArrowUpDown className="h-3 w-3" />
                {linkSortBy === 'distance' ? 'By Distance' : 'By Name'}
              </Button>
            </div>

            {/* Plaza list */}
            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-lg max-h-[300px]">
              {linkPlazasWithDistance.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">No plazas found</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {linkPlazasWithDistance.map((p) => (
                    <button
                      key={p.id}
                      className={cn(
                        'w-full text-left p-3 hover:bg-blue-50 transition-colors flex items-center justify-between gap-3',
                        selectedLinkId === p.id && 'bg-blue-50 ring-1 ring-blue-300'
                      )}
                      onClick={() => setSelectedLinkId(p.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">{p.name}</span>
                          {p.status === 'verified' && (
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                          {p.highway} • {p.direction}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] px-1.5 h-5 font-semibold', distanceColor(p._distance))}
                        >
                          {formatDistance(p._distance)}
                        </Badge>
                        {selectedLinkId === p.id && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleLinkConfirm}
                disabled={!selectedLinkId || actionId === linkingPlaza?.id}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {actionId === linkingPlaza?.id && <Loader2 className="h-4 w-4 animate-spin" />}
                Link & Merge
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
