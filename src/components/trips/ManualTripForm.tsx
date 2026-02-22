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
import { CalendarIcon, Clock, DollarSign, MapPin, Loader2, Route, Car, WifiOff } from "lucide-react";
import { format } from "date-fns";
import { ManualTripInput } from '../../utils/tripFactory';
import { RoutePoint, TripStop } from '../../types/tripSession';
import { LocationInput } from '../ui/LocationInput';
import { calculateRouteDistance, calculatePathDistance } from '../../utils/locationService';
import { LeafletMap } from '../maps/LeafletMap';
import { StopList } from './StopList';
import { toast } from 'sonner@2.0.3';
import { useOffline } from '../providers/OfflineProvider';

interface ManualTripFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ManualTripInput, driverId?: string) => Promise<void>;
  isAdmin?: boolean;
  drivers?: { id: string; name: string }[];
  vehicles?: { id: string; plate: string }[];
  currentDriverId?: string; // For Admin to default select
  defaultVehicleId?: string;
  initialData?: {
    date?: string;
    time?: string;
    endTime?: string;
    duration?: number;
    pickupLocation?: string;
    pickupCoords?: { lat: number; lon: number };
    endLocation?: string;
    dropoffCoords?: { lat: number; lon: number };
    route?: RoutePoint[];
    stops?: TripStop[];
    totalWaitTime?: number;
    distance?: number;
    isLiveRecorded?: boolean;
    resolutionMethod?: 'instant' | 'background' | 'manual' | 'pending';
    resolutionTimestamp?: string;
    geocodeError?: string;
  };
}

