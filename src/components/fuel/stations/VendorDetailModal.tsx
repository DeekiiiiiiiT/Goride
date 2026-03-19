import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Card, CardContent } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Loader2,
  MapPin,
  Plus,
  Search,
  TrendingUp,
  User,
  Car,
  X,
  AlertTriangle,
  Link2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../../services/api';

interface VendorDetailModalProps {
  vendorId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onResolved?: () => void;
}

interface VendorDetails {
  vendor: any;
  transactions: any[];
  drivers: any[];
  vehicles: any[];
  suggestedMatches: any[];
}

export function VendorDetailModal({ vendorId, isOpen, onClose, onResolved }: VendorDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<VendorDetails | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [resolving, setResolving] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stationSearchResults, setStationSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // New station form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [newStationBrand, setNewStationBrand] = useState('');
  const [newStationAddress, setNewStationAddress] = useState('');

  // Rejection form
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionAction, setRejectionAction] = useState<'flag' | 'dismiss'>('flag');

  useEffect(() => {
    if (isOpen && vendorId) {
      fetchVendorDetails();
    } else {
      resetState();
    }
  }, [vendorId, isOpen]);

  const resetState = () => {
    setDetails(null);
    setActiveTab('overview');
    setSelectedStationId(null);
    setSearchTerm('');
    setStationSearchResults([]);
    setShowCreateForm(false);
    setShowRejectForm(false);
    setNewStationName('');
    setNewStationBrand('');
    setNewStationAddress('');
    setRejectionReason('');
    setRejectionAction('flag');
  };

  const fetchVendorDetails = async () => {
    if (!vendorId) return;
    
    setLoading(true);
    try {
      const data = await api.getUnverifiedVendorById(vendorId);
      setDetails(data);
      
      // Pre-populate new station form with vendor name
      if (data.vendor?.name) {
        setNewStationName(data.vendor.name);
        setNewStationBrand(data.vendor.name);
      }
    } catch (error: any) {
      console.error('Failed to fetch vendor details:', error);
      toast.error('Failed to load vendor details', {
        description: error.message || 'Please try again'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStationSearch = async () => {
    if (!searchTerm.trim()) {
      setStationSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      // Search verified stations
      const response = await api.searchStations(searchTerm);
      setStationSearchResults(response.stations || []);
    } catch (error: any) {
      console.error('Failed to search stations:', error);
      toast.error('Station search failed', {
        description: error.message || 'Please try again'
      });
      setStationSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleResolveToStation = async () => {
    if (!selectedStationId || !vendorId) {
      toast.error('Please select a station');
      return;
    }

    setResolving(true);
    try {
      const result = await api.resolveVendorToStation(
        vendorId,
        selectedStationId,
        'admin-user-id' // TODO: Get from auth context
      );

      toast.success('Vendor resolved successfully!', {
        description: `${result.summary.transactionsUpdated} transactions updated`,
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />
      });

      onResolved?.();
      onClose();
    } catch (error: any) {
      console.error('Failed to resolve vendor:', error);
      toast.error('Resolution failed', {
        description: error.message || 'Please try again'
      });
    } finally {
      setResolving(false);
    }
  };

  const handleCreateStation = async () => {
    if (!newStationName.trim() || !vendorId) {
      toast.error('Station name is required');
      return;
    }

    setResolving(true);
    try {
      const result = await api.createStationFromVendor(
        vendorId,
        {
          name: newStationName,
          brand: newStationBrand || newStationName,
          address: newStationAddress || 'Address to be updated',
        },
        'admin-user-id' // TODO: Get from auth context
      );

      toast.success('New station created!', {
        description: `Vendor resolved with ${result.summary.transactionsUpdated} transactions`,
        icon: <CheckCircle2 className="h-4 w-4 text-green-500" />
      });

      onResolved?.();
      onClose();
    } catch (error: any) {
      console.error('Failed to create station:', error);
      toast.error('Station creation failed', {
        description: error.message || 'Please try again'
      });
    } finally {
      setResolving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim() || !vendorId) {
      toast.error('Rejection reason is required');
      return;
    }

    setResolving(true);
    try {
      const result = await api.rejectUnverifiedVendor(
        vendorId,
        'admin-user-id', // TODO: Get from auth context
        rejectionReason,
        rejectionAction
      );

      toast.success('Vendor rejected', {
        description: `${result.summary.transactionsAffected} transactions ${rejectionAction}ed`,
        icon: <XCircle className="h-4 w-4 text-red-500" />
      });

      onResolved?.();
      onClose();
    } catch (error: any) {
      console.error('Failed to reject vendor:', error);
      toast.error('Rejection failed', {
        description: error.message || 'Please try again'
      });
    } finally {
      setResolving(false);
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
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSourceTypeLabel = (type: string) => {
    switch (type) {
      case 'no_gps': return 'No GPS';
      case 'unmatched_name': return 'Unmatched Name';
      case 'manual_entry': return 'Manual Entry';
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

  // Helper to look up vehicle and driver names from transaction IDs
  const getVehicleName = (vehicleId: string) => {
    if (!details) return 'Unknown Vehicle';
    const vehicle = details.vehicles.find((v: any) => v.id === vehicleId);
    return vehicle?.licensePlate || vehicle?.plateNumber || 'Unknown Vehicle';
  };

  const getDriverName = (driverId: string) => {
    if (!details) return 'Unknown Driver';
    const driver = details.drivers.find((d: any) => d.id === driverId);
    return driver?.name || 'Unknown Driver';
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-indigo-600" />
            Unverified Vendor Resolution
          </DialogTitle>
          <DialogDescription>
            Review and resolve this unverified vendor by linking to an existing station or creating a new one
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          </div>
        ) : !details ? (
          <div className="text-center py-12 text-slate-500">
            Failed to load vendor details
          </div>
        ) : (
          <div className="space-y-6">
            {/* Vendor Header */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold text-slate-900">
                        {details.vendor.name}
                      </h3>
                      <Badge 
                        variant="outline" 
                        className={getSourceTypeColor(details.vendor.sourceType)}
                      >
                        {getSourceTypeLabel(details.vendor.sourceType)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500">Transactions</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {details.vendor.metadata?.transactionCount || 0}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500">Total Amount</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {formatCurrency(details.vendor.metadata?.totalAmount || 0)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500">Drivers</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {details.drivers.length}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500">Vehicles</p>
                          <p className="text-sm font-semibold text-slate-900">
                            {details.vehicles.length}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="transactions">
                  Transactions ({details.transactions.length})
                </TabsTrigger>
                <TabsTrigger value="resolve">Resolve</TabsTrigger>
                <TabsTrigger value="reject">Reject</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Suggested Matches */}
                  <Card>
                    <CardContent className="p-4">
                      <h4 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                        <Search className="h-4 w-4 text-indigo-600" />
                        Suggested Matches
                        <Badge variant="outline" className="ml-auto">
                          {details.suggestedMatches.length}
                        </Badge>
                      </h4>
                      {details.suggestedMatches.length === 0 ? (
                        <p className="text-sm text-slate-500">No similar stations found</p>
                      ) : (
                        <div className="space-y-2">
                          {details.suggestedMatches.slice(0, 3).map((match: any) => (
                            <div
                              key={match.id}
                              className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                              onClick={() => {
                                setSelectedStationId(match.id);
                                setActiveTab('resolve');
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="font-medium text-sm text-slate-900">{match.name}</p>
                                  <p className="text-xs text-slate-500">{match.address}</p>
                                </div>
                                <Badge variant="outline" className="text-xs">
                                  {match.similarity}% match
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Drivers & Vehicles */}
                  <Card>
                    <CardContent className="p-4">
                      <h4 className="font-semibold text-slate-900 mb-3">Activity Summary</h4>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Drivers</p>
                          <div className="flex flex-wrap gap-2">
                            {details.drivers.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No driver information</p>
                            ) : (
                              details.drivers.map((driver: any) => (
                                <Badge key={driver.id} variant="secondary" className="text-xs font-medium">
                                  <User className="h-3 w-3 mr-1" />
                                  {driver.name}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Vehicles</p>
                          <div className="flex flex-wrap gap-2">
                            {details.vehicles.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No vehicle information</p>
                            ) : (
                              details.vehicles.map((vehicle: any) => (
                                <Badge key={vehicle.id} variant="secondary" className="text-xs font-semibold">
                                  <Car className="h-3 w-3 mr-1" />
                                  {vehicle.licensePlate || vehicle.plateNumber || 'Unknown Vehicle'}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Transactions Tab */}
              <TabsContent value="transactions" className="space-y-2">
                {details.transactions.map((tx: any) => (
                  <Card key={tx.id}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm text-slate-900">
                              {formatCurrency(Math.abs(tx.amount))}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              <Car className="h-3 w-3 mr-1" />
                              {tx.vehicleId ? getVehicleName(tx.vehicleId) : 'Unknown Vehicle'}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(tx.date)}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {tx.driverId ? getDriverName(tx.driverId) : 'Unknown Driver'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </TabsContent>

              {/* Resolve Tab */}
              <TabsContent value="resolve" className="space-y-4">
                {!showCreateForm ? (
                  <>
                    {/* Search Existing Stations */}
                    <div>
                      <Label className="text-sm font-semibold mb-2 block">
                        Link to Existing Station
                      </Label>
                      <div className="flex gap-2 mb-3">
                        <Input
                          placeholder="Search verified stations..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleStationSearch()}
                        />
                        <Button 
                          onClick={handleStationSearch}
                          disabled={searching}
                          variant="outline"
                        >
                          {searching ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Search className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      {/* Suggested Matches First */}
                      {details.suggestedMatches.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs text-slate-500 mb-2">Suggested Matches</p>
                          <div className="space-y-2">
                            {details.suggestedMatches.map((match: any) => (
                              <div
                                key={match.id}
                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                  selectedStationId === match.id
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-slate-200 hover:bg-slate-50'
                                }`}
                                onClick={() => setSelectedStationId(match.id)}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm text-slate-900">{match.name}</p>
                                    <p className="text-xs text-slate-500">{match.address}</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                    {match.similarity}% match
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Search Results */}
                      {stationSearchResults.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">Search Results</p>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {stationSearchResults.map((station: any) => (
                              <div
                                key={station.id}
                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                  selectedStationId === station.id
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-slate-200 hover:bg-slate-50'
                                }`}
                                onClick={() => setSelectedStationId(station.id)}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm text-slate-900">{station.name}</p>
                                    <p className="text-xs text-slate-500">{station.address}</p>
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-slate-400" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => setShowCreateForm(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create New Station
                      </Button>

                      <Button
                        onClick={handleResolveToStation}
                        disabled={!selectedStationId || resolving}
                      >
                        {resolving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Resolving...
                          </>
                        ) : (
                          <>
                            <Link2 className="h-4 w-4 mr-2" />
                            Resolve to Station
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  /* Create New Station Form */
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="station-name">Station Name *</Label>
                      <Input
                        id="station-name"
                        value={newStationName}
                        onChange={(e) => setNewStationName(e.target.value)}
                        placeholder="Enter station name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="station-brand">Brand</Label>
                      <Input
                        id="station-brand"
                        value={newStationBrand}
                        onChange={(e) => setNewStationBrand(e.target.value)}
                        placeholder="Enter brand name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="station-address">Address</Label>
                      <Input
                        id="station-address"
                        value={newStationAddress}
                        onChange={(e) => setNewStationAddress(e.target.value)}
                        placeholder="Enter address (optional)"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={() => setShowCreateForm(false)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>

                      <Button
                        onClick={handleCreateStation}
                        disabled={!newStationName.trim() || resolving}
                      >
                        {resolving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Create & Resolve
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Reject Tab */}
              <TabsContent value="reject" className="space-y-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-red-900 mb-1">Reject This Vendor</h4>
                      <p className="text-sm text-red-700">
                        This action will mark the vendor as resolved without creating a station. 
                        All linked transactions will be {rejectionAction === 'flag' ? 'flagged for review' : 'dismissed'}.
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="rejection-reason">Reason for Rejection *</Label>
                  <Textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why this vendor is being rejected..."
                    rows={4}
                  />
                </div>

                <div>
                  <Label className="mb-2 block">Transaction Action</Label>
                  <div className="space-y-2">
                    <div
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        rejectionAction === 'flag'
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                      onClick={() => setRejectionAction('flag')}
                    >
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-sm text-slate-900">Flag for Review</p>
                          <p className="text-xs text-slate-500">
                            Mark transactions as flagged for manual review
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        rejectionAction === 'dismiss'
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                      onClick={() => setRejectionAction('dismiss')}
                    >
                      <div className="flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-slate-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-sm text-slate-900">Dismiss</p>
                          <p className="text-xs text-slate-500">
                            Mark transactions as dismissed (no further action needed)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-4 border-t">
                  <Button
                    onClick={handleReject}
                    disabled={!rejectionReason.trim() || resolving}
                    variant="destructive"
                  >
                    {resolving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Reject Vendor
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}