import React, { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { 
  Wrench, 
  User, 
  FileUp, 
  Fuel, 
  Flag, 
  MoreHorizontal, 
  Trash2,
  Calendar,
  RefreshCw,
  Info,
  Filter,
  Search,
  CheckCircle2,
  AlertCircle,
  FileDown,
  ListChecks,
  ChevronDown
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { formatInFleetTz, useFleetTimezone } from "../../../utils/timezoneDisplay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table";
import { Input } from "../../ui/input";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
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
import { OdometerReading, UnifiedOdometerEntry } from '../../../types/vehicle';
import { odometerService } from '../../../services/odometerService';
import { toast } from "sonner";

import { formatMasterLogExport, formatCheckInExport } from '../../../utils/odometerUtils';
import { downloadCSV } from '../../../utils/export';
import { ImportOdometerModal } from './ImportOdometerModal';
import { SourceEvidenceModal } from './SourceEvidenceModal';

interface OdometerHistoryProps {
  vehicleId: string;
  maintenanceLogs?: any[];
  trips?: any[];
  onCorrectReading?: () => void;
  refreshTrigger?: number;
}

const OdometerHistoryInternal: React.FC<OdometerHistoryProps> = ({ 
  vehicleId, 
  onCorrectReading, 
  refreshTrigger = 0 
}) => {
  const [history, setHistory] = useState<UnifiedOdometerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [readingToDelete, setReadingToDelete] = useState<string | null>(null);
  const [evidenceToShow, setEvidenceToShow] = useState<any>(null);
  const [isExportingMaster, setIsExportingMaster] = useState(false);
  const [isExportingCheckins, setIsExportingCheckins] = useState(false);
  const [filters, setFilters] = useState({
    source: 'fuel' as 'fuel' | 'service' | 'checkin',
    search: '',
    startDate: '',
    endDate: ''
  });
  const fleetTz = useFleetTimezone();

  const SOURCE_TABS = [
    { value: 'service' as const, label: 'Service Logs', short: 'Service', icon: Wrench },
    { value: 'fuel' as const, label: 'Fuel Receipts', short: 'Fuel', icon: Fuel },
    { value: 'checkin' as const, label: 'Vehicle Handover', short: 'Handover', icon: CheckCircle2 },
  ];

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await odometerService.getLedger(vehicleId, { limit: 5000 });
      setHistory(data || []);
    } catch (error) {
      console.error("Failed to load odometer history", error);
      toast.error("Failed to load odometer history");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshTrigger]);

  const handleExportMasterLog = async () => {
      setIsExportingMaster(true);
      try {
          // 1. Fetch fresh unified history to ensure we have the latest
          const data = await odometerService.getUnifiedHistory(vehicleId);
          
          if (!data || data.length === 0) {
              toast.error("No data to export");
              return;
          }

          // 2. Prepare for CSV
          // We can cast data to UnifiedOdometerEntry[] because the service guarantees it
          const exportRows = formatMasterLogExport(data as any[]);
          
          // 3. Download
          const filename = `master_odometer_log_${vehicleId}_${new Date().toISOString().split('T')[0]}`;
          await downloadCSV(exportRows, filename, { checksum: true });
          
          toast.success(`Exported ${exportRows.length} records successfully.`);
      } catch (error) {
          console.error("Export failed:", error);
          toast.error("Failed to export master log");
      } finally {
          setIsExportingMaster(false);
      }
  };

  const handleExportCheckins = async () => {
      setIsExportingCheckins(true);
      try {
          // 1. Fetch fresh unified history
          const data = await odometerService.getUnifiedHistory(vehicleId);
          
          if (!data || data.length === 0) {
              toast.error("No data to export");
              return;
          }

          // 2. Prepare for Check-in CSV (Legacy Format)
          // Filter strictly for check-ins as this is a legacy export
          const checkinsOnly = data.filter(d => d.source === 'checkin');
          const exportRows = formatCheckInExport(checkinsOnly as any[]);
          
          // 3. Download
          const filename = `checkin_export_${vehicleId}_${new Date().toISOString().split('T')[0]}`;
          await downloadCSV(exportRows, filename, { checksum: true });
          
          toast.success(`Exported ${exportRows.length} check-in records.`);
      } catch (error) {
          console.error("Check-in export failed:", error);
          toast.error("Failed to export check-ins");
      } finally {
          setIsExportingCheckins(false);
      }
  };

  const handleDeleteRequest = (id: string) => {
    setReadingToDelete(id);
  };

  const confirmDelete = async () => {
    if (!readingToDelete) return;
    
    try {
      // Find the reading to get its source type
      const reading = history.find(r => r.id === readingToDelete);
      const source = reading?.source || 'manual';
      await odometerService.deleteReading(readingToDelete, vehicleId, source);
      toast.success("Reading deleted");
      fetchHistory();
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete reading");
    } finally {
      setReadingToDelete(null);
    }
  };

  const handleViewEvidence = (reading: UnifiedOdometerEntry) => {
    const sourceMap: Record<string, string> = {
      'fuel': 'Fuel Receipt',
      'service': 'Service Log',
      'checkin': 'Vehicle Handover',
      'manual': 'Manual Entry'
    };

    const bestImageUrl = reading.imageUrl || 
                        reading.metaData?.odometerProofUrl || 
                        reading.metaData?.photoUrl || 
                        reading.metaData?.receiptUrl || 
                        reading.metaData?.invoiceUrl;

    setEvidenceToShow({
      id: reading.referenceId || reading.id,
      type: reading.source,
      source: sourceMap[reading.source] || reading.source,
      date: reading.date,
      value: reading.value,
      imageUrl: bestImageUrl,
      notes: reading.notes,
      metadata: { ...reading.metaData },
      isVerified: reading.isVerified
    });
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'service':
      case 'Service Log': return <Wrench className="h-4 w-4 text-blue-500" />;
      case 'manual':
      case 'Manual Update': return <User className="h-4 w-4 text-slate-500" />;
      case 'Trip Import': return <FileUp className="h-4 w-4 text-emerald-500" />;
      case 'fuel':
      case 'Fuel Log': return <Fuel className="h-4 w-4 text-amber-500" />;
      case 'checkin':
      case 'Weekly Check-in':
      case 'Vehicle Handover': return <CheckCircle2 className="h-4 w-4 text-indigo-500" />;
      case 'Baseline': return <Flag className="h-4 w-4 text-purple-500" />;
      default: return <Calendar className="h-4 w-4 text-slate-400" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'manual': return 'Manual';
      case 'fuel': return 'Fuel';
      case 'service': return 'Service';
      case 'checkin': return 'Vehicle Handover';
      case 'Trip Import': return 'Import';
      case 'Manual Update': return 'Manual';
      case 'Weekly Check-in': return 'Vehicle Handover';
      case 'Vehicle Handover': return 'Vehicle Handover';
      default: return source;
    }
  };

  /** Unified history uses canonical sources (fuel, service, checkin, manual); legacy rows may use API labels. */
  const canonicalSource = useCallback((source: string): string => {
    const map: Record<string, string> = {
      "Fuel Log": "fuel",
      "Service Log": "service",
      "Weekly Check-in": "checkin",
      "Vehicle Handover": "checkin",
      "Manual Update": "manual",
    };
    return map[source] || source;
  }, []);

  const filteredHistory = useMemo(() => {
    const rows = history.filter((item) => {
      if (canonicalSource(item.source) !== filters.source) return false;
      
      // Search (notes)
      if (filters.search && !item.notes?.toLowerCase().includes(filters.search.toLowerCase())) return false;

      // Date range
      if (filters.startDate) {
        const start = startOfDay(new Date(filters.startDate));
        if (new Date(item.date) < start) return false;
      }
      if (filters.endDate) {
        const end = endOfDay(new Date(filters.endDate));
        if (new Date(item.date) > end) return false;
      }

      return true;
    });

    // Newest first by real clock time (recordedAt), then higher km as tie-break
    return [...rows].sort((a, b) => {
      const ta = new Date(a.recordedAt || a.createdAt || a.date).getTime();
      const tb = new Date(b.recordedAt || b.createdAt || b.date).getTime();
      if (tb !== ta) return tb - ta;
      return (Number(b.value) || 0) - (Number(a.value) || 0);
    });
  }, [history, filters, canonicalSource]);

  const sourceTotal = useMemo(
    () => history.filter((item) => canonicalSource(item.source) === filters.source).length,
    [history, filters.source, canonicalSource],
  );

  const activeSourceTab = SOURCE_TABS.find((t) => t.value === filters.source) || SOURCE_TABS[1]!;

  const formatDate = (dateStr: string, recordedAt?: string | null) => {
    const raw = recordedAt || dateStr;
    if (!raw) return '-';
    try {
        const hasTime = /T\d{1,2}:\d{2}/.test(String(raw)) || (String(raw).length > 10 && /\d{2}:\d{2}/.test(String(raw)));
        if (!hasTime && String(raw).length === 10 && String(raw).includes('-')) {
            const [year, month, day] = String(raw).split('-').map(Number);
            return format(new Date(year, month - 1, day), 'MMM d, yyyy');
        }
        // Display in Fleet Jamaica timezone (matches Transaction Logs wall clock)
        return formatInFleetTz(raw, fleetTz, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
    } catch (e) {
        return dateStr || String(raw);
    }
  };

  const latestReading = history[0]?.value || 0;
  const digits = latestReading.toLocaleString('en-US', { minimumIntegerDigits: 6, useGrouping: false }).split('').slice(-6);
  const lastVerifiedDate = history.find(r => r.type === 'Hard')?.date || '';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin" />
        <p className="text-slate-500 font-medium">Loading history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs
        value={filters.source}
        onValueChange={(v) =>
          setFilters((prev) => ({ ...prev, source: v as 'fuel' | 'service' | 'checkin' }))
        }
      >
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-slate-100 p-1 sm:w-auto">
          {SOURCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const count = history.filter((h) => canonicalSource(h.source) === tab.value).length;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-1.5 px-3 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.short}</span>
                <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 rounded-md px-1.5 text-[10px] font-semibold">
                  {count}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Advanced Filter Bar */}
      <Card className="border-slate-200 bg-slate-50/50 shadow-sm overflow-visible">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[240px]">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 block px-1">Search Notes</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Filter by location, driver, or notes..." 
                  className="pl-10 bg-white border-slate-200 rounded-lg h-10"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2">
               <div className="w-[140px]">
                  <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 block px-1">From</label>
                  <Input 
                    type="date" 
                    className="bg-white border-slate-200 rounded-lg h-10 text-xs"
                    value={filters.startDate}
                    onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                  />
               </div>
               <div className="w-[140px]">
                  <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 block px-1">To</label>
                  <Input 
                    type="date" 
                    className="bg-white border-slate-200 rounded-lg h-10 text-xs"
                    value={filters.endDate}
                    onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                  />
               </div>
            </div>

            <Button 
              variant="ghost" 
              className="text-slate-500 hover:text-slate-900 h-10"
              onClick={() => setFilters((prev) => ({
                ...prev,
                search: '',
                startDate: '',
                endDate: ''
              }))}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main List */}
        <div className="lg:col-span-3">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/30">
              <div className="space-y-1">
                <CardTitle className="text-base font-semibold">{activeSourceTab.label}</CardTitle>
                <CardDescription>
                  Displaying {filteredHistory.length} of {sourceTotal} records.
                  “vs prior log” compares within this {activeSourceTab.short.toLowerCase()} timeline only.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredHistory.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="bg-slate-100 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Filter className="h-8 w-8 text-slate-300" />
                  </div>
                  <h3 className="text-slate-900 font-semibold mb-1">No {activeSourceTab.label.toLowerCase()}</h3>
                  <p className="text-slate-500 text-sm max-w-xs mx-auto">Try another tab, or adjust your search and date range.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-slate-50/50">
                      <TableHead className="w-[140px] font-semibold text-slate-600 h-10">Timestamp</TableHead>
                      <TableHead className="w-[160px] font-semibold text-slate-600 h-10">Anchor Source</TableHead>
                      <TableHead className="font-semibold text-slate-600 h-10 text-right">Odometer</TableHead>
                      <TableHead
                        className="font-semibold text-slate-600 h-10 text-right"
                        title={`Change vs the previous ${activeSourceTab.short.toLowerCase()} log in this tab. Red = regression; does not lower Live Status.`}
                      >
                        vs prior log
                      </TableHead>
                      <TableHead className="font-semibold text-slate-600 h-10">Description / Verification</TableHead>
                      <TableHead className="w-[40px] h-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((reading, index) => {
                      // Prior log = next row in newest-first list (correct clock order)
                      const prevInFull = filteredHistory[index + 1];
                      const delta = prevInFull ? reading.value - prevInFull.value : 0;
                      // True regression: this log is lower than the prior log (mixed sources). Live Status still uses max hard km.
                      const isRegression = !!prevInFull && delta < -50;

                      return (
                        <TableRow key={reading.id} className="group hover:bg-slate-50/80 transition-colors">
                          <TableCell className="font-medium text-slate-900 align-top py-4">
                            {formatDate(reading.date, reading.recordedAt || reading.createdAt)}
                          </TableCell>
                          <TableCell className="align-top py-4">
                            <div className="flex items-center gap-2">
                              {getSourceIcon(reading.source)}
                              <span className="text-sm font-medium text-slate-700">{getSourceLabel(reading.source)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right align-top py-4">
                            <span className="font-mono font-bold text-slate-900 tracking-tight">
                              {reading.value.toLocaleString()}
                            </span>
                            <span className="text-slate-400 text-[10px] ml-1 uppercase">km</span>
                          </TableCell>
                          <TableCell className="text-right align-top py-4">
                            {prevInFull && (
                              <Badge
                                variant="outline"
                                title={
                                  isRegression
                                    ? 'Regression vs prior log — stored for audit; does not lower Live Status'
                                    : `Change vs previous ${activeSourceTab.short.toLowerCase()} log`
                                }
                                className={`font-mono text-[11px] px-1.5 h-5 rounded ${
                                  isRegression
                                    ? 'bg-red-50 text-red-600 border-red-100'
                                    : delta < 0
                                      ? 'bg-amber-50 text-amber-700 border-amber-100'
                                      : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}
                              >
                                {delta > 0 && '+'}{delta.toLocaleString()}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="align-top py-4">
                            <div className="space-y-1">
                              <p className="text-sm text-slate-600 line-clamp-1 group-hover:line-clamp-none transition-all">
                                {reading.notes || (isRegression ? 'Log on file (km stepped back vs prior log)' : 'Log entry')}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {isRegression && (
                                  <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-none text-[10px] py-0 px-1.5 h-4">
                                    <AlertCircle className="w-2.5 h-2.5 mr-1" /> Regression
                                  </Badge>
                                )}
                                {reading.isVerified && (
                                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px] py-0 px-1.5 h-4">
                                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Source on file
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top py-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <MoreHorizontal className="h-4 w-4 text-slate-400" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuLabel>Audit Options</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleViewEvidence(reading)}>
                                  <Search className="mr-2 h-4 w-4" />
                                  View Linked Source
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteRequest(reading.id)} 
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Entry
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Audit Sidebar */}
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm bg-indigo-50/30 border-l-4 border-l-indigo-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                <Info className="h-4 w-4" />
                {activeSourceTab.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Showing {activeSourceTab.label.toLowerCase()} only. “vs prior log” is within this tab —
                not mixed across fuel, service, and handover. Red “Regression” means this reading is more
                than 50 km below the prior log in this list; Live Status still uses highest hard km.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Jump to source</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
               <div className="divide-y divide-slate-100">
                  {SOURCE_TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = filters.source === tab.value;
                    const blurb =
                      tab.value === 'service'
                        ? 'Official readings from mechanic invoices. High trust.'
                        : tab.value === 'fuel'
                          ? 'Odometer captured at pump. Excellent frequency.'
                          : 'Verified photo proof when the driver receives the vehicle.';
                    return (
                      <button
                        key={tab.value}
                        type="button"
                        onClick={() => setFilters((prev) => ({ ...prev, source: tab.value }))}
                        className={`w-full p-3 flex gap-3 text-left transition-colors hover:bg-slate-50 ${
                          active ? 'bg-indigo-50/60' : ''
                        }`}
                      >
                        <div className="mt-1"><Icon className={`h-4 w-4 ${
                          tab.value === 'service' ? 'text-blue-500' : tab.value === 'fuel' ? 'text-amber-500' : 'text-indigo-500'
                        }`} /></div>
                        <div>
                          <h4 className={`text-xs font-bold ${active ? 'text-indigo-900' : 'text-slate-900'}`}>{tab.label}</h4>
                          <p className="text-[10px] text-slate-500">{blurb}</p>
                        </div>
                      </button>
                    );
                  })}
               </div>
            </CardContent>
          </Card>

          <div className="p-4 bg-slate-100 rounded-xl border border-slate-200">
             <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-slate-600" />
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-tight">Anchor Policy</h4>
             </div>
             <p className="text-[11px] text-slate-500 leading-normal">
                Platform trips are automatically tagged to the nearest anchor period. Discrepancies exceeding 5% are flagged for manual audit.
             </p>
          </div>
        </div>
      </div>

      <AlertDialog open={!!readingToDelete} onOpenChange={(open) => !open && setReadingToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this manual odometer reading.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SourceEvidenceModal 
        isOpen={!!evidenceToShow}
        onClose={() => setEvidenceToShow(null)}
        evidence={evidenceToShow}
      />
    </div>
  );
};

export const OdometerHistory = memo(OdometerHistoryInternal);