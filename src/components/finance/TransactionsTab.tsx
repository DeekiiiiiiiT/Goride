import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "../ui/dropdown-menu";
import { Search, MoreHorizontal, Download, CheckCircle2, FileText, ArrowUpRight, ArrowDownLeft, Trash2, Layers, List } from "lucide-react";
import { Trip, FinancialTransaction, TransactionCategory, ImportBatch } from "../../types/data";
// generateMockTransactions removed — no more mock fallback (Phase 11)
import { TransactionFilters, TransactionFilterState } from "./TransactionFilters";
import { CashFlowDashboard } from "./CashFlowDashboard";
import { ExpensesTab } from "./ExpensesTab";
import { PayrollTab } from "./PayrollTab";
import { ReportCenter } from "./reports/ReportCenter";
import { FleetFinancialReport } from "./reports/FleetFinancialReport"; // Imported
import { format, isSameDay, subDays, startOfMonth, isBefore, isAfter, startOfDay, endOfDay } from "date-fns";
import { formatSafeDate, formatSafeTime } from "../../utils/timeUtils";
import { cn } from "../ui/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { api } from "../../services/api"; // Need API to fetch driver metrics for report
import { DriverMetrics } from "../../types/data";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { toast } from "sonner@2.0.3";
import { ReportGeneratorModal } from "../reports/ReportGeneratorModal";

interface TransactionsTabProps {
  trips: Trip[];
  mode?: 'analytics' | 'list';
}

