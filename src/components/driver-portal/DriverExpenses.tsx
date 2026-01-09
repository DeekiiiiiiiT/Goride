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
  X
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

function ExpenseLogger() {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Form State
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

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const allTx = await api.getTransactions();
      // Filter for this driver and only Expenses
      const myTx = allTx.filter((t: FinancialTransaction) => 
        (t.driverId === user?.id || t.driverId === driverRecord?.id || t.driverId === driverRecord?.driverId) && 
        t.type === 'Expense'
      );
      // Sort by date desc
      myTx.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !category || !date) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      let receiptUrl = '';
      if (receiptFile) {
        const uploadRes = await api.uploadFile(receiptFile);
        receiptUrl = uploadRes.url;
      }

      const newTx: Partial<FinancialTransaction> = {
        id: crypto.randomUUID(),
        driverId: driverRecord?.id || user?.id,
        driverName: driverRecord?.driverName || driverRecord?.name || user?.email,
        vehicleId: driverRecord?.assignedVehicleId,
        vehiclePlate: driverRecord?.assignedVehiclePlate || driverRecord?.assignedVehicleName || (driverRecord?.assignedVehicleId ? 'Assigned Vehicle' : undefined),
        date: isValid(date) ? format(date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        time: time ? `${time}:00` : (isValid(date) ? format(date, 'HH:mm:ss') : format(new Date(), 'HH:mm:ss')), // Use the separate time state
        type: 'Expense',
        category: category as TransactionCategory,
        amount: -Math.abs(parseFloat(amount)), // Expenses are negative
        description: notes || `${category} Expense - ${merchant || 'Unknown'}`,
        status: 'Pending', // Needs approval
        paymentMethod: 'Cash', // Default assumption for driver reimbursement, or create a selector
        receiptUrl: receiptUrl,
        odometer: odometer ? parseInt(odometer) : undefined,
        notes: notes,
        
        // Structured Data
        vendor: merchant,
        referenceNumber: referenceNumber,
        metadata: {
            plaza,
            lane,
            vehicleClass,
            collector
        }
      };

      await api.saveTransaction(newTx);
      
      toast.success("Expense submitted for approval");
      setIsFormOpen(false);
      
      // Reset Form
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

  if (isFormOpen) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
           <h2 className="text-xl font-bold">Log New Expense</h2>
           <Button variant="ghost" onClick={() => setIsFormOpen(false)}>Cancel</Button>
        </div>

        <Card>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-6">
              
              <div className="grid gap-2">
                <Label>Expense Type</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div 
                    className={cn(
                      "flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all",
                      category === 'Fuel' ? "border-orange-500 bg-orange-50 text-orange-700" : "border-slate-200 hover:bg-slate-50"
                    )}
                    onClick={() => setCategory('Fuel')}
                  >
                    <Fuel className="h-6 w-6 mb-1" />
                    <span className="text-xs font-medium">Fuel</span>
                  </div>
                  <div 
                    className={cn(
                      "flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all",
                      category === 'Maintenance' ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 hover:bg-slate-50"
                    )}
                    onClick={() => setCategory('Maintenance')}
                  >
                    <Wrench className="h-6 w-6 mb-1" />
                    <span className="text-xs font-medium">Service</span>
                  </div>
                  <div 
                    className={cn(
                      "flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all",
                      category === 'Tolls' ? "border-purple-500 bg-purple-50 text-purple-700" : "border-slate-200 hover:bg-slate-50"
                    )}
                    onClick={() => setCategory('Tolls')}
                  >
                    <Ticket className="h-6 w-6 mb-1" />
                    <span className="text-xs font-medium">Toll</span>
                  </div>
                  <div 
                    className={cn(
                      "flex flex-col items-center justify-center p-3 rounded-lg border cursor-pointer transition-all",
                      category === 'Other Expenses' ? "border-slate-500 bg-slate-50 text-slate-700" : "border-slate-200 hover:bg-slate-50"
                    )}
                    onClick={() => setCategory('Other Expenses')}
                  >
                    <Receipt className="h-6 w-6 mb-1" />
                    <span className="text-xs font-medium">Other</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                    <Label>Date & Time</Label>
                    <div className="flex gap-2">
                        <Popover>
                        <PopoverTrigger asChild>
                            <Button
                            variant={"outline"}
                            className={cn(
                                "w-full justify-start text-left font-normal",
                                !date && "text-muted-foreground"
                            )}
                            >
                            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                            <span className="truncate">
                                {date ? format(date, "MMM d, yyyy") : "Pick a date"}
                            </span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                            mode="single"
                            selected={date}
                            onSelect={(d) => d && setDate(d)}
                            initialFocus
                            />
                        </PopoverContent>
                        </Popover>
                        <Input 
                            type="time" 
                            className="w-[110px]"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                        />
                    </div>
                 </div>
                 <div className="space-y-2">
                    <Label>Amount ($)</Label>
                    <Input 
                        type="number" 
                        placeholder="0.00" 
                        step="0.01" 
                        min="0"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        required
                    />
                 </div>
              </div>

              {category === 'Fuel' || category === 'Maintenance' ? (
                  <div className="space-y-2">
                    <Label>Odometer (km)</Label>
                    <Input 
                        type="number" 
                        placeholder="Current reading" 
                        value={odometer}
                        onChange={e => setOdometer(e.target.value)}
                    />
                  </div>
              ) : null}

              <div className="space-y-2">
                 <Label>Receipt / Photo</Label>
                 
                 {isScanning ? (
                    <div className="border-2 border-dashed border-indigo-200 bg-indigo-50 rounded-lg p-8 flex flex-col items-center justify-center h-40">
                        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-3" />
                        <p className="text-sm text-indigo-700 font-semibold">Analyzing receipt...</p>
                        <p className="text-xs text-indigo-500 mt-1">Extracting merchant & amount</p>
                    </div>
                 ) : receiptPreview ? (
                    <div className="relative border rounded-lg overflow-hidden bg-slate-100 h-48 group">
                       <img src={receiptPreview} className="h-full w-full object-contain" alt="Receipt" />
                       <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Button 
                             variant="destructive" 
                             size="sm" 
                             onClick={(e) => {
                                 e.preventDefault();
                                 setReceiptFile(null);
                                 setReceiptPreview(null);
                                 setAmount('');
                                 setNotes('');
                                 setTime(format(new Date(), 'HH:mm'));
                                 setMerchant('');
                                 setReferenceNumber('');
                                 setPlaza('');
                                 setLane('');
                                 setVehicleClass('');
                                 setCollector('');
                                 setScannedDate('');
                                 setScannedTime('');
                             }}
                          >
                             <X className="h-4 w-4 mr-2" /> Remove
                          </Button>
                       </div>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1">
                        <div 
                            onClick={() => cameraInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all cursor-pointer h-32"
                        >
                             <Camera className="h-8 w-8 text-slate-400 mb-2" />
                             <span className="text-sm font-medium text-slate-600">Scan Receipt</span>
                             <span className="text-[10px] text-slate-400 mt-1">Use Camera</span>
                        </div>

                        <input 
                           type="file"
                           ref={cameraInputRef}
                           accept="image/*"
                           capture="environment"
                           className="hidden"
                           onChange={handleFileChange}
                        />
                    </div>
                 )
                }
              </div>

              {receiptPreview && (
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                      <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Receipt Details (Read Only)</Label>
                      
                      <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                              <Label className="text-xs">Merchant</Label>
                              <Input value={merchant} readOnly className="bg-slate-50 text-slate-700" placeholder="-" />
                          </div>
                          <div className="space-y-1">
                              <Label className="text-xs">Date / Time</Label>
                              <Input 
                                value={scannedDate && scannedTime ? `${scannedDate} ${scannedTime}` : scannedDate || scannedTime || '-'} 
                                readOnly 
                                className="bg-slate-50 text-slate-700" 
                                placeholder="-" 
                              />
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                              <Label className="text-xs">Ref / Invoice</Label>
                              <Input value={referenceNumber} readOnly className="bg-slate-50 text-slate-700" placeholder="-" />
                          </div>
                          <div className="space-y-1">
                              <Label className="text-xs">Plaza / Location</Label>
                              <Input value={plaza} readOnly className="bg-slate-50 text-slate-700" placeholder="-" />
                          </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                              <Label className="text-xs">Lane</Label>
                              <Input value={lane} readOnly className="bg-slate-50 text-slate-700" placeholder="-" />
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                              <Label className="text-xs">Class</Label>
                              <Input value={vehicleClass} readOnly className="bg-slate-50 text-slate-700" placeholder="-" />
                          </div>
                          <div className="space-y-1">
                              <Label className="text-xs">Collector</Label>
                              <Input value={collector} readOnly className="bg-slate-50 text-slate-700" placeholder="-" />
                          </div>
                      </div>
                  </div>
              )}

              <div className="space-y-2">
                 <Label>Additional Notes</Label>
                 <Textarea 
                    placeholder={isScanning ? "AI is writing details..." : "Describe the expense (or scan receipt to auto-fill)..."}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    disabled={isScanning}
                 />
              </div>

            </CardContent>
            <CardFooter className="pt-0">
               <Button className="w-full" size="lg" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Submit Expense
               </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
         <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Expenses</h2>
            <p className="text-sm text-slate-500">Log your operational costs for reimbursement.</p>
         </div>
         <Button onClick={() => setIsFormOpen(true)}>
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
                   <Button variant="outline" className="mt-4" onClick={() => setIsFormOpen(true)}>
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
            <ExpenseLogger />
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
