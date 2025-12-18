import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner@2.0.3';
import { Vehicle } from '../../types/vehicle';

interface AddVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVehicleAdded: (vehicle: Vehicle) => void;
}

export function AddVehicleModal({ isOpen, onClose, onVehicleAdded }: AddVehicleModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    licensePlate: '',
    make: '',
    model: '',
    year: new Date().getFullYear().toString(),
    status: 'Active',
    vin: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.licensePlate || !formData.make || !formData.model) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    try {
      const newVehicle: Vehicle = {
        id: formData.licensePlate, // Use plate as ID for simplicity
        licensePlate: formData.licensePlate,
        make: formData.make,
        model: formData.model,
        year: formData.year,
        vin: formData.vin || `${formData.licensePlate}-VIN`,
        status: formData.status as any,
        image: 'figma:asset/6426d17c3b251d9c214959cf1b6b0705de44c168.png', // Default placeholder
        metrics: {
            todayEarnings: 0,
            utilizationRate: 0,
            totalLifetimeEarnings: 0,
            odometer: 0,
            fuelLevel: 100,
            healthScore: 100
        },
        serviceStatus: 'OK',
        nextServiceType: 'Inspection',
        daysToService: 90
      };

      await api.saveVehicle(newVehicle);
      onVehicleAdded(newVehicle);
      toast.success("Vehicle added successfully");
      onClose();
      
      // Reset form
      setFormData({
        licensePlate: '',
        make: '',
        model: '',
        year: new Date().getFullYear().toString(),
        status: 'Active',
        vin: ''
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to add vehicle");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Vehicle</DialogTitle>
          <DialogDescription>
            Register a new vehicle to your fleet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="plate" className="text-right">
              Plate <span className="text-red-500">*</span>
            </Label>
            <Input
              id="plate"
              value={formData.licensePlate}
              onChange={(e) => setFormData({...formData, licensePlate: e.target.value.toUpperCase()})}
              className="col-span-3"
              placeholder="ABC-123"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="make" className="text-right">
              Make <span className="text-red-500">*</span>
            </Label>
            <Input
              id="make"
              value={formData.make}
              onChange={(e) => setFormData({...formData, make: e.target.value})}
              className="col-span-3"
              placeholder="Toyota"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="model" className="text-right">
              Model <span className="text-red-500">*</span>
            </Label>
            <Input
              id="model"
              value={formData.model}
              onChange={(e) => setFormData({...formData, model: e.target.value})}
              className="col-span-3"
              placeholder="Camry"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="year" className="text-right">
              Year
            </Label>
            <Input
              id="year"
              type="number"
              value={formData.year}
              onChange={(e) => setFormData({...formData, year: e.target.value})}
              className="col-span-3"
            />
          </div>
           <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="vin" className="text-right">
              VIN
            </Label>
            <Input
              id="vin"
              value={formData.vin}
              onChange={(e) => setFormData({...formData, vin: e.target.value})}
              className="col-span-3"
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">
              Status
            </Label>
            <div className="col-span-3">
                <Select 
                    value={formData.status} 
                    onValueChange={(val) => setFormData({...formData, status: val})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
            </div>
          </div>
          
          <DialogFooter>
             <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Vehicle
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}