import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  Trash2
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
import { TripManifestSheet } from './TripManifestSheet';

interface MasterLogTimelineProps {
  vehicleId: string;
  refreshTrigger?: number;
}

export const MasterLogTimeline: React.FC<MasterLogTimelineProps> = ({ vehicleId, refreshTrigger = 0 }) => {
  const [history, setHistory] = useState<OdometerReading[]>([]);
  const [reports, setReports] = useState<Record<string, MileageReport>>({});
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<OdometerReading | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editOdometer, setEditOdometer] = useState('');
  
  const [manifestGap, setManifestGap] = useState<{start: OdometerReading, end: OdometerReading} | null>(null);
  
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

      const newReports: Record<string, MileageReport> = {};
      for (let i = 0; i < verifiedOnly.length - 1; i++) {
        const start = verifiedOnly[i];
        const end = verifiedOnly[i+1];
        try {
            const report = await mileageCalculationService.calculatePeriodMileage(vehicleId, start, end);
            newReports[`${start.id}_${end.id}`] = report;
        } catch (e) {
            console.error("Report calc error", e);
        }
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
    setReviewingId(readingId);
    try {
      const reading = history.find(h => h.id === readingId);
      if (!reading) return;

      const updatedReading: Partial<OdometerReading> = {
        ...reading,
        isVerified: status === 'approved',
        isManagerVerified: status === 'approved',
        verifiedBy: 'Fleet Manager',
        verifiedAt: new Date().toISOString()
      };

      await api.addOdometerReading(updatedReading);
      toast.success(`Reading ${status === 'approved' ? 'approved' : 'flagged'}`);
      fetchTimelineData();
    } catch (error) {
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
        await api.updateAnchor(cleanId, {
            date: newDateStr,
            value: Number(editOdometer),
            type: editingItem.source,
            vehicleId
        });
        toast.success("Anchor updated successfully");
        fetchTimelineData();
        setEditingItem(null);
    } catch (e) {
        console.error(e);
        toast.error("Failed to update anchor");
    }
  };

  const confirmDelete = async () => {
      if (!deleteId) return;

      setReviewingId(deleteId);
      try {
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
          fetchTimelineData();
      } catch (error) {
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
        return true;
    });
  }, [history, searchTerm, sourceFilter, confidenceFilter]);

  // Calculate Verified Coverage
  // Since we removed projections, coverage is now 100% of the displayed items are anchors. 
  // Maybe we can calculate coverage based on time? or just remove it.
  // The prompt asked to "Update "Audit Confidence" text to reflect that we are measuring the frequency of hard anchors vs trip volume"
  // For now let's keep it simple: Ratio of verified anchors in the list (should be 100% now)
  const verifiedCount = history.filter(r => r.isVerified).length;
  const totalItems = history.length;

  const latestReading = history.length > 0 ? history[0] : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="text-sm text-slate-500">Loading Master Log...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-2">
      
      {/* Live Fleet Status Card */}
      <Card className="bg-slate-950 text-white border-slate-800 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-32 bg-indigo-500/10 blur-[100px] rounded-full"></div>
        <CardContent className="p-8 relative z-10">
           <div className="flex flex-col md:flex-row justify-between md:items-start gap-6">
              <div>
                  <div className="flex items-center gap-2 mb-4">
                     <ShieldCheck className="w-4 h-4 text-emerald-400" />
                     <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">Last Verified Anchor</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-6">Physical Odometer Status</h2>
                  
                  <div className="flex items-center gap-2 mb-6">
                      {latestReading ? (
                         latestReading.value.toString().split('').map((digit, idx) => (
                             <div key={idx} className="w-10 h-14 bg-slate-900 border border-slate-800 rounded flex items-center justify-center">
                                 <span className="text-3xl font-mono font-bold">{digit}</span>
                             </div>
                         ))
                      ) : (
                          <div className="text-slate-500">No data</div>
                      )}
                      <span className="text-slate-500 text-xl font-bold ml-2 mt-4">km</span>
                  </div>

                  {latestReading && (
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 px-3 py-1">
                             <div className="w-2 h-2 rounded-full bg-emerald-400 mr-2"></div>
                             Verified: {format(parseDateForDisplay(latestReading.date), 'MMM d, yyyy')}
                          </Badge>
                          <Badge variant="outline" className="bg-slate-800 text-slate-300 border-slate-700 px-3 py-1">
                             <Info className="w-3 h-3 mr-2" />
                             Source: {latestReading.source}
                          </Badge>
                      </div>
                  )}
              </div>

              <div className="flex flex-col gap-3 min-w-[200px]">
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white w-full justify-start">
                      <Plus className="w-4 h-4 mr-2" />
                      Manual Odometer Entry
                  </Button>
                  <Button 
                    variant="outline" 
                    className="bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800 w-full justify-start"
                    onClick={fetchTimelineData}
                  >
                      <RotateCw className="w-4 h-4 mr-2" />
                      Sync Latest Data
                  </Button>
              </div>
           </div>
        </CardContent>
      </Card>

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
                           <Input type="date" className="h-9 w-[130px] text-xs" />
                      </div>
                      <div className="space-y-1">
                           <label className="text-[10px] font-bold text-slate-400 uppercase">To</label>
                           <Input type="date" className="h-9 w-[130px] text-xs" />
                      </div>
                      
                      <div className="pt-5">
                        <Button variant="ghost" size="sm" className="text-slate-500 h-9" onClick={() => {
                            setSearchTerm('');
                            setSourceFilter('all');
                            setConfidenceFilter('any');
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
                <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 grid grid-cols-12 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="col-span-3">Timestamp</div>
                    <div className="col-span-2">Anchor Source</div>
                    <div className="col-span-2 text-right pr-4">Odometer</div>
                    <div className="col-span-2 text-right pr-4">Distance Δ</div>
                    <div className="col-span-3">Description / Verification</div>
                </div>
                <div className="divide-y divide-slate-100">
                    {filteredHistory.map((item, index) => {
                        const prevItem = index < filteredHistory.length - 1 ? filteredHistory[index + 1] : null;
                        const delta = prevItem ? item.value - prevItem.value : 0;
                        const isPlus = delta >= 0;

                        // Check if there is a report for the gap leading to this item (from previous chronological item)
                        // In the list, the previous chronological item is at index + 1 (because list is sorted DESC)
                        // So the gap is between item (End) and prevItem (Start)
                        // wait, report key is `${start.id}_${end.id}`
                        // start is prevItem (older), end is item (newer)
                        const report = prevItem ? reports[`${prevItem.id}_${item.id}`] : null;

                        return (
                            <React.Fragment key={item.id}>
                            <div className="grid grid-cols-12 px-6 py-4 items-center hover:bg-slate-50 transition-colors group relative z-10 bg-white">
                                <div className="col-span-3">
                                    <p className="text-sm font-semibold text-slate-900">{format(parseDateForDisplay(item.date), 'MMM d, yyyy')}</p>
                                    <p className="text-xs text-slate-400">{format(parseDateForDisplay(item.date), 'HH:mm')}</p>
                                </div>
                                <div className="col-span-2 flex items-center gap-2">
                                    <div className="p-1.5 rounded-full bg-indigo-100 text-indigo-600">
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
                                    <p className="text-sm text-slate-600 truncate w-full" title={item.notes}>{item.notes}</p>
                                    <Badge className={`text-[10px] h-5 px-1.5 flex items-center gap-1 ${item.isVerified ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
                                        {item.isVerified ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                        {item.isVerified ? 'Verified' : 'Unverified'}
                                    </Badge>
                                </div>
                                    <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                                    <MoreVertical className="h-4 w-4 text-slate-400" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
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

                            {/* Gap Report Visualization (The line between anchors) */}
                            {report && (
                                <div className="col-span-12 px-12 py-2 bg-slate-50 border-t border-b border-slate-100">
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
                                                className="h-7 text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                                                onClick={() => prevItem && setManifestGap({ start: prevItem, end: item })}
                                            >
                                                View Trip Manifest
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            </React.Fragment>
                        );
                    })}
                    
                    {filteredHistory.length === 0 && (
                        <div className="p-12 text-center text-slate-500">
                            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p>No verified anchors found.</p>
                        </div>
                    )}
                </div>
            </Card>
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
