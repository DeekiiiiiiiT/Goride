import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../../services/api';
import { Button } from '../../ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../ui/table';
import { Badge } from '../../ui/badge';
import { cn } from '../../ui/utils';
import { 
  Loader2, 
  MapPin, 
  ExternalLink, 
  ShieldCheck, 
  Map, 
  Clock, 
  Calendar,
  Link2, 
  Trash2, 
  Search,
  Check,
  Plus,
  Navigation,
  ArrowUpDown,
  Merge,
  Zap,
  XCircle,
  MoreHorizontal
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { StationProfile } from '../../../types/station';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter,
  DialogTrigger
} from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '../../ui/tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '../../ui/dropdown-menu';
import { calculateDistance } from '../../../utils/stationUtils';

interface LearntLocationsTabProps {
  onPromoted?: () => void;
  onVerifyLocation?: (learntLocation: any) => void;
}

export function LearntLocationsTab({ onPromoted, onVerifyLocation }: LearntLocationsTabProps) {
  const [locations, setLocations] = useState<any[]>([]);
  const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
  const [unverifiedStations, setUnverifiedStations] = useState<StationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Action States
  const [actionId, setActionId] = useState<string | null>(null);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<any | null>(null);
  const [mergeSearch, setMergeSearch] = useState('');
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergingLocation, setMergingLocation] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('Incorrect GPS coordinates');
  const [rescanning, setRescanning] = useState(false);
  const [rescanRadius, setRescanRadius] = useState(150);
  const [syncMasterPin, setSyncMasterPin] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<any[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // --- Link to Existing Station dialog state (Phase 6) ---
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkingLocation, setLinkingLocation] = useState<any | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkSortBy, setLinkSortBy] = useState<'distance' | 'name'>('distance');
  const [selectedLinkStation, setSelectedLinkStation] = useState<string | null>(null);

  const fetchLearnt = async () => {
    try {
      setLoading(true);
      const [learntData, stationData] = await Promise.all([
        api.getLearntLocations(),
        api.getStations()
      ]);
      setLocations(learntData);
      setVerifiedStations(stationData.filter((s: any) => s.status === 'verified'));
      setUnverifiedStations(stationData.filter((s: any) => s.status === 'unverified'));
    } catch (error) {
      console.error('Error fetching learnt locations:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLearnt();
  }, []);

  const handlePromote = async (loc: any) => {
    try {
      setActionId(loc.id);
      
      const stationData: Partial<StationProfile> = {
        name: loc.name || 'New Verified Station',
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
          lastUpdated: new Date().toISOString()
        }
      };

      const promoteResult = await api.promoteLearntLocationToMaster({
        learntId: loc.id,
        action: 'create',
        stationData
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
      fetchLearnt();
      onPromoted?.();
    } catch (error) {
      console.error('Promotion error:', error);
      toast.error('Failed to promote location');
    } finally {
      setActionId(null);
    }
  };

  const handleMerge = async (learntId: string, targetStationId: string) => {
    try {
      setActionId(learntId);
      await api.promoteLearntLocationToMaster({
        learntId,
        action: 'merge',
        targetStationId
      });
      toast.success('Location merged into Master Ledger');
      fetchLearnt();
      onPromoted?.();
    } catch (error) {
      toast.error('Failed to merge location');
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedLocation) return;
    try {
      setActionId(selectedLocation.id);
      await api.rejectLearntLocation(selectedLocation.id, rejectReason);
      toast.success('Location flagged as anomaly');
      setIsRejectDialogOpen(false);
      fetchLearnt();
    } catch (error) {
      toast.error('Failed to reject location');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedLocation) return;
    try {
      setActionId(selectedLocation.id);
      const result = await api.deleteLearntLocation(selectedLocation.id);
      const msg = result.transactionDeleted 
        ? 'Location and linked transaction permanently deleted' 
        : 'Location permanently deleted (no linked transaction found)';
      toast.success(msg);
      setIsDeleteDialogOpen(false);
      fetchLearnt();
    } catch (error) {
      console.log('[DeleteLearnt] Frontend error:', error);
      toast.error('Failed to delete location');
    } finally {
      setActionId(null);
    }
  };

  const handleRescan = async () => {
    try {
      setRescanning(true);
      const result = await api.rescanLearntLocations(rescanRadius);

      // Phase 11: Show auto-cleanup feedback if resolved learnt locations were removed
      if (result.autoCleanedLearnt > 0) {
        const cleanedNames = (result.cleanupDetails || [])
          .map((d: any) => `"${d.learntName}" → ${d.stationName}`)
          .join(', ');
        toast.success(`Auto-resolved ${result.autoCleanedLearnt} learnt location(s)`, {
          description: cleanedNames || 'These transactions were already matched to verified stations.',
          duration: 8000,
        });
        // Refresh the list since items were removed
        fetchLearnt();
      }

      if (result.matches && result.matches.length > 0) {
        setPendingMatches(result.matches);
        setIsReviewModalOpen(true);
      } else if (result.autoCleanedLearnt === 0) {
        toast.info(`Analysis complete. No potential matches found within ${rescanRadius}m.`);
      }
    } catch (error) {
      console.error('Rescan error:', error);
      toast.error('Analysis failed');
    } finally {
      setRescanning(false);
    }
  };

  const handleBulkApprove = async () => {
    try {
      setRescanning(true);
      let count = 0;
      for (const match of pendingMatches) {
        await api.mergeLearntLocation(match.learntId, match.matchedStationId);
        count++;
      }
      toast.success(`Handshake Complete: Merged ${count} matched locations.`);
      setIsReviewModalOpen(false);
      setPendingMatches([]);
      fetchLearnt();
      onPromoted?.();
    } catch (error) {
      toast.error('Failed to complete bulk merge');
    } finally {
      setRescanning(false);
    }
  };

  const filteredStations = [...verifiedStations, ...unverifiedStations].filter(s => 
    s.name?.toLowerCase().includes(mergeSearch.toLowerCase()) ||
    s.brand?.toLowerCase().includes(mergeSearch.toLowerCase())
  );

  /**
   * Phase 6: Stations enriched with distance from the currently-linking learnt location.
   * Sorted by distance (closest first) by default, with search + sort toggle.
   */
  const linkStationsWithDistance = useMemo(() => {
    if (!linkingLocation) return [];
    const locLat = linkingLocation.location?.lat;
    const locLng = linkingLocation.location?.lng;
    if (locLat == null || locLng == null) return [];

    const allStations = [...verifiedStations, ...unverifiedStations];
    const enriched = allStations.map(station => {
      const sLat = station.location?.lat ?? 0;
      const sLng = station.location?.lng ?? 0;
      const distM = (sLat && sLng) ? Math.round(calculateDistance(locLat, locLng, sLat, sLng)) : Infinity;
      return { ...station, _distance: distM };
    });

    // Filter by search term (name, brand, plusCode)
    const searchLower = linkSearch.toLowerCase();
    const filtered = searchLower
      ? enriched.filter(s =>
          s.name?.toLowerCase().includes(searchLower) ||
          s.brand?.toLowerCase().includes(searchLower) ||
          s.plusCode?.toLowerCase().includes(searchLower) ||
          s.address?.toLowerCase().includes(searchLower)
        )
      : enriched;

    // Sort
    if (linkSortBy === 'distance') {
      filtered.sort((a, b) => a._distance - b._distance);
    } else {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return filtered;
  }, [linkingLocation, verifiedStations, unverifiedStations, linkSearch, linkSortBy]);

  /** Format distance for display */
  const formatDistance = (m: number): string => {
    if (m === Infinity) return '—';
    if (m < 1000) return `${m}m`;
    return `${(m / 1000).toFixed(1)}km`;
  };

  /** Color class for distance badge */
  const distanceColor = (m: number): string => {
    if (m <= 150) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (m <= 500) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-red-50 text-red-700 border-red-200';
  };

  /** Handle "Link & Merge" confirm in the dialog */
  const handleLinkConfirm = async () => {
    if (!linkingLocation || !selectedLinkStation) return;
    try {
      setActionId(linkingLocation.id);
      await api.promoteLearntLocationToMaster({
        learntId: linkingLocation.id,
        action: 'merge',
        targetStationId: selectedLinkStation,
      });
      const targetName = linkStationsWithDistance.find(s => s.id === selectedLinkStation)?.name || 'station';
      toast.success(`Linked to "${targetName}" and merged successfully.`);
      setIsLinkDialogOpen(false);
      setLinkingLocation(null);
      setSelectedLinkStation(null);
      setLinkSearch('');
      fetchLearnt();
      onPromoted?.();
    } catch (error) {
      console.error('[Link to Station] Merge failed:', error);
      toast.error('Failed to link to existing station.');
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-slate-500 font-medium">Scanning for anomalous GPS clusters...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-amber-50 border border-amber-100 p-4 rounded-lg gap-4">
        <div className="flex gap-3">
          <div className="bg-amber-100 p-2 rounded-full h-fit">
            <Map className="h-4 w-4 text-amber-600" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-amber-900">Evidence Bridge: Learnt Locations</h4>
            <p className="text-xs text-amber-700 leading-relaxed max-w-2xl">
              These coordinates were captured during transactions but do not match any verified station. 
              Review, Promote, or Merge them to maintain the Master Audit Ledger.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-end gap-1.5 mr-2">
            <label className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Matching Sensitivity</label>
            <select 
              className="text-xs bg-white border border-amber-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
              value={rescanRadius}
              onChange={(e) => setRescanRadius(Number(e.target.value))}
            >
              <option value={75}>Strict (75m)</option>
              <option value={150}>Standard (150m)</option>
              <option value={300}>Relaxed (300m)</option>
              <option value={600}>Enterprise (600m)</option>
            </select>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className="bg-white border-amber-200 text-amber-700 h-6">
              {locations.length} Anomalies Detected
            </Badge>
            <Button 
              size="sm" 
              variant="outline" 
              className="h-8 bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200 transition-colors"
              onClick={handleRescan}
              disabled={rescanning || locations.length === 0}
            >
              {rescanning ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5 mr-1.5" />
              )}
              Re-scan Evidence Bridge
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Detected Name / Vendor</TableHead>
              <TableHead>Coordinates (Lat, Lng)</TableHead>
              <TableHead>Last Transaction</TableHead>
              <TableHead>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help underline decoration-dotted decoration-slate-400 underline-offset-4">Accuracy</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[250px] text-center">
                    GPS accuracy of the device at the time of the transaction — the radius (in meters) within which the true position lies. Lower is better (e.g. ±2m = excellent, ±15m+ = poor signal).
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-slate-500 italic">
                  No new locations learnt. All transaction coordinates match verified stations.
                </TableCell>
              </TableRow>
            ) : (
              locations.map((loc) => (
                <TableRow key={loc.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-900">{loc.name || 'Unknown Merchant'}</span>
                      <span className="text-[10px] text-slate-400 font-mono uppercase">ID: {loc.id.split('-')[0]}</span>
                      {/* Phase 7: Nearby station indicator */}
                      {loc.nearbyStation && (
                        <div className="flex items-center gap-1 mt-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] px-1.5 py-0 h-[18px] font-semibold gap-1 flex items-center',
                              loc.nearbyStation.distance <= 100
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : loc.nearbyStation.distance <= 300
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                            )}
                          >
                            <MapPin className="h-2.5 w-2.5" />
                            Near: {loc.nearbyStation.name} ({loc.nearbyStation.distance}m)
                          </Badge>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-slate-600 font-mono text-xs">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      {loc.location.lat.toFixed(6)}, {loc.location.lng.toFixed(6)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col text-xs text-slate-500">
                      <div className="flex items-center gap-1.5 font-medium text-slate-700">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {new Date(loc.timestamp).toLocaleDateString()}
                      </div>
                      <button 
                        className="text-[10px] text-blue-500 hover:underline cursor-pointer w-fit mt-0.5"
                        onClick={() => toast.info(`Transaction Reference: ${loc.transactionId || 'N/A'}`)}
                      >
                        View Tx Ref
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium text-[10px] px-1.5">
                      ±{(loc.location.accuracy || 15).toFixed(2)}m
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                            onClick={() => window.open(`https://www.google.com/maps?q=${loc.location.lat},${loc.location.lng}`, '_blank')}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">View in Google Maps</TooltipContent>
                      </Tooltip>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-slate-200">
                            {actionId === loc.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4 text-slate-500" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Resolve</DropdownMenuLabel>
                          
                          <DropdownMenuItem
                            className="gap-2.5 text-blue-700 focus:text-blue-800 focus:bg-blue-50 font-medium items-start py-2"
                            onClick={() => handlePromote(loc)}
                          >
                            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm font-medium">Secure Ledger</div>
                              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">Promote directly to the Verified Master Ledger as a new station. Auto-merges if a duplicate is detected.</div>
                            </div>
                          </DropdownMenuItem>

                          {onVerifyLocation && (
                            <DropdownMenuItem
                              className="gap-2.5 text-violet-700 focus:text-violet-800 focus:bg-violet-50 items-start py-2"
                              onClick={() => onVerifyLocation(loc)}
                            >
                              <Navigation className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                <div className="text-sm font-medium">Verify Location</div>
                                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">Create a brand-new verified station from this learnt location. Use when no matching station exists yet.</div>
                              </div>
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem
                            className="gap-2.5 text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 items-start py-2"
                            onClick={() => {
                              setLinkingLocation(loc);
                              setLinkSearch('');
                              setSelectedLinkStation(null);
                              setLinkSortBy('distance');
                              setIsLinkDialogOpen(true);
                            }}
                          >
                            <Link2 className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm font-medium">Link to Station</div>
                              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">Link to an existing verified station. Best when the station already exists — associates the transaction, adds a GPS alias, and clears the anomaly.</div>
                            </div>
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            className="gap-2.5 text-slate-700 focus:text-slate-800 focus:bg-slate-50 items-start py-2"
                            onClick={() => {
                              setMergingLocation(loc);
                              setMergeSearch('');
                              setIsMergeDialogOpen(true);
                            }}
                          >
                            <Merge className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm font-medium">Merge into Station</div>
                              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">Manually merge into a specific station from a searchable list. The learnt coordinates become a GPS alias on the target.</div>
                            </div>
                          </DropdownMenuItem>

                          {loc.nearbyStation && loc.nearbyStation.distance <= 150 && (
                            <DropdownMenuItem
                              className="gap-2.5 text-emerald-700 focus:text-emerald-800 focus:bg-emerald-50 font-medium items-start py-2"
                              onClick={async () => {
                                try {
                                  setActionId(loc.id);
                                  await api.promoteLearntLocationToMaster({
                                    learntId: loc.id,
                                    action: 'merge',
                                    targetStationId: loc.nearbyStation.id,
                                  });
                                  toast.success(`Quick-merged into "${loc.nearbyStation.name}".`, {
                                    description: `GPS alias added. Transaction linked to existing station (${loc.nearbyStation.distance}m away).`,
                                    icon: <Zap className="h-4 w-4 text-emerald-500" />,
                                  });
                                  fetchLearnt();
                                  onPromoted?.();
                                } catch (error) {
                                  console.error('[Quick Merge] Failed:', error);
                                  toast.error('Quick merge failed.');
                                } finally {
                                  setActionId(null);
                                }
                              }}
                            >
                              <Zap className="h-4 w-4 mt-0.5 shrink-0" />
                              <div>
                                <div className="text-sm font-medium">Quick Merge ({loc.nearbyStation.distance}m)</div>
                                <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">One-click merge into {loc.nearbyStation.name} ({loc.nearbyStation.distance}m away). Adds GPS alias and links the transaction automatically.</div>
                              </div>
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Discard</DropdownMenuLabel>

                          <DropdownMenuItem
                            className="gap-2.5 text-red-600 focus:text-red-700 focus:bg-red-50 items-start py-2"
                            onClick={() => {
                              setSelectedLocation(loc);
                              setIsRejectDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm font-medium">Reject as Anomaly</div>
                              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">Discard as a GPS anomaly. Transaction data is kept but coordinates flagged as unreliable. Use when GPS was clearly wrong.</div>
                            </div>
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            className="gap-2.5 text-red-700 focus:text-red-800 focus:bg-red-50 font-medium items-start py-2"
                            onClick={() => {
                              setSelectedLocation(loc);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div>
                              <div className="text-sm font-medium">Delete Permanently</div>
                              <div className="text-[10px] font-normal text-slate-500 leading-snug mt-0.5">Permanently delete this learnt location AND its linked pending transaction. Cannot be undone.</div>
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-blue-600" />
              Evidence Bridge Review
            </DialogTitle>
            <DialogDescription>
              The system found {pendingMatches.length} potential matches. Review and approve before merging.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden mt-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="text-xs font-bold uppercase text-slate-600">Anomaly (Learnt)</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600">Potential Match (MGMT)</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 text-center">Distance</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-slate-600 text-center">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMatches.map((match, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="text-sm font-semibold">{match.learntName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{match.learntId.split('-')[0]}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="text-sm font-semibold text-blue-700">{match.matchedStationName}</div>
                        <Badge className="text-[9px] h-4 px-1.5 bg-amber-50 text-amber-700 border-amber-100 uppercase">
                          {match.matchedStationStatus}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs font-medium">
                      {match.distance}m
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] uppercase ${
                          match.confidence === 'High' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' :
                          match.confidence === 'Medium' ? 'border-amber-200 text-amber-700 bg-amber-50' :
                          'border-red-200 text-red-700 bg-red-50'
                        }`}
                      >
                        {match.confidence}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsReviewModalOpen(false)}>Cancel Review</Button>
            <Button 
              className="bg-blue-600 hover:bg-blue-700"
              onClick={handleBulkApprove}
              disabled={rescanning}
            >
              {rescanning ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Approve and Bulk Merge {pendingMatches.length} Matches
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Reject Learnt Location
            </DialogTitle>
            <DialogDescription>
              Flag this location as an anomaly. It will be removed from the staging area and ignored by future verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Rejection Reason</label>
              <Input 
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Incorrect GPS, Not a Gas Station..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionId !== null}>
              {actionId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              Permanently Delete
            </DialogTitle>
            <DialogDescription>
              This will permanently delete the learnt location record <strong>and</strong> its linked pending fuel transaction. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {selectedLocation && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1 text-sm">
              <div className="font-medium text-red-800">{selectedLocation.name || 'Unknown Station'}</div>
              {selectedLocation.transactionId && (
                <div className="text-red-600 text-xs">Linked transaction: {selectedLocation.transactionId}</div>
              )}
              <div className="text-red-500 text-xs">
                Location: {selectedLocation.location?.lat?.toFixed(5)}, {selectedLocation.location?.lng?.toFixed(5)}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={actionId !== null}>
              {actionId ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to Existing Station Dialog (Phase 6) */}
      <Dialog open={isMergeDialogOpen} onOpenChange={(open) => {
        setIsMergeDialogOpen(open);
        if (!open) {
          setMergingLocation(null);
          setMergeSearch('');
        }
      }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center">
                <Merge className="h-4 w-4 text-slate-600" />
              </div>
              Merge into Station
            </DialogTitle>
            <DialogDescription>
              Search and select a station to merge this learnt location into. The GPS coordinates will become an alias on the target station.
            </DialogDescription>
          </DialogHeader>

          {mergingLocation && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
              <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900 truncate">
                  {mergingLocation.name || 'Unknown Merchant'}
                </p>
                <p className="text-[10px] text-amber-600 font-mono">
                  {mergingLocation.location?.lat?.toFixed(6)}, {mergingLocation.location?.lng?.toFixed(6)}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input 
                placeholder="Search stations..." 
                className="pl-8 h-8 text-xs"
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 px-1">
              <input 
                type="checkbox" 
                id="syncMasterPinMerge"
                className="h-3 w-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                checked={syncMasterPin}
                onChange={(e) => setSyncMasterPin(e.target.checked)}
              />
              <label htmlFor="syncMasterPinMerge" className="text-[10px] font-medium text-slate-600 cursor-pointer">
                Sync Master Pin to these coordinates
              </label>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-lg">
            {filteredStations.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No stations found</div>
            ) : (
              filteredStations.map(station => (
                <button
                  key={station.id}
                  className="w-full text-left p-2.5 hover:bg-blue-50 transition-colors group flex items-center justify-between border-b border-slate-100 last:border-0"
                  onClick={() => {
                    if (mergingLocation) {
                      handleMerge(mergingLocation.id, station.id);
                      setIsMergeDialogOpen(false);
                    }
                  }}
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">{station.name}</div>
                    <div className="text-[10px] text-slate-500">{station.brand} • {station.address}</div>
                  </div>
                  <Badge 
                    className={`text-[9px] h-4 px-1.5 ${
                      station.status === 'verified' 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {station.status === 'verified' ? 'Master' : 'Unverified'}
                  </Badge>
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMergeDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link to Existing Station Dialog (Phase 6) */}
      <Dialog open={isLinkDialogOpen} onOpenChange={(open) => {
        setIsLinkDialogOpen(open);
        if (!open) {
          setLinkingLocation(null);
          setSelectedLinkStation(null);
          setLinkSearch('');
        }
      }}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <Link2 className="h-4 w-4 text-emerald-600" />
              </div>
              Link to Existing Station
            </DialogTitle>
            <DialogDescription>
              Select a verified or unverified station to link this learnt transaction to. The GPS coordinates will be added as an alias on the target station.
            </DialogDescription>
          </DialogHeader>

          {/* Learnt location context card */}
          {linkingLocation && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
              <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-900 truncate">
                  {linkingLocation.name || 'Unknown Merchant'}
                </p>
                <p className="text-[10px] text-amber-600 font-mono">
                  {linkingLocation.location?.lat?.toFixed(6)}, {linkingLocation.location?.lng?.toFixed(6)}
                </p>
              </div>
              <Badge variant="outline" className="ml-auto bg-white border-amber-200 text-amber-700 text-[10px] shrink-0">
                Anomaly
              </Badge>
            </div>
          )}

          {/* Search + Sort controls */}
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
              onClick={() => setLinkSortBy(prev => prev === 'distance' ? 'name' : 'distance')}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {linkSortBy === 'distance' ? 'By Distance' : 'By Name'}
            </Button>
          </div>

          {/* Scrollable station list */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg min-h-0 max-h-[350px]">
            {linkStationsWithDistance.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin className="h-8 w-8 text-slate-300 mb-2" />
                <p className="text-sm text-slate-500 font-medium">No stations found</p>
                <p className="text-xs text-slate-400 mt-0.5">Try a different search term</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {linkStationsWithDistance.map(station => {
                  const isSelected = selectedLinkStation === station.id;
                  const isSuggested = station._distance <= 150;
                  return (
                    <button
                      key={station.id}
                      type="button"
                      className={cn(
                        'w-full text-left p-3 transition-colors flex items-center gap-3',
                        isSelected
                          ? 'bg-emerald-50 border-l-3 border-l-emerald-500'
                          : 'hover:bg-slate-50 border-l-3 border-l-transparent'
                      )}
                      onClick={() => setSelectedLinkStation(station.id)}
                    >
                      {/* Radio indicator */}
                      <div className={cn(
                        'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                        isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300'
                      )}>
                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>

                      {/* Station details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'text-sm font-semibold truncate',
                            isSelected ? 'text-emerald-800' : 'text-slate-900'
                          )}>
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
                        {station.plusCode && (
                          <span className="text-[9px] text-violet-500 font-mono mt-0.5 block">{station.plusCode}</span>
                        )}
                      </div>

                      {/* Distance + Status badges */}
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] font-bold border tabular-nums', distanceColor(station._distance))}
                        >
                          {formatDistance(station._distance)} away
                        </Badge>
                        <Badge
                          className={cn('text-[9px] h-4 px-1.5',
                            station.status === 'verified'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
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

          {/* Footer count + confirm */}
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
                onClick={handleLinkConfirm}
                disabled={!selectedLinkStation || actionId !== null}
              >
                {actionId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Merge className="h-4 w-4" />
                )}
                Link &amp; Merge
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}