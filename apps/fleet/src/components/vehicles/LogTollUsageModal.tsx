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
import { Loader2, DollarSign, MinusCircle } from "lucide-react";
import { api } from '../../services/api';

interface LogTollUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleName: string;
  tollTagId?: string; // Visible ID
  tollTagUuid?: string; // Internal UUID
  currentBalance: number;
  onSuccess: () => void;
}

export function LogTollUsageModal({ 
  isOpen, 
  onClose, 
  vehicleId, 
  vehicleName, 
  tollTagId,
  tollTagUuid,
  currentBalance,
  onSuccess 
}: LogTollUsageModalProps) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [location, setLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create the usage transaction
      // We store it as a negative amount in the ledger to show it's a deduction, 
      // but categorize it as 'Toll Usage' so we can distinguish it from 'Expense' (Top-up).
      // Or, if we view Top-up as Expense, Usage should ideally be just a tracking record.
      // However, to keep the "Toll Balance" math consistent:
      // Top-up = +Credit (In Tag Ledger)
      // Usage = -Debit (In Tag Ledger)
      // The main "Transactions" table is somewhat hybrid. 
      // We will save it with 'Toll Usage' category.
      
      await api.saveTransaction({
        date: new Date(date).toISOString(),
        amount: -parseFloat(amount), // Deduction is negative
        type: 'Usage', // Distinct from 'Expense'
        category: 'Toll Usage',
        description: location || `Toll Passage - ${vehicleName}`,
        vehicleId: vehicleId,
        vehiclePlate: vehicleName,
        paymentMethod: 'Tag Balance',
        status: 'Completed',
        isReconciled: false,
        time: new Date().toLocaleTimeString(),
        metadata: {
            tollTagId: tollTagId,
            tollTagUuid: tollTagUuid,
            location: location
        }
      });

      // 2. Update the Vehicle's Toll Balance
      // Get the latest vehicle data first to ensure we don't overwrite other changes? 
      // For now, we assume the prop passed 'currentBalance' is relatively fresh or we optimistically update.
      // Ideally we fetch, update, save.
      
      const vehicles = await api.getVehicles();
      const vehicle = vehicles.find((v: any) => v.id === vehicleId);
      
      if (vehicle) {
          const newBalance = (vehicle.tollBalance || 0) - parseFloat(amount);
          await api.saveVehicle({
              ...vehicle,
              tollBalance: newBalance
          });
      }

      toast.success("Toll usage recorded");
      setAmount('');
      setLocation('');
      onSuccess();
      onClose();
    } catch (error) {
      toast.error("Failed to record usage");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log Toll Usage</DialogTitle>
          <DialogDescription>
            Record a toll passage for <strong>{vehicleName}</strong>. This will deduct from the tag balance.
            {tollTagId && <span className="block text-xs text-slate-500 mt-1">Tag ID: {tollTagId}</span>}
          </DialogDescription>
        </DialogHeader>
        
        <div className="p-4 mb-4 bg-amber-50 rounded-lg border border-amber-100 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <MinusCircle className="h-5 w-5" />
            </div>
            <div>
                <p className="text-sm font-medium text-slate-900">Tag Deduction</p>
                <p className="text-xs text-slate-500">Current Balance: ${currentBalance?.toLocaleString() || '0.00'}</p>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Toll Charge ($)</Label>
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
            <Label htmlFor="location">Location / Plaza (Optional)</Label>
            <Input
              id="location"
              placeholder="e.g. Portmore, Spanish Town"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
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

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-amber-600 hover:bg-amber-700 text-white">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Log Usage'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
