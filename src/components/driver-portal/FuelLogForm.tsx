import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Fuel, Calendar, Hash, DollarSign, FileText } from "lucide-react";
import { FuelLog } from '../../types/data';

interface FuelLogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<FuelLog>) => void;
}

export function FuelLogForm({ open, onOpenChange, onSubmit }: FuelLogFormProps) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    odometer: '',
    liters: '',
    totalCost: '',
    notes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      date: formData.date,
      odometer: parseFloat(formData.odometer),
      liters: parseFloat(formData.liters),
      totalCost: parseFloat(formData.totalCost),
      notes: formData.notes
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 bg-orange-100 rounded-lg">
                <Fuel className="h-5 w-5 text-orange-600" />
            </div>
            <DialogTitle>Log Fuel Purchase</DialogTitle>
          </div>
          <DialogDescription>
            Record your fuel details to track efficiency and expenses.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
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
              <Label htmlFor="odometer">Odometer (km)</Label>
              <div className="relative">
                <Hash className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  id="odometer" 
                  type="number" 
                  className="pl-9"
                  placeholder="45320"
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
                placeholder="40.5"
                value={formData.liters}
                onChange={e => setFormData({...formData, liters: e.target.value})}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Total Cost</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input 
                  id="cost" 
                  type="number" 
                  step="0.01"
                  className="pl-9"
                  placeholder="65.25"
                  value={formData.totalCost}
                  onChange={e => setFormData({...formData, totalCost: e.target.value})}
                  required 
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <div className="relative">
              <FileText className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input 
                id="notes" 
                className="pl-9"
                placeholder="Shell Station, Spanish Town"
                value={formData.notes}
                onChange={e => setFormData({...formData, notes: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-orange-600 hover:bg-orange-700">Save Log</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
