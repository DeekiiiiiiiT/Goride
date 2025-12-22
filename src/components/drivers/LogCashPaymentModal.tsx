import React, { useState } from 'react';
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
import { toast } from "sonner@2.0.3";
import { Loader2, DollarSign } from "lucide-react";

interface LogCashPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payment: { amount: number; date: string; notes: string }) => Promise<void>;
  driverName: string;
  cashOwed: number;
}

export function LogCashPaymentModal({ isOpen, onClose, onSave, driverName, cashOwed }: LogCashPaymentModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        amount: parseFloat(amount),
        date: new Date(date).toISOString(),
        notes
      });
      toast.success("Payment recorded successfully");
      setAmount('');
      setNotes('');
      onClose();
    } catch (error) {
      toast.error("Failed to record payment");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log Cash Payment</DialogTitle>
          <DialogDescription>
            Record cash handed over by {driverName}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="p-4 mb-4 bg-slate-50 rounded-lg border border-slate-100 flex justify-between items-center">
            <div>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Current Balance</p>
                <p className="text-sm text-slate-600">Owed by driver</p>
            </div>
            <div className="text-right">
                <p className="text-xl font-bold text-slate-900">${cashOwed.toFixed(2)}</p>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Payment Amount ($)</Label>
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
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="e.g. Handed over at office"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Confirm Payment'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
