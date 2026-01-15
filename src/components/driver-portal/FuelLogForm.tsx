import React, { useState } from 'react';
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
    liters: '',
    totalCost: '',
    notes: ''
  });

  const [paymentMethod, setPaymentMethod] = useState('reimbursement');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    let receiptUrl = '';
    if (photo) {
         try {
             const data = new FormData();
             data.append('file', photo);
             const res = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-37f42386/upload`, {
                 method: 'POST',
                 headers: { 'Authorization': `Bearer ${publicAnonKey}` },
                 body: data
             });
             const json = await res.json();
             if (json.url) receiptUrl = json.url;
         } catch (err) {
             console.error("Upload failed", err);
         }
    }

    onSubmit({
      date: formData.date,
      odometer: parseFloat(formData.odometer),
      liters: parseFloat(formData.liters),
      totalCost: parseFloat(formData.totalCost),
      notes: formData.notes,
      receiptUrl,
      paymentMethod
    });
    
    setIsUploading(false);
    onOpenChange(false);
    
    // Reset fields for next time
    setFormData({
        date: new Date().toISOString().split('T')[0],
        odometer: '',
        liters: '',
        totalCost: '',
        notes: ''
    });
    setPhoto(null);
    setPhotoPreview(null);
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  id="date" 
                  type="date" 
                  className="pl-9"
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  required 
                />
              </div>
            </div>
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
              <Label htmlFor="liters">Liters</Label>
              <Input 
                id="liters" 
                type="number" 
                step="0.01"
                placeholder="e.g. 40.5"
                value={formData.liters}
                onChange={e => setFormData({...formData, liters: e.target.value})}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Total Cost ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  id="cost" 
                  type="number" 
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

          <div className="space-y-2">
            <Label htmlFor="receipt">Receipt Photo {paymentMethod === 'reimbursement' && <span className="text-red-500">*</span>}</Label>
            <div className="flex items-center gap-4">
                <Button 
                    type="button"
                    variant="outline" 
                    className={`w-full h-24 border-dashed relative overflow-hidden ${!photoPreview && paymentMethod === 'reimbursement' ? 'border-orange-300 bg-orange-50' : ''}`}
                    onClick={() => document.getElementById('fuel-receipt-upload')?.click()}
                >
                    {photoPreview ? (
                        <div className="relative w-full h-full">
                            <ImageWithFallback 
                                src={photoPreview} 
                                alt="Receipt Preview" 
                                className="w-full h-full object-cover rounded-md opacity-80"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white font-medium">
                                <CheckCircle2 className="mr-2 h-5 w-5" />
                                Ready
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Camera className="h-6 w-6" />
                            <span>{paymentMethod === 'reimbursement' ? "Required for Reimbursement" : "Tap to Capture Receipt"}</span>
                        </div>
                    )}
                </Button>
                <Input 
                    id="fuel-receipt-upload" 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                    onChange={handlePhotoChange}
                    required={paymentMethod === 'reimbursement'}
                />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input 
                id="notes" 
                className="pl-9"
                placeholder="Station name, location, etc."
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700" disabled={isUploading}>
                {isUploading ? "Uploading..." : (paymentMethod === 'reimbursement' ? "Request Reimbursement" : "Save Log")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
