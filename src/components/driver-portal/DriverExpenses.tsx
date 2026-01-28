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
import { formatSafeDate, formatSafeTime } from '../../utils/timeUtils';
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
  onBack?: () => void;
}

type ViewState = 'list' | 'category_select' | 'odometer_scan' | 'method_select' | 'entry_details';

interface FuelEntryState {
  odometerReading?: number;
  odometerProof?: File;
  odometerMethod?: string;
  paymentMethod?: 'gas_card' | 'personal_cash';
  pricePerLiter?: string;
  isFullTank?: boolean;
  manualReason?: string;
  volume?: string; 
}

export function DriverExpenses({ defaultOpen = false, onBack }: ExpenseLoggerProps) {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [viewState, setViewState] = useState<ViewState>(defaultOpen ? 'category_select' : 'list');
  const [fuelEntry, setFuelEntry] = useState<FuelEntryState>({});
  const [tankStatus, setTankStatus] = useState<any>(null);
  
  const [isScanning, setIsScanning] = useState(false);

  const [date, setDate] = useState<Date>(new Date());
  const [time, setTime] = useState<string>(format(new Date(), 'HH:mm'));
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('Fuel');
  const [notes, setNotes] = useState('');
  const [odometer, setOdometer] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  const [merchant, setMerchant] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [plaza, setPlaza] = useState('');
  const [lane, setLane] = useState('');
  const [vehicleClass, setVehicleClass] = useState('');
  const [collector, setCollector] = useState('');
  
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
    setFuelEntry({});
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const driverIds = [
          user?.id,
          driverRecord?.id,
          driverRecord?.driverId
      ].filter(Boolean) as string[];

      const allTx = await api.getTransactions(driverIds);
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

      setIsScanning(true);
      toast.info("Analyzing receipt...", { duration: 2000 });
      
      try {
        const { data } = await api.scanReceipt(file);
        
        if (data) {
           if (data.amount) setAmount(data.amount.toString());
           
           if (data.date) {
               const parts = data.date.split('-');
               if (parts.length === 3) {
                   const y = parseInt(parts[0]);
                   const m = parseInt(parts[1]) - 1; 
                   const d = parseInt(parts[2]);
                   if (y > 2000) {
                        const localDate = new Date(y, m, d);
                        if (isValid(localDate)) {
                            setDate(localDate);
                        }
                   }
               }
           }

           if (data.time) {
                let timeStr = data.time;
                if (timeStr.length > 5) {
                    timeStr = timeStr.substring(0, 5);
                }
                setTime(timeStr);
           } else if (!data.time && data.date) {
                setTime("12:00");
           }
           
           if (data.type) {
               const t = data.type.toLowerCase();
               if (t.includes('fuel')) setCategory('Fuel');
               else if (t.includes('service') || t.includes('repair') || t.includes('maintenance')) setCategory('Maintenance');
               else if (t.includes('toll')) setCategory('Tolls');
               else setCategory('Other Expenses');
           }
           
           setMerchant(data.merchant || '');
           setPlaza(data.plaza || '');
           setLane(data.lane || '');
           setVehicleClass(data.vehicleClass || '');
           setReferenceNumber(data.receiptNumber || '');
           setCollector(data.collector || '');
           
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

    let finalAmount = 0;
    if (isFuel) {
        if (isGasCard) {
            finalAmount = 0; 
        } else {
            finalAmount = -Math.abs(parseFloat(amount || '0'));
        }
    } else {
        finalAmount = -Math.abs(parseFloat(amount || '0'));
    }

    let methodStr = 'Cash'; 
    if (isFuel) {
        methodStr = isGasCard ? 'Gas Card' : 'Cash';
    }

    const finalOdometer = isFuel ? fuelEntry.odometerReading : (odometer ? parseInt(odometer) : undefined);

    const fuelPrice = fuelEntry.pricePerLiter ? parseFloat(fuelEntry.pricePerLiter) : undefined;
    const rawAmount = Math.abs(parseFloat(amount || '0'));
    
    let calculatedVolume = fuelEntry.volume ? parseFloat(fuelEntry.volume) : undefined;
    if (isFuel && !isGasCard && fuelPrice && fuelPrice > 0) {
        calculatedVolume = Number((rawAmount / fuelPrice).toFixed(2));
    }

    const metadata = {
        plaza,
        lane,
        vehicleClass,
        collector,
        fuelVolume: calculatedVolume,
        pricePerLiter: fuelPrice,
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
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isGasCard = category === 'Fuel' && fuelEntry.paymentMethod === 'gas_card';
    
    if (!category || !date) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    if (!isGasCard && !amount) {
        toast.error("Please enter an amount");
        return;
    }

    if (category === 'Fuel' && !isGasCard) {
        const price = parseFloat(fuelEntry.pricePerLiter || '0');
        if (!fuelEntry.pricePerLiter || isNaN(price) || price <= 0) {
             toast.error("Please enter a valid fuel price");
             return;
        }
        
        if (price < 0.50) {
             toast.error("Fuel price seems too low. Please verify.");
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
        time: time ? `${time}:00` : undefined,
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

  const handleCategorySelect = async (cat: string) => {
    setCategory(cat);
    if (cat === 'Fuel') {
      setViewState('odometer_scan');
      if (driverRecord?.assignedVehicleId) {
        api.getVehicleTankStatus(driverRecord.assignedVehicleId)
          .then(setTankStatus)
          .catch(console.error);
      }
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

  const goBack = () => {
    switch (viewState) {
      case 'category_select': 
        if (defaultOpen && onBack) {
          onBack();
        } else {
          setViewState('list'); 
        }
        break;
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
                                           {formatSafeDate(tx.date, tx.time)}
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
                lastOdometer={tankStatus?.lastOdometer}
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
              <div className="space-y-4">
                <div className="space-y-2">
                    <Label>{category === 'Fuel' ? 'Gas Station name' : 'Merchant / Vendor'}</Label>
                    <Input 
                        placeholder={category === 'Fuel' ? 'e.g. Shell, Caltex, etc.' : 'e.g. Shell, mechanic, etc.'} 
                        value={merchant} 
                        onChange={e => setMerchant(e.target.value)} 
                    />
                </div>

                {category !== 'Fuel' && (
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
                )}

                {category === 'Fuel' && fuelEntry.paymentMethod === 'personal_cash' && (
                  <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Cash Spent ($)</Label>
                        <Input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                      </div>
                      
                      <FuelCashInputs 
                        pricePerLiter={fuelEntry.pricePerLiter || ''}
                        onPriceChange={(p) => setFuelEntry(prev => ({ ...prev, pricePerLiter: p }))}
                        isFullTank={fuelEntry.isFullTank || false}
                        onFullTankChange={(c) => setFuelEntry(prev => ({ ...prev, isFullTank: c }))}
                        currentVolume={(() => {
                            const amt = parseFloat(amount || '0');
                            const price = parseFloat(fuelEntry.pricePerLiter || '0');
                            if (amt > 0 && price > 0) return (amt / price).toFixed(2);
                            return '0.00';
                        })()}
                      />
                  </div>
                )}

                {category !== 'Fuel' && (
                  <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required />
                  </div>
                )}

                <ReceiptUploader 
                  preview={receiptPreview}
                  isScanning={isScanning}
                  onFileChange={handleFileChange}
                />

                <div className="space-y-2">
                  <Label>Notes (Optional)</Label>
                  <Textarea placeholder="Add details..." value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>

              <Button type="submit" className="w-full h-12 text-lg font-bold" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Expense"}
              </Button>
            </form>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
