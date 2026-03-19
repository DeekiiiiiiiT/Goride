import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Card, CardContent } from '../../ui/card';
import {
  Calendar,
  DollarSign,
  User,
  Car,
  MapPin,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Building2,
  ArrowRight,
  Search
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../../services/api';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '../../ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';
import { VisuallyHidden } from '../../ui/visually-hidden';

interface SingleTransactionModalProps {
  transactionId: string | null;
  vendorId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onResolved: () => void;
}

interface Transaction {
  id: string;
  date: string;
  amount: number;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehicleName?: string;
  vendorName: string;
  sourceType: string;
}

interface Station {
  id: string;
  name: string;
  brand?: string;
  address?: string;
  city?: string;
  state?: string;
}

export function SingleTransactionModal({
  transactionId,
  vendorId,
  isOpen,
  onClose,
  onResolved
}: SingleTransactionModalProps) {
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [action, setAction] = useState<'match' | 'create' | 'reject' | null>(null);
  
  // For matching to existing station
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [stationSearch, setStationSearch] = useState('');
  const [stationPopoverOpen, setStationPopoverOpen] = useState(false);
  const [searchingStations, setSearchingStations] = useState(false);
  
  // For creating new station
  const [newStationName, setNewStationName] = useState('');
  const [newStationBrand, setNewStationBrand] = useState('');
  const [newStationAddress, setNewStationAddress] = useState('');
  const [newStationCity, setNewStationCity] = useState('');
  const [newStationState, setNewStationState] = useState('');
  
  // For rejection
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    if (isOpen && transactionId && vendorId) {
      fetchTransactionDetails();
      fetchStations();
    } else {
      resetModal();
    }
  }, [isOpen, transactionId, vendorId]);

  const fetchTransactionDetails = async () => {
    if (!transactionId || !vendorId) return;
    
    setLoading(true);
    try {
      const vendorDetail = await api.getUnverifiedVendorById(vendorId);
      const txList = vendorDetail.transactions || [];
      const tx = txList.find((t: any) => t.id === transactionId);
      
      if (tx) {
        setTransaction({
          id: tx.id,
          date: tx.date || tx.createdAt,
          amount: tx.amount || 0,
          driverId: tx.driverId,
          driverName: tx.driverName,
          vehicleId: tx.vehicleId,
          vehicleName: tx.vehicleName,
          vendorName: vendorDetail.vendor.name,
          sourceType: vendorDetail.vendor.sourceType
        });
        
        // Pre-fill new station name with vendor name
        setNewStationName(vendorDetail.vendor.name);
      }
    } catch (error: any) {
      console.error('Failed to fetch transaction:', error);
      toast.error('Failed to load transaction details');
    } finally {
      setLoading(false);
    }
  };

  const fetchStations = async () => {
    setSearchingStations(true);
    try {
      const response = await api.getStations();
      const stationList = Array.isArray(response) ? response : (response.stations || []);
      setStations(stationList);
    } catch (error) {
      console.error('Failed to fetch stations:', error);
    } finally {
      setSearchingStations(false);
    }
  };

  const resetModal = () => {
    setTransaction(null);
    setAction(null);
    setSelectedStationId('');
    setStationSearch('');
    setNewStationName('');
    setNewStationBrand('');
    setNewStationAddress('');
    setNewStationCity('');
    setNewStationState('');
    setRejectionReason('');
  };

  const handleResolve = async () => {
    if (!vendorId || !transactionId) return;

    setResolving(true);
    try {
      if (action === 'match') {
        if (!selectedStationId) {
          toast.error('Please select a station');
          return;
        }
        
        await api.resolveTransactionToStation(vendorId, transactionId, selectedStationId);
        toast.success('Transaction matched to station!');
        onResolved();
        onClose();
      } else if (action === 'create') {
        if (!newStationName.trim()) {
          toast.error('Station name is required');
          return;
        }
        
        const result = await api.createStationFromTransaction(vendorId, transactionId, {
          name: newStationName.trim(),
          brand: newStationBrand.trim() || undefined,
          address: newStationAddress.trim() || undefined,
          city: newStationCity.trim() || undefined,
          state: newStationState.trim() || undefined,
        });
        
        toast.success('New station created and transaction resolved!');
        onResolved();
        onClose();
      } else if (action === 'reject') {
        if (!rejectionReason.trim()) {
          toast.error('Rejection reason is required');
          return;
        }
        
        await api.rejectTransaction(vendorId, transactionId, rejectionReason.trim());
        toast.success('Transaction rejected');
        onResolved();
        onClose();
      }
    } catch (error: any) {
      console.error('Resolution failed:', error);
      toast.error('Failed to resolve transaction', {
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
      minimumFractionDigits: 2
    }).format(amount);
  };

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

  const filteredStations = stations.filter(s =>
    s.name.toLowerCase().includes(stationSearch.toLowerCase()) ||
    s.brand?.toLowerCase().includes(stationSearch.toLowerCase()) ||
    s.city?.toLowerCase().includes(stationSearch.toLowerCase())
  );

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Loading Transaction</DialogTitle>
            <DialogDescription>Please wait while we load the transaction details.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-sm text-slate-600">Loading transaction...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!transaction) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Resolve Single Transaction
          </DialogTitle>
          <DialogDescription>
            Review and resolve this individual transaction
          </DialogDescription>
        </DialogHeader>

        {/* Transaction Details */}
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="space-y-3">
              {/* Vendor Name */}
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Vendor Name</p>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900 text-lg">{transaction.vendorName}</p>
                    <Badge variant="outline" className={`text-xs ${getSourceTypeColor(transaction.sourceType)}`}>
                      {getSourceTypeLabel(transaction.sourceType)}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Transaction Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Calendar className="h-4 w-4 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Date</p>
                    <p className="text-sm font-medium text-slate-900">
                      {new Date(transaction.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <DollarSign className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Amount</p>
                    <p className="text-sm font-bold text-slate-900">
                      {formatCurrency(Math.abs(transaction.amount))}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <User className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Driver</p>
                    <p className="text-sm font-medium text-slate-900">
                      {transaction.driverName || 'Unknown'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Car className="h-4 w-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Vehicle</p>
                    <p className="text-sm font-medium text-slate-900">
                      {transaction.vehicleName || 'Unknown'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Selection */}
        {!action && (
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-slate-900">Choose Action</Label>
            
            <Button
              variant="outline"
              className="w-full justify-between h-auto p-4 hover:border-indigo-300 hover:bg-indigo-50"
              onClick={() => setAction('match')}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Building2 className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-900">Match to Existing Station</p>
                  <p className="text-xs text-slate-600">Link this transaction to a verified station</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400" />
            </Button>

            <Button
              variant="outline"
              className="w-full justify-between h-auto p-4 hover:border-green-300 hover:bg-green-50"
              onClick={() => setAction('create')}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-900">Create New Station</p>
                  <p className="text-xs text-slate-600">Add as a new verified station</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400" />
            </Button>

            <Button
              variant="outline"
              className="w-full justify-between h-auto p-4 hover:border-red-300 hover:bg-red-50"
              onClick={() => setAction('reject')}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-slate-900">Reject Transaction</p>
                  <p className="text-xs text-slate-600">Mark as invalid or fraudulent</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400" />
            </Button>
          </div>
        )}

        {/* Match to Existing Station */}
        {action === 'match' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-900">Select Station</Label>
              <Button variant="ghost" size="sm" onClick={() => setAction(null)}>
                Change Action
              </Button>
            </div>

            <Popover open={stationPopoverOpen} onOpenChange={setStationPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedStationId
                    ? stations.find(s => s.id === selectedStationId)?.name
                    : "Search and select station..."}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[500px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Search stations..." 
                    value={stationSearch}
                    onValueChange={setStationSearch}
                  />
                  {searchingStations ? (
                    <div className="p-4 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400" />
                      <p className="text-xs text-slate-500 mt-2">Loading stations...</p>
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>
                        <div className="p-4 text-center">
                          <p className="text-sm text-slate-600">No stations found matching "{stationSearch}"</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {stations.length} total stations loaded
                          </p>
                        </div>
                      </CommandEmpty>
                      <CommandGroup className="max-h-[300px] overflow-y-auto">
                        {filteredStations.map((station) => (
                          <CommandItem
                            key={station.id}
                            value={station.id}
                            onSelect={() => {
                              setSelectedStationId(station.id);
                              setStationPopoverOpen(false);
                            }}
                          >
                            <div className="flex-1">
                              <p className="font-medium text-slate-900">{station.name}</p>
                              <p className="text-xs text-slate-500">
                                {station.brand && `${station.brand} • `}
                                {station.city && station.state && `${station.city}, ${station.state}`}
                              </p>
                            </div>
                            {selectedStationId === station.id && (
                              <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </>
                  )}
                </Command>
              </PopoverContent>
            </Popover>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAction(null)}
                disabled={resolving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={handleResolve}
                disabled={!selectedStationId || resolving}
              >
                {resolving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Resolving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Resolve to Station
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Create New Station */}
        {action === 'create' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-900">New Station Details</Label>
              <Button variant="ghost" size="sm" onClick={() => setAction(null)}>
                Change Action
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="station-name">Station Name *</Label>
                <Input
                  id="station-name"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  placeholder="e.g., Shell Gas Station"
                />
              </div>

              <div>
                <Label htmlFor="station-brand">Brand (Optional)</Label>
                <Input
                  id="station-brand"
                  value={newStationBrand}
                  onChange={(e) => setNewStationBrand(e.target.value)}
                  placeholder="e.g., Shell"
                />
              </div>

              <div>
                <Label htmlFor="station-address">Address (Optional)</Label>
                <Input
                  id="station-address"
                  value={newStationAddress}
                  onChange={(e) => setNewStationAddress(e.target.value)}
                  placeholder="e.g., 123 Main St"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="station-city">City (Optional)</Label>
                  <Input
                    id="station-city"
                    value={newStationCity}
                    onChange={(e) => setNewStationCity(e.target.value)}
                    placeholder="e.g., Miami"
                  />
                </div>

                <div>
                  <Label htmlFor="station-state">State (Optional)</Label>
                  <Input
                    id="station-state"
                    value={newStationState}
                    onChange={(e) => setNewStationState(e.target.value)}
                    placeholder="e.g., FL"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAction(null)}
                disabled={resolving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700"
                onClick={handleResolve}
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
                    Create Station
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Reject Transaction */}
        {action === 'reject' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-900">Rejection Reason</Label>
              <Button variant="ghost" size="sm" onClick={() => setAction(null)}>
                Change Action
              </Button>
            </div>

            <div>
              <Label htmlFor="rejection-reason">Why is this transaction being rejected? *</Label>
              <Input
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Fraudulent entry, duplicate transaction, etc."
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAction(null)}
                disabled={resolving}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleResolve}
                disabled={!rejectionReason.trim() || resolving}
              >
                {resolving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Transaction
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}