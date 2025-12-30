import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Badge } from "../ui/badge";
import { 
  Calendar as CalendarIcon, 
  Upload, 
  Loader2, 
  Receipt, 
  Fuel, 
  Wrench, 
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Plus
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "../ui/utils";
import { toast } from "sonner@2.0.3";
import { useAuth } from '../auth/AuthContext';
import { useCurrentDriver } from '../../hooks/useCurrentDriver';
import { api } from '../../services/api';
import { FinancialTransaction, TransactionCategory } from '../../types/data';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { DriverClaims } from './DriverClaims';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

function ExpenseLogger() {
  const { user } = useAuth();
  const { driverRecord } = useCurrentDriver();
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form State
  const [date, setDate] = useState<Date>(new Date());
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('Fuel');
  const [notes, setNotes] = useState('');
  const [odometer, setOdometer] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  useEffect(() => {
    if (user) fetchTransactions();
  }, [user]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const allTx = await api.getTransactions();
      // Filter for this driver and only Expenses
      const myTx = allTx.filter((t: FinancialTransaction) => 
        (t.driverId === user?.id || t.driverId === driverRecord?.driverId) && 
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setReceiptPreview(e.target?.result as string);
      reader.readAsDataURL(file);
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
        driverId: user?.id,
        driverName: driverRecord?.name || user?.email,
        date: format(date, 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm:ss'),
        type: 'Expense',
        category: category as TransactionCategory,
        amount: -Math.abs(parseFloat(amount)), // Expenses are negative
        description: notes || `${category} Expense`,
        status: 'Pending', // Needs approval
        paymentMethod: 'Cash', // Default assumption for driver reimbursement, or create a selector
        receiptUrl: receiptUrl,
        odometer: odometer ? parseInt(odometer) : undefined,
        notes: notes
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
                <div className="grid grid-cols-3 gap-2">
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
                    <Label>Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !date && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date ? format(date, "PPP") : <span>Pick a date</span>}
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
                 <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative">
                    <input 
                       type="file" 
                       accept="image/*,.pdf" 
                       className="absolute inset-0 opacity-0 cursor-pointer"
                       onChange={handleFileChange}
                    />
                    {receiptPreview ? (
                       <div className="relative w-full h-32">
                          <img src={receiptPreview} className="h-full w-full object-contain rounded-md" alt="Receipt" />
                       </div>
                    ) : (
                       <>
                          <Upload className="h-8 w-8 text-slate-400 mb-2" />
                          <p className="text-sm text-slate-500 font-medium">Click to upload receipt</p>
                          <p className="text-xs text-slate-400">JPG, PNG, PDF up to 5MB</p>
                       </>
                    )}
                 </div>
              </div>

              <div className="space-y-2">
                 <Label>Notes</Label>
                 <Textarea 
                    placeholder="Describe the expense..."
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
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
                               tx.category === 'Maintenance' ? "bg-blue-100" : "bg-slate-100"
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
                                     <span>{format(new Date(tx.date), 'MMM d, yyyy')}</span>
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
  return (
    <div className="space-y-4">
      <Tabs defaultValue="claims" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 bg-slate-100 p-1 rounded-xl">
          <TabsTrigger value="claims" className="rounded-lg">Refund Claims</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-lg">My Expenses</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="mt-0">
          <ExpenseLogger />
        </TabsContent>

        <TabsContent value="claims" className="mt-0">
           <DriverClaims />
        </TabsContent>
      </Tabs>
    </div>
  );
}