export function ManualTripForm({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isAdmin = false,
  drivers = [],
  vehicles = [],
  currentDriverId,
  defaultVehicleId,
  initialData
}: ManualTripFormProps) {
  const { isOnline, addToQueue } = useOffline();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ManualTripInput>({
    date: format(new Date(), 'yyyy-MM-dd'),
    time: format(new Date(), 'HH:mm'),
    amount: 0,
    platform: 'InDrive',
    paymentMethod: 'Cash',
    pickupLocation: '',
    dropoffLocation: '',
    notes: '',
    distance: 0,
    vehicleId: defaultVehicleId || '',
    route: [],
    stops: [],
    totalWaitTime: 0,
    pickupCoords: undefined,
    dropoffCoords: undefined,
    resolutionMethod: 'manual'
  });
  
  const [selectedDriverId, setSelectedDriverId] = useState<string>(currentDriverId || '');
  
  // Coordinates for distance calculation
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [isCalculatingDistance, setIsCalculatingDistance] = useState(false);

  // Reset form when opened
  useEffect(() => {
    if (open) {
      if (initialData) {
        // Calculate distance from route points if available (more accurate for multi-stop)
        let routeDistance = 0;
        
        if (initialData.distance !== undefined) {
             routeDistance = initialData.distance;
        } else if (initialData.route && initialData.route.length > 1) {
             routeDistance = calculatePathDistance(initialData.route);
        }

        setFormData({
          date: initialData.date || format(new Date(), 'yyyy-MM-dd'),
          time: initialData.time || format(new Date(), 'HH:mm'),
          endTime: initialData.endTime,
          duration: initialData.duration,
          amount: 0,
          platform: initialData.isLiveRecorded ? 'GoRide' : 'InDrive',
          paymentMethod: 'Cash',
          pickupLocation: initialData.pickupLocation || '',
          dropoffLocation: initialData.endLocation || '',
          notes: '',
          distance: routeDistance,
          vehicleId: defaultVehicleId || '',
          route: initialData.route || [],
          stops: initialData.stops || [],
          totalWaitTime: initialData.totalWaitTime || 0,
          isLiveRecorded: initialData.isLiveRecorded,
          pickupCoords: initialData.pickupCoords,
          dropoffCoords: initialData.dropoffCoords,
          resolutionMethod: initialData.resolutionMethod,
          resolutionTimestamp: initialData.resolutionTimestamp,
          geocodeError: initialData.geocodeError
        });
        if (initialData.pickupCoords) {
          setPickupCoords(initialData.pickupCoords);
        } else {
          setPickupCoords(null);
        }
        if (initialData.dropoffCoords) {
          setDropoffCoords(initialData.dropoffCoords);
        } else {
          setDropoffCoords(null);
        }
      } else {
        setFormData({
          date: format(new Date(), 'yyyy-MM-dd'),
          time: format(new Date(), 'HH:mm'),
          amount: 0,
          platform: 'InDrive',
          paymentMethod: 'Cash',
          pickupLocation: '',
          dropoffLocation: '',
          notes: '',
          distance: 0,
          vehicleId: defaultVehicleId || '',
          route: [],
          stops: [],
          totalWaitTime: 0,
          pickupCoords: undefined,
          dropoffCoords: undefined,
          resolutionMethod: 'manual'
        });
        setPickupCoords(null);
        setDropoffCoords(null);
      }
      
      if (currentDriverId) setSelectedDriverId(currentDriverId);
    }
  }, [open, currentDriverId, defaultVehicleId, initialData]);

  // Auto-calculate distance when both coords are set
  useEffect(() => {
    const calculateDistance = async () => {
      // Skip if we have a live route (distance already calculated from track)
      if (initialData?.route && initialData.route.length > 1) return;

      if (pickupCoords && dropoffCoords) {
        setIsCalculatingDistance(true);
        try {
          const dist = await calculateRouteDistance(pickupCoords, dropoffCoords);
          if (dist !== null) {
            setFormData(prev => ({ ...prev, distance: parseFloat(dist.toFixed(2)) }));
            toast.success(`Distance calculated: ${dist.toFixed(2)} km`);
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
      
      if (!isOnline) {
        addToQueue({
          type: 'SUBMIT_TRIP',
          payload: {
            tripData: {}, 
            formData: formData,
            rawRoute: formData.route || [],
            calculatedDistance: formData.distance || 0
          }
        });
        
        toast.success("Trip saved successfully");
        onOpenChange(false);
      } else {
        await onSubmit(formData, selectedDriverId);
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Form submission failed", error);
      toast.error("Failed to save trip");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ManualTripInput, value: any) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // If manually editing location, mark as manual resolution
      if (field === 'pickupLocation' || field === 'dropoffLocation') {
        newData.resolutionMethod = 'manual';
        newData.resolutionTimestamp = new Date().toISOString();
        newData.geocodeError = undefined; // Clear error on manual fix
      }
      
      return newData;
    });
  };

  const handleOpenNavigation = () => {
    if (!formData.dropoffLocation) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formData.dropoffLocation)}`;
    window.open(url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? 'Confirm Trip Details' : 'Log Manual Trip'}</DialogTitle>
          <DialogDescription>
            {initialData ? 'Review and confirm the details of your recorded trip.' : 'Record a trip taken outside of integrated platforms (e.g. Cash, Private Client).'}
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

          {/* Date & Time Row - Only show for manual entries */}
          {!formData.isLiveRecorded && (
            <div className="space-y-4">
              {/* Date - full width */}
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
              {/* Pickup Time & Dropoff Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Pickup Time</Label>
                  <div className="relative">
                    <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-emerald-500" />
                    <Input 
                      type="time" 
                      className="pl-9"
                      value={formData.time}
                      onChange={(e) => {
                        handleInputChange('time', e.target.value);
                        // Auto-calc duration if both times set
                        if (formData.endTime && e.target.value) {
                          const [sh, sm] = e.target.value.split(':').map(Number);
                          const [eh, em] = formData.endTime.split(':').map(Number);
                          let diff = (eh * 60 + em) - (sh * 60 + sm);
                          if (diff < 0) diff += 24 * 60; // crosses midnight
                          handleInputChange('duration', diff);
                        }
                      }}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Dropoff Time</Label>
                  <div className="relative">
                    <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-rose-400" />
                    <Input 
                      type="time" 
                      className="pl-9"
                      value={formData.endTime || ''}
                      onChange={(e) => {
                        handleInputChange('endTime', e.target.value);
                        // Auto-calc duration if both times set
                        if (formData.time && e.target.value) {
                          const [sh, sm] = formData.time.split(':').map(Number);
                          const [eh, em] = e.target.value.split(':').map(Number);
                          let diff = (eh * 60 + em) - (sh * 60 + sm);
                          if (diff < 0) diff += 24 * 60; // crosses midnight
                          handleInputChange('duration', diff);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
              {/* Duration hint */}
              {formData.duration && formData.duration > 0 && (
                <p className="text-[10px] text-emerald-600 font-medium text-right -mt-2">
                  ⏱ Duration: {Math.floor(formData.duration / 60) > 0 ? `${Math.floor(formData.duration / 60)}h ` : ''}{formData.duration % 60} min
                </p>
              )}
            </div>
          )}

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

            {/* Distance Input - Hidden for Live Trips */}
            {!formData.isLiveRecorded && (
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
                    step="0.01"
                    className="pl-9"
                    placeholder="0.00"
                    value={formData.distance || ''}
                    onChange={(e) => handleInputChange('distance', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Platform & Payment Method Row */}
          <div className="grid grid-cols-2 gap-4">
            {!formData.isLiveRecorded && (
              <div className="space-y-2">
                <Label>Platform</Label>
                <Select 
                  value={formData.platform} 
                  onValueChange={(val: any) => handleInputChange('platform', val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="InDrive">InDrive (Manual)</SelectItem>
                    <SelectItem value="Uber">Uber (Manual)</SelectItem>
                    <SelectItem value="Lyft">Lyft (Manual)</SelectItem>
                    <SelectItem value="Bolt">Bolt (Manual)</SelectItem>
                    <SelectItem value="GoRide">GoRide (Manual)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className={formData.isLiveRecorded ? "col-span-2 space-y-2" : "space-y-2"}>
              <Label>Payment Method</Label>
              <Select 
                value={formData.paymentMethod} 
                onValueChange={(val: any) => handleInputChange('paymentMethod', val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card / Digital</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Amount Row */}
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
            {formData.paymentMethod === 'Cash' && (
              <p className="text-[10px] text-emerald-600 font-medium text-right mt-1">
                * Driver collects this amount as cash
              </p>
            )}
          </div>

          {/* Locations - Hidden for Live Trips */}
          {!formData.isLiveRecorded && (
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
                        if (lat && lon) {
                          setPickupCoords({ lat, lon });
                          handleInputChange('pickupCoords', { lat, lon });
                        }
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
                        if (lat && lon) {
                          setDropoffCoords({ lat, lon });
                          handleInputChange('dropoffCoords', { lat, lon });
                        }
                      }}
                      showNavigationButton={!!formData.dropoffLocation}
                      onNavigateClick={handleOpenNavigation}
                   />
                </div>
              </div>
            </div>
          )}

          {/* Map Visualization - Hidden for Live Trips */}
          {!formData.isLiveRecorded && ((formData.route && formData.route.length > 0) || (pickupCoords && dropoffCoords)) && (
            <div className="my-2 rounded-lg overflow-hidden border border-slate-200">
              <LeafletMap 
                route={formData.route || []} 
                startMarker={pickupCoords}
                endMarker={dropoffCoords}
                height="150px" 
              />
            </div>
          )}

          {/* Stops Summary */}
          {formData.stops && formData.stops.length > 0 && (
             <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <Label>Trip Summary</Label>
                  {formData.totalWaitTime !== undefined && formData.totalWaitTime > 0 && (
                     <div className={`text-xs font-bold px-2 py-0.5 rounded border ${formData.totalWaitTime > 120 ? 'text-red-600 bg-red-50 border-red-100' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
                        Wait: {Math.floor(formData.totalWaitTime / 60)}m {formData.totalWaitTime % 60}s
                     </div>
                  )}
                </div>
                <div className="-mt-2">
                   <StopList stops={formData.stops} />
                </div>
             </div>
          )}

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