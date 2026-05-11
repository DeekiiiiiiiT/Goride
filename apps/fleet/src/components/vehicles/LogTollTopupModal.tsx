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
import { Loader2, DollarSign, CreditCard } from "lucide-react";
import { api } from '../../services/api';

interface LogTollTopupModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleName: string;
  tollTagId?: string; // Visible ID
  tollTagUuid?: string; // Internal UUID
  onSuccess: () => void;
}

export function LogTollTopupModal({ 
  isOpen, 
  onClose, 
  vehicleId, 
  vehicleName, 
  tollTagId,
  tollTagUuid,
  onSuccess 
}: LogTollTopupModalProps) {
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
      // Create the transaction
      await api.saveTransaction({
        date: new Date(date).toISOString(),
        amount: -parseFloat(amount), // Expense is negative
        type: 'Expense',
        category: 'Toll Top-up',
        description: notes || `Toll Top-up for ${vehicleName}`,
        vehicleId: vehicleId,
        vehiclePlate: vehicleName, // Assuming vehicleName is plate or useful identifier
        paymentMethod: 'Bank Transfer',
        status: 'Completed',
        isReconciled: true,
        time: new Date().toLocaleTimeString(),
        // Add specific metadata if needed in notes or separate field
        metadata: {
            tollTagId: tollTagId,
            tollTagUuid: tollTagUuid
        }
      });

      // Also update the vehicle's estimated balance if we want to track that directly
      // Fetch fresh vehicle data to update balance
      const vehicles = await api.getVehicles();
      const vehicle = vehicles.find((v: any) => v.id === vehicleId);
      
      if (vehicle) {
          const newBalance = (vehicle.tollBalance || 0) + parseFloat(amount);
          await api.saveVehicle({
              ...vehicle,
              tollBalance: newBalance
          });
      }

      toast.success("Top-up recorded successfully");
      setAmount('');
      setNotes('');
      onSuccess();
      onClose();
    } catch (error) {
      toast.error("Failed to record top-up");
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Log Toll Top-up</DialogTitle>
          <DialogDescription>
            Add funds to the toll tag for <strong>{vehicleName}</strong>
            {tollTagId && <span className="block text-xs text-slate-500 mt-1">Tag ID: {tollTagId}</span>}
          </DialogDescription>
        </DialogHeader>
        
        <div className="p-4 mb-4 bg-indigo-50 rounded-lg border border-indigo-100 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                <CreditCard className="h-5 w-5" />
            </div>
            <div>
                <p className="text-sm font-medium text-slate-900">Fleet Expense</p>
                <p className="text-xs text-slate-500">This amount will be deducted from fleet earnings.</p>
            </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Top-up Amount ($)</Label>
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
            <Label htmlFor="notes">Notes / Transaction ID</Label>
            <Textarea
              id="notes"
              placeholder="e.g. TxID: 2E8A188EE5"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Log Top-up'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
