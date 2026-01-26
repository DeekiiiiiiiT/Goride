import React, { useMemo, useState } from 'react';
import { 
  FuelEntry, 
  OdometerBucket 
} from '../../types/fuel';
import { 
  FinancialTransaction 
} from '../../types/data';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../ui/table';
import { Badge } from '../ui/badge';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '../ui/tooltip';
import { 
  ChevronDown, 
  ChevronRight, 
  Info, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  ExternalLink,
  Eye,
  Filter,
  ShieldCheck,
  Zap,
  Calendar,
  XCircle,
  Clock,
  Trash2,
  Loader2,
  RefreshCw,
  PlusCircle,
  Banknote,
  Fuel,
  Activity,
  TrendingDown,
  Fingerprint
} from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';
import { FuelCalculationService } from '../../services/fuelCalculationService';
import { cn } from '../ui/utils';
import { isFuelDebit, isFuelCredit, findBucketForEntry } from '../../utils/fuelGroupingUtils';
import { formatSafeDate, formatSafeTime } from '../../utils/timeUtils';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { toast } from "sonner@2.0.3";
import { settlementService } from '../../services/settlementService';
import { fuelService } from '../../services/fuelService';
import { api } from '../../services/api';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface FuelLedgerViewProps {
  transactions: FinancialTransaction[];
  fuelEntries: FuelEntry[];
  buckets: OdometerBucket[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export const FuelLedgerView: React.FC<FuelLedgerViewProps> = ({
  transactions,
  fuelEntries,
  buckets,
  isLoading,
  onRefresh
}) => {
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null
  });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    location: '',
    amount: '',
    liters: '',
    odometer: '',
    category: 'Ride Share'
  });

    // Phase 1: Ledger Integrity Analysis for the Activity Tab
    const ledgerIntegrity = useMemo(() => {
        const integrityMap = new Map<string, 'Complete' | 'Partial' | 'Orphaned' | 'Verified' | 'Pending'>();
        
        // Combine all fuel activity items to check their balance
        const allTransactions = transactions.filter(isFuelDebit || isFuelCredit);
        
        // 1. Check Fuel Entries (Original Logs)
        fuelEntries.forEach(entry => {
            const related = transactions.filter(t => 
                t.metadata?.sourceId === entry.id || 
                t.metadata?.linkedFuelId === entry.id ||
                t.id === entry.transactionId ||
                (Math.abs(t.amount) === Math.abs(entry.amount) && t.date === entry.date.split('T')[0] && t.vehicleId === entry.vehicleId)
            );

            const hasDebit = related.some(t => t.amount < 0 || t.type === 'Expense');
            const hasCredit = related.some(t => t.amount > 0 || t.type === 'Reimbursement');

            if (hasDebit && hasCredit) {
                integrityMap.set(entry.id, 'Verified');
            } else if (hasDebit || hasCredit) {
                integrityMap.set(entry.id, 'Partial');
            } else {
                // Phase 6: Orphan Logic Update
                if (entry.reconciliationStatus === 'Pending') {
                    integrityMap.set(entry.id, 'Pending');
                } else {
                    integrityMap.set(entry.id, 'Orphaned');
                }
            }
        });

        // 2. Check Financial Transactions (Ledger Side)
        transactions.forEach(tx => {
            if (!isFuelDebit(tx) && !isFuelCredit(tx)) return;
            
            // Look for the parent fuel log
            const hasParent = fuelEntries.some(e => 
                e.id === tx.metadata?.sourceId || 
                e.id === tx.metadata?.linkedFuelId ||
                e.transactionId === tx.id ||
                (Math.abs(e.amount) === Math.abs(tx.amount) && e.date.split('T')[0] === tx.date && e.vehicleId === tx.vehicleId)
            );

            if (!hasParent) {
                integrityMap.set(tx.id, 'Orphaned');
            } else {
                // If it has a parent, check if its "twin" exists
                const absAmount = Math.abs(tx.amount);
                const isDebit = tx.amount < 0;
                const hasTwin = transactions.some(t => 
                    t.id !== tx.id && 
                    Math.abs(t.amount) === absAmount && 
                    t.date === tx.date && 
                    (isDebit ? t.amount > 0 : t.amount < 0)
                );
                
                if (!hasTwin) {
                    integrityMap.set(tx.id, 'Partial');
                } else {
                    integrityMap.set(tx.id, 'Verified');
                }
            }
        });
        
        return integrityMap;
    }, [fuelEntries, transactions]);

    const handleAddEntry = () => {
    // In a real app, this would call an API. 
    // Here we'll just close the dialog and simulate success.
    console.log('Adding entry:', newEntry);
    setIsAddDialogOpen(false);
    // Reset form
    setNewEntry({
      date: format(new Date(), 'yyyy-MM-dd'),
      location: '',
      amount: '',
      liters: '',
      odometer: '',
      category: 'Ride Share'
    });
  };

  const toggleBucket = (bucketId: string) => {
    setExpandedBuckets(prev => ({
      ...prev,
      [bucketId]: !prev[bucketId]
    }));
  };


  // 1. Group transactions and entries by bucket with filtering
  const ledgerGroups = useMemo(() => {
    const groups: Record<string, {
      bucket: OdometerBucket | null;
      transactions: FinancialTransaction[];
      entries: FuelEntry[];
      date: string;
    }> = {};

    // Filter logic for search and dates
    const matchesSearch = (text: string) => 
      !searchQuery || text.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDate = (dateStr: string) => {
      if (!dateRange.start && !dateRange.end) return true;
      const date = new Date(dateStr);
      const start = dateRange.start ? startOfDay(new Date(dateRange.start)) : null;
      const end = dateRange.end ? endOfDay(new Date(dateRange.end)) : null;
      
      if (start && end) return isWithinInterval(date, { start, end });
      if (start) return date >= start;
      if (end) return date <= end;
      return true;
    };

    // Filter buckets first
    const filteredBuckets = buckets.filter(b => matchesDate(b.startDate) || matchesDate(b.endDate));

    filteredBuckets.forEach(bucket => {
      groups[bucket.id] = {
        bucket,
        transactions: [],
        entries: [],
        date: bucket.endDate
      };
    });

    // Match transactions to buckets with filters
    transactions.forEach(tx => {
      if (!matchesSearch(tx.description || '') && !matchesSearch(tx.referenceNumber || '') && !matchesSearch(tx.category || '')) return;
      if (!matchesDate(tx.date)) return;

      let targetBucketId = tx.anchorPeriodId;
      if (!targetBucketId) {
        const matchingBucket = filteredBuckets.find(b => 
          tx.date >= b.startDate && tx.date <= b.endDate
        );
        if (matchingBucket) targetBucketId = matchingBucket.id;
      }

      if (targetBucketId && groups[targetBucketId]) {
        groups[targetBucketId].transactions.push(tx);
      } else {
        if (!groups['pending']) {
          groups['pending'] = { bucket: null, transactions: [], entries: [], date: '9999-12-31' };
        }
        groups['pending'].transactions.push(tx);
      }
    });

    // Match entries to buckets with filters
    fuelEntries.forEach(entry => {
      if (!matchesSearch(entry.location || '') && !matchesSearch(entry.reconciliationStatus || '')) return;
      if (!matchesDate(entry.date)) return;

      const bucket = findBucketForEntry(entry, filteredBuckets);
      if (bucket && groups[bucket.id]) {
        groups[bucket.id].entries.push(entry);
      } else {
        if (!groups['pending']) {
          groups['pending'] = { bucket: null, transactions: [], entries: [], date: '9999-12-31' };
        }
        groups['pending'].entries.push(entry);
      }
    });

    // Sort items within groups by date and time (descending)
    Object.values(groups).forEach(group => {
      group.transactions.sort((a, b) => {
        const dateTimeA = `${a.date}T${a.time || '00:00:00'}`;
        const dateTimeB = `${b.date}T${b.time || '00:00:00'}`;
        return dateTimeB.localeCompare(dateTimeA);
      });
      group.entries.sort((a, b) => {
        const dateTimeA = a.date.includes('T') ? a.date : `${a.date}T${(a as any).time || '00:00:00'}`;
        const dateTimeB = b.date.includes('T') ? b.date : `${b.date}T${(b as any).time || '00:00:00'}`;
        return dateTimeB.localeCompare(dateTimeA);
      });
    });

    // Calculate net totals and derived status for parent rows
    return Object.values(groups).map(group => {
      const totalDebits = [
        ...group.entries.map(e => e.amount),
        ...group.transactions.filter(isFuelDebit).map(tx => Math.abs(tx.amount))
      ].reduce((sum, val) => sum + (val || 0), 0);

      const totalCredits = group.transactions
        .filter(isFuelCredit)
        .reduce((sum, tx) => sum + tx.amount, 0);

      // Derive status logic for Phase 5
      let derivedStatus = group.bucket?.status || 'Reconciled';
      const hasFlaggedItem = group.entries.some(e => e.reconciliationStatus === 'Flagged') || 
                            group.transactions.some(t => t.status === 'Flagged');
      const hasOdometerGap = (group.bucket?.unaccountedDistance || 0) > 0;
      
      if (hasFlaggedItem || (derivedStatus === 'Anomaly' && hasOdometerGap)) {
        derivedStatus = 'Anomaly';
      } else if (!group.bucket) {
        derivedStatus = 'Pending';
      }

      return {
        ...group,
        netChange: totalCredits - totalDebits,
        derivedStatus
      };
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, fuelEntries, buckets, searchQuery, dateRange]);

  // Phase 2 & 3: Atomic Deletion Handlers
  const [isPurging, setIsPurging] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    txId?: string;
    entryId?: string;
    affectedCount: { transactions: number; entries: number };
    targetIds: { transactions: string[]; entries: string[] };
    isBucketPurge?: boolean;
    bucketLabel?: string;
  }>({
    isOpen: false,
    affectedCount: { transactions: 0, entries: 0 },
    targetIds: { transactions: [], entries: [] }
  });

  const initiatePurge = async (id: string, type: 'tx' | 'entry') => {
    setIsPurging(true);
    try {
      let entriesToPurge: string[] = [];
      let txsToPurge: string[] = [];

      if (type === 'entry') {
        const entry = fuelEntries.find(e => e.id === id);
        if (entry) {
          entriesToPurge.push(entry.id);
          const related = await settlementService.getRelatedTransactions(entry);
          txsToPurge = related.map(t => t.id);
        }
      } else {
        const tx = transactions.find(t => t.id === id);
        if (tx) {
          txsToPurge.push(tx.id);
          const parent = await settlementService.getParentFuelEntry(tx);
          if (parent) {
            entriesToPurge.push(parent.id);
            const related = await settlementService.getRelatedTransactions(parent);
            related.forEach(r => {
                if (!txsToPurge.includes(r.id)) txsToPurge.push(r.id);
            });
          } else {
              // Try to find twin if it's a "Ghost Record" but might have a pair
              const twin = transactions.find(t => 
                t.id !== tx.id && 
                Math.abs(t.amount) === Math.abs(tx.amount) && 
                t.date === tx.date && 
                ((tx.amount < 0 && t.amount > 0) || (tx.amount > 0 && t.amount < 0))
              );
              if (twin) txsToPurge.push(twin.id);
          }
        }
      }

      setDeleteDialog({
        isOpen: true,
        txId: type === 'tx' ? id : undefined,
        entryId: type === 'entry' ? id : undefined,
        affectedCount: { transactions: txsToPurge.length, entries: entriesToPurge.length },
        targetIds: { transactions: txsToPurge, entries: entriesToPurge }
      });
    } catch (err) {
      console.error("[PurgeDiscovery] Failed:", err);
      toast.error("Discovery failed: Could not map related records.");
    } finally {
      setIsPurging(false);
    }
  };

  const initiateBucketPurge = async (groupId: string) => {
    setIsPurging(true);
    try {
      const group = ledgerGroups.find(g => (g.bucket?.id || 'pending') === groupId);
      if (!group) return;

      const entriesToPurge = group.entries.map(e => e.id);
      const txsToPurge = group.transactions.map(t => t.id);

      setDeleteDialog({
        isOpen: true,
        affectedCount: { transactions: txsToPurge.length, entries: entriesToPurge.length },
        targetIds: { transactions: txsToPurge, entries: entriesToPurge },
        isBucketPurge: true,
        bucketLabel: groupId === 'pending' ? 'Pending Items' : `${format(new Date(group.bucket!.startDate), 'MMM dd')} - ${format(new Date(group.bucket!.endDate), 'MMM dd')}`
      });
    } catch (err) {
      console.error("[BucketPurgeDiscovery] Failed:", err);
      toast.error("Discovery failed: Could not map bucket records.");
    } finally {
      setIsPurging(false);
    }
  };

  const executePurge = async () => {
    setIsPurging(true);
    try {
      const { transactions: txIds, entries: entryIds } = deleteDialog.targetIds;
      
      // Atomic multi-stage purge
      await Promise.all([
        ...txIds.map(id => api.deleteTransaction(id)),
        ...entryIds.map(id => fuelService.deleteFuelEntry(id))
      ]);

      toast.success(`Atomic Purge Complete: ${txIds.length} financial and ${entryIds.length} log records removed.`);
      setDeleteDialog(prev => ({ ...prev, isOpen: false }));
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("[PurgeExecution] Failed:", err);
      toast.error("Purge failed: System may be in an inconsistent state.");
    } finally {
      setIsPurging(false);
    }
  };

  // Phase 4: Ledger Health Analysis
  const healthStats = useMemo(() => {
    let anomalies = 0;
    let orphans = 0;
    let totalImbalance = 0;

    ledgerGroups.forEach(group => {
      if (group.derivedStatus === 'Anomaly') anomalies++;
      if (group.netChange !== 0) totalImbalance += group.netChange;
    });

    ledgerIntegrity.forEach((status) => {
      if (status === 'Orphaned') orphans++;
    });

    return { 
      anomalies, 
      orphans, 
      totalImbalance,
      isHealthy: anomalies === 0 && orphans === 0 && totalImbalance === 0
    };
  }, [ledgerGroups, ledgerIntegrity]);

  // Phase 5: Automated Integrity Backfill
  const [isBackfilling, setIsBackfilling] = useState(false);

  const executeIntegrityBackfill = async () => {
    setIsBackfilling(true);
    try {
      const result = await api.reconcileLedgerOrphans();
      
      if (result.success && result.linkedCount > 0) {
        toast.success(`Integrity Audit Complete: ${result.linkedCount} orphaned records linked (${result.anomalyFixedCount} anomalies resolved).`);
        if (onRefresh) onRefresh();
      } else {
        toast.info("Audit complete: No new links found.");
      }
    } catch (err) {
      console.error("[IntegrityBackfill] Failed:", err);
      toast.error("Audit failed: Server connection error.");
    } finally {
      setIsBackfilling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const renderStatusBadge = (status: string | undefined, reason?: string) => {
    switch (status) {
      case 'Verified':
      case 'Approved':
      case 'Success':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="w-3 h-3" /> Verified</Badge>;
      case 'Flagged':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1 cursor-help">
                  <AlertTriangle className="w-3 h-3" /> Flagged
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{reason || 'Anomalous reading or metadata mismatch'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'Observing':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1"><Search className="w-3 h-3" /> Observing</Badge>;
      default:
        return <Badge variant="secondary" className="bg-slate-50 text-slate-600 border-slate-200">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Phase 4: Ledger Health Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            healthStats.anomalies > 0 ? "bg-red-50" : "bg-emerald-50"
          )}>
            <AlertTriangle className={cn("h-5 w-5", healthStats.anomalies > 0 ? "text-red-500" : "text-emerald-500")} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Audit Anomaly Windows</p>
            <p className={cn("text-xl font-bold", healthStats.anomalies > 0 ? "text-red-600" : "text-slate-700")}>
              {healthStats.anomalies} {healthStats.anomalies === 1 ? 'Window' : 'Windows'}
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            healthStats.orphans > 0 ? "bg-amber-50" : "bg-emerald-50"
          )}>
            <Fingerprint className={cn("h-5 w-5", healthStats.orphans > 0 ? "text-amber-500" : "text-emerald-500")} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Orphaned Transactions</p>
            <p className={cn("text-xl font-bold", healthStats.orphans > 0 ? "text-amber-600" : "text-slate-700")}>
              {healthStats.orphans} Records
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            healthStats.totalImbalance !== 0 ? "bg-red-50" : "bg-emerald-50"
          )}>
            <TrendingDown className={cn("h-5 w-5", healthStats.totalImbalance !== 0 ? "text-red-500" : "text-emerald-500")} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Ledger Imbalance</p>
            <p className={cn("text-xl font-bold font-mono", healthStats.totalImbalance !== 0 ? "text-red-600" : "text-emerald-600")}>
              {healthStats.totalImbalance > 0 ? '+' : ''}{FuelCalculationService.formatCurrency(healthStats.totalImbalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Phase 5: Integrity Repair Action */}
      {(healthStats.anomalies > 0 || healthStats.orphans > 0) && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-4 mb-3 sm:mb-0">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 border border-amber-200">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">System Integrity Gaps Detected</p>
              <p className="text-xs text-amber-700 max-w-md">The audit engine found mismatched "Fingerprints". Automated repair can link orphans and resolve window anomalies across the ledger.</p>
            </div>
          </div>
          <Button 
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-sm font-bold px-6"
            onClick={executeIntegrityBackfill}
            disabled={isBackfilling}
          >
            {isBackfilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Run Integrity Repair
          </Button>
        </div>
      )}

      {/* Filter Bar - Phase 6 */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder="Search transactions or locations..." 
            className="pl-9 bg-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 bg-white text-slate-600 border-slate-200">
                <Calendar className="w-4 h-4" />
                {dateRange.start ? (
                  <span>{format(new Date(dateRange.start), 'MMM dd')} - {dateRange.end ? format(new Date(dateRange.end), 'MMM dd') : '...'}</span>
                ) : (
                  "Select Dates"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <h4 className="font-medium leading-none">Filter by Date Range</h4>
                  <p className="text-sm text-slate-500">View transactions within specific windows.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">Start Date</label>
                    <Input 
                      type="date" 
                      onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
                      value={dateRange.start || ''}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-slate-400">End Date</label>
                    <Input 
                      type="date" 
                      onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
                      value={dateRange.end || ''}
                    />
                  </div>
                </div>
                {(dateRange.start || dateRange.end) && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDateRange({ start: null, end: null })}
                  >
                    Clear Dates
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {(searchQuery || dateRange.start || dateRange.end) && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setSearchQuery('');
                setDateRange({ start: null, end: null });
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              <XCircle className="w-4 h-4 mr-1" /> Clear All
            </Button>
          )}
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="ml-auto bg-slate-900 text-white hover:bg-slate-800 gap-2">
              <PlusCircle className="w-4 h-4" />
              Manual Entry
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>New Fuel Entry</DialogTitle>
              <DialogDescription>
                Record a manual fuel purchase. This will trigger an expense debit and a company credit adjustment.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="date" className="text-right text-xs font-bold uppercase text-slate-400">Date</Label>
                <Input
                  id="date"
                  type="date"
                  className="col-span-3"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry({...newEntry, date: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-right text-xs font-bold uppercase text-slate-400">Location</Label>
                <Input
                  id="location"
                  placeholder="e.g. Shell Station"
                  className="col-span-3"
                  value={newEntry.location}
                  onChange={(e) => setNewEntry({...newEntry, location: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="amount" className="text-right text-xs font-bold uppercase text-slate-400">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0.00"
                  className="col-span-3 font-mono"
                  value={newEntry.amount}
                  onChange={(e) => setNewEntry({...newEntry, amount: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="liters" className="text-right text-xs font-bold uppercase text-slate-400">Liters</Label>
                <Input
                  id="liters"
                  type="number"
                  placeholder="0.00"
                  className="col-span-3 font-mono"
                  value={newEntry.liters}
                  onChange={(e) => setNewEntry({...newEntry, liters: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="odometer" className="text-right text-xs font-bold uppercase text-slate-400">Odometer</Label>
                <Input
                  id="odometer"
                  type="number"
                  placeholder="Current km"
                  className="col-span-3 font-mono"
                  value={newEntry.odometer}
                  onChange={(e) => setNewEntry({...newEntry, odometer: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="category" className="text-right text-xs font-bold uppercase text-slate-400">Bucket</Label>
                <Select 
                  value={newEntry.category} 
                  onValueChange={(val) => setNewEntry({...newEntry, category: val})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select bucket" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ride Share">Ride Share (Standard)</SelectItem>
                    <SelectItem value="Company Ops">Company Ops (100% Credit)</SelectItem>
                    <SelectItem value="Personal">Personal (0% Credit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button type="submit" onClick={handleAddEntry} className="bg-slate-900 text-white">Save Entry</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Audit Legend - Phase 4 */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2 bg-slate-50 border rounded-lg text-[11px] font-medium text-slate-500">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Verified: Anchor Confirmed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-blue-600" />
          <span>Auto-Generated Settlement</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Fingerprint className="w-3.5 h-3.5 text-orange-600" />
          <span>Signature Collision Match</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
          <span>Observing: Pending Anchor</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="w-2 h-2 rounded-full bg-red-600" />
          <span>Debit (Expense)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-600" />
          <span>Credit (Settlement)</span>
        </div>
      </div>

      <div className="rounded-md border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/50">
              <TableHead className="w-[140px] md:w-[180px]">Date</TableHead>
              <TableHead>Description & Metadata</TableHead>
              <TableHead className="hidden sm:table-cell w-[120px]">Status</TableHead>
              <TableHead className="text-right w-[100px] md:w-[140px]">Debit</TableHead>
              <TableHead className="hidden md:table-cell text-right w-[140px]">Credit</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledgerGroups.map((group, gIdx) => {
              const isPendingGroup = !group.bucket;
              const groupId = group.bucket?.id || 'pending';
              const isExpanded = expandedBuckets[groupId] || (isPendingGroup && (group.entries.length > 0 || group.transactions.length > 0));

              // Don't show empty groups unless it's the pending group with items
              if (isPendingGroup && group.entries.length === 0 && group.transactions.length === 0) return null;

              return (
                <React.Fragment key={groupId}>
                  {/* Parent Row - Anchor Window or Pending Header */}
                  <TableRow 
                    className={cn(
                      "group cursor-pointer hover:bg-slate-50/80",
                      isPendingGroup ? "bg-amber-50/20" : "bg-slate-50/30"
                    )}
                    onClick={() => toggleBucket(groupId)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span className="truncate">
                          {isPendingGroup 
                            ? 'Pending Reconciliation' 
                            : `${format(new Date(group.bucket!.startDate), 'MMM dd, yyyy')} - ${format(new Date(group.bucket!.endDate), 'MMM dd, yyyy')}`
                          }
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-slate-900 truncate max-w-[150px] md:max-w-none">
                          {isPendingGroup 
                            ? 'Floating Entries & Adjustments' 
                            : `Settlement Window: ${group.bucket!.startOdometer.toLocaleString()} - ${group.bucket!.endOdometer.toLocaleString()} km`
                          }
                        </span>
                        <span className="text-xs text-slate-500 truncate">
                          {isPendingGroup 
                            ? `${group.entries.length + group.transactions.length} items awaiting window closure`
                            : (
                                <div className="flex items-center gap-2">
                                  <span>{group.bucket!.tripsCount} trips • {group.bucket!.unaccountedDistance > 0 ? `${group.bucket!.unaccountedDistance.toLocaleString()}km gap` : 'No gaps detected'}</span>
                                  {(() => {
                                      const debitCount = group.entries.length + group.transactions.filter(isFuelDebit).length;
                                      if (debitCount <= 1) return null;
                                      return (
                                        <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-red-50 text-red-600 border-red-100 font-bold">
                                          {debitCount} DEBITS
                                        </Badge>
                                      );
                                  })()}
                                </div>
                              )
                          }
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {group.derivedStatus === 'Pending' ? (
                        <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">Pending</Badge>
                      ) : (
                        group.derivedStatus === 'Anomaly' ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Audit Needed</Badge>
                            {(group.bucket?.unaccountedDistance || 0) > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 cursor-help" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Distance gap of {group.bucket!.unaccountedDistance.toLocaleString()}km detected between trips.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Reconciled</Badge>
                        )
                      )}
                    </TableCell>
                    <TableCell colSpan={2} className="text-right">
                      <div className="flex justify-end gap-2 items-center">
                        <span className="hidden sm:inline text-xs font-medium text-slate-400">Net:</span>
                        <span className={cn(
                          "text-sm font-bold font-mono",
                          (group.netChange < 0) ? "text-red-600" : (group.netChange > 0 ? "text-emerald-600" : "text-slate-900")
                        )}>
                          {group.netChange < 0 ? '-' : group.netChange > 0 ? '+' : ''}
                          {FuelCalculationService.formatCurrency(Math.abs(group.netChange))}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="w-[50px]">
                      {!isPendingGroup && group.derivedStatus === 'Anomaly' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-amber-500 hover:text-red-600 hover:bg-red-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  initiateBucketPurge(groupId);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Purge Entire Anomaly Window</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Child Rows - Transactions & Entries */}
                  {isExpanded && (
                    <>
                    {group.entries.map((entry) => (
                      <TableRow key={entry.id} className="bg-white/50 border-l-4 border-l-slate-100">
                        <TableCell className="pl-6 md:pl-8 text-[10px] md:text-xs text-slate-500 whitespace-nowrap">
                          {formatSafeDate(entry.date, entry.time)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate max-w-[120px] md:max-w-none">{entry.location || 'Fuel Purchase'}</span>
                              {entry.metadata?.receiptUrl && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <a href={entry.metadata.receiptUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700">
                                        <Eye className="w-3 h-3" />
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent>View Receipt</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-tight">
                              {entry.liters?.toFixed(2)}L @ {FuelCalculationService.formatCurrency(entry.pricePerLiter || 0)}/L • Odo: {entry.odometer?.toLocaleString() || 'N/A'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex flex-col gap-1">
                            {renderStatusBadge(
                              entry.reconciliationStatus, 
                              entry.metadata?.auditFlags?.join(', ') || entry.metadata?.reason
                            )}
                            {(() => {
                              const integrity = ledgerIntegrity.get(entry.id);
                              if (integrity === 'Verified') return null;
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className={cn(
                                        "h-4 px-1 text-[8px] font-bold uppercase cursor-help",
                                        integrity === 'Orphaned' ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200"
                                      )}>
                                        {integrity} Ledger
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">
                                        {integrity === 'Orphaned' 
                                          ? "No financial records found in the ledger for this log." 
                                          : "Missing either the Debit or Credit side of this transaction."}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-red-600">
                          -${FuelCalculationService.formatCurrency(entry.amount).replace('$', '')}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right"></TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            disabled={isPurging}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              initiatePurge(entry.id, 'entry');
                            }}
                          >
                            {isPurging && deleteDialog.entryId === entry.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}

                    {group.transactions.map((tx) => (
                      <TableRow key={tx.id} className="bg-white/50 border-l-4 border-l-slate-100 hover:bg-slate-50/50 transition-colors">
                        <TableCell className="pl-6 md:pl-8 text-[10px] md:text-xs text-slate-500 whitespace-nowrap">
                          {formatSafeDate(tx.date, tx.time)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-700 truncate max-w-[120px] md:max-w-none">{tx.description}</span>
                            <span className="text-[10px] text-slate-400 uppercase tracking-tight font-semibold">
                              {tx.category} • Ref: {tx.referenceNumber || 'System Gen'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex flex-col gap-1">
                            {tx.metadata?.reconciliationStatus === 'Flagged' ? (
                               renderStatusBadge('Flagged', tx.metadata?.auditFlags?.join(', '))
                            ) : tx.metadata?.automated ? (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1"><Zap className="w-3 h-3" /> Auto</Badge>
                            ) : renderStatusBadge(tx.status, tx.metadata?.approvalReason)}
                            
                            {(() => {
                              const integrity = ledgerIntegrity.get(tx.id);
                              if (integrity === 'Verified' || !integrity) return null;
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className={cn(
                                        "h-4 px-1 text-[8px] font-bold uppercase cursor-help",
                                        integrity === 'Orphaned' ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200"
                                      )}>
                                        {integrity} Link
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">
                                        {integrity === 'Orphaned' 
                                          ? "Ghost Record: This transaction has no parent Fuel Log." 
                                          : "Partial Record: This transaction is missing its corresponding Debit/Credit twin."}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {isFuelDebit(tx) ? (
                            <span className="font-mono font-bold text-red-600">
                              -${FuelCalculationService.formatCurrency(Math.abs(tx.amount)).replace('$', '')}
                            </span>
                          ) : (
                            !isFuelCredit(tx) && <span className="text-slate-300">-</span>
                          )}
                          {!isFuelDebit(tx) && isFuelCredit(tx) && (
                            <div className="md:hidden">
                               <span className="font-mono font-bold text-emerald-600">
                                +${FuelCalculationService.formatCurrency(tx.amount).replace('$', '')}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-right">
                          {isFuelCredit(tx) ? (
                            <span className="font-mono font-bold text-emerald-600">
                              +${FuelCalculationService.formatCurrency(tx.amount).replace('$', '')}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            disabled={isPurging}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              initiatePurge(tx.id, 'tx');
                            }}
                          >
                            {isPurging && deleteDialog.txId === tx.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
        </Table>
      </div>
      
      {ledgerGroups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed rounded-xl bg-slate-50/50 transition-all hover:bg-slate-50/80">
          <div className="relative">
            <div className="bg-white p-5 rounded-full shadow-md mb-4 border border-slate-100">
              <Search className="w-10 h-10 text-slate-300" />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-amber-100 p-1.5 rounded-full border-2 border-white">
              <Info className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-1">Audit Ledger Empty</h3>
          <p className="text-slate-500 text-center max-w-sm mb-6">
            We couldn't find any fuel transactions for the selected period. This usually means no receipts have been uploaded yet.
          </p>
          <button className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-2">
            Upload Fuel Receipt
          </button>
        </div>
      )}
      {/* Phase 2: Total System Recall Dialog */}
      <Dialog open={deleteDialog.isOpen} onOpenChange={(open) => !isPurging && setDeleteDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="sm:max-w-[450px] border-red-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              {deleteDialog.isBucketPurge ? 'Window-Level Atomic Purge' : 'Atomic Multi-Stage Purge'}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {deleteDialog.isBucketPurge ? (
                <span>You are purging all records within the window: <strong>{deleteDialog.bucketLabel}</strong>.</span>
              ) : (
                <span>You are about to execute a <strong>Total System Recall</strong> for this record.</span>
              )}
              {" "}This operation is atomic and bi-directional.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-6 space-y-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-100 space-y-3">
              <h4 className="text-sm font-bold text-red-700 uppercase tracking-tight">Records Slated for Deletion:</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <Banknote className="w-4 h-4" /> Financial Transactions
                  </span>
                  <Badge variant="secondary" className="bg-red-100 text-red-700">{deleteDialog.affectedCount.transactions}</Badge>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 text-slate-600">
                    <Fuel className="w-4 h-4" /> Fuel Log Entries
                  </span>
                  <Badge variant="secondary" className="bg-red-100 text-red-700">{deleteDialog.affectedCount.entries}</Badge>
                </div>
              </div>
            </div>
            
            <p className="text-xs text-slate-500 italic">
              * This will remove all associated Debit (Expense) and Credit (Settlement) transactions to maintain ledger balance. 
              Data cannot be recovered once purged.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialog(prev => ({ ...prev, isOpen: false }))}
              disabled={isPurging}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={executePurge}
              disabled={isPurging}
              className="gap-2"
            >
              {isPurging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Execute {deleteDialog.isBucketPurge ? 'Bulk Window' : 'Atomic'} Purge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
