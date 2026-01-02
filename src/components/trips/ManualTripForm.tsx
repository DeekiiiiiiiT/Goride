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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { CalendarIcon, Clock, DollarSign, MapPin, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ManualTripInput } from '../../utils/tripFactory';

interface ManualTripFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ManualTripInput, driverId?: string) => Promise<void>;
  isAdmin?: boolean;
  drivers?: { id: string; name: string }[];
  currentDriverId?: string; // For Admin to default select
}

export function ManualTripForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isAdmin = false,
  drivers = [],
  currentDriverId
}: ManualTripFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ManualTripInput>({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    amount: 0,
    platform: 'Cash',
    pickupLocation: '',
    dropoffLocation: '',
    notes: '',
    distance: 0
  });
  
  const [selectedDriverId, setSelectedDriverId] = useState<string>(currentDriverId || '');

  // Reset form when opened
  useEffect(() => {
    if (open) {
      setFormData({
        date: format(new Date(), 'yyyy-MM-dd'),
        time: format(new Date(), 'HH:mm'),
        amount: 0,
        platform: 'Cash',
        pickupLocation: '',
        dropoffLocation: '',
        notes: '',
        distance: 0
      });
      if (currentDriverId) setSelectedDriverId(currentDriverId);
    }
  }, [open, currentDriverId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || formData.amount <= 0) return;
    if (isAdmin && !selectedDriverId) return;

    try {
      setLoading(true);
      await onSubmit(formData, selectedDriverId);
      onOpenChange(false);
    } catch (error) {
      console.error("Form submission failed", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ManualTripInput, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Log Manual Trip</DialogTitle>
          <DialogDescription>
            Record a trip taken outside of integrated platforms (e.g. Cash, Private Client).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          
          {/* Admin: Driver Selector */}
          {isAdmin && (
            <div className="space-y-2">
              <Label>Select Driver</Label>
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Search or select a driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date & Time Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input 
                  type="date" 
                  className="pl-9"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <div className="relative">
                <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input 
                  type="time" 
                  className="pl-9"
                  value={formData.time}
                  onChange={(e) => handleInputChange('time', e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Amount & Platform Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Earnings Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-2.5 h-4 w-4 text-emerald-600" />
                <Input 
                  type="number" 
                  min="0" 
                  step="0.01"
                  className="pl-9 font-medium"
                  placeholder="0.00"
                  value={formData.amount || ''}
                  onChange={(e) => handleInputChange('amount', parseFloat(e.target.value))}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Source / Platform</Label>
              <Select 
                value={formData.platform} 
                onValueChange={(val: any) => handleInputChange('platform', val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash Trip</SelectItem>
                  <SelectItem value="Private">Private Client</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                  <SelectItem value="Uber">Uber (Manual)</SelectItem>
                  <SelectItem value="Lyft">Lyft (Manual)</SelectItem>
                  <SelectItem value="Bolt">Bolt (Manual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Locations */}
          <div className="space-y-2">
            <Label>Locations (Optional)</Label>
            <div className="grid grid-cols-1 gap-2">
              <div className="relative">
                 <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-emerald-500" />
                 <Input 
                    placeholder="Pickup Location" 
                    className="pl-9 text-sm"
                    value={formData.pickupLocation}
                    onChange={(e) => handleInputChange('pickupLocation', e.target.value)}
                 />
              </div>
              <div className="relative">
                 <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-rose-500" />
                 <Input 
                    placeholder="Dropoff Location" 
                    className="pl-9 text-sm"
                    value={formData.dropoffLocation}
                    onChange={(e) => handleInputChange('dropoffLocation', e.target.value)}
                 />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea 
              placeholder="Add details about this trip..." 
              className="h-20 resize-none"
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={loading || !formData.amount || (isAdmin && !selectedDriverId)}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Trip
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
