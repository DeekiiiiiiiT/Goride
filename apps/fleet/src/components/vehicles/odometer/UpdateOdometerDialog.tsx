import React, { useState } from 'react';
import { format } from 'date-fns';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";
import { odometerService } from '../../../services/odometerService';
import { toast } from "sonner@2.0.3";

interface UpdateOdometerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vehicleId: string;
  currentReading: number;
}

export const UpdateOdometerDialog: React.FC<UpdateOdometerDialogProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess,
  vehicleId,
  currentReading
}) => {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    reading: '',
    notes: ''
  });

  const handleSubmit = async () => {
    if (!form.reading) {
      toast.error("Please enter a reading");
      return;
    }

    const readingValue = parseFloat(form.reading.replace(/[^0-9.]/g, ''));
    if (isNaN(readingValue)) {
      toast.error("Invalid reading value");
      return;
    }

    // Optional: Warn if reading is lower than current? 
    // We allow it (corrections), but maybe a warning toast is nice.
    if (readingValue < currentReading) {
       if (!confirm(`Warning: The new reading (${readingValue}) is lower than the current reading (${currentReading}). Are you sure?`)) {
         return;
       }
    }

    setLoading(true);
    try {
      await odometerService.addReading({
        vehicleId,
        date: form.date, // We might want to add time? For now date is fine.
        value: readingValue,
        type: 'Hard', // Manual updates are always hard readings
        source: 'Manual Update',
        notes: form.notes
      });
      
      toast.success("Odometer updated successfully");
      onSuccess();
      onClose();
      setForm({ date: format(new Date(), 'yyyy-MM-dd'), reading: '', notes: '' });
    } catch (error) {
      console.error(error);
      toast.error("Failed to update odometer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Odometer</DialogTitle>
          <DialogDescription>
            Record a new manual odometer reading for this vehicle.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="reading">New Reading (km)</Label>
            <Input
              id="reading"
              type="number"
              placeholder={`Current: ${currentReading}`}
              value={form.reading}
              onChange={(e) => setForm({ ...form, reading: e.target.value })}
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Reason for update..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving..." : "Update Mileage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
