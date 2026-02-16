import React, { useState, useEffect } from 'react';
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
  Navigation
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
  const [selectedLocation, setSelectedLocation] = useState<any | null>(null);
  const [mergeSearch, setMergeSearch] = useState('');
  const [rejectReason, setRejectReason] = useState('Incorrect GPS coordinates');
  const [rescanning, setRescanning] = useState(false);
  const [rescanRadius, setRescanRadius] = useState(150);
  const [syncMasterPin, setSyncMasterPin] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<any[]>([]);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

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

      await api.promoteLearntLocationToMaster({
        learntId: loc.id,
        action: 'create',
        stationData
      });
      
      toast.success('Location promoted to Verified Master Ledger');
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

  const handleRescan = async () => {
    try {
      setRescanning(true);
      const result = await api.rescanLearntLocations(rescanRadius);
      if (result.matches && result.matches.length > 0) {
        setPendingMatches(result.matches);
        setIsReviewModalOpen(true);
      } else {
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
              <TableHead>Accuracy</TableHead>
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
                    <div className="flex justify-end items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        onClick={() => window.open(`https://www.google.com/maps?q=${loc.location.lat},${loc.location.lng}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>

                      {/* Verify Location — opens the Edit Station modal pre-filled with learnt data */}
                      {onVerifyLocation && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300 bg-violet-50/50"
                          onClick={() => onVerifyLocation(loc)}
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Verify
                        </Button>
                      )}

                      <Popover>
                        <PopoverTrigger asChild>
                          <Button size="sm" variant="outline" className="h-8 gap-1.5 border-slate-200 text-slate-700">
                            <Link2 className="h-3.5 w-3.5" />
                            Merge
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-0" align="end">
                          <div className="p-3 border-b border-slate-100 bg-slate-50">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">Select Master Station</h4>
                            <div className="relative mb-3">
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
                                  id="syncMasterPin"
                                  className="h-3 w-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  checked={syncMasterPin}
                                  onChange={(e) => setSyncMasterPin(e.target.checked)}
                                />
                                <label htmlFor="syncMasterPin" className="text-[10px] font-medium text-slate-600 cursor-pointer">
                                  Sync Master Pin to these coordinates
                                </label>
                            </div>
                          </div>
                          <div className="max-h-[300px] overflow-y-auto p-1">
                            {filteredStations.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400">No stations found</div>
                            ) : (
                              filteredStations.map(station => (
                                <button
                                  key={station.id}
                                  className="w-full text-left p-2.5 hover:bg-blue-50 rounded transition-colors group flex items-center justify-between"
                                  onClick={() => handleMerge(loc.id, station.id)}
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
                        </PopoverContent>
                      </Popover>

                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                        onClick={() => {
                          setSelectedLocation(loc);
                          setIsRejectDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Reject
                      </Button>

                      <Button 
                        size="sm" 
                        className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-sm"
                        onClick={() => handlePromote(loc)}
                        disabled={actionId === loc.id}
                      >
                        {actionId === loc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Secure Ledger
                          </>
                        )}
                      </Button>
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
    </div>
  );
}