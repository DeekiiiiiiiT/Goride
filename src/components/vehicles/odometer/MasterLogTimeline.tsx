import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { 
  ShieldCheck, 
  AlertCircle, 
  Fuel, 
  Wrench, 
  ClipboardCheck, 
  User, 
  TrendingUp,
  History,
  CheckCircle2,
  XCircle,
  MoreVertical,
  ChevronRight,
  Info,
  Search,
  RotateCw,
  Plus,
  Pencil,
  Trash2,
  ScanLine,
  Keyboard,
  CreditCard,
  FileText
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Progress } from "../../ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import { toast } from "sonner@2.0.3";
import { OdometerReading, MileageReport } from '../../../types/vehicle';
import { Trip } from '../../../types/data';
import { odometerService } from '../../../services/odometerService';
import { mileageCalculationService } from '../../../services/mileageCalculationService';
import { api } from '../../../services/api';
import { FuelCalculationService } from '../../../services/fuelCalculationService';
import { fuelService } from '../../../services/fuelService';
import { TripManifestSheet } from './TripManifestSheet';
import { SourceEvidenceModal } from './SourceEvidenceModal';
import { AuditTrailModal } from './AuditTrailModal';

interface MasterLogTimelineProps {
  vehicleId: string;
  refreshTrigger?: number;
  viewMode?: 'timeline' | 'anomalies';
}

