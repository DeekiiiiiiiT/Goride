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
import { CalendarIcon, Clock, DollarSign, MapPin, Loader2, Route, Car } from "lucide-react";
import { format } from "date-fns";
import { ManualTripInput } from '../../utils/tripFactory';
import { LocationInput } from '../ui/LocationInput';
import { calculateRouteDistance } from '../../utils/locationService';
import { toast } from 'sonner@2.0.3';

interface ManualTripFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ManualTripInput, driverId?: string) => Promise<void>;
  isAdmin?: boolean;
  drivers?: { id: string; name: string }[];
  vehicles?: { id: string; plate: string }[];
  currentDriverId?: string; // For Admin to default select
  defaultVehicleId?: string;
}

export function ManualTripForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isAdmin = false,
  drivers = [],
  vehicles = [],
  currentDriverId,
  defaultVehicleId
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
    distance: 0,
    vehicleId: defaultVehicleId || ''
  });
  
  const [selectedDriverId, setSelectedDriverId] = useState<string>(currentDriverId || '');
  
  // Coordinates for distance calculation
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

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
        distance: 0,
        vehicleId: defaultVehicleId || ''
      });
      setPickupCoords(null);
      setDropoffCoords(null);
      if (currentDriverId) setSelectedDriverId(currentDriverId);
    }
  }, [open, currentDriverId, defaultVehicleId]);

  // Auto-calculate distance when both coords are set
  useEffect(() => {
    const calculateDistance = async () => {
      if (pickupCoords && dropoffCoords) {
        setIsCalculatingDistance(true);
        try {
          const dist = await calculateRouteDistance(pickupCoords, dropoffCoords);
          if (dist !== null) {
            setFormData(prev => ({ ...prev, distance: parseFloat(dist.toFixed(1)) }));
            toast.success(`Distance calculated: ${dist.toFixed(1)} km`);
          }
        } catch (error) {
          console.error("Failed to calculate distance", error);
        } finally {
          setIsCalculatingDistance(false);
        }
      }
    };

    calculateDistance();
  }, [pickupCoords, dropoffCoords]);

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

  const handleOpenNavigation = () => {
    if (!formData.dropoffLocation) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formData.dropoffLocation)}`;
    window.open(url, '_blank');
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

          {/* Vehicle & Distance Row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Show Vehicle Selector ONLY if Admin, or if defaultVehicleId is not set but we want to show current status */}
            {/* Since we want to hide it for drivers as per instructions: */}
            {isAdmin ? (
               <div className="space-y-2">
                 <Label>Vehicle</Label>
                 <Select 
                   value={formData.vehicleId} 
                   onValueChange={(val) => handleInputChange('vehicleId', val)}
                 >
                   <SelectTrigger>
                     <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-slate-500" />
                        <SelectValue placeholder="Select Vehicle" />
                     </div>
                   </SelectTrigger>
                   <SelectContent>
                     {vehicles.length > 0 ? (
                       vehicles.map(v => (
                         <SelectItem key={v.id} value={v.id}>{v.plate}</SelectItem>
                       ))
                     ) : (
                       <SelectItem value="none" disabled>No vehicles available</SelectItem>
                     )}
                   </SelectContent>
                 </Select>
               </div>
            ) : (
               /* Hidden field for layout balance, or just span 2 cols? Let's just render the Distance input. */
               /* Actually, we need to show Distance. If Vehicle is hidden, Distance can take full width or 1/2 width. */
               /* Let's make Distance take full width if Vehicle is hidden, or 1/2 width with empty space. */
               /* Better UX: Just show Distance. */
               <></>
            )}

            <div className={isAdmin ? "space-y-2" : "space-y-2 col-span-2"}>
              <Label className="flex items-center gap-2">
                 Distance (km)
                 {isCalculatingDistance && <Loader2 className="h-3 w-3 animate-spin text-indigo-600" />}
              </Label>
              <div className="relative">
                <Route className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                <Input 
                  type="number" 
                  min="0" 
                  step="0.1"
                  className="pl-9"
                  placeholder="0.0"
                  value={formData.distance || ''}
                  onChange={(e) => handleInputChange('distance', parseFloat(e.target.value))}
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
                 <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-emerald-500 z-10" />
                 <LocationInput 
                    placeholder="Pickup Location" 
                    className="pl-9 text-sm"
                    value={formData.pickupLocation}
                    onChange={(e) => handleInputChange('pickupLocation', e.target.value)}
                    onAddressSelect={(addr, lat, lon) => {
                      handleInputChange('pickupLocation', addr);
                      if (lat && lon) setPickupCoords({ lat, lon });
                    }}
                    showLocationButton={true}
                 />
              </div>
              <div className="relative">
                 <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-rose-500 z-10" />
                 <LocationInput 
                    placeholder="Dropoff Location" 
                    className="pl-9 text-sm"
                    value={formData.dropoffLocation}
                    onChange={(e) => handleInputChange('dropoffLocation', e.target.value)}
                    onAddressSelect={(addr, lat, lon) => {
                      handleInputChange('dropoffLocation', addr);
                      if (lat && lon) setDropoffCoords({ lat, lon });
                    }}
                    showNavigationButton={!!formData.dropoffLocation}
                    onNavigateClick={handleOpenNavigation}
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