export function TransactionsTab({ trips, mode = 'analytics' }: TransactionsTabProps) {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [driverMetrics, setDriverMetrics] = useState<DriverMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTxns, setSelectedTxns] = useState<Set<string>>(new Set());

  // Filters
  const [filters, setFilters] = useState<TransactionFilterState>({
    dateRange: 'all',
    type: 'all',
    status: 'all',
    driverId: 'all',
    minAmount: '',
    maxAmount: '',
    category: 'all',
    reconciled: 'all',
    batchId: 'all'
  });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [listGrouping, setListGrouping] = useState<'flat' | 'grouped'>('flat');
  const [batchToDelete, setBatchToDelete] = useState<{id: string, name: string} | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Compute server-side date params from the current filter state
  // so we can ask the server for only the trips in the selected window
  const serverDateParams = useMemo(() => {
    const today = new Date();
    switch (filters.dateRange) {
      case 'today':
        return { startDate: format(today, 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      case 'yesterday': {
        const yesterday = subDays(today, 1);
        return { startDate: format(yesterday, 'yyyy-MM-dd'), endDate: format(yesterday, 'yyyy-MM-dd') };
      }
      case 'week':
        return { startDate: format(subDays(today, 7), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      case 'month':
        return { startDate: format(startOfMonth(today), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd') };
      case 'custom':
        if (filters.dateStart) {
          return {
            startDate: format(new Date(filters.dateStart), 'yyyy-MM-dd'),
            endDate: filters.dateEnd ? format(new Date(filters.dateEnd), 'yyyy-MM-dd') : format(new Date(filters.dateStart), 'yyyy-MM-dd')
          };
        }
        return {};
      case 'all':
      default:
        return {};
    }
  }, [filters.dateRange, filters.dateStart, filters.dateEnd]);

  // Fetch data – trips are now fetched server-side with date params
  // so historical data is always available regardless of the 200-trip cap
  useEffect(() => {
    setLoading(true);
    
    const loadData = async () => {
       try {
           // Parallel fetch of supporting data + date-filtered trips
           const [metrics, realTx, batchList, tripResult] = await Promise.all([
               api.getDriverMetrics().catch(e => { console.error("Metrics load failed", e); return []; }),
               api.getTransactions().catch(e => { console.error("Tx load failed", e); return []; }),
               api.getBatches().catch(e => { console.error("Batches load failed", e); return []; }),
               api.getTripsFiltered({ ...serverDateParams, limit: 2000 })
                 .catch(e => { console.error("Trips search failed", e); return { data: [] as Trip[], page: 0, limit: 2000, total: 0 }; })
           ]);

           setDriverMetrics(metrics);

           const fetchedTrips: Trip[] = tripResult.data || [];
           console.log(`[TransactionsTab] Server fetched ${fetchedTrips.length} trips (total: ${tripResult.total}) with date params:`, serverDateParams);
           
           // Convert Trips to Financial Transactions to unify the view
           // NOTE (Phase 11): This conversion is used by Analytics mode sub-tabs
           // (Cash Flow, Expenses, Payroll, Reconciliation, Reports).
           // The Transaction List page now uses LedgerView instead (Phase 9).
           const tripTransactions: FinancialTransaction[] = fetchedTrips.map(t => {
               const batch = batchList.find((b: ImportBatch) => b.id === t.batchId);
               const isCash = (t.cashCollected || 0) > 0;
               
               return {
                   id: t.id,
                   date: t.date,
                   time: t.requestTime ? format(new Date(t.requestTime), 'HH:mm:ss') : '00:00:00',
                   driverId: t.driverId,
                   driverName: t.driverName,
                   vehicleId: t.vehicleId,
                   type: 'Revenue',
                   category: 'Fare Earnings',
                   description: `${t.platform || 'Trip'} ${isCash ? '(Cash)' : ''}: ${t.pickupLocation || 'Unknown'} -> ${t.dropoffLocation || 'Unknown'}`,
                   amount: isCash ? t.cashCollected! : (t.netPayout || t.amount),
                   paymentMethod: isCash ? 'Cash' : 'Digital Wallet',
                   status: t.status === 'Completed' ? 'Completed' : 'Pending',
                   batchId: t.batchId,
                   batchName: batch?.fileName || (t.batchId ? 'Imported Trip File' : undefined),
                   isReconciled: false
               } as FinancialTransaction;
           });

           // Merge real transactions (expenses, manual entries) with converted Trip transactions
           // Filter out any realTx that might duplicate a trip (unlikely but safe)
           const tripIds = new Set(tripTransactions.map(t => t.id));
           const uniqueRealTx = Array.isArray(realTx) ? realTx.filter((tx: FinancialTransaction) => !tripIds.has(tx.id)) : [];
           
           const allTransactions = [...uniqueRealTx, ...tripTransactions];
           
           // Sort by date desc
           allTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

           if (allTransactions.length > 0) {
              setTransactions(allTransactions);
           } else {
              // Phase 11: No more mock fallback — show empty state
              setTransactions([]);
           }

       } catch (e) {
           console.error("Failed to load finance data", e);
           // Phase 11: No more mock fallback — show empty state
           setTransactions([]);
       } finally {
           setLoading(false);
       }
    };
    
    loadData();
  }, [serverDateParams]);

  const handleAddTransaction = (newTxn: FinancialTransaction) => {
    setTransactions(prev => [newTxn, ...prev]);
  };

  // Derived Lists
  const drivers = useMemo(() => {
    const map = new Map();
    transactions.forEach(t => {
      if (t.driverId && !map.has(t.driverId)) {
        map.set(t.driverId, t.driverName || 'Unknown');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [transactions]);

  const vehicles = useMemo(() => {
    const map = new Map();
    transactions.forEach(t => {
      if (t.vehicleId && !map.has(t.vehicleId)) {
        map.set(t.vehicleId, { id: t.vehicleId, plate: t.vehiclePlate || t.vehicleId || 'Unknown' });
      }
    });
    // Ensure we return unique vehicles
    return Array.from(map.values());
  }, [transactions]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => set.add(t.category));
    return Array.from(set).sort();
  }, [transactions]);

  const batches = useMemo(() => {
    const map = new Map();
    transactions.forEach(t => {
      if (t.batchId && !map.has(t.batchId)) {
        map.set(t.batchId, t.batchName || `Batch #${t.batchId.substring(0,8)}`);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [transactions]);

  // Filter Logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Search
      const term = searchTerm.toLowerCase();
      if (term && !t.description.toLowerCase().includes(term) && !t.id.toLowerCase().includes(term)) {
        return false;
      }

      // Type
      if (filters.type !== 'all' && t.type !== filters.type) return false;

      // Status
      if (filters.status !== 'all' && t.status !== filters.status) return false;

      // Driver
      if (filters.driverId !== 'all' && t.driverId !== filters.driverId) return false;

      // Category
      if (filters.category !== 'all' && t.category !== filters.category) return false;

      // Reconciled
      if (filters.reconciled !== 'all') {
        const isRec = t.isReconciled;
        if (filters.reconciled === 'yes' && !isRec) return false;
        if (filters.reconciled === 'no' && isRec) return false;
      }

      // Batch
      if (filters.batchId && filters.batchId !== 'all' && t.batchId !== filters.batchId) return false;

      // Amount
      if (filters.minAmount && Math.abs(t.amount) < parseFloat(filters.minAmount)) return false;
      if (filters.maxAmount && Math.abs(t.amount) > parseFloat(filters.maxAmount)) return false;

      // Date
      const tDate = new Date(t.date);
      const today = new Date();

      if (filters.dateRange === 'today') {
        if (!isSameDay(tDate, today)) return false;
      } else if (filters.dateRange === 'yesterday') {
        if (!isSameDay(tDate, subDays(today, 1))) return false;
      } else if (filters.dateRange === 'week') {
        if (isBefore(tDate, subDays(today, 7))) return false;
      } else if (filters.dateRange === 'month') {
        if (isBefore(tDate, startOfMonth(today))) return false;
      } else if (filters.dateRange === 'custom' && filters.dateStart) {
        const start = startOfDay(new Date(filters.dateStart));
        const end = filters.dateEnd ? endOfDay(new Date(filters.dateEnd)) : endOfDay(start);
        if (isBefore(tDate, start) || isAfter(tDate, end)) return false;
      }

      return true;
    });
  }, [transactions, filters, searchTerm]);

  // Selection Logic
  const toggleSelectAll = () => {
    if (selectedTxns.size === filteredTransactions.length) {
      setSelectedTxns(new Set());
    } else {
      setSelectedTxns(new Set(filteredTransactions.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedTxns);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedTxns(newSet);
  };

  // Quick Views
  const applyQuickView = (view: string) => {
    const today = new Date();
    switch (view) {
      case 'today':
        setFilters(prev => ({ ...prev, dateRange: 'today', type: 'all', status: 'all', reconciled: 'all' }));
        break;
      case 'unreconciled':
        setFilters(prev => ({ ...prev, reconciled: 'no' }));
        break;
      case 'large':
        setFilters(prev => ({ ...prev, minAmount: '1000' }));
        break;
      case 'cash':
        // Not implemented in filters yet, but logic is conceptual
        break;
      case 'expenses':
        setFilters(prev => ({ ...prev, type: 'Expense' }));
        break;
    }
  };

  // Helper for formatting currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  const confirmDeleteBatch = async () => {
    if (!batchToDelete) return;
    
    try {
        await api.deleteBatch(batchToDelete.id);
        
        // Update local state
        setTransactions(prev => prev.filter(t => t.batchId !== batchToDelete.id));
        
        // If we were filtering by this batch, reset filter
        if (filters.batchId === batchToDelete.id) {
            setFilters(prev => ({ ...prev, batchId: 'all' }));
        }
        
        toast.success("File Removed", {
          description: `Transactions from "${batchToDelete.name}" have been deleted.`
        });
    } catch (error) {
        console.error("Failed to delete batch", error);
        toast.error("Failed to delete file");
    } finally {
        setBatchToDelete(null);
    }
  };

  const handleDeleteBatch = () => {
    if (filters.batchId === 'all' || !filters.batchId) return;
    const batchName = batches.find(b => b.id === filters.batchId)?.name || 'Unknown File';
    setBatchToDelete({ id: filters.batchId, name: batchName });
  };

  const handleDeleteBatchById = (batchId: string, batchName: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setBatchToDelete({ id: batchId, name: batchName });
  };

  const listViewContent = (
     <div className="space-y-4">
            <div className="flex justify-between items-center">
                 <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <Button 
                        variant={listGrouping === 'flat' ? 'secondary' : 'ghost'} 
                        size="sm" 
                        className={cn("h-7 text-xs px-3 shadow-none", listGrouping === 'flat' && "bg-white shadow-sm text-indigo-600")}
                        onClick={() => setListGrouping('flat')}
                    >
                        <List className="h-3.5 w-3.5 mr-2" />
                        List View
                    </Button>
                    <Button 
                        variant={listGrouping === 'grouped' ? 'secondary' : 'ghost'} 
                        size="sm" 
                        className={cn("h-7 text-xs px-3 shadow-none", listGrouping === 'grouped' && "bg-white shadow-sm text-indigo-600")}
                        onClick={() => setListGrouping('grouped')}
                    >
                        <Layers className="h-3.5 w-3.5 mr-2" />
                        Group by File
                    </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsReportModalOpen(true)}>
                    <Download className="h-4 w-4 mr-2" />
                    Export Reports
                </Button>
            </div>
            
            <ReportGeneratorModal open={isReportModalOpen} onOpenChange={setIsReportModalOpen} />

            {/* Quick Analysis Views */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => applyQuickView('today')}>
                Today's Transactions
                </Button>
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => applyQuickView('unreconciled')}>
                Unreconciled Only
                </Button>
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => applyQuickView('large')}>
                Large Transactions {'>'}$1k
                </Button>
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => applyQuickView('expenses')}>
                Expense Claims
                </Button>
            </div>

            {/* Batch Context Banner */}
            {filters.batchId && filters.batchId !== 'all' && (
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-white rounded-md border flex items-center justify-center">
                            <FileText className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-900">
                                {batches.find(b => b.id === filters.batchId)?.name || 'Unknown File'}
                            </p>
                            <p className="text-xs text-slate-500">
                                Contains {filteredTransactions.length} transactions
                            </p>
                        </div>
                    </div>
                    <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={handleDeleteBatch}
                        className="gap-2"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete File
                    </Button>
                </div>
            )}

            <div className="flex flex-col gap-4 md:flex-row md:items-start justify-between bg-slate-50/50 p-4 rounded-lg border border-slate-100">
                <TransactionFilters 
                filters={filters} 
                onFilterChange={setFilters} 
                drivers={drivers}
                categories={categories}
                batches={batches}
                />
                
                <div className="relative w-full md:w-[300px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                    placeholder="Search transactions..." 
                    className="pl-8 bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                </div>
            </div>

            {/* Batch Actions Bar */}
            {selectedTxns.size > 0 && (
                <div className="flex items-center gap-2 bg-indigo-50 p-2 rounded-md border border-indigo-100 text-indigo-700 animate-in fade-in slide-in-from-top-2">
                <span className="text-sm font-medium px-2">{selectedTxns.size} selected</span>
                <div className="h-4 w-px bg-indigo-200 mx-2" />
                <Button size="sm" variant="ghost" className="hover:bg-indigo-100 hover:text-indigo-800 h-8 gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Mark Reconciled
                </Button>
                <Button size="sm" variant="ghost" className="hover:bg-indigo-100 hover:text-indigo-800 h-8 gap-1">
                    <FileText className="h-4 w-4" /> Categorize
                </Button>
                <Button size="sm" variant="ghost" className="hover:bg-indigo-100 hover:text-indigo-800 h-8 gap-1">
                    <Download className="h-4 w-4" /> Export
                </Button>
                </div>
            )}

            {listGrouping === 'grouped' ? (
                <div className="space-y-4">
                    {Array.from(new Set(filteredTransactions.map(t => t.batchId || 'manual'))).map(batchId => {
                        const batchTxns = filteredTransactions.filter(t => (t.batchId || 'manual') === batchId);
                        const batchName = batches.find(b => b.id === batchId)?.name || (batchId === 'manual' ? 'Manual Entries' : 'Unknown Import');
                        const totalAmount = batchTxns.reduce((sum, t) => sum + t.amount, 0);
                        
                        return (
                            <Accordion type="single" collapsible key={batchId} className="bg-white rounded-lg border shadow-sm">
                                <AccordionItem value={batchId} className="border-none">
                                    <div className="flex items-center p-4">
                                        <AccordionTrigger className="hover:no-underline py-0 flex-1 pr-4">
                                            <div className="flex items-center gap-4 text-left">
                                                <div className="h-10 w-10 bg-indigo-50 rounded-md border border-indigo-100 flex items-center justify-center text-indigo-600">
                                                    <FileText className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <h4 className="font-medium text-slate-900">{batchName}</h4>
                                                    <p className="text-sm text-slate-500">{batchTxns.length} transactions • {formatCurrency(totalAmount)}</p>
                                                </div>
                                            </div>
                                        </AccordionTrigger>
                                        <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="ml-2 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 h-8"
                                            onClick={(e) => handleDeleteBatchById(batchId, batchName, e)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                            Delete File
                                        </Button>
                                    </div>
                                    <AccordionContent className="px-0 pb-0 border-t">
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow className="bg-slate-50/50">
                                                        <TableHead>Date</TableHead>
                                                        <TableHead>Description</TableHead>
                                                        <TableHead className="text-right">Amount</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {batchTxns.slice(0, 50).map(txn => (
                                                        <TableRow key={txn.id}>
                                                            <TableCell className="w-[120px]">{formatSafeDate(txn.date)}</TableCell>
                                                            <TableCell>{txn.description}</TableCell>
                                                            <TableCell className={cn("text-right font-mono font-medium", txn.amount >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                                {formatCurrency(txn.amount)}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                    {batchTxns.length > 50 && (
                                                        <TableRow>
                                                            <TableCell colSpan={3} className="text-center text-xs text-slate-500 py-2">
                                                                + {batchTxns.length - 50} more transactions
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            </Accordion>
                        );
                    })}
                    
                    {filteredTransactions.length === 0 && (
                        <div className="text-center p-8 border border-dashed rounded-lg text-slate-500">
                            No files found matching your filters.
                        </div>
                    )}
                </div>
            ) : (
            <Card>
                <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                    <CardTitle>Transaction History</CardTitle>
                    <Badge variant="outline" className="font-mono">
                    {filteredTransactions.length} records
                    </Badge>
                </div>
                </CardHeader>
                <CardContent className="p-0">
                <Table>
                    <TableHeader>
                    <TableRow className="bg-slate-50">
                        <TableHead className="w-[40px]">
                        <Checkbox 
                            checked={filteredTransactions.length > 0 && selectedTxns.size === filteredTransactions.length}
                            onCheckedChange={toggleSelectAll}
                        />
                        </TableHead>
                        <TableHead>Date / Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {loading ? (
                        <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-slate-500">
                            Loading transactions...
                        </TableCell>
                        </TableRow>
                    ) : filteredTransactions.length === 0 ? (
                        <TableRow>
                        <TableCell colSpan={8} className="h-64 text-center text-slate-500">
                            No transactions found matching your filters.
                        </TableCell>
                        </TableRow>
                    ) : (
                        filteredTransactions.slice(0, 50).map((txn) => (
                        <TableRow key={txn.id} className="hover:bg-slate-50/50">
                            <TableCell>
                            <Checkbox 
                                checked={selectedTxns.has(txn.id)}
                                onCheckedChange={() => toggleSelect(txn.id)}
                            />
                            </TableCell>
                            <TableCell className="align-top">
                            <div className="flex flex-col">
                                <span className="font-medium text-slate-900">{formatSafeDate(txn.date)}</span>
                                <span className="text-xs text-slate-500">{txn.time || 'Timeless'}</span>
                            </div>
                            </TableCell>
                            <TableCell className="align-top">
                                <div className="flex items-center gap-1.5">
                                    {txn.amount >= 0 ? (
                                        <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-500" />
                                    ) : (
                                        <ArrowUpRight className="h-3.5 w-3.5 text-rose-500" />
                                    )}
                                    <span className={cn(
                                        "text-xs font-medium px-1.5 py-0.5 rounded-full border",
                                        txn.type === 'Revenue' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                        txn.type === 'Expense' ? "bg-rose-50 text-rose-700 border-rose-100" :
                                        txn.type === 'Payout' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                        "bg-blue-50 text-blue-700 border-blue-100"
                                    )}>
                                        {txn.type}
                                    </span>
                                </div>
                            </TableCell>
                            <TableCell className="align-top">
                            <div className="flex flex-col max-w-[250px]">
                                <span className="text-sm font-medium text-slate-700 truncate" title={txn.description}>
                                    {txn.description}
                                </span>
                                {txn.driverName && (
                                    <span className="text-xs text-slate-500">Driver: {txn.driverName}</span>
                                )}
                            </div>
                            </TableCell>
                            <TableCell className="align-top">
                                <Badge variant="secondary" className="font-normal text-xs text-slate-600 bg-slate-100">
                                    {txn.category}
                                </Badge>
                            </TableCell>
                            <TableCell className="align-top text-right">
                                <span className={cn(
                                    "font-bold font-mono",
                                    txn.amount >= 0 ? "text-emerald-600" : "text-rose-600"
                                )}>
                                    {txn.amount >= 0 ? '+' : ''}{formatCurrency(txn.amount)}
                                </span>
                            </TableCell>
                            <TableCell className="align-top text-center">
                                {txn.isReconciled ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] gap-1">
                                        <CheckCircle2 className="h-3 w-3" /> Reconciled
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px]">
                                        {txn.status}
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                <DropdownMenuItem>Edit Transaction</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>Mark as {txn.isReconciled ? 'Unreconciled' : 'Reconciled'}</DropdownMenuItem>
                                <DropdownMenuItem className="text-rose-600">Delete</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            </TableCell>
                        </TableRow>
                        ))
                    )}
                    </TableBody>
                </Table>
                </CardContent>
            </Card>
            )}
      </div>
  );

  if (mode === 'list') {
      return (
          <>
            {listViewContent}
            
            <AlertDialog open={!!batchToDelete} onOpenChange={(open) => !open && setBatchToDelete(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the file "{batchToDelete?.name}" and all {transactions.filter(t => t.batchId === batchToDelete?.id).length} associated transactions from the database.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={confirmDeleteBatch} className="bg-rose-600 hover:bg-rose-700">Delete File</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
      );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="dashboard" className="w-full">
        <div className="flex items-center justify-between mb-4">
             <TabsList>
                <TabsTrigger value="dashboard">Cash Flow Analysis</TabsTrigger>
                <TabsTrigger value="expenses">Expense Management</TabsTrigger>
                <TabsTrigger value="payroll">Payroll System</TabsTrigger>
                <TabsTrigger value="reconciliation">Reconciliation Report</TabsTrigger>
                <TabsTrigger value="reports">Report Center</TabsTrigger>
             </TabsList>
             
             {/* Global Actions could go here */}
        </div>

        <TabsContent value="dashboard">
             <CashFlowDashboard transactions={transactions} />
        </TabsContent>
        
        <TabsContent value="expenses">
            <ExpensesTab transactions={transactions} onAddTransaction={handleAddTransaction} vehicles={vehicles} />
        </TabsContent>

        <TabsContent value="payroll">
            <PayrollTab transactions={transactions} onAddTransaction={handleAddTransaction} drivers={drivers} />
        </TabsContent>

        <TabsContent value="reconciliation">
            <FleetFinancialReport transactions={transactions} driverMetrics={driverMetrics} />
        </TabsContent>

        <TabsContent value="reports">
            <ReportCenter transactions={transactions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}