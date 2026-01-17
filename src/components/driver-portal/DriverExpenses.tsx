import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Badge } from "../ui/badge";
import { 
  Calendar as CalendarIcon, 
  Loader2, 
  Receipt, 
  Fuel, 
  Wrench, 
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  Ticket,
  Camera,
  X,
  ChevronLeft
} from "lucide-react";
import { format, isValid } from "date-fns";
import { cn } from "../ui/utils";
import { toast } from "sonner@2.0.3";
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { api } from '../../services/api';
import { FinancialTransaction, TransactionCategory } from '../../types/data';
import { DriverClaims } from './DriverClaims';
import { DriverFuelStats } from './DriverFuelStats';
import { PortalHome } from './views/PortalHome';
import { ReimbursementMenu } from './views/ReimbursementMenu';
import { DriverHeader } from './ui/DriverHeader';
import { PaymentMethodSelector } from './expenses/PaymentMethodSelector';
import { GasCardSummary } from './expenses/GasCardSummary';
import { FuelCashInputs } from './expenses/FuelCashInputs';
import { ReceiptUploader } from './expenses/ReceiptUploader';
import { OdometerScanner } from './common/OdometerScanner';

interface ExpenseLoggerProps {
  defaultOpen?: boolean;
}

type ViewState = 'list' | 'category_select' | 'odometer_scan' | 'method_select' | 'entry_details';

interface FuelEntryState {
  odometerReading?: number;
  odometerProof?: File;
  odometerMethod?: string;
  paymentMethod?: 'gas_card' | 'personal_cash';
  volume?: string;
  isFullTank?: boolean;
  manualReason?: string;
}

