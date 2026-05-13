// cache-bust: force recompile — 2026-02-10
import React, { useState, useEffect } from 'react';
import { toast } from "sonner@2.0.3"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Checkbox } from "../ui/checkbox";
import { Badge } from "../ui/badge";
import { Fuel, Calendar, Hash, DollarSign, FileText, Camera, Upload, CheckCircle2, Info, Loader2, AlertCircle } from "lucide-react";
import { FuelLog, StationProfile, StationAlias } from '../../types/data';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { api } from '../../services/api';
import { Progress } from "../ui/progress";
import { calculateDistance, isInsideGeofence } from '../../utils/geoUtils';
import { EvidenceBridgeStatus } from './EvidenceBridgeStatus';
import { Textarea } from '../ui/textarea';
import { motion } from 'motion/react';

interface FuelLogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<FuelLog> & { 
    paymentMethod?: string;
    geofenceMetadata?: any;
    deviationReason?: string;
  }) => Promise<void> | void;
  vehicleId?: string;
}

export function FuelLogForm({ open, onOpenChange, onSubmit, vehicleId }: FuelLogFormProps) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    odometer: '',
    pricePerLiter: '',
    totalCost: '',
    notes: '',
    isFullTank: false,
    deviationReason: ''
  });

  const [paymentMethod, setPaymentMethod] = useState('reimbursement');
  const [isUploading, setIsUploading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [tankStatus, setTankStatus] = useState<{
      currentCumulative: number;
      tankCapacity: number;
      percent: number;
      status: string;
  } | null>(null);

  // Phase 3: Geofence State
  const [capturedGeo, setCapturedGeo] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    timestamp: string;
    isInside?: boolean;
    distance?: number;
    matchedStation?: string;
    matchedStationName?: string;
  } | null>(null);

  const [stations, setStations] = useState<any[]>([]);

  useEffect(() => {
      if (open) {
          if (vehicleId) {
            api.getVehicleTankStatus(vehicleId).then(setTankStatus).catch(console.error);
          }
          api.getStations().then(setStations).catch(console.error);
      }
  }, [open, vehicleId]);

  // Step 3.1 & 3.2: High-Accuracy Geolocation Trigger
  const handleOdometerScan = () => {
    setIsScanning(true);
    
    const options = {
      enableHighAccuracy: true, // Step 3.2
      timeout: 10000,           // Step 3.4
      maximumAge: 0
    };

    const onSuccess = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = position.coords;
      
      // Step 3.3: Store snapshot to prevent "movement drift"
      const snapshot = {
        lat: latitude,
        lng: longitude,
        accuracy: accuracy,
        timestamp: new Date().toISOString()
      };

      // Perform immediate geofence check against all stations
      let bestMatch: any = null;
      let minDistance = Infinity;

      stations.forEach((station: any) => {
        const check = isInsideGeofence(latitude, longitude, station);
        if (check.distance < minDistance) {
          minDistance = check.distance;
          bestMatch = {
            stationId: station.id,
            stationName: station.name,
            isInside: check.isInside,
            distance: check.distance,
            radiusAtTrigger: check.radiusUsed
          };
        }
      });

      setCapturedGeo({
        ...snapshot,
        isInside: bestMatch?.isInside || false,
        distance: bestMatch?.distance || minDistance,
        matchedStation: bestMatch?.stationId,
        matchedStationName: bestMatch?.stationName
      });

      setIsScanning(false);
      toast.success("Odometer scan verified with spatial snapshot", {
        description: bestMatch?.isInside ? "Station detected within radius." : "GPS verified outside known stations."
      });
    };

    const onError = (error: GeolocationPositionError) => {
      setIsScanning(false);
      console.error("Geolocation error:", error);
      toast.error("Failed to capture spatial snapshot", {
        description: "Please ensure GPS is enabled for transaction verification."
      });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    } else {
      setIsScanning(false);
      toast.error("Geolocation not supported by this device");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Step 4.4: Mandatory Deviation Reason
    if (capturedGeo && !capturedGeo.isInside && !formData.deviationReason) {
      toast.error("Reason for deviation required", {
        description: "Vehicle is outside the verified station radius. Please explain why."
      });
      return;
    }

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

    try {
      await onSubmit({
        date: formData.date,
        odometer: parseFloat(formData.odometer),
        liters: calculatedLiters,
        totalCost: amount,
        notes: formData.notes,
        receiptUrl: '',
        paymentMethod,
        deviationReason: formData.deviationReason,
        geofenceMetadata: capturedGeo ? {
          isInside: capturedGeo.isInside,
          distanceMeters: capturedGeo.distance,
          timestamp: capturedGeo.timestamp,
          radiusAtTrigger: 75, // Default or specific if found
          lat: capturedGeo.lat,
          lng: capturedGeo.lng,
          accuracy: capturedGeo.accuracy
        } : undefined,
        metadata: {
          pricePerLiter: price,
          isFullTank: formData.isFullTank
        }
      } as any);
    
      // Only close and reset AFTER the save succeeds
      onOpenChange(false);
    
      // Reset fields for next time
      setFormData({
          date: new Date().toISOString().split('T')[0],
          odometer: '',
          pricePerLiter: '',
          totalCost: '',
          notes: '',
          isFullTank: false,
          deviationReason: ''
      });
      setPaymentMethod('reimbursement');
      setCapturedGeo(null);
    } catch (err) {
      // Save failed — keep dialog open with data intact so driver can retry
      console.error("Fuel save failed:", err);
      toast.error("Failed to save fuel log. Your data is still here — please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-100 rounded-2xl">
                <Fuel className="h-6 w-6 text-orange-600" />
            </div>
            <div>
                <DialogTitle className="text-xl font-bold">Log Fuel Purchase</DialogTitle>
                <DialogDescription className="text-xs">
                    Record your fuel details. Reimbursements are processed weekly.
                </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Phase 4: Step 4.1/4.2/4.3 - Evidence Bridge Status */}
        {capturedGeo && (
            <EvidenceBridgeStatus 
              isInside={!!capturedGeo.isInside}
              distance={capturedGeo.distance || 0}
              accuracy={capturedGeo.accuracy || 0}
              stationName={capturedGeo.matchedStationName}
              driftThreshold={100}
            />
        )}
        
        {/* Phase 4: Tank Progress Awareness */}
        {!capturedGeo && tankStatus && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                <div className="flex justify-between items-end">
                    <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Tank Capacity</p>
                        <p className="text-sm font-bold text-slate-900">
                            {tankStatus.currentCumulative.toFixed(1)}L / {tankStatus.tankCapacity}L 
                            <span className="ml-2 text-xs font-normal text-slate-400">({tankStatus.percent}%)</span>
                        </p>
                    </div>
                    <Badge variant="outline" className={
                        tankStatus.percent > 90 ? "bg-red-50 text-red-700 border-red-100" :
                        tankStatus.percent > 75 ? "bg-orange-50 text-orange-700 border-orange-100" :
                        "bg-green-50 text-green-700 border-green-100"
                    }>
                        {tankStatus.status}
                    </Badge>
                </div>
                <Progress value={tankStatus.percent} className="h-2" />
                
                {tankStatus.percent > 80 && (
                    <div className="flex items-start gap-2 bg-orange-100/50 p-2 rounded-lg border border-orange-100">
                        <Info className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-orange-800 font-medium leading-tight">
                            Your tank is nearly full. Please mark as "Full Tank" if you filled it completely.
                        </p>
                    </div>
                )}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="odometer" className="text-sm font-semibold">Odometer (km)</Label>
                <div className="flex items-center gap-2">
                    {capturedGeo ? (
                         <Badge variant="outline" className={`text-[10px] uppercase font-bold ${capturedGeo.isInside ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                            {capturedGeo.isInside ? 'Verified at Station' : 'Forensic Drift'}
                         </Badge>
                    ) : (
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider">Awaiting Scan</span>
                    )}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Hash className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                  <Input 
                    id="odometer" 
                    type="number" 
                    inputMode="numeric"
                    className={`pl-9 h-11 text-base border-indigo-200 focus-visible:ring-indigo-500 ${capturedGeo?.isInside === false ? 'border-red-300 ring-red-50' : ''}`}
                    placeholder="e.g. 45320"
                    value={formData.odometer}
                    onChange={e => setFormData({...formData, odometer: e.target.value})}
                    required 
                  />
                </div>
                <Button 
                    type="button" 
                    variant="outline" 
                    className={`h-11 px-4 gap-2 font-bold ${capturedGeo ? (capturedGeo.isInside ? 'border-green-500 text-green-600 bg-green-50' : 'border-red-500 text-red-600 bg-red-50') : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'}`}
                    onClick={handleOdometerScan}
                    disabled={isScanning}
                >
                    {isScanning ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : capturedGeo ? (
                        <CheckCircle2 className="h-4 w-4" />
                    ) : (
                        <Camera className="h-4 w-4" />
                    )}
                    {capturedGeo ? 'Rescan' : 'Scan'}
                </Button>
              </div>

              {/* Step 4.4: Reason for Deviation */}
              {capturedGeo && !capturedGeo.isInside && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="space-y-2 pt-2"
                  >
                    <Label htmlFor="deviation" className="text-xs font-bold text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-3 w-3" />
                      MANDATORY: Why are you scanning outside the station?
                    </Label>
                    <Textarea 
                      id="deviation"
                      placeholder="e.g. GPS drift, station coordinates incorrect, emergency refueling..."
                      className="text-sm border-red-200 focus-visible:ring-red-500 min-h-[80px]"
                      value={formData.deviationReason}
                      onChange={e => setFormData({...formData, deviationReason: e.target.value})}
                      required
                    />
                  </motion.div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price" className="text-sm font-semibold">Price/Liter ($)</Label>
              <Input 
                id="price" 
                type="number" 
                inputMode="decimal"
                step="0.001"
                placeholder="0.000"
                className="h-11 text-base"
                value={formData.pricePerLiter}
                onChange={e => setFormData({...formData, pricePerLiter: e.target.value})}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost" className="text-sm font-semibold">Cash Spent ($)</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <Input 
                  id="cost" 
                  type="number" 
                  inputMode="decimal"
                  step="0.01"
                  className="pl-9 h-11 text-base"
                  placeholder="e.g. 6500.00"
                  value={formData.totalCost}
                  onChange={e => setFormData({...formData, totalCost: e.target.value})}
                  required 
                />
              </div>
            </div>
          </div>
          
          {/* Payment Method Selection */}
          <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
            <Label className="text-base font-bold">How did you pay?</Label>
            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="grid gap-3">
                
                <Label className={`flex items-start space-x-3 p-4 rounded-xl border cursor-pointer transition-all min-h-[70px] ${paymentMethod === 'reimbursement' ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <RadioGroupItem value="reimbursement" id="pm-reimbursement" className="mt-1 h-5 w-5" />
                    <div className="grid gap-1">
                        <span className="font-bold text-slate-900 dark:text-slate-100">Cash (Request Reimbursement)</span>
                        <span className="text-xs text-slate-500">I paid with my own money. Please pay me back.</span>
                    </div>
                </Label>

                <Label className={`flex items-start space-x-3 p-4 rounded-xl border cursor-pointer transition-all min-h-[70px] ${paymentMethod === 'card' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <RadioGroupItem value="card" id="pm-card" className="mt-1 h-5 w-5" />
                    <div className="grid gap-1">
                        <span className="font-bold text-slate-900 dark:text-slate-100">Fuel Card</span>
                        <span className="text-xs text-slate-500">I used the company card (Fleet/Advance Card).</span>
                    </div>
                </Label>
            </RadioGroup>
          </div>

          <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <Checkbox 
                id="full-tank" 
                className="h-5 w-5"
                checked={formData.isFullTank}
                onCheckedChange={(checked) => setFormData({...formData, isFullTank: !!checked})}
            />
            <div className="grid gap-1.5 leading-none">
                <label
                    htmlFor="full-tank"
                    className="text-sm font-bold leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                    Filled to capacity (Full Tank)
                </label>
                <p className="text-[10px] text-slate-500">
                    Resets the mathematical cumulative counter for this vehicle.
                </p>
            </div>
          </div>

          <DialogFooter className="pt-4 flex-col sm:flex-row gap-3">
            <Button type="button" variant="ghost" className="h-11 text-base w-full sm:w-auto" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="h-11 text-base w-full sm:flex-1 bg-orange-600 hover:bg-orange-700 font-bold" disabled={isUploading}>
                {isUploading ? "Processing..." : (paymentMethod === 'reimbursement' ? "Request Reimbursement" : "Save Log")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}