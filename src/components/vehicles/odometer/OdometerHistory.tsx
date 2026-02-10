import React, { useEffect, useState, useCallback } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
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
import { OdometerReading } from '../../../types/vehicle';
import { odometerService } from '../../../services/odometerService';
import { toast } from "sonner@2.0.3";

import { formatMasterLogExport, formatCheckInExport } from '../../../utils/odometerUtils';
import { downloadCSV } from '../../../utils/export';
import { ImportOdometerModal } from './ImportOdometerModal';

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
  const [history, setHistory] = useState<OdometerReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [readingToDelete, setReadingToDelete] = useState<string | null>(null);
  const [isExportingMaster, setIsExportingMaster] = useState(false);
  const [isExportingCheckins, setIsExportingCheckins] = useState(false);
  const [filters, setFilters] = useState({
    source: 'all',
    search: '',
    startDate: '',
    endDate: ''
  });

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      // Use the unified service to get everything in one go, without trip projections
      const data = await odometerService.getUnifiedHistory(vehicleId);
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
          downloadCSV(exportRows, filename);
          
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
          downloadCSV(exportRows, filename);
          
          toast.success(`Exported ${exportRows.length} check-in records.`);
      } catch (error) {
          console.error("Check-in export failed:", error);
          toast.error("Failed to export check-ins");
      } finally {
          setIsExportingCheckins(false);
      }
  };

  const handleDeleteRequest = (id: string) => {
    if (id.startsWith('fuel') || id.startsWith('checkin') || id.startsWith('service')) {
        toast.info("Cannot delete linked records directly. Manage them in their respective modules.");
        return;
    }
    setReadingToDelete(id);
  };

  const confirmDelete = async () => {
    if (!readingToDelete) return;
    
    try {
      await odometerService.deleteReading(readingToDelete, vehicleId);
      toast.success("Reading deleted");
      fetchHistory();
    } catch (error) {
      toast.error("Failed to delete reading");
    } finally {
      setReadingToDelete(null);
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'Service Log': return <Wrench className="h-4 w-4 text-blue-500" />;
      case 'Manual Update': return <User className="h-4 w-4 text-slate-500" />;
      case 'Trip Import': return <FileUp className="h-4 w-4 text-emerald-500" />;
      case 'Fuel Log': return <Fuel className="h-4 w-4 text-amber-500" />;
      case 'Weekly Check-in': return <CheckCircle2 className="h-4 w-4 text-indigo-500" />;
      case 'Baseline': return <Flag className="h-4 w-4 text-purple-500" />;
      default: return <Calendar className="h-4 w-4 text-slate-400" />;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'Trip Import': return 'Import';
      case 'Manual Update': return 'Manual';
      case 'Weekly Check-in': return 'Check-in';
      default: return source;
    }
  };

  const filteredHistory = React.useMemo(() => {
    return history.filter(item => {
      // Source filter
      if (filters.source !== 'all' && item.source !== filters.source) return false;
      
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
  }, [history, filters]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
        if (dateStr.length === 10 && dateStr.includes('-')) {
            const [year, month, day] = dateStr.split('-').map(Number);
            return format(new Date(year, month - 1, day), 'MMM d, yyyy');
        }
        return format(new Date(dateStr), 'MMM d, yyyy');
    } catch (e) {
        return dateStr;
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
      {/* Enhanced Odometer Dashboard */}
      <div className="bg-slate-900 rounded-2xl p-8 text-white relative overflow-hidden shadow-2xl border border-slate-800">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] -ml-32 -mb-32 pointer-events-none"></div>
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 relative z-10">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
               <div className="bg-indigo-500/20 p-2 rounded-lg">
                  <RefreshCw className="h-5 w-5 text-indigo-300" />
               </div>
               <div>
                  <h3 className="text-indigo-200 font-semibold tracking-wide uppercase text-xs">Verified Odometer Anchor</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold tracking-tight">Live Fleet Status</span>
                  </div>
               </div>
            </div>
            
            <div className="flex items-end gap-4">
               <div className="flex gap-1.5">
                  {digits.map((digit, i) => (
                      <div key={i} className="w-12 h-16 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center text-4xl font-mono font-bold text-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
                          {digit}
                      </div>
                  ))}
               </div>
               <div className="pb-2">
                   <span className="text-2xl text-slate-500 font-mono">km</span>
               </div>
            </div>
            
            <div className="flex flex-wrap gap-4 pt-2">
              <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                <span>Verified Anchor: {lastVerifiedDate ? formatDate(lastVerifiedDate) : 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                <Info className="h-4 w-4 text-indigo-400" />
                <span>Source: {history[0]?.source || 'None'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto">
              <Button 
                onClick={onCorrectReading} 
                className="bg-indigo-600 hover:bg-indigo-500 text-white h-12 px-6 rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
              >
                  <Wrench className="w-4 h-4 mr-2" />
                  Manual Odometer Entry
              </Button>
              <div className="flex gap-2">
                <Button 
                    variant="outline" 
                    className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl"
                    onClick={() => fetchHistory()}
                    title="Refresh Data"
                >
                    <RefreshCw className="w-4 h-4" />
                </Button>
                <ImportOdometerModal 
                    vehicleId={vehicleId} 
                    onImportComplete={fetchHistory} 
                    triggerClassName="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl"
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button 
                            variant="outline" 
                            className="flex-1 bg-white/5 border-white/10 hover:bg-white/10 text-white h-12 rounded-xl px-4 min-w-[60px]"
                            title="Export Data"
                        >
                            <FileUp className="w-4 h-4 mr-2" />
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Export Options</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                            onClick={handleExportMasterLog}
                            disabled={isExportingMaster}
                        >
                            {isExportingMaster ? (
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <FileUp className="w-4 h-4 mr-2 text-indigo-500" />
                            )}
                            <span>Export Master Log</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={handleExportCheckins}
                            disabled={isExportingCheckins}
                        >
                            {isExportingCheckins ? (
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <ListChecks className="w-4 h-4 mr-2 text-emerald-500" />
                            )}
                            <span>Export Check-ins</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
              </div>
          </div>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <Card className="border-slate-200 bg-slate-50/50 shadow-sm overflow-visible">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[240px]">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 block px-1">Search Notes</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Filter by location, driver, or service..." 
                  className="pl-10 bg-white border-slate-200 rounded-lg h-10"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
            </div>

            <div className="w-[180px]">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1.5 block px-1">Source Type</label>
              <Select 
                value={filters.source} 
                onValueChange={(v) => setFilters(prev => ({ ...prev, source: v }))}
              >
                <SelectTrigger className="bg-white border-slate-200 rounded-lg h-10">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="Fuel Log">Fuel Logs</SelectItem>
                  <SelectItem value="Service Log">Service Records</SelectItem>
                  <SelectItem value="Weekly Check-in">Check-ins</SelectItem>
                  <SelectItem value="Manual Update">Manual Entries</SelectItem>
                </SelectContent>
              </Select>
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
              onClick={() => setFilters({
                source: 'all',
                search: '',
                startDate: '',
                endDate: ''
              })}
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
                <CardTitle className="text-base font-semibold">Raw History</CardTitle>
                <CardDescription>
                  Displaying {filteredHistory.length} of {history.length} records
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredHistory.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="bg-slate-100 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Filter className="h-8 w-8 text-slate-300" />
                  </div>
                  <h3 className="text-slate-900 font-semibold mb-1">No matching records</h3>
                  <p className="text-slate-500 text-sm max-w-xs mx-auto">Try adjusting your filters or date range to find what you're looking for.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-slate-50/50">
                      <TableHead className="w-[140px] font-semibold text-slate-600 h-10">Timestamp</TableHead>
                      <TableHead className="w-[160px] font-semibold text-slate-600 h-10">Anchor Source</TableHead>
                      <TableHead className="font-semibold text-slate-600 h-10 text-right">Odometer</TableHead>
                      <TableHead className="font-semibold text-slate-600 h-10 text-right">Distance ∆</TableHead>
                      <TableHead className="font-semibold text-slate-600 h-10">Description / Verification</TableHead>
                      <TableHead className="w-[40px] h-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((reading, index) => {
                      // Find next reading in the FULL history to calculate delta (since filtered history might have gaps)
                      const fullIndex = history.findIndex(h => h.id === reading.id);
                      const prevInFull = history[fullIndex + 1];
                      const delta = prevInFull ? reading.value - prevInFull.value : 0;
                      
                      const isManual = reading.source === 'Manual Update';

                      return (
                        <TableRow key={reading.id} className="group hover:bg-slate-50/80 transition-colors">
                          <TableCell className="font-medium text-slate-900 align-top py-4">
                            {formatDate(reading.date)}
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
                              <Badge variant="outline" className={`font-mono text-[11px] px-1.5 h-5 rounded ${delta >= 0 ? 'bg-slate-50 text-slate-600 border-slate-200' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                {delta > 0 && '+'}{delta.toLocaleString()}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="align-top py-4">
                            <div className="space-y-1">
                              <p className="text-sm text-slate-600 line-clamp-1 group-hover:line-clamp-none transition-all">
                                {reading.notes || 'Verified log entry'}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {reading.isVerified && (
                                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none text-[10px] py-0 px-1.5 h-4">
                                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Verified
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
                                <DropdownMenuItem onClick={() => {
                                    toast.info("Viewing linked transaction detail...");
                                }}>
                                  <Search className="mr-2 h-4 w-4" />
                                  View Linked Source
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteRequest(reading.id)} 
                                  className={`text-red-600 focus:text-red-600 ${(!isManual) ? 'opacity-50 grayscale' : ''}`}
                                  disabled={!isManual}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Manual Entry
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
                Raw History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                This table shows the raw list of all hard odometer readings (anchors) recorded for this vehicle. For gap analysis and audit discrepancies, please switch to the <strong>Master Log</strong> tab.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Source Definitions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
               <div className="divide-y divide-slate-100">
                  <div className="p-3 flex gap-3">
                    <div className="mt-1"><Wrench className="h-4 w-4 text-blue-500" /></div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Service Logs</h4>
                      <p className="text-[10px] text-slate-500">Official readings from mechanic invoices. High trust.</p>
                    </div>
                  </div>
                  <div className="p-3 flex gap-3">
                    <div className="mt-1"><Fuel className="h-4 w-4 text-amber-500" /></div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Fuel Receipts</h4>
                      <p className="text-[10px] text-slate-500">Odometer captured at pump. Excellent frequency.</p>
                    </div>
                  </div>
                  <div className="p-3 flex gap-3">
                    <div className="mt-1"><CheckCircle2 className="h-4 w-4 text-indigo-500" /></div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">Weekly Check-in</h4>
                      <p className="text-[10px] text-slate-500">Verified photo of odometer cluster by admin.</p>
                    </div>
                  </div>
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
    </div>
  );
};

export const OdometerHistory = React.memo(OdometerHistoryInternal);