function ExpenseLogger({ defaultOpen = false }: ExpenseLoggerProps) {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Wizard State
  const [viewState, setViewState] = useState<ViewState>(defaultOpen ? 'category_select' : 'list');
  const [fuelEntry, setFuelEntry] = useState<FuelEntryState>({});
  
  const [isScanning, setIsScanning] = useState(false);

  // Form State (Shared between wizard steps or used in entry_details)
  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState<string>(format(new Date(), 'HH:mm'));
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('Fuel');
  const [notes, setNotes] = useState('');
  const [odometer, setOdometer] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  // Parsed Receipt Fields
  const [merchant, setMerchant] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [plaza, setPlaza] = useState('');
  const [lane, setLane] = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [collector, setCollector] = useState('');
  const [scannedDate, setScannedDate] = useState('');
  const [scannedTime, setScannedTime] = useState('');
  
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) fetchTransactions();
  }, [user]);

  const resetForm = () => {
    setAmount('');
    setCategory('Fuel');
    setNotes('');
    setOdometer('');
    setReceiptFile(null);
    setReceiptPreview(null);
    setDate(new Date());
    setTime(format(new Date(), 'HH:mm'));
    setMerchant('');
    setReferenceNumber('');
    setPlaza('');
    setLane('');
    setVehicleClass('');
    setCollector('');
    setScannedDate('');
    setScannedTime('');
    setFuelEntry({});
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      // Pass all relevant IDs to filter server-side
      // We explicitly check user.id and driverRecord fields
      const driverIds = [
          user?.id,
          driverRecord?.id,
          driverRecord?.driverId
      ].filter(Boolean) as string[];

      const allTx = await api.getTransactions(driverIds);
      
      // Filter for only Expenses (server handles the ID filtering now)
      const myTx = allTx.filter((t: FinancialTransaction) => 
        t.type === 'Expense'
      );
      setTransactions(myTx);
    } catch (e) {
      console.error("Failed to fetch transactions", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setReceiptPreview(e.target?.result as string);
      reader.readAsDataURL(file);

      // AI Scan
      setIsScanning(true);
      toast.info("Analyzing receipt...", { duration: 2000 });
      
      try {
        const { data } = await api.scanReceipt(file);
        
        if (data) {
           if (data.amount) setAmount(data.amount.toString());
           
           if (data.date) {
               // Handle Date - Parse as local date to avoid timezone shifts
               // "YYYY-MM-DD" -> [YYYY, MM, DD]
               const parts = data.date.split('-');
               if (parts.length === 3) {
                   const y = parseInt(parts[0]);
                   const m = parseInt(parts[1]) - 1; // Month is 0-indexed
                   const d = parseInt(parts[2]);
                   
                   // Basic validation to prevent weird years (e.g. 1900) if format is DD-MM-YYYY
                   // Assume year must be > 2000
                   if (y > 2000) {
                        const localDate = new Date(y, m, d);
                        if (isValid(localDate)) {
                            setDate(localDate);
                        }
                   }
               }
           }

           if (data.time) {
                // Handle Time - Expecting HH:MM or HH:MM:SS
                // We just need HH:MM for the input
                let timeStr = data.time;
                if (timeStr.length > 5) {
                    timeStr = timeStr.substring(0, 5);
                }
                setTime(timeStr);
           } else if (!data.time && data.date) {
                // If no time is found but date is found, default to 12:00 PM to avoid confusion
                // or keep current time? Let's default to noon if strictly scanning a receipt.
                setTime("12:00");
           }
           
           if (data.type) {
               const t = data.type.toLowerCase();
               if (t.includes('fuel')) setCategory('Fuel');
               else if (t.includes('service') || t.includes('repair') || t.includes('maintenance')) setCategory('Maintenance');
               else if (t.includes('toll')) setCategory('Tolls');
               else setCategory('Other Expenses');
           }
           
           // Populate Read-Only Fields
           setMerchant(data.merchant || '');
           setPlaza(data.plaza || '');
           setLane(data.lane || '');
           setVehicleClass(data.vehicleClass || '');
           setReferenceNumber(data.receiptNumber || '');
           setCollector(data.collector || '');
           setScannedDate(data.date || '');
           setScannedTime(data.time || '');
           
           // Any extra notes from AI
           if (data.notes) setNotes(data.notes);
           
           toast.success("Receipt details extracted!");
        }
      } catch (error) {
          console.error("Scan error:", error);
          toast.error("Could not auto-scan receipt. Please enter details manually.");
      } finally {
          setIsScanning(false);
      }
    }
  };

  const constructTransactionPayload = (
    baseTx: Partial<FinancialTransaction>, 
    receiptUrl: string, 
    odometerProofUrl: string
  ): Partial<FinancialTransaction> => {
    const isGasCard = category === 'Fuel' && fuelEntry.paymentMethod === 'gas_card';
    const isFuel = category === 'Fuel';

    // 1. Calculate Amount
    let finalAmount = 0;
    if (isFuel) {
        if (isGasCard) {
            finalAmount = 0; // Gas card transactions are tracked but not reimbursed directly
        } else {
            // Cash fuel is an expense (negative)
            finalAmount = -Math.abs(parseFloat(amount || '0'));
        }
    } else {
        // Other expenses are negative
        finalAmount = -Math.abs(parseFloat(amount || '0'));
    }

    // 2. Determine Payment Method String
    let methodStr = 'Cash'; // Default
    if (isFuel) {
        methodStr = isGasCard ? 'Gas Card' : 'Cash';
    }

    // 3. Determine Odometer
    // For Fuel, we strictly use the scanned value. For others, optional manual entry.
    const finalOdometer = isFuel ? fuelEntry.odometerReading : (odometer ? parseInt(odometer) : undefined);

    // 4. Construct Metadata
    const metadata = {
        plaza,
        lane,
        vehicleClass,
        collector,
        // Fuel Specifics
        fuelVolume: (isFuel && fuelEntry.volume) ? parseFloat(fuelEntry.volume) : undefined,
        isFullTank: (isFuel) ? fuelEntry.isFullTank : undefined,
        odometerMethod: (isFuel) ? fuelEntry.odometerMethod : undefined,
        odometerProofUrl: (isFuel) ? odometerProofUrl : undefined,
        odometerManualReason: (isFuel) ? fuelEntry.manualReason : undefined,
    };

    return {
        ...baseTx,
        amount: finalAmount,
        paymentMethod: methodStr as any,
        odometer: finalOdometer,
        metadata: metadata,
        receiptUrl: receiptUrl
    };
  };

  const parseLocalDate = (dateStr: string): Date => {
    // Parse YYYY-MM-DD manually to create a local Date at 00:00:00
    // new Date("YYYY-MM-DD") creates UTC midnight, which shifts the date when displayed locally
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isGasCard = category === 'Fuel' && fuelEntry.paymentMethod === 'gas_card';
    
    // Validation
    if (!category || !date) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    if (!isGasCard && !amount) {
        toast.error("Please enter an amount");
        return;
    }

    // specific validation for Cash Fuel
    if (category === 'Fuel' && !isGasCard) {
        if (!fuelEntry.volume) {
             toast.error("Please enter fuel volume");
             return;
        }
    }

    setIsSubmitting(true);
    try {
      let receiptUrl = '';
      if (receiptFile) {
        const uploadRes = await api.uploadFile(receiptFile);
        receiptUrl = uploadRes.url;
      }

      let odometerProofUrl = '';
      if (fuelEntry.odometerProof) {
        const uploadRes = await api.uploadFile(fuelEntry.odometerProof);
        odometerProofUrl = uploadRes.url;
      }

      const baseTx: Partial<FinancialTransaction> = {
        id: crypto.randomUUID(),
        driverId: driverRecord?.id || user?.id,
        driverName: driverRecord?.driverName || driverRecord?.name || user?.email,
        vehicleId: driverRecord?.assignedVehicleId,
        vehiclePlate: driverRecord?.assignedVehiclePlate || driverRecord?.assignedVehicleName || (driverRecord?.assignedVehicleId ? 'Assigned Vehicle' : undefined),
        date: isValid(date) ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        time: time ? `${time}:00` : (isValid(date) ? format(date, 'HH:mm:ss') : format(new Date(), 'HH:mm:ss')),
        type: 'Expense',
        category: category as TransactionCategory,
        description: notes || `${category} Expense - ${merchant || 'Unknown'}`,
        status: 'Pending',
        notes: notes,
        vendor: merchant,
        referenceNumber: referenceNumber,
      };

      const newTx = constructTransactionPayload(baseTx, receiptUrl, odometerProofUrl);

      const savedTx = await api.saveTransaction(newTx);
      
      if (savedTx.status === 'Approved') {
          toast.success("Expense Auto-Approved & Odometer Verified! 🚀");
      } else {
          toast.success("Expense submitted for approval");
      }

      setViewState('list');
      resetForm();
      fetchTransactions();

    } catch (err) {
      console.error(err);
      toast.error("Failed to submit expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Completed':
      case 'Reconciled':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1"/> Approved</Badge>;
      case 'Pending':
        return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><Clock className="w-3 h-3 mr-1"/> Pending</Badge>;
      case 'Failed':
      case 'Void':
        return <Badge className="bg-rose-100 text-rose-700 border-rose-200"><XCircle className="w-3 h-3 mr-1"/> Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch(cat) {
      case 'Fuel': return <Fuel className="h-4 w-4 text-orange-500" />;
      case 'Maintenance': return <Wrench className="h-4 w-4 text-blue-500" />;
      case 'Tolls': return <Ticket className="h-4 w-4 text-purple-500" />;
      default: return <Receipt className="h-4 w-4 text-slate-500" />;
    }
  };

  const handleCategorySelect = (cat: string) => {
    setCategory(cat);
    if (cat === 'Fuel') {
      setViewState('odometer_scan');
    } else {
      setViewState('entry_details');
    }
  };

  const handleOdometerScanComplete = (result: any) => {
    setFuelEntry(prev => ({
      ...prev,
      odometerReading: result.reading,
      odometerProof: result.photo,
      odometerMethod: result.method,
      manualReason: result.manualReason
    }));
    setViewState('method_select');
  };

  const handleMethodSelect = (method: 'gas_card' | 'personal_cash') => {
    setFuelEntry(prev => ({ ...prev, paymentMethod: method }));
    setViewState('entry_details');
  };

  const handleClearReceipt = () => {
    setReceiptFile(null);
    setReceiptPreview(null);
    if (cameraInputRef.current) {
        cameraInputRef.current.value = "";
    }
  };

  const goBack = () => {
    switch (viewState) {
      case 'category_select': setViewState('list'); break;
      case 'odometer_scan': setViewState('category_select'); break;
      case 'method_select': setViewState('odometer_scan'); break;
      case 'entry_details': 
        if (category === 'Fuel') setViewState('method_select');
        else setViewState('category_select');
        break;
      default: setViewState('list');
    }
  };

  if (viewState === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
           <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Expenses</h2>
              <p className="text-sm text-slate-500">Log your operational costs for reimbursement.</p>
           </div>
           <Button onClick={() => setViewState('category_select')}>
              <Plus className="mr-2 h-4 w-4" /> Log Expense
           </Button>
        </div>

        <div className="space-y-4">
           {loading ? (
              <div className="text-center py-10">
                 <Loader2 className="h-8 w-8 animate-spin mx-auto text-indigo-500" />
              </div>
           ) : transactions.length === 0 ? (
              <Card className="bg-slate-50 border-dashed">
                 <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                     <div className="bg-white p-4 rounded-full shadow-sm mb-3">
                         <Receipt className="h-8 w-8 text-slate-300" />
                     </div>
                     <h3 className="font-semibold text-slate-900">No expenses logged</h3>
                     <p className="text-slate-500 text-sm max-w-sm mt-1">
                        Keep track of fuel, maintenance, and other costs here. Approved expenses are deducted from your fleet fees.
                     </p>
                     <Button variant="outline" className="mt-4" onClick={() => setViewState('category_select')}>
                        Log First Expense
                     </Button>
                 </CardContent>
              </Card>
           ) : (
              <div className="grid gap-3">
                 {transactions.map(tx => (
                    <Card key={tx.id} className="overflow-hidden">
                       <CardContent className="p-0">
                          <div className="flex items-center p-4 gap-4">
                             <div className={cn(
                                 "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                                 tx.category === 'Fuel' ? "bg-orange-100" : 
                                 tx.category === 'Maintenance' ? "bg-blue-100" : 
                                 tx.category === 'Tolls' ? "bg-purple-100" : "bg-slate-100"
                             )}>
                                 {getCategoryIcon(tx.category)}
                             </div>
                             <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                   <h4 className="font-semibold text-slate-900 truncate pr-2">{tx.category}</h4>
                                   <span className="font-bold text-slate-900 text-right shrink-0">
                                      ${Math.abs(tx.amount).toFixed(2)}
                                   </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-slate-500">
                                   <div className="flex items-center gap-2">
                                       <span>
                                       {(() => {
                                           try {
                                               const timeStr = tx.time || '12:00:00';
                                               const cleanTime = timeStr.length >= 5 ? timeStr : '12:00:00';
                                               const localDate = new Date(`${tx.date}T${cleanTime}`);
                                               const validDate = !isNaN(localDate.getTime()) ? localDate : new Date(tx.date);
                                               
                                               return format(validDate, 'MMM d, yyyy');
                                           } catch (e) {
                                               return format(new Date(tx.date), 'MMM d, yyyy');
                                           }
                                       })()}
                                       </span>
                                       {tx.odometer && <span>• {tx.odometer} km</span>}
                                   </div>
                                   {getStatusBadge(tx.status)}
                                </div>
                                {tx.description && tx.description !== `${tx.category} Expense` && (
                                    <p className="text-xs text-slate-400 mt-1 truncate">{tx.description}</p>
                                )}
                             </div>
                          </div>
                       </CardContent>
                    </Card>
                 ))}
              </div>
           )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3">
         <Button variant="ghost" size="icon" onClick={goBack}>
            <ChevronLeft className="h-5 w-5" />
         </Button>
         <div>
            <h2 className="text-xl font-bold">
              {viewState === 'category_select' && "Log New Expense"}
              {viewState === 'odometer_scan' && "Scan Odometer"}
              {viewState === 'method_select' && "Payment Method"}
              {viewState === 'entry_details' && (category === 'Fuel' ? "Fuel Details" : "Expense Details")}
            </h2>
            <p className="text-xs text-slate-500">
              {category === 'Fuel' ? (
                <>Step {
                  viewState === 'category_select' ? '1' :
                  viewState === 'odometer_scan' ? '2' :
                  viewState === 'method_select' ? '3' : '4'
                } of 4</>
              ) : (
                <>Step {
                  viewState === 'category_select' ? '1' : '2'
                } of 2</>
              )}
            </p>
         </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {viewState === 'category_select' && (
            <div className="p-6 space-y-4">
              <Label className="text-base font-semibold">Select Category</Label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'Fuel', icon: Fuel, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
                  { id: 'Maintenance', icon: Wrench, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
                  { id: 'Tolls', icon: Ticket, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
                  { id: 'Other Expenses', icon: Receipt, color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
                ].map((item) => (
                  <div 
                    key={item.id}
                    className={cn(
                      "flex flex-col items-center justify-center p-6 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]",
                      category === item.id ? `${item.border} ${item.bg}` : "border-slate-100 hover:bg-slate-50"
                    )}
                    onClick={() => handleCategorySelect(item.id)}
                  >
                    <item.icon className={cn("h-8 w-8 mb-2", item.color)} />
                    <span className="text-sm font-bold">{item.id === 'Other Expenses' ? 'Other' : item.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewState === 'odometer_scan' && (
            <div className="p-0 min-h-[400px]">
              <OdometerScanner 
                onScanComplete={handleOdometerScanComplete}
                onCancel={goBack}
              />
            </div>
          )}

          {viewState === 'method_select' && (
            <PaymentMethodSelector onSelect={handleMethodSelect} />
          )}

          {viewState === 'entry_details' && (
            category === 'Fuel' && fuelEntry.paymentMethod === 'gas_card' ? (
                <GasCardSummary 
                   odometer={fuelEntry.odometerReading || 0}
                   date={date}
                   time={time}
                   isSubmitting={isSubmitting}
                   onSubmit={handleSubmit}
                />
            ) : (
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Category-specific UI will be implemented in Phases 6 & 7 */}
              {/* For now, just a placeholder to complete Phase 3 */}
              <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Merchant / Vendor</Label>
                    <Input 
                        placeholder="e.g. Shell, mechanic, etc." 
                        value={merchant} 
                        onChange={e => setMerchant(e.target.value)} 
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input 
                      type="date" 
                      value={format(date, 'yyyy-MM-dd')} 
                      onChange={(e) => {
                        if (e.target.value) {
                          setDate(parseLocalDate(e.target.value));
                        }
                      }} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>

                {category === 'Fuel' && fuelEntry.paymentMethod === 'personal_cash' && (
                  <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Amount ($)</Label>
                        <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                      </div>
                      
                      <FuelCashInputs 
                        volume={fuelEntry.volume || ''}
                        onVolumeChange={(v) => setFuelEntry(prev => ({ ...prev, volume: v }))}
                        isFullTank={fuelEntry.isFullTank || false}
                        onFullTankChange={(c) => setFuelEntry(prev => ({ ...prev, isFullTank: c }))}
                      />
                  </div>
                )}

                {category === 'Tolls' && (
                   <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Amount ($)</Label>
                        <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                      </div>

                      <div className="space-y-2">
                        <Label>Plaza / Location</Label>
                        <Input 
                            placeholder="e.g. 407 ETR / Exit 42" 
                            value={plaza} 
                            onChange={e => setPlaza(e.target.value)} 
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                             <Label>Lane</Label>
                             <Input placeholder="e.g. 4" value={lane} onChange={e => setLane(e.target.value)} />
                          </div>
                          <div className="space-y-2">
                             <Label>Collector</Label>
                             <Input placeholder="ID #" value={collector} onChange={e => setCollector(e.target.value)} />
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Vehicle Class</Label>
                            <Input placeholder="e.g. Class 2" value={vehicleClass} onChange={e => setVehicleClass(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Reference Number</Label>
                            <Input placeholder="Transaction ID" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
                        </div>
                      </div>
                   </div>
                )}

                {category !== 'Fuel' && category !== 'Tolls' && (
                  <>
                    <div className="space-y-2">
                      <Label>Amount ($)</Label>
                      <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                    </div>
                    {category === 'Maintenance' && (
                      <div className="space-y-2">
                        <Label>Odometer (km)</Label>
                        <Input 
                            type="number" 
                            placeholder="Current reading" 
                            value={odometer}
                            onChange={e => setOdometer(e.target.value)}
                        />
                      </div>
                    )}
                  </>
                )}

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    placeholder="Add details about this expense..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                <ReceiptUploader 
                    onFileSelect={handleFileChange}
                    onClear={handleClearReceipt}
                    previewUrl={receiptPreview}
                    isScanning={isScanning}
                    fileName={receiptFile?.name}
                />
              </div>

              <Button className="w-full" size="lg" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {category === 'Fuel' && fuelEntry.paymentMethod === 'gas_card' ? 'Submit Log' : 'Submit Expense'}
              </Button>
            </form>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function DriverExpenses() {
  const [currentView, setCurrentView] = useState('home');
  const [history, setHistory] = useState<string[]>(['home']);

  const navigateTo = (view: string) => {
    setCurrentView(view);
    setHistory(prev => [...prev, view]);
  };

  const handleBack = () => {
    if (history.length > 1) {
      const newHistory = [...history];
      newHistory.pop(); // Remove current
      const previous = newHistory[newHistory.length - 1];
      setHistory(newHistory);
      setCurrentView(previous);
    }
  };

  // Determine Title & Header State
  let title = "GoRide";
  let showBack = currentView !== 'home';

  if (currentView === 'menu-reimbursements') title = "Reimbursements";
  else if (currentView === 'feature-expenses') title = "Expenses";
  else if (currentView === 'feature-fuel') title = "Fuel & MPG";
  else if (currentView === 'claim-tolls') title = "Toll Refunds";
  else if (currentView === 'claim-wait') title = "Wait Time Disputes";
  else if (currentView === 'claim-cleaning') title = "Cleaning Fees";
  else if (currentView === 'claim-history' || currentView === 'menu-history') title = "History";

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      
      {/* Dynamic Header - Only show on sub-pages */}
      {currentView !== 'home' && (
        <DriverHeader 
          title={title}
          onBack={handleBack}
          showProfile={false}
        />
      )}

      <div className="flex-1">
        {currentView === 'home' && <PortalHome onNavigate={navigateTo} />}
        
        {currentView === 'menu-reimbursements' && <ReimbursementMenu onNavigate={navigateTo} />}
        
        {currentView === 'feature-expenses' && (
          <div className="p-4">
            <ExpenseLogger defaultOpen={true} />
          </div>
        )}

        {currentView === 'feature-fuel' && (
           <div className="p-4">
             <DriverFuelStats />
           </div>
        )}

        {/* Claims Deep Linking - Passed as "defaultTab" props in Phase 5 */}
        {(currentView === 'claim-tolls' || currentView === 'claim-wait' || currentView === 'claim-cleaning' || currentView === 'claim-history' || currentView === 'menu-history') && (
           <div className="p-4">
             <DriverClaims 
               hideTabs={true}
               defaultTab={
                 currentView === 'claim-tolls' ? 'tolls' : 
                 currentView === 'claim-wait' ? 'wait' : 
                 currentView === 'claim-cleaning' ? 'cleaning' : 
                 currentView === 'claim-history' || currentView === 'menu-history' ? 'history' : 
                 'tolls'
               }
             /> 
           </div>
        )}

      </div>
    </div>
  );
}
