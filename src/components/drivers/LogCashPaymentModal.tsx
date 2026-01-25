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
import { Loader2, DollarSign, Wallet, ArrowRightLeft } from "lucide-react";
import { FinancialTransaction } from '../../types/data';

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
    initialTransaction
}: LogCashPaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [transactionType, setTransactionType] = useState<'payment' | 'float' | 'adjustment'>('payment');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [workPeriodStart, setWorkPeriodStart] = useState('');
  const [workPeriodEnd, setWorkPeriodEnd] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
            setWorkPeriodStart(initialTransaction.metadata.workPeriodStart.split('T')[0]);
        } else {
            setWorkPeriodStart('');
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
        setWorkPeriodStart(initialWorkPeriodStart ? initialWorkPeriodStart.split('T')[0] : '');
        setWorkPeriodEnd(initialWorkPeriodEnd ? initialWorkPeriodEnd.split('T')[0] : '');
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
    
    // Validate Work Period if provided
    if ((workPeriodStart && !workPeriodEnd) || (!workPeriodStart && workPeriodEnd)) {
        toast.error("Please provide both start and end dates for the work period");
        return;
    }
    
    if (workPeriodStart && workPeriodEnd && new Date(workPeriodStart) > new Date(workPeriodEnd)) {
        toast.error("Work period start date cannot be after end date");
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
        workPeriodStart: workPeriodStart ? new Date(workPeriodStart).toISOString() : undefined,
        workPeriodEnd: workPeriodEnd ? new Date(workPeriodEnd).toISOString() : undefined,
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
                <p className="text-xl font-bold text-slate-900">${cashOwed.toFixed(2)}</p>
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
          
          <div className="space-y-2">
            <Label>Work Period (Optional)</Label>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <Label htmlFor="period-start" className="text-xs text-slate-500 font-normal">Start Date</Label>
                    <Input
                        id="period-start"
                        type="date"
                        value={workPeriodStart}
                        onChange={(e) => setWorkPeriodStart(e.target.value)}
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="period-end" className="text-xs text-slate-500 font-normal">End Date</Label>
                    <Input
                        id="period-end"
                        type="date"
                        value={workPeriodEnd}
                        onChange={(e) => setWorkPeriodEnd(e.target.value)}
                    />
                </div>
            </div>
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
