import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { 
  Search, 
  AlertCircle, 
  TrendingUp, 
  Building2,
  Calendar,
  DollarSign,
  Users,
  Car,
  Loader2,
  ChevronRight,
  Database,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../../services/api';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { VendorDetailModal } from './VendorDetailModal';
import { SingleTransactionModal } from './SingleTransactionModal';
import { TransactionReviewWizard } from './TransactionReviewWizard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';

interface UnverifiedVendor {
  id: string;
  name: string;
  status: 'pending' | 'resolved';
  createdAt: string;
  transactionIds: string[];
  sourceType: 'no_gps' | 'unmatched_name' | 'manual_entry';
  metadata: {
    totalAmount: number;
    transactionCount: number;
    firstSeen: string;
    lastSeen: string;
    submittedBy: string[];
    vehicles: string[];
  };
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedStationId?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

interface TransactionRow {
  id: string;
  vendorId: string;
  vendorName: string;
  sourceType: 'no_gps' | 'unmatched_name' | 'manual_entry';
  date: string;
  amount: number;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehicleName?: string;
  status: 'pending' | 'resolved';
}

interface UnverifiedVendorsTabProps {
  onSelectVendor?: (vendor: UnverifiedVendor) => void;
  onRefresh?: () => void;
}

export function UnverifiedVendorsTab({ onSelectVendor, onRefresh }: UnverifiedVendorsTabProps) {
  const [vendors, setVendors] = useState<UnverifiedVendor[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Phase 8: Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationPreview, setMigrationPreview] = useState<any>(null);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [showReviewWizard, setShowReviewWizard] = useState(false);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      // Always fetch ALL vendors so we can show resolved transactions across both tabs
      const response = await api.getUnverifiedVendors(statusFilter === 'all' ? undefined : statusFilter);
      const vendorsList = response.vendors || [];
      setVendors(vendorsList);
      
      // Also fetch all vendors if filtering, so resolved tab can show resolved txs from any vendor
      let allVendorsList = vendorsList;
      if (statusFilter === 'resolved') {
        // For resolved tab, also get pending vendors that may have resolvedTransactionIds
        const allResponse = await api.getUnverifiedVendors();
        allVendorsList = allResponse.vendors || [];
      }
      
      // Flatten vendors into individual transaction rows
      const txRows: TransactionRow[] = [];
      
      const vendorsToScan = statusFilter === 'resolved' ? allVendorsList : vendorsList;
      
      for (const vendor of vendorsToScan) {
        // Fetch full vendor details with transactions
        try {
          const vendorDetail = await api.getUnverifiedVendorById(vendor.id);
          
          // Add pending transactions (for Pending and All tabs)
          if (statusFilter !== 'resolved') {
            const txList = vendorDetail.transactions || [];
            for (const tx of txList) {
              txRows.push({
                id: tx.id,
                vendorId: vendor.id,
                vendorName: vendor.name,
                sourceType: vendor.sourceType,
                date: tx.date || tx.createdAt,
                amount: tx.amount || 0,
                driverId: tx.driverId,
                driverName: tx.driverName,
                vehicleId: tx.vehicleId,
                vehicleName: tx.vehicleName,
                status: 'pending'
              });
            }
          }
          
          // Add resolved transactions (for Resolved and All tabs)
          if (statusFilter === 'resolved' || statusFilter === 'all') {
            const resolvedTxList = vendorDetail.resolvedTransactions || [];
            for (const tx of resolvedTxList) {
              txRows.push({
                id: tx.id,
                vendorId: vendor.id,
                vendorName: vendor.name,
                sourceType: vendor.sourceType,
                date: tx.date || tx.createdAt,
                amount: tx.amount || 0,
                driverId: tx.driverId,
                driverName: tx.driverName,
                vehicleId: tx.vehicleId,
                vehicleName: tx.vehicleName,
                status: 'resolved'
              });
            }
          }
        } catch (err) {
          console.error(`Failed to fetch transactions for vendor ${vendor.id}:`, err);
        }
      }
      
      setTransactions(txRows);
    } catch (error: any) {
      console.error('Failed to fetch unverified vendors:', error);
      toast.error('Failed to load unverified vendors', {
        description: error.message || 'Please try again'
      });
      setVendors([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [statusFilter]);

  const filteredVendors = useMemo(() => {
    if (!searchTerm) return vendors;
    
    const lower = searchTerm.toLowerCase();
    return vendors.filter(v => 
      v.name.toLowerCase().includes(lower) ||
      v.id.toLowerCase().includes(lower)
    );
  }, [vendors, searchTerm]);

  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return transactions;
    
    const lower = searchTerm.toLowerCase();
    return transactions.filter(tx => 
      tx.vendorName.toLowerCase().includes(lower) ||
      tx.driverName?.toLowerCase().includes(lower) ||
      tx.vehicleName?.toLowerCase().includes(lower) ||
      tx.id.toLowerCase().includes(lower)
    );
  }, [transactions, searchTerm]);

  const summary = useMemo(() => {
    const pendingVendors = vendors.filter(v => v.status === 'pending');
    const pendingTransactions = transactions.filter(tx => tx.status === 'pending');
    const resolvedTransactions = transactions.filter(tx => tx.status === 'resolved');
    
    return {
      totalVendors: vendors.length,
      pendingVendors: pendingVendors.length,
      pending: pendingTransactions.length,  // Transaction count for "Pending" card
      resolved: resolvedTransactions.length,  // Transaction count for "Resolved" card
      totalAmountAtRisk: pendingTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0),
      totalTransactions: transactions.length
    };
  }, [vendors, transactions]);

  const getSourceTypeLabel = (type: string) => {
    switch (type) {
      case 'no_gps': return 'No GPS';
      case 'unmatched_name': return 'Unmatched';
      case 'manual_entry': return 'Manual';
      default: return type;
    }
  };

  const getSourceTypeColor = (type: string) => {
    switch (type) {
      case 'no_gps': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'unmatched_name': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'manual_entry': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Phase 8: Migration handlers
  const handleRepairResolved = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-37f42386/unverified-vendors/repair-resolved`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const result = await response.json();
      if (result.repaired > 0) {
        toast.success(`Repaired ${result.repaired} orphaned resolved transactions`);
        await fetchVendors();
        onRefresh?.();
      }
    } catch (err) {
      console.error('Repair failed:', err);
    }
  };

  // Run repair once on mount
  useEffect(() => {
    handleRepairResolved();
  }, []);

  const handleMigrationPreview = async () => {
    setIsMigrating(true);
    try {
      const result = await api.migrateLegacyVendors(true);
      setMigrationPreview(result.preview);
      setShowMigrationModal(true);
      
      if (result.preview && result.preview.vendorsToCreate > 0) {
        toast.success(`Found ${result.preview.vendorsToCreate} orphaned vendors to migrate`, {
          description: `${result.preview.totalOrphanedTransactions} transactions affecting ${formatCurrency(result.preview.totalAmountAffected)}`
        });
      } else {
        toast.info('No legacy data to migrate', {
          description: 'All vendors are already in the system'
        });
      }
    } catch (error: any) {
      console.error('Migration preview failed:', error);
      toast.error('Failed to preview migration', {
        description: error.message || 'Please try again'
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleMigrationExecute = async () => {
    setIsMigrating(true);
    try {
      const result = await api.migrateLegacyVendors(false);
      
      if (result.success && result.summary) {
        toast.success(`Migration complete! Created ${result.summary.vendorsCreated} vendors`, {
          description: `Migrated ${result.summary.transactionsMigrated} transactions and ${result.summary.fuelLogsMigrated} fuel logs`,
          duration: 8000
        });
        
        setShowMigrationModal(false);
        setMigrationPreview(null);
        
        // Refresh vendors list
        await fetchVendors();
        onRefresh?.();
      }
    } catch (error: any) {
      console.error('Migration execution failed:', error);
      toast.error('Migration failed', {
        description: error.message || 'Please try again',
        duration: 10000
      });
    } finally {
      setIsMigrating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-3" />
          <p className="text-sm text-slate-600">Loading unverified vendors...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Pending Vendors</p>
                <p className="text-2xl font-bold text-slate-900">{summary.pendingVendors}</p>
              </div>
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Gate-Held Txns</p>
                <p className="text-2xl font-bold text-slate-900">{summary.pending}</p>
              </div>
              <div className="p-2 bg-blue-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Amount at Risk</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(summary.totalAmountAtRisk)}</p>
              </div>
              <div className="p-2 bg-red-100 rounded-lg">
                <DollarSign className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Resolved</p>
                <p className="text-2xl font-bold text-slate-900">{summary.resolved}</p>
              </div>
              <div className="p-2 bg-green-100 rounded-lg">
                <Building2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium mb-1">Total Vendors</p>
                <p className="text-2xl font-bold text-slate-900">{summary.totalVendors}</p>
              </div>
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Building2 className="h-5 w-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Phase 8: Legacy Data Migration Alert */}
      {summary.totalVendors === 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                  <Database className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900 mb-1">
                    Legacy Data Migration
                  </h4>
                  <p className="text-sm text-slate-600 mb-3">
                    Found orphaned "Unspecified Vendor" entries in the Review Queue? Run the migration tool to backfill them into this gating system.
                  </p>
                  <p className="text-xs text-slate-500">
                    This will scan for fuel transactions and logs created before the vendor gating system was implemented (Phase 7) and create unverified vendor records for them.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setShowReviewWizard(true)}
                disabled={isMigrating}
                className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
              >
                {isMigrating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Review Legacy Transactions
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search vendor names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant={statusFilter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('pending')}
          >
            Pending
            {summary.pending > 0 && (
              <Badge variant="secondary" className="ml-2 bg-white text-slate-900">
                {summary.pending}
              </Badge>
            )}
          </Button>
          <Button
            variant={statusFilter === 'resolved' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('resolved')}
          >
            Resolved
          </Button>
          <Button
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter('all')}
          >
            All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchVendors();
              onRefresh?.();
            }}
          >
            <Loader2 className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Vendors List */}
      {filteredTransactions.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 font-medium">No unverified transactions found</p>
            <p className="text-sm text-slate-500 mt-1">
              {searchTerm 
                ? 'Try adjusting your search or filter'
                : statusFilter === 'pending'
                ? 'All transactions have been verified!'
                : 'No transactions match the current filter'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredTransactions.map((tx) => (
            <Card 
              key={tx.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => {
                setSelectedVendorId(tx.vendorId);
                setSelectedTransactionId(tx.id);
                setIsModalOpen(true);
              }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 grid grid-cols-6 gap-4">
                    {/* Date */}
                    <div className="col-span-1">
                      <p className="text-xs text-slate-500 mb-1">Date</p>
                      <p className="text-sm font-medium text-slate-900">
                        {new Date(tx.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                    </div>

                    {/* Vendor Name */}
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 mb-1">Vendor</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 truncate">{tx.vendorName}</p>
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${getSourceTypeColor(tx.sourceType)}`}
                        >
                          {getSourceTypeLabel(tx.sourceType)}
                        </Badge>
                      </div>
                    </div>

                    {/* Driver */}
                    <div className="col-span-1">
                      <p className="text-xs text-slate-500 mb-1">Driver</p>
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {tx.driverName || 'Unknown'}
                      </p>
                    </div>

                    {/* Vehicle */}
                    <div className="col-span-1">
                      <p className="text-xs text-slate-500 mb-1">Vehicle</p>
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {tx.vehicleName || 'Unknown'}
                      </p>
                    </div>

                    {/* Amount */}
                    <div className="col-span-1">
                      <p className="text-xs text-slate-500 mb-1">Amount</p>
                      <p className="text-sm font-bold text-slate-900">
                        {formatCurrency(Math.abs(tx.amount))}
                      </p>
                    </div>
                  </div>

                  <Button variant="ghost" size="sm" className="shrink-0">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Vendor Detail Modal */}
      <SingleTransactionModal
        transactionId={selectedTransactionId}
        vendorId={selectedVendorId}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVendorId(null);
          setSelectedTransactionId(null);
        }}
        onResolved={() => {
          fetchVendors();
          onRefresh?.();
        }}
      />

      {/* Migration Modal */}
      <Dialog open={showMigrationModal} onOpenChange={setShowMigrationModal}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-amber-600" />
              Legacy Data Migration Preview
            </DialogTitle>
            <DialogDescription>
              Review the orphaned data found before executing the migration. This will create unverified vendor records that must be resolved before transactions can be approved.
            </DialogDescription>
          </DialogHeader>

          {migrationPreview && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-amber-600 font-medium mb-1">Vendors to Create</p>
                        <p className="text-2xl font-bold text-amber-900">{migrationPreview.vendorsToCreate}</p>
                      </div>
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <Building2 className="h-4 w-4 text-amber-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-blue-200 bg-blue-50">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-blue-600 font-medium mb-1">Total Transactions</p>
                        <p className="text-2xl font-bold text-blue-900">{migrationPreview.totalOrphanedTransactions}</p>
                      </div>
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 bg-slate-50">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-slate-600 font-medium mb-1">Fuel Logs</p>
                        <p className="text-2xl font-bold text-slate-900">{migrationPreview.totalOrphanedFuelLogs}</p>
                      </div>
                      <div className="p-2 bg-slate-100 rounded-lg">
                        <Database className="h-4 w-4 text-slate-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-green-200 bg-green-50">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-green-600 font-medium mb-1">Total Amount</p>
                        <p className="text-2xl font-bold text-green-900">{formatCurrency(migrationPreview.totalAmountAffected)}</p>
                      </div>
                      <div className="p-2 bg-green-100 rounded-lg">
                        <DollarSign className="h-4 w-4 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Warning Banner */}
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-900 mb-1">Action Required After Migration</p>
                      <p className="text-amber-700">
                        After migration, you must resolve each vendor by either matching to an existing station or creating a new verified station. Transactions will remain gate-held until resolution.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vendor Details */}
              {migrationPreview.vendors && migrationPreview.vendors.length > 0 && (
                <div>
                  <h4 className="font-semibold text-slate-900 text-sm mb-3">
                    Vendors to be Created ({migrationPreview.vendors.length})
                  </h4>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50">
                    {migrationPreview.vendors.map((vendor: any, index: number) => (
                      <Card key={index} className="bg-white">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h5 className="font-semibold text-slate-900 text-sm mb-2 truncate">
                                {vendor.name}
                              </h5>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <TrendingUp className="h-3 w-3 text-slate-400" />
                                  <span className="font-medium">{vendor.transactionCount}</span>
                                  <span className="text-slate-500">txns</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <Database className="h-3 w-3 text-slate-400" />
                                  <span className="font-medium">{vendor.fuelLogCount}</span>
                                  <span className="text-slate-500">logs</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <DollarSign className="h-3 w-3 text-slate-400" />
                                  <span className="font-medium">{formatCurrency(vendor.totalAmount)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <Users className="h-3 w-3 text-slate-400" />
                                  <span className="font-medium">{vendor.driverCount}</span>
                                  <span className="text-slate-500">drivers</span>
                                </div>
                              </div>
                              {vendor.dateRange && (
                                <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                                  <Calendar className="h-3 w-3" />
                                  <span>
                                    {new Date(vendor.dateRange.from).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                    {' → '}
                                    {new Date(vendor.dateRange.to).toLocaleDateString('en-US', { 
                                      month: 'short', 
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-200 shrink-0">
                              Legacy
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* No Data Found */}
              {migrationPreview.vendorsToCreate === 0 && (
                <Card className="border-green-200 bg-green-50">
                  <CardContent className="p-6 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                    <p className="font-semibold text-green-900 mb-1">All Clear!</p>
                    <p className="text-sm text-green-700">
                      No orphaned vendors found. All data is already in the system.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMigrationModal(false);
                setMigrationPreview(null);
              }}
              disabled={isMigrating}
              className="w-full sm:w-auto"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            
            {migrationPreview && migrationPreview.vendorsToCreate > 0 && (
              <Button
                onClick={handleMigrationExecute}
                disabled={isMigrating}
                className="bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto"
              >
                {isMigrating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Migrating {migrationPreview.vendorsToCreate} vendors...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirm Migration ({migrationPreview.vendorsToCreate} vendors)
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Review Wizard */}
      <TransactionReviewWizard
        isOpen={showReviewWizard}
        onClose={() => setShowReviewWizard(false)}
        onComplete={() => {
          fetchVendors();
          onRefresh?.();
        }}
      />
    </div>
  );
}