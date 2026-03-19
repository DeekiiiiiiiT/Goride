import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { 
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Clock,
  DollarSign,
  Calendar,
  User,
  Car,
  MapPin,
  Fuel,
  Building2,
  Search,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  SkipForward
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../../services/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';

interface Transaction {
  id: string;
  date: string;
  amount: number;
  vendor: string;
  category: string;
  description?: string;
  driverId?: string;
  driverName?: string;
  vehicleId?: string;
  vehicleName?: string;
  status: string;
}

interface FuelLog {
  id: string;
  location: string;
  litersFilled?: number;
  odometerReading?: number;
  date: string;
  gallons?: number;
  pricePerGallon?: number;
  pricePerLiter?: number;
  totalAmount?: number;
  fuelType?: string;
  notes?: string;
}

interface ReviewItem {
  transactionId: string;
  transaction: Transaction;
  fuelLog: FuelLog | null;
  suggestedVendorName: string;
  needsResolution: boolean;
}

interface TransactionReviewWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function TransactionReviewWizard({ isOpen, onClose, onComplete }: TransactionReviewWizardProps) {
  const [loading, setLoading] = useState(true);
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'create_vendor' | 'match_station' | 'skip' | 'reject' | null>(null);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');

  const currentItem = reviewQueue[currentIndex];
  const isLastItem = currentIndex === reviewQueue.length - 1;
  const isFirstItem = currentIndex === 0;

  useEffect(() => {
    if (isOpen) {
      loadReviewQueue();
    }
  }, [isOpen]);

  const loadReviewQueue = async () => {
    setLoading(true);
    try {
      const result = await api.scanLegacyTransactions();
      if (result.success && result.preview) {
        setReviewQueue(result.preview.transactions || []);
        setCurrentIndex(0);
        setProcessedCount(0);
        
        if (result.preview.transactions.length === 0) {
          toast.info('No orphaned transactions found', {
            description: 'All transactions are already processed'
          });
        } else {
          toast.success(`Found ${result.preview.transactions.length} transactions to review`, {
            description: `Total amount: $${result.preview.totalAmountAffected.toFixed(2)}`
          });
        }
      }
    } catch (error: any) {
      console.error('Failed to load review queue:', error);
      toast.error('Failed to load transactions', {
        description: error.message || 'Please try again'
      });
    } finally {
      setLoading(false);
    }
  };

  const searchStations = async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const result = await api.searchStations(query);
      setSearchResults(result.stations || []);
    } catch (error: any) {
      console.error('Station search failed:', error);
      toast.error('Search failed', { description: error.message });
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      searchStations(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const processTransaction = async (
    action: 'create_vendor' | 'match_station' | 'skip' | 'reject',
    data?: any
  ) => {
    if (!currentItem) return;

    setProcessing(true);
    try {
      const result = await api.processMigrationTransaction(
        currentItem.transactionId,
        action,
        {
          ...data,
          resolvedBy: 'admin' // TODO: Get from auth context
        }
      );

      if (result.success) {
        toast.success(result.message, {
          duration: 2000
        });

        setProcessedCount(prev => prev + 1);

        // Move to next transaction or close if done
        if (isLastItem) {
          setTimeout(() => {
            toast.success('Review complete!', {
              description: `Processed ${processedCount + 1} transactions`,
              duration: 5000
            });
            onComplete();
            onClose();
          }, 500);
        } else {
          setCurrentIndex(prev => prev + 1);
          // Reset action selection
          setSelectedAction(null);
          setSelectedStation(null);
          setSearchQuery('');
          setSearchResults([]);
          setRejectReason('');
        }
      }
    } catch (error: any) {
      console.error('Failed to process transaction:', error);
      toast.error('Processing failed', {
        description: error.message || 'Please try again',
        duration: 5000
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleAction = (action: 'create_vendor' | 'match_station' | 'skip' | 'reject') => {
    setSelectedAction(action);

    switch (action) {
      case 'create_vendor':
        processTransaction('create_vendor', {
          vendorName: currentItem.suggestedVendorName
        });
        break;
      case 'skip':
        processTransaction('skip');
        break;
      case 'match_station':
        // Wait for station selection
        break;
      case 'reject':
        // Wait for reason input
        break;
    }
  };

  const handleMatchStation = () => {
    if (!selectedStation) return;
    processTransaction('match_station', {
      stationId: selectedStation.id
    });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    processTransaction('reject', {
      reason: rejectReason
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(Math.abs(amount));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Loading Transactions</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-3" />
              <p className="text-sm text-slate-600">Scanning for orphaned transactions...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (reviewQueue.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              All Clear!
            </DialogTitle>
            <DialogDescription>
              No orphaned transactions found. All data is already processed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <p className="font-semibold text-green-900">Your database is clean!</p>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Review Orphaned Transaction
            </DialogTitle>
            <Badge variant="outline" className="text-xs">
              {currentIndex + 1} / {reviewQueue.length}
            </Badge>
          </div>
          <DialogDescription>
            Review each transaction and decide how to handle it. You can match to an existing station, create a new vendor, skip for later, or reject.
          </DialogDescription>
        </DialogHeader>

        {currentItem && (
          <div className="space-y-4">
            {/* Progress Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / reviewQueue.length) * 100}%` }}
              />
            </div>

            {/* Transaction Header */}
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-slate-900">
                        {currentItem.transaction.vendor}
                      </h3>
                      <Badge variant="outline" className="text-xs bg-red-100 text-red-700 border-red-200">
                        Unverified
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{currentItem.transaction.description}</p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-3xl font-bold text-slate-900">
                      {formatCurrency(currentItem.transaction.amount)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{currentItem.transaction.category}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-sm pt-3 border-t border-amber-200">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Calendar className="h-4 w-4 text-slate-500" />
                    <span className="font-medium">{formatDate(currentItem.transaction.date)}</span>
                  </div>
                  {currentItem.transaction.driverName && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <User className="h-4 w-4 text-slate-500" />
                      <span className="font-medium">{currentItem.transaction.driverName}</span>
                    </div>
                  )}
                  {currentItem.transaction.vehicleName && (
                    <div className="flex items-center gap-2 text-slate-700">
                      <Car className="h-4 w-4 text-slate-500" />
                      <span className="font-medium">{currentItem.transaction.vehicleName}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Complete Fuel Log Information - ALWAYS SHOW */}
            <Card className="border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-md">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b-2 border-blue-300">
                  <Fuel className="h-5 w-5 text-blue-700" />
                  <h4 className="text-base font-bold text-blue-900">Complete Fuel Log Details</h4>
                </div>

                {currentItem.fuelLog ? (
                  <div className="space-y-4">
                    {/* Location - Primary Info */}
                    {currentItem.fuelLog.location && (
                      <div className="bg-white rounded-lg p-3 border border-blue-200">
                        <div className="flex items-start gap-3">
                          <MapPin className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Station Location</p>
                            <p className="text-base font-bold text-slate-900">{currentItem.fuelLog.location}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Key Metrics - 3 Column Grid */}
                    <div className="grid grid-cols-3 gap-3">
                      {/* Odometer */}
                      {currentItem.fuelLog.odometerReading !== undefined && currentItem.fuelLog.odometerReading !== null && (
                        <div className="bg-white rounded-lg p-3 border border-purple-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Car className="h-4 w-4 text-purple-600" />
                            <p className="text-xs font-semibold text-purple-700 uppercase">Odometer</p>
                          </div>
                          <p className="text-lg font-bold text-slate-900">
                            {currentItem.fuelLog.odometerReading.toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-500">km</p>
                        </div>
                      )}

                      {/* Gallons */}
                      {currentItem.fuelLog.gallons !== undefined && currentItem.fuelLog.gallons !== null && (
                        <div className="bg-white rounded-lg p-3 border border-blue-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Fuel className="h-4 w-4 text-blue-600" />
                            <p className="text-xs font-semibold text-blue-700 uppercase">Gallons</p>
                          </div>
                          <p className="text-lg font-bold text-slate-900">
                            {currentItem.fuelLog.gallons}
                          </p>
                          <p className="text-xs text-slate-500">gal</p>
                        </div>
                      )}

                      {/* Liters */}
                      {currentItem.fuelLog.litersFilled !== undefined && currentItem.fuelLog.litersFilled !== null && (
                        <div className="bg-white rounded-lg p-3 border border-blue-200">
                          <div className="flex items-center gap-2 mb-1">
                            <Fuel className="h-4 w-4 text-blue-600" />
                            <p className="text-xs font-semibold text-blue-700 uppercase">Liters</p>
                          </div>
                          <p className="text-lg font-bold text-slate-900">
                            {currentItem.fuelLog.litersFilled}
                          </p>
                          <p className="text-xs text-slate-500">L</p>
                        </div>
                      )}
                    </div>

                    {/* Pricing Information - 2 Column Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Price Per Gallon */}
                      {currentItem.fuelLog.pricePerGallon !== undefined && currentItem.fuelLog.pricePerGallon !== null && (
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <div className="flex items-center gap-2 mb-1">
                            <DollarSign className="h-4 w-4 text-green-600" />
                            <p className="text-xs font-semibold text-green-700 uppercase">Price/Gallon</p>
                          </div>
                          <p className="text-lg font-bold text-green-900">
                            {formatCurrency(currentItem.fuelLog.pricePerGallon)}
                          </p>
                        </div>
                      )}

                      {/* Price Per Liter */}
                      {currentItem.fuelLog.pricePerLiter !== undefined && currentItem.fuelLog.pricePerLiter !== null && (
                        <div className="bg-white rounded-lg p-3 border border-green-200">
                          <div className="flex items-center gap-2 mb-1">
                            <DollarSign className="h-4 w-4 text-green-600" />
                            <p className="text-xs font-semibold text-green-700 uppercase">Price/Liter</p>
                          </div>
                          <p className="text-lg font-bold text-green-900">
                            {formatCurrency(currentItem.fuelLog.pricePerLiter)}
                          </p>
                        </div>
                      )}

                      {/* Total Amount Paid */}
                      {currentItem.fuelLog.totalAmount !== undefined && currentItem.fuelLog.totalAmount !== null && (
                        <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-lg p-3 border-2 border-green-300 col-span-2">
                          <div className="flex items-center gap-2 mb-1">
                            <DollarSign className="h-5 w-5 text-green-700" />
                            <p className="text-xs font-bold text-green-800 uppercase tracking-wide">Total Amount Paid</p>
                          </div>
                          <p className="text-2xl font-bold text-green-900">
                            {formatCurrency(currentItem.fuelLog.totalAmount)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Additional Details */}
                    <div className="space-y-2">
                      {/* Fuel Type */}
                      {currentItem.fuelLog.fuelType && (
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                          <div className="flex items-center gap-2">
                            <Fuel className="h-4 w-4 text-slate-600" />
                            <p className="text-xs font-semibold text-slate-600 uppercase">Fuel Type:</p>
                            <p className="text-sm font-bold text-slate-900">{currentItem.fuelLog.fuelType}</p>
                          </div>
                        </div>
                      )}

                      {/* Log Date if different */}
                      {currentItem.fuelLog.date && currentItem.fuelLog.date !== currentItem.transaction.date && (
                        <div className="bg-white rounded-lg p-3 border border-slate-200">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-slate-600" />
                            <p className="text-xs font-semibold text-slate-600 uppercase">Fuel Log Date:</p>
                            <p className="text-sm font-bold text-slate-900">{formatDate(currentItem.fuelLog.date)}</p>
                          </div>
                        </div>
                      )}

                      {/* Driver Notes */}
                      {currentItem.fuelLog.notes && (
                        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-xs font-semibold text-amber-800 uppercase mb-1">Driver Notes</p>
                              <p className="text-sm text-amber-900 italic leading-relaxed">"{currentItem.fuelLog.notes}"</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Raw Data Display - for debugging */}
                    <details className="bg-slate-100 rounded-lg p-3 border border-slate-300">
                      <summary className="text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-900">
                        View Raw Fuel Log Data (Debug)
                      </summary>
                      <pre className="text-xs text-slate-700 mt-2 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(currentItem.fuelLog, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg p-6 border border-amber-300 text-center">
                    <AlertTriangle className="h-8 w-8 text-amber-600 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-amber-900">No Fuel Log Attached</p>
                    <p className="text-xs text-amber-700 mt-1">This transaction has no associated fuel entry log</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            {!selectedAction && (
              <div className="space-y-3">
                <h4 className="font-semibold text-slate-900 text-sm">How do you want to handle this?</h4>
                
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-start gap-2 hover:border-indigo-300 hover:bg-indigo-50"
                    onClick={() => handleAction('create_vendor')}
                    disabled={processing}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-indigo-600" />
                      <span className="font-semibold text-sm">Create Unverified Vendor</span>
                    </div>
                    <span className="text-xs text-slate-600 text-left">
                      Add "{currentItem.suggestedVendorName}" to review queue for later station matching
                    </span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-start gap-2 hover:border-green-300 hover:bg-green-50"
                    onClick={() => setSelectedAction('match_station')}
                    disabled={processing}
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="font-semibold text-sm">Match to Station</span>
                    </div>
                    <span className="text-xs text-slate-600 text-left">
                      Link directly to an existing verified station
                    </span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-start gap-2 hover:border-slate-300 hover:bg-slate-50"
                    onClick={() => handleAction('skip')}
                    disabled={processing}
                  >
                    <div className="flex items-center gap-2">
                      <SkipForward className="h-4 w-4 text-slate-600" />
                      <span className="font-semibold text-sm">Skip for Now</span>
                    </div>
                    <span className="text-xs text-slate-600 text-left">
                      Defer this transaction to review later
                    </span>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-start gap-2 hover:border-red-300 hover:bg-red-50"
                    onClick={() => setSelectedAction('reject')}
                    disabled={processing}
                  >
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="font-semibold text-sm">Reject as Invalid</span>
                    </div>
                    <span className="text-xs text-slate-600 text-left">
                      Mark as invalid and flag for review
                    </span>
                  </Button>
                </div>
              </div>
            )}

            {/* Match Station Interface */}
            {selectedAction === 'match_station' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900 text-sm">Search for Station</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedAction(null);
                      setSelectedStation(null);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search stations by name, brand, or address..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {searching && (
                  <div className="text-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600 mx-auto" />
                  </div>
                )}

                {!searching && searchResults.length > 0 && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto border border-slate-200 rounded-lg p-3">
                    {searchResults.map((station) => (
                      <Card
                        key={station.id}
                        className={`cursor-pointer transition-all ${
                          selectedStation?.id === station.id
                            ? 'border-indigo-300 bg-indigo-50'
                            : 'hover:border-slate-300'
                        }`}
                        onClick={() => setSelectedStation(station)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h5 className="font-semibold text-slate-900 text-sm">{station.name}</h5>
                              <p className="text-xs text-slate-600 mt-1">{station.address}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {station.brand}
                                </Badge>
                              </div>
                            </div>
                            {selectedStation?.id === station.id && (
                              <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {!searching && searchQuery && searchResults.length === 0 && (
                  <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-amber-700">No stations found for "{searchQuery}"</p>
                    </CardContent>
                  </Card>
                )}

                {selectedStation && (
                  <Button
                    onClick={handleMatchStation}
                    disabled={processing}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {processing ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Matching...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Match to {selectedStation.name}
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Reject Interface */}
            {selectedAction === 'reject' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900 text-sm">Rejection Reason</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedAction(null);
                      setRejectReason('');
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </div>

                <Input
                  placeholder="e.g., Duplicate entry, Invalid vendor, Test data..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />

                <Button
                  onClick={handleReject}
                  disabled={processing || !rejectReason.trim()}
                  className="w-full bg-red-600 hover:bg-red-700"
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 mr-2" />
                      Confirm Rejection
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex items-center justify-between">
          <div className="text-sm text-slate-600">
            Processed: {processedCount} / {reviewQueue.length}
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                if (confirm('Are you sure you want to exit? Your progress will not be saved.')) {
                  onClose();
                }
              }}
              disabled={processing}
            >
              Exit Review
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}