const MasterLogTimelineInternal: React.FC<MasterLogTimelineProps & React.HTMLAttributes<HTMLDivElement>> = ({ vehicleId, refreshTrigger = 0, viewMode = 'timeline', ...props }) => {
  const [history, setHistory] = useState<OdometerReading[]>([]);
  const [reports, setReports] = useState<Record<string, MileageReport>>({});
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<OdometerReading | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editOdometer, setEditOdometer] = useState('');
  
  const [evidenceData, setEvidenceData] = useState<any | null>(null);
  const [auditTrailId, setAuditTrailId] = useState<string | null>(null);
  const [manifestGap, setManifestGap] = useState<{start: OdometerReading, end: OdometerReading} | null>(null);
  
  // Virtualization State
  const [visibleCount, setVisibleCount] = useState(20);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bottomRef.current) return;
    
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setVisibleCount(prev => prev + 20);
      }
    }, { threshold: 0.1 });
    
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, []);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('any');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const parseDateForDisplay = (dateStr: string): Date => {
     if (dateStr.includes('T')) {
         return new Date(dateStr);
     }
     // Legacy date-only string (YYYY-MM-DD)
     // Parse manually to local midnight to avoid UTC shift
     const [year, month, day] = dateStr.split('-').map(Number);
     return new Date(year, month - 1, day);
  };

  const fetchTimelineData = useCallback(async () => {
    setLoading(true);
    try {
      const unifiedHistory = await odometerService.getUnifiedHistory(vehicleId);
      setHistory(unifiedHistory);

      // Generate reports for each pair of VERIFIED anchors only
      const verifiedOnly = unifiedHistory
        .filter(r => r.isVerified)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (verifiedOnly.length < 2) {
          setReports({});
          return;
      }

      // Optimization Phase 8: Batch fetch all trips for the vehicle to avoid O(N) sequential calls
      // This solves the performance bottleneck after running Chaos Seeder
      const allTripsResponse = await api.getTripsFiltered({ 
          vehicleId, 
          limit: 5000 // High limit for batch processing
      });
      const allTrips = allTripsResponse.data || [];

      // Fetch adjustments for 3-way attribution
      let allAdjustments: any[] = [];
      try {
          const adjResponse = await fuelService.getMileageAdjustments();
          allAdjustments = (adjResponse || []).filter((a: any) => a.vehicleId === vehicleId);
      } catch (e) {
          console.error("Failed to fetch adjustments for 3-way attribution", e);
      }

      const newReports: Record<string, MileageReport> = {};
      
      for (let i = 0; i < verifiedOnly.length - 1; i++) {
        const start = verifiedOnly[i];
        const end = verifiedOnly[i+1];
        
        // Filter trips locally from the batch
        const startTime = new Date(start.date).getTime();
        const endTime = new Date(end.date).getTime();
        
        const periodTrips = allTrips.filter((t: Trip) => {
            // Only include Completed and Cancelled trips (Processing trips are unverified)
            if (t.status !== 'Completed' && t.status !== 'Cancelled') return false;
            
            const tTime = new Date(t.date).getTime();
            // Prioritize anchorPeriodId tag if available (from Phase 6 logic)
            if (t.metadata?.anchorPeriodId) {
                return t.metadata.anchorPeriodId === start.id;
            }
            return tTime >= startTime && tTime <= endTime;
        });

        const totalDistance = end.value - start.value;
        const platformDistance = periodTrips.reduce((sum: number, trip: Trip) => sum + FuelCalculationService.getTotalTripRideshareKm(trip), 0);
        const personalDistance = Math.max(0, totalDistance - platformDistance);
        const personalPercentage = totalDistance > 0 ? (personalDistance / totalDistance) * 100 : 0;

        // 3-way attribution: match adjustments to this anchor period by date
        const periodAdjustments = allAdjustments.filter((a: any) => {
            const aTime = new Date(a.date).getTime();
            return aTime >= startTime && aTime <= endTime;
        });

        const adjustedPersonalDistance = periodAdjustments
            .filter((a: any) => a.type === 'Personal')
            .reduce((sum: number, a: any) => sum + (a.distance || 0), 0);
        const companyMiscDistance = periodAdjustments
            .filter((a: any) => a.type === 'Company_Misc' || a.type === 'Maintenance')
            .reduce((sum: number, a: any) => sum + (a.distance || 0), 0);
        const unaccountedDistance = Math.max(0, totalDistance - platformDistance - adjustedPersonalDistance - companyMiscDistance);

        let anomalyDetected = false;
        let anomalyReason = undefined;

        if (totalDistance < 0) {
            anomalyDetected = true;
            anomalyReason = "End odometer is lower than start odometer.";
        } else if (totalDistance - platformDistance < -1) {
            anomalyDetected = true;
            anomalyReason = `Platform distance exceeds total physical distance.`;
        }

        newReports[`${start.id}_${end.id}`] = {
            vehicleId,
            periodStart: start.date,
            periodEnd: end.date,
            startOdometer: start.value,
            endOdometer: end.value,
            totalDistance,
            platformDistance,
            personalDistance,
            personalPercentage,
            anomalyDetected,
            anomalyReason,
            tripCount: periodTrips.length,
            rideShareDistance: platformDistance,
            adjustedPersonalDistance,
            companyMiscDistance,
            unaccountedDistance
        };
      }
      setReports(newReports);
    } catch (error) {
      console.error("Failed to fetch timeline data", error);
      toast.error("Failed to load Master Log");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    fetchTimelineData();
  }, [fetchTimelineData, refreshTrigger]);

  const handleReview = async (readingId: string, status: 'approved' | 'rejected') => {
    // Optimistic Update
    const originalHistory = [...history];
    const itemIndex = history.findIndex(h => h.id === readingId);
    if (itemIndex === -1) return;

    const newHistory = [...history];
    newHistory[itemIndex] = {
        ...newHistory[itemIndex],
        isVerified: status === 'approved',
        isAnchorPoint: status === 'approved',
        isManagerVerified: status === 'approved',
        verifiedBy: 'Fleet Manager (Pending...)',
        verifiedAt: new Date().toISOString()
    };
    setHistory(newHistory);
    
    setReviewingId(readingId);
    try {
      const reading = newHistory[itemIndex];
      const updatedReading: Partial<OdometerReading> = {
        ...reading,
        verifiedBy: 'Fleet Manager',
      };

      await api.addOdometerReading(updatedReading);
      toast.success(`Reading ${status === 'approved' ? 'approved' : 'flagged'}`);
      // fetchTimelineData(); // Refresh in background if needed, but optimistic UI is enough for now
    } catch (error) {
      setHistory(originalHistory);
      toast.error("Failed to update status");
    } finally {
      setReviewingId(null);
    }
  };

  const handleDelete = (readingId: string) => {
    setDeleteId(readingId);
  };

  const handleEdit = (item: OdometerReading) => {
    setEditingItem(item);
    const dateObj = parseDateForDisplay(item.date);
    setEditDate(format(dateObj, 'yyyy-MM-dd'));
    setEditTime(format(dateObj, 'HH:mm'));
    setEditOdometer(item.value.toString());
  };

  const handleViewSource = (item: OdometerReading) => {
    // Priority for display: Odometer Proof > Receipt > General Photo
    const bestImageUrl = item.imageUrl || 
                        item.metaData?.odometerProofUrl || 
                        item.metaData?.photoUrl || 
                        item.metaData?.receiptUrl || 
                        item.metaData?.invoiceUrl;

    setEvidenceData({
        id: item.id,
        type: item.source,
        source: item.source,
        date: item.date,
        value: item.value,
        imageUrl: bestImageUrl,
        notes: item.notes,
        metadata: item.metaData,
        isVerified: item.isVerified
    });
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    
    // Construct new date
    let newDateStr = editDate;
    if (editTime && editDate) {
        newDateStr = `${editDate}T${editTime}`;
    }

    // Clean ID logic matching the backend expectations and confirmDelete logic
    let cleanId = editingItem.id;
    if (cleanId.startsWith('fuel_')) cleanId = cleanId.replace('fuel_', '');
    else if (cleanId.startsWith('checkin_')) cleanId = cleanId.replace('checkin_', '');
    else if (cleanId.startsWith('service_')) cleanId = cleanId.replace('service_', '');
    // For others, keep as is

    try {
        const newValue = Number(editOdometer);
        
        // Phase 4: Create Audit Log before update
        await api.logAuditAction({
            entityId: editingItem.id,
            entityType: 'odometer_reading',
            action: 'update',
            oldValue: editingItem.value,
            newValue: newValue,
            reason: 'Manual adjustment via Master Log',
            userId: 'fleet-manager-1' // In a real app, this would be the session user
        });

        await api.updateAnchor(cleanId, {
            date: newDateStr,
            value: newValue,
            type: editingItem.source,
            vehicleId
        });
        toast.success("Anchor updated successfully (Audit Logged)");
        fetchTimelineData();
        setEditingItem(null);
    } catch (e) {
        console.error(e);
        toast.error("Failed to update anchor");
    }
  };

  const confirmDelete = async () => {
      if (!deleteId) return;

      // Find original item for logging
      const originalItem = history.find(h => h.id === deleteId);

      // Optimistic Update
      const originalHistory = [...history];
      setHistory(prev => prev.filter(h => h.id !== deleteId));

      setReviewingId(deleteId);
      try {
          // Phase 4: Audit Log for deletion
          if (originalItem) {
              await api.logAuditAction({
                  entityId: deleteId,
                  entityType: 'odometer_reading',
                  action: 'delete',
                  oldValue: originalItem.value,
                  reason: 'Manual deletion via Master Log',
                  userId: 'fleet-manager-1'
              });
          }

          if (deleteId.startsWith('checkin_')) {
            await api.deleteCheckIn(deleteId.replace('checkin_', ''));
          } else if (deleteId.startsWith('fuel_')) {
            await api.deleteFuelEntry(deleteId.replace('fuel_', ''));
          } else if (deleteId.startsWith('service_')) {
            await api.deleteMaintenanceLog(deleteId.replace('service_', ''), vehicleId);
          } else {
            await api.deleteOdometerReading(deleteId, vehicleId);
          }

          toast.success("Odometer reading deleted");
          // fetchTimelineData();
      } catch (error) {
          setHistory(originalHistory);
          console.error(error);
          toast.error("Failed to delete reading");
      } finally {
          setReviewingId(null);
          setDeleteId(null);
      }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'Fuel Receipt':
      case 'Fuel Log':
        return <Fuel className="h-4 w-4 text-amber-500" />;
      case 'Service Log':
      case 'Service Request':
        return <Wrench className="h-4 w-4 text-blue-500" />;
      case 'Weekly Check-in':
        return <ClipboardCheck className="h-4 w-4 text-indigo-500" />;
      case 'Baseline':
        return <ShieldCheck className="h-4 w-4 text-purple-500" />;
      default:
        return <User className="h-4 w-4 text-slate-500" />;
    }
  };

  const getSourceLabel = (source: string) => {
     if (source === 'Weekly Check-in') return 'Check-in';
     return source;
  }

  // Filter Logic
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
        // Search
        if (searchTerm && !item.notes?.toLowerCase().includes(searchTerm.toLowerCase()) && !item.source.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        // Source
        if (sourceFilter !== 'all') {
            if (sourceFilter === 'verified' && !item.isVerified) return false;
        }
        // Confidence (Simplified mapping)
        if (confidenceFilter !== 'any') {
            if (confidenceFilter === 'high' && !item.isVerified) return false;
        }
        
        // Date Range - Use the same parsing logic as display to avoid UTC shifts
        const itemDate = parseDateForDisplay(item.date).getTime();
        
        if (dateRange.from) {
            const [y, m, d] = dateRange.from.split('-').map(Number);
            const fromDate = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
            if (itemDate < fromDate) return false;
        }
        
        if (dateRange.to) {
            const [y, m, d] = dateRange.to.split('-').map(Number);
            const toDate = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
            if (itemDate > toDate) return false;
        }
        
        return true;
    });
  }, [history, searchTerm, sourceFilter, confidenceFilter, dateRange]);

  // Calculate Verified Coverage
  // Since we removed projections, coverage is now 100% of the displayed items are anchors. 
  // Maybe we can calculate coverage based on time? or just remove it.
  // The prompt asked to "Update "Audit Confidence" text to reflect that we are measuring the frequency of hard anchors vs trip volume"
  // For now let's keep it simple: Ratio of verified anchors in the list (should be 100% now)
  const verifiedCount = history.filter(r => r.isVerified).length;
  const totalItems = history.length;

  const latestReading = history.length > 0 ? history[0] : null;

  const anomalyReports = useMemo(() => {
     return Object.values(reports)
        .filter(r => r.anomalyDetected)
        .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());
  }, [reports]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="text-sm text-slate-500">Loading Master Log...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2" {...props}>
      {/* Filter Bar */}
      <Card className="bg-white border-slate-200 shadow-sm">
          <CardContent className="p-4">
              <div className="flex flex-col lg:flex-row gap-4 items-center">
                  <div className="relative flex-1 w-full">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input 
                        placeholder="Filter by location, driver, or service..." 
                        className="pl-9 bg-slate-50 border-slate-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                      <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Source Type</label>
                          <Select value={sourceFilter} onValueChange={setSourceFilter}>
                              <SelectTrigger className="w-[140px] h-9 text-xs">
                                  <SelectValue placeholder="All Sources" />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="all">All Sources</SelectItem>
                                  <SelectItem value="verified">Verified Only</SelectItem>
                              </SelectContent>
                          </Select>
                      </div>

                      <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase">From</label>
                           <Input 
                                type="date" 
                                className="h-9 w-[130px] text-xs" 
                                value={dateRange.from}
                                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                           />
                      </div>
                      <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase">To</label>
                           <Input 
                                type="date" 
                                className="h-9 w-[130px] text-xs" 
                                value={dateRange.to}
                                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                           />
                      </div>
                      
                      <div className="pt-5">
                        <Button variant="ghost" size="sm" className="text-slate-500 h-9" onClick={() => {
                            setSearchTerm('');
                            setSourceFilter('all');
                            setConfidenceFilter('any');
                            setDateRange({ from: '', to: '' });
                        }}>
                            Reset
                        </Button>
                      </div>
                  </div>
              </div>
          </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Timeline View */}
        <div className="lg:col-span-2 space-y-6">
            {viewMode === 'anomalies' ? (
                <div className="space-y-6">
                     <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900">Anomaly Detection</h3>
                            <p className="text-sm text-slate-500">Displaying {anomalyReports.length} flagged intervals</p>
                        </div>
                        <Badge variant="destructive" className="bg-red-50 text-red-600 border-red-200">
                            {anomalyReports.length} Issues
                        </Badge>
                    </div>

                    <div className="space-y-4">
                        {anomalyReports.map((report, idx) => (
                             <Card key={idx} className="border-red-200 bg-red-50/30 overflow-hidden">
                                <CardContent className="p-0">
                                    <div className="p-4 border-b border-red-100 flex justify-between items-center bg-red-50/50">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="w-5 h-5 text-red-500" />
                                            <span className="font-semibold text-red-900">Anomaly Detected</span>
                                        </div>
                                        <Badge variant="outline" className="bg-white border-red-200 text-red-700">
                                            {format(parseDateForDisplay(report.periodStart), 'MMM d')} - {format(parseDateForDisplay(report.periodEnd), 'MMM d, yyyy')}
                                        </Badge>
                                    </div>
                                    <div className="p-6">
                                        <div className="flex flex-col gap-4">
                                            <div className="p-3 bg-white rounded border border-red-100 text-sm text-red-800">
                                                <strong>Issue:</strong> {report.anomalyReason}
                                            </div>
                                            
                                            <div className="grid grid-cols-3 gap-4 text-center">
                                                <div className="p-3 bg-white rounded border border-slate-100">
                                                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Physical Dist</div>
                                                    <div className="text-lg font-mono font-bold text-slate-900">{report.totalDistance.toLocaleString()} km</div>
                                                </div>
                                                <div className="p-3 bg-white rounded border border-slate-100">
                                                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Reported Trips</div>
                                                    <div className="text-lg font-mono font-bold text-indigo-600">{report.platformDistance.toFixed(1)} km</div>
                                                </div>
                                                <div className="p-3 bg-white rounded border border-slate-100">
                                                    <div className="text-xs text-slate-500 uppercase font-bold mb-1">Gap</div>
                                                    <div className="text-lg font-mono font-bold text-red-600">{(report.totalDistance - report.platformDistance).toFixed(1)} km</div>
                                                </div>
                                            </div>

                                            {/* Smart Suggestions */}
                                            {report.totalDistance * 1.60934 > report.platformDistance && (report.totalDistance - report.platformDistance < 0) && (
                                                <div className="bg-amber-50 text-amber-800 text-xs p-3 rounded flex items-start gap-2 border border-amber-100">
                                                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                                    <div>
                                                        <strong>Possible Unit Mismatch:</strong> 
                                                        <span className="block mt-0.5">
                                                            If {report.totalDistance} was entered in <strong>Miles</strong>, it would equal <strong>{(report.totalDistance * 1.60934).toFixed(1)} km</strong>, which covers the reported distance.
                                                        </span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex justify-end gap-2 mt-2">
                                                 <Button 
                                                    size="sm"
                                                    variant="outline"
                                                    className="bg-white"
                                                    onClick={() => {
                                                        const e = history.find(h => h.value === report.endOdometer && h.date === report.periodEnd);
                                                        if (e) handleEdit(e);
                                                        else toast.error("Could not find anchor to edit");
                                                    }}
                                                 >
                                                    <Pencil className="w-3 h-3 mr-2" />
                                                    Fix Odometer
                                                 </Button>
                                                 <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    onClick={() => {
                                                        // Find the items to trigger manifest view
                                                        // We need the original OdometerReading objects
                                                        const startItem = history.find(h => h.id.includes(report.startOdometer.toString()) || h.value === report.startOdometer); // heuristic
                                                        // Better: We stored IDs in the report key usually? No, report key is `${start.id}_${end.id}`.
                                                        // But we don't have the IDs in the report object explicitly except via closure?
                                                        // Wait, in fetchTimelineData: newReports[`${start.id}_${end.id}`]
                                                        // I should probably pass IDs in the report object to be safe.
                                                        // The report object has: vehicleId, periodStart, periodEnd...
                                                        // It does NOT have startId/endId. 
                                                        // I should add them to MileageReport type or just find them by date/value.
                                                        
                                                        // Finding by value/date is safe enough for this context
                                                        const s = history.find(h => h.value === report.startOdometer && h.date === report.periodStart);
                                                        const e = history.find(h => h.value === report.endOdometer && h.date === report.periodEnd);
                                                        
                                                        if (s && e) {
                                                            setManifestGap({ start: s, end: e });
                                                        } else {
                                                            toast.error("Could not load manifest for this gap.");
                                                        }
                                                    }}
                                                 >
                                                    View Trip Manifest
                                                 </Button>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                             </Card>
                        ))}

                        {anomalyReports.length === 0 && (
                            <div className="text-center p-12 bg-slate-50 border border-slate-200 rounded-lg border-dashed">
                                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                                <h3 className="text-lg font-medium text-slate-900">All Clear</h3>
                                <p className="text-slate-500">No anomalies detected in verified gaps.</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <>
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Timeline View</h3>
                        <p className="text-sm text-slate-500">Displaying {filteredHistory.length} of {history.length} audit entries</p>
                    </div>
                    <Badge variant="outline" className="bg-white">
                        {history.filter(h => h.isVerified).length} Anchors
                    </Badge>
                </div>

                <Card className="border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <div className="min-w-[800px]">
                        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 grid grid-cols-12 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <div className="col-span-3">Timestamp</div>
                            <div className="col-span-2">Anchor Source</div>
                            <div className="col-span-2 text-right pr-4">Odometer</div>
                            <div className="col-span-2 text-right pr-4">Distance Δ</div>
                            <div className="col-span-3">Description / Verification</div>
                        </div>
                        <div className="divide-y divide-slate-100">
                            {filteredHistory.slice(0, visibleCount).map((item, index) => {
                                const prevItem = index < filteredHistory.length - 1 ? filteredHistory[index + 1] : null;
                                const delta = prevItem ? item.value - prevItem.value : 0;
                                const isPlus = delta >= 0;

                                // Check if there is a report for the gap leading to this item (from previous chronological item)
                                // In the list, the previous chronological item is at index + 1 (because list is sorted DESC)
                                // So the gap is between item (End) and prevItem (Start)
                                // wait, report key is `${prevItem.id}_${item.id}`
                                // start is prevItem (older), end is item (newer)
                                const report = prevItem ? reports[`${prevItem.id}_${item.id}`] : null;

                                return (
                                    <div key={item.id} className="divide-y divide-slate-100">
                                    <div className="grid grid-cols-12 px-6 py-5 items-center hover:bg-slate-50 transition-colors group relative z-10 bg-white min-h-[72px]">
                                        <div className="col-span-3">
                                            <p className="text-sm font-semibold text-slate-900">{format(parseDateForDisplay(item.date), 'MMM d, yyyy')}</p>
                                            <p className="text-xs text-slate-400">{format(parseDateForDisplay(item.date), 'HH:mm')}</p>
                                        </div>
                                        <div className="col-span-2 flex items-center gap-2">
                                            <div className="p-2 rounded-full bg-indigo-100 text-indigo-600">
                                                {getSourceIcon(item.source)}
                                            </div>
                                            <span className="text-sm font-medium text-slate-700">
                                                {getSourceLabel(item.source)}
                                            </span>
                                        </div>
                                        <div className="col-span-2 text-right pr-4">
                                            <p className="text-sm font-mono font-bold text-slate-900">{item.value.toLocaleString()}</p>
                                            <p className="text-[10px] text-slate-400">KM</p>
                                        </div>
                                        <div className="col-span-2 text-right pr-4">
                                            {prevItem && (
                                                <Badge variant="outline" className={`font-mono font-normal ${isPlus ? 'bg-slate-50 text-slate-600' : 'bg-red-50 text-red-600'}`}>
                                                    {isPlus ? '+' : ''}{delta.toFixed(1)}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="col-span-3 flex flex-col items-start gap-1">
                                            <div className="flex flex-col items-start gap-1">
                                                <button 
                                                    className="text-sm text-slate-600 truncate w-full text-left hover:text-indigo-600 hover:underline transition-colors" 
                                                    title="Click to view source evidence"
                                                    onClick={() => handleViewSource(item)}
                                                >
                                                    {item.notes}
                                                </button>
                                                <div className="flex gap-2">
                                                    <Badge className={`text-[10px] h-6 px-2 flex items-center gap-1 ${item.isVerified ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                                                        {item.isVerified ? (
                                                            item.metaData?.method === 'ai_verified' ? (
                                                                <ScanLine className="w-3.5 h-3.5" />
                                                            ) : (
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                            )
                                                        ) : <AlertCircle className="w-3.5 h-3.5" />}
                                                        {item.isVerified ? (item.metaData?.method === 'ai_verified' ? 'AI Scanned' : 'Verified') : 'Unverified'}
                                                    </Badge>
                                                    
                                                    {item.metaData?.method === 'manual_override' && (
                                                        <Badge variant="outline" className="text-[10px] h-6 px-2 flex items-center gap-1 text-slate-500 bg-slate-50">
                                                            <Keyboard className="w-3.5 h-3.5" />
                                                            Manual Entry
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="absolute right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-10 w-10">
                                                        <MoreVertical className="h-5 w-5 text-slate-400" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleViewSource(item)}>
                                                        <FileText className="mr-2 h-4 w-4 text-indigo-500" />
                                                        View Source Evidence
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => setAuditTrailId(item.id)}>
                                                        <History className="mr-2 h-4 w-4 text-slate-500" />
                                                        View Audit Trail
                                                    </DropdownMenuItem>
                                                    {!item.isVerified && (
                                                        <DropdownMenuItem onClick={() => handleReview(item.id, 'approved')}>
                                                            <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
                                                            Mark as Verified
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => handleEdit(item)}>
                                                        <Pencil className="mr-2 h-4 w-4 text-slate-500" />
                                                        Edit Entry
                                                    </DropdownMenuItem>
                                                    {item.isVerified && (
                                                        <DropdownMenuItem onClick={() => handleReview(item.id, 'rejected')}>
                                                            <XCircle className="mr-2 h-4 w-4 text-amber-500" />
                                                            Flag as Unverified
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        Delete Entry
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>

                                    {/* Gap Report Visualization */}
                                    {report && (
                                        <div className="px-12 py-3 bg-slate-50 border-t border-b border-slate-100">
                                            <div className="flex items-center gap-6 text-xs">
                                                <div className="flex items-center gap-2 text-slate-500">
                                                    <TrendingUp className="w-4 h-4" />
                                                    <span className="font-semibold">Audit Gap Analysis</span>
                                                </div>
                                                <div className="h-4 w-px bg-slate-300"></div>
                                                <div>
                                                    <span className="text-slate-400 uppercase text-[10px] font-bold mr-2">Trips</span>
                                                    <span className="font-mono font-bold text-slate-700">{report.tripCount}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 uppercase text-[10px] font-bold mr-2">Business</span>
                                                    <span className="font-mono font-bold text-slate-700">{report.platformDistance.toFixed(1)} km</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 uppercase text-[10px] font-bold mr-2">Personal</span>
                                                    <span className={`font-mono font-bold ${report.personalDistance > 0 ? 'text-indigo-600' : 'text-slate-700'}`}>
                                                        {report.personalDistance.toFixed(1)} km
                                                    </span>
                                                </div>

                                                <div className="ml-auto flex items-center gap-4">
                                                    {report.anomalyDetected && (
                                                        <Badge variant="destructive" className="text-[10px]">
                                                            Anomaly Detected
                                                        </Badge>
                                                    )}
                                                    
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="h-9 px-4 text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                                        onClick={() => prevItem && setManifestGap({ start: prevItem, end: item })}
                                                    >
                                                        View Trip Manifest
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    </div>
                                );
                            })}
                            
                            <div ref={bottomRef} className="h-4 w-full" />

                            {filteredHistory.length === 0 && (
                                <div className="p-12 text-center text-slate-500">
                                    <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                    <p>No verified anchors found.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
            </>
            )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
            {/* Audit Confidence Card */}
            <Card className="border-indigo-100 bg-white shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                        <Info className="w-4 h-4 text-indigo-500" />
                        Anchor Confidence
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-semibold text-slate-500">Verified Anchors</span>
                            <span className="text-lg font-bold text-indigo-600">{verifiedCount}</span>
                        </div>
                        <Progress value={Math.min(100, (verifiedCount / 10) * 100)} className="h-2 bg-indigo-50" indicatorClassName="bg-indigo-500" />
                        <p className="text-[10px] text-right text-slate-400 mt-1">Target: 10+ anchors</p>
                    </div>
                    
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-xs text-slate-600 leading-relaxed">
                            "Verified Anchors" are physical hard points (Check-ins, Service Logs) used to audit the gaps against reported trips.
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* Source Definitions */}
            <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold text-slate-900">Source Definitions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex gap-3">
                        <div className="mt-0.5"><Wrench className="w-4 h-4 text-blue-500" /></div>
                        <div>
                            <h4 className="text-xs font-bold text-slate-700">Service Logs</h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">Official readings from mechanic invoices. High trust.</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <div className="mt-0.5"><Fuel className="w-4 h-4 text-amber-500" /></div>
                        <div>
                            <h4 className="text-xs font-bold text-slate-700">Fuel Receipts</h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">Odometer captured at pump. Excellent frequency.</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <div className="mt-0.5"><CheckCircle2 className="w-4 h-4 text-indigo-500" /></div>
                        <div>
                            <h4 className="text-xs font-bold text-slate-700">Weekly Check-in</h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">Verified photo of odometer cluster by admin.</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
      
      <SourceEvidenceModal 
        isOpen={!!evidenceData}
        onClose={() => setEvidenceData(null)}
        evidence={evidenceData}
      />

      <AuditTrailModal 
        isOpen={!!auditTrailId}
        onClose={() => setAuditTrailId(null)}
        entityId={auditTrailId}
      />

      <TripManifestSheet 
        isOpen={!!manifestGap}
        onClose={() => setManifestGap(null)}
        vehicleId={vehicleId}
        startAnchor={manifestGap?.start || null}
        endAnchor={manifestGap?.end || null}
      />

      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Edit Audit Anchor</DialogTitle>
                <DialogDescription>
                    Update the details for this {editingItem?.source} entry.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Date</label>
                        <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Time</label>
                        <Input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Odometer (km)</label>
                    <Input type="number" value={editOdometer} onChange={e => setEditOdometer(e.target.value)} />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
                <Button onClick={saveEdit}>Save Changes</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the odometer reading.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export const MasterLogTimeline = React.memo(MasterLogTimelineInternal);