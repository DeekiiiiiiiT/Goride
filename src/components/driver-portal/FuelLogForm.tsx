import React, { useState } from 'react';
import { toast } from "sonner@2.0.3"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Fuel, Calendar, Hash, DollarSign, FileText, Camera, Upload, CheckCircle2 } from "lucide-react";
import { FuelLog } from '../../types/data';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { ImageWithFallback } from '../figma/ImageWithFallback';

interface FuelLogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<FuelLog> & { paymentMethod?: string }) => void;
}

export function FuelLogForm({ open, onOpenChange, onSubmit }: FuelLogFormProps) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    odometer: '',
    pricePerLiter: '',
    totalCost: '',
    notes: ''
  });

  const [paymentMethod, setPaymentMethod] = useState('reimbursement');
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    const amount = parseFloat(formData.totalCost);
    const price = parseFloat(formData.pricePerLiter);

    // Validation Safeguards (Phase 5)
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid total cost");
      setIsUploading(false);
      return;
    }

    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid fuel price");
      setIsUploading(false);
      return;
    }

    if (price < 0.50) {
      toast.error("Fuel price seems too low. Please verify.");
      setIsUploading(false);
      return;
    }

    const calculatedLiters = Number((amount / price).toFixed(2));

    onSubmit({
      date: formData.date,
      odometer: parseFloat(formData.odometer),
      liters: calculatedLiters,
      totalCost: amount,
      notes: formData.notes,
      receiptUrl: '',
      paymentMethod,
      metadata: {
        pricePerLiter: price
      }
    } as any);
    
    setIsUploading(false);
    onOpenChange(false);
    
    // Reset fields for next time
    setFormData({
        date: new Date().toISOString().split('T')[0],
        odometer: '',
        pricePerLiter: '',
        totalCost: '',
        notes: ''
    });
    setPaymentMethod('reimbursement');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-orange-100 rounded-lg">
                <Fuel className="h-5 w-5 text-orange-600" />
            </div>
            <DialogTitle>Log Fuel Purchase</DialogTitle>
          </div>
          <DialogDescription>
            Record your fuel details. Reimbursements are processed weekly.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          
          {/* Payment Method Selection */}
          <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
            <Label className="text-base font-semibold">How did you pay?</Label>
            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="grid gap-3">
                
                <Label className={`flex items-start space-x-3 p-3 rounded-md border cursor-pointer transition-all ${paymentMethod === 'reimbursement' ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <RadioGroupItem value="reimbursement" id="pm-reimbursement" className="mt-1" />
                    <div className="grid gap-1">
                        <span className="font-medium text-slate-900 dark:text-slate-100">Cash (Request Reimbursement)</span>
                        <span className="text-xs text-slate-500">I paid with my own money. Please pay me back.</span>
                    </div>
                </Label>

                <Label className={`flex items-start space-x-3 p-3 rounded-md border cursor-pointer transition-all ${paymentMethod === 'card' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <RadioGroupItem value="card" id="pm-card" className="mt-1" />
                    <div className="grid gap-1">
                        <span className="font-medium text-slate-900 dark:text-slate-100">Fuel Card</span>
                        <span className="text-xs text-slate-500">I used the company card (Fleet/Advance Card).</span>
                    </div>
                </Label>

                <Label className={`flex items-start space-x-3 p-3 rounded-md border cursor-pointer transition-all ${paymentMethod === 'personal' ? 'border-slate-400 bg-slate-100 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-700'}`}>
                    <RadioGroupItem value="personal" id="pm-personal" className="mt-1" />
                    <div className="grid gap-1">
                        <span className="font-medium text-slate-900 dark:text-slate-100">Personal Expense</span>
                        <span className="text-xs text-slate-500">This was for personal use. Do not reimburse.</span>
                    </div>
                </Label>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="odometer">Odometer (km)</Label>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider">Verified Anchor</span>
              </div>
              <div className="relative">
                <Hash className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  id="odometer" 
                  type="number" 
                  inputMode="decimal"
                  className="pl-9 border-indigo-200 focus-visible:ring-indigo-500"
                  placeholder="e.g. 45320"
                  value={formData.odometer}
                  onChange={e => setFormData({...formData, odometer: e.target.value})}
                  required 
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Input 
                id="price" 
                type="number" 
                inputMode="decimal"
                step="0.001"
                placeholder="0.000"
                value={formData.pricePerLiter}
                onChange={e => setFormData({...formData, pricePerLiter: e.target.value})}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Cash Spent ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  id="cost" 
                  type="number" 
                  inputMode="decimal"
                  step="0.01"
                  className="pl-9"
                  placeholder="e.g. 6500.00"
                  value={formData.totalCost}
                  onChange={e => setFormData({...formData, totalCost: e.target.value})}
                  required 
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700" disabled={isUploading}>
                {isUploading ? "Processing..." : (paymentMethod === 'reimbursement' ? "Request Reimbursement" : "Save Log")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
