import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "../ui/select";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { toast } from "sonner@2.0.3";
import { Loader2, DollarSign, Wallet, ArrowRightLeft, Calendar } from "lucide-react";
import { FinancialTransaction } from '../../types/data';
import { format } from "date-fns";

interface SettlementPeriod {
  start: Date;
  end: Date;
  amountOwed: number;
  amountPaid: number;
  balance: number;
  status: string;
}

interface LogCashPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialWorkPeriodStart?: string;
  initialWorkPeriodEnd?: string;
  initialAmount?: number;
  initialTransaction?: FinancialTransaction;
  onSave: (payment: { 
    id?: string;
    amount: number; 
    date: string; 
    notes: string;
    paymentMethod: string;
    referenceNumber?: string;
    transactionType: 'payment' | 'float' | 'adjustment';
    workPeriodStart?: string;
    workPeriodEnd?: string;
  }) => Promise<void>;
  driverName: string;
  cashOwed: number;
  periods?: SettlementPeriod[];
}

export function LogCashPaymentModal({ 
    isOpen, 
    onClose, 
    onSave, 
    driverName, 
    cashOwed, 
    initialWorkPeriodStart, 
    initialWorkPeriodEnd,
    initialAmount,
    initialTransaction,
    periods = []
}: LogCashPaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [transactionType, setTransactionType] = useState<'payment' | 'float' | 'adjustment'>('payment');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [workPeriodStart, setWorkPeriodStart] = useState('');
  const [workPeriodEnd, setWorkPeriodEnd] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('general');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper: find a period key that matches a given start date ISO string
  const findPeriodKey = (startIso: string): string => {
    if (!startIso || periods.length === 0) return 'general';
    const targetDate = new Date(startIso).toISOString().split('T')[0];
    const match = periods.find(p => {
      const pDate = new Date(p.start).toISOString().split('T')[0];
      return pDate === targetDate;
    });
    return match ? new Date(match.start).toISOString() : 'general';
  };

  // Handle period dropdown change
  const handlePeriodChange = (value: string) => {
    setSelectedPeriod(value);
    if (value === 'general') {
      setWorkPeriodStart('');
      setWorkPeriodEnd('');
    } else {
      const period = periods.find(p => new Date(p.start).toISOString() === value);
      if (period) {
        setWorkPeriodStart(format(new Date(period.start), 'yyyy-MM-dd'));
        setWorkPeriodEnd(format(new Date(period.end), 'yyyy-MM-dd'));
      }
    }
  };

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      if (initialTransaction) {
        // Edit Mode
        setAmount(Math.abs(initialTransaction.amount).toFixed(2));
        setDate(new Date(initialTransaction.date).toISOString().split('T')[0]);
        setNotes(initialTransaction.description || '');
        setPaymentMethod(initialTransaction.paymentMethod || 'Cash');
        
        // Infer transaction type
        if (initialTransaction.category === 'Float Issue') {
            setTransactionType('float');
        } else if (initialTransaction.category === 'Adjustment') {
            setTransactionType('adjustment');
        } else {
            setTransactionType('payment');
        }

        setReferenceNumber(initialTransaction.referenceNumber || '');
        
        if (initialTransaction.metadata?.workPeriodStart) {
            const start = initialTransaction.metadata.workPeriodStart.split('T')[0];
            setWorkPeriodStart(start);
            setSelectedPeriod(findPeriodKey(initialTransaction.metadata.workPeriodStart));
        } else {
            setWorkPeriodStart('');
            setSelectedPeriod('general');
        }
        
        if (initialTransaction.metadata?.workPeriodEnd) {
            setWorkPeriodEnd(initialTransaction.metadata.workPeriodEnd.split('T')[0]);
        } else {
            setWorkPeriodEnd('');
        }

      } else {
        // Create Mode
        setAmount(initialAmount ? initialAmount.toFixed(2) : '');
        setDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setPaymentMethod('Cash');
        setTransactionType('payment');
        setReferenceNumber('');

        if (initialWorkPeriodStart) {
          const key = findPeriodKey(initialWorkPeriodStart);
          setSelectedPeriod(key);
          if (key !== 'general') {
            const period = periods.find(p => new Date(p.start).toISOString() === key);
            if (period) {
              setWorkPeriodStart(format(new Date(period.start), 'yyyy-MM-dd'));
              setWorkPeriodEnd(format(new Date(period.end), 'yyyy-MM-dd'));
            }
          } else {
            setWorkPeriodStart(initialWorkPeriodStart.split('T')[0]);
            setWorkPeriodEnd(initialWorkPeriodEnd ? initialWorkPeriodEnd.split('T')[0] : '');
          }
        } else {
          setSelectedPeriod('general');
          setWorkPeriodStart('');
          setWorkPeriodEnd('');
        }
      }
    }
  }, [isOpen, initialWorkPeriodStart, initialWorkPeriodEnd, initialAmount, initialTransaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if ((paymentMethod === 'Bank Transfer' || paymentMethod === 'Mobile Money') && !referenceNumber) {
      toast.error("Reference number is required for non-cash payments");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        id: initialTransaction?.id,
        amount: parseFloat(amount),
        date: date, // Keep as YYYY-MM-DD string to avoid UTC shift in constructor
        notes,
        paymentMethod,
        referenceNumber: referenceNumber || undefined,
        transactionType,
        workPeriodStart: workPeriodStart ? `${workPeriodStart}T12:00:00.000Z` : undefined,
        workPeriodEnd: workPeriodEnd ? `${workPeriodEnd}T12:00:00.000Z` : undefined,
      });
      toast.success(initialTransaction ? "Transaction updated successfully" : "Transaction recorded successfully");
      onClose();
    } catch (error) {
      toast.error(initialTransaction ? "Failed to update transaction" : "Failed to record transaction");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTransactionColor = () => {
    switch (transactionType) {
      case 'payment': return 'bg-emerald-50 border-emerald-100';
      case 'float': return 'bg-amber-50 border-amber-100';
      case 'adjustment': return 'bg-slate-50 border-slate-100';
      default: return 'bg-slate-50 border-slate-100';
    }
  };

  // Format a period for display in the dropdown
  const formatPeriodLabel = (period: SettlementPeriod): string => {
    const start = new Date(period.start);
    const end = new Date(period.end);
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  };

  const getStatusEmoji = (period: SettlementPeriod): string => {
    switch (period.status) {
      case 'Paid': return '🟢';
      case 'Overpaid': return '🟢';
      case 'Partial': return '🟡';
      case 'Unpaid': return '🔴';
      default: return '⚪';
    }
  };

  const formatPeriodSublabel = (period: SettlementPeriod): string => {
    if (period.status === 'Paid' || period.status === 'Overpaid') return 'Settled';
    if (period.status === 'Partial') return `$${period.balance.toFixed(2)} remaining`;
    return `$${period.balance.toFixed(2)} unpaid`;
  };

  // Get the currently selected period object (for the detail card)
  const selectedPeriodObj = selectedPeriod !== 'general' 
    ? periods.find(p => new Date(p.start).toISOString() === selectedPeriod) 
    : null;

  // Periods with activity, sorted most recent first (already sorted from WeeklySettlementView)
  const activePeriods = periods.filter(p => p.amountOwed > 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialTransaction ? 'Edit Transaction' : 'Log Transaction'}</DialogTitle>
          <DialogDescription>
            {initialTransaction ? 'Update financial transaction details.' : `Record a financial transaction for ${driverName}.`}
          </DialogDescription>
        </DialogHeader>
        
        <div className={`p-4 mb-2 rounded-lg border flex justify-between items-center ${getTransactionColor()}`}>
            <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Current Outstanding</p>
                <p className="text-sm text-slate-600">Owed by driver</p>
            </div>
            <div className="text-right">
                <p className="text-xl font-bold text-slate-900">${(cashOwed || 0).toFixed(2)}</p>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Transaction Type Selection */}
          <div className="space-y-3">
             <Label>Transaction Type</Label>
             <RadioGroup 
                defaultValue="payment" 
                value={transactionType} 
                onValueChange={(val) => setTransactionType(val as any)}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2"
             >
                <div className="relative">
                    <RadioGroupItem value="payment" id="type-payment" className="peer sr-only" />
                    <Label
                        htmlFor="type-payment"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-emerald-500 [&:has([data-state=checked])]:border-emerald-500 cursor-pointer text-center h-full"
                    >
                        <Wallet className="mb-2 h-4 w-4 text-emerald-600" />
                        <span className="text-xs font-medium">Receive Payment</span>
                    </Label>
                </div>
                <div className="relative">
                    <RadioGroupItem value="float" id="type-float" className="peer sr-only" />
                    <Label
                        htmlFor="type-float"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-amber-500 [&:has([data-state=checked])]:border-amber-500 cursor-pointer text-center h-full"
                    >
                        <ArrowRightLeft className="mb-2 h-4 w-4 text-amber-600" />
                        <span className="text-xs font-medium">Issue Float</span>
                    </Label>
                </div>
                <div className="relative">
                    <RadioGroupItem value="adjustment" id="type-adjustment" className="peer sr-only" />
                    <Label
                        htmlFor="type-adjustment"
                        className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-slate-500 [&:has([data-state=checked])]:border-slate-500 cursor-pointer text-center h-full"
                    >
                        <DollarSign className="mb-2 h-4 w-4 text-slate-600" />
                        <span className="text-xs font-medium">Adjustment</span>
                    </Label>
                </div>
             </RadioGroup>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="amount">Amount ($)</Label>
                <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-9"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    autoFocus
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="date">Date Received</Label>
                <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                />
            </div>
          </div>
          
          {/* Settlement Period Dropdown */}
          <div className="space-y-2">
            <Label htmlFor="settlement-period">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Apply to Settlement Period
              </span>
            </Label>
            {activePeriods.length > 0 ? (
              <select
                id="settlement-period"
                value={selectedPeriod}
                onChange={(e) => handlePeriodChange(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="general">🔵 General (Waterfall Pool)</option>
                <optgroup label="Settlement Weeks">
                  {activePeriods.map((period) => {
                    const key = new Date(period.start).toISOString();
                    const emoji = getStatusEmoji(period);
                    const label = formatPeriodLabel(period);
                    const sublabel = formatPeriodSublabel(period);
                    return (
                      <option key={key} value={key}>
                        {emoji} {label} — {sublabel}
                      </option>
                    );
                  })}
                </optgroup>
              </select>
            ) : (
              <div className="flex h-9 w-full items-center rounded-md border border-input bg-slate-50 px-3 text-sm text-slate-500">
                🔵 General (Waterfall Pool) — no settlement data yet
              </div>
            )}

            {/* Detail card when a specific period is selected */}
            {selectedPeriodObj ? (
              <div className={`rounded-lg border p-3 text-xs space-y-2 ${
                selectedPeriodObj.status === 'Paid' || selectedPeriodObj.status === 'Overpaid'
                  ? 'bg-emerald-50/60 border-emerald-200'
                  : selectedPeriodObj.status === 'Partial'
                  ? 'bg-amber-50/60 border-amber-200'
                  : 'bg-red-50/60 border-red-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">{formatPeriodLabel(selectedPeriodObj)}</span>
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    selectedPeriodObj.status === 'Paid' || selectedPeriodObj.status === 'Overpaid'
                      ? 'bg-emerald-100 text-emerald-700'
                      : selectedPeriodObj.status === 'Partial'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {getStatusEmoji(selectedPeriodObj)} {selectedPeriodObj.status}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wide">Owed</p>
                    <p className="font-semibold text-slate-700">${selectedPeriodObj.amountOwed.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wide">Paid</p>
                    <p className="font-semibold text-emerald-600">${selectedPeriodObj.amountPaid.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase tracking-wide">Balance</p>
                    <p className={`font-semibold ${selectedPeriodObj.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      ${selectedPeriodObj.balance.toFixed(2)}
                    </p>
                  </div>
                </div>
                {/* Mini progress bar */}
                {selectedPeriodObj.amountOwed > 0 && (
                  <div className="pt-0.5">
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all ${
                          selectedPeriodObj.status === 'Paid' || selectedPeriodObj.status === 'Overpaid'
                            ? 'bg-emerald-500'
                            : selectedPeriodObj.status === 'Partial'
                            ? 'bg-amber-500'
                            : 'bg-red-300'
                        }`}
                        style={{ width: `${Math.min(100, (selectedPeriodObj.amountPaid / selectedPeriodObj.amountOwed) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 leading-tight">
                Payment will be applied oldest-debt-first via the waterfall pool.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="method">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                        <SelectItem value="Check">Check</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="reference">Reference ID</Label>
                <Input
                id="reference"
                placeholder="Optional for Cash"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                disabled={paymentMethod === 'Cash'}
                />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder={transactionType === 'payment' ? "e.g. Handed over at office" : "e.g. Initial cash float for the week"}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none h-20"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button 
                type="submit" 
                disabled={isSubmitting} 
                className={transactionType === 'float' ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                initialTransaction ? 'Update Transaction' : (transactionType === 'payment' ? 'Confirm Payment' : 'Confirm Transaction')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}