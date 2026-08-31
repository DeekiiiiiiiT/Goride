import React from 'react';
import { Activity, AlertTriangle, ListChecks, ShieldCheck, Tag, Unlink } from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Label } from '../../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { ImageWithFallback } from '../../figma/ImageWithFallback';
import { Vehicle } from '../../../types/vehicle';
import { api } from '../../../services/api';
import type { VehicleCatalogRecord } from '../../../types/vehicleCatalog';
import { TollClassPicker } from '../TollClassPicker';

export interface VehicleDetailHeaderProps {
  vehicle: Vehicle;
  showCatalogVerifiedBadge: boolean;
  showCatalogLinkBrokenBadge: boolean;
  linkedCatalog: VehicleCatalogRecord | null | undefined;
  setAlignModalOpen: (open: boolean) => void;
  onAssignDriver?: () => void;
  handleUnassignTag: () => void;
  onUpdate?: (vehicle: Vehicle) => void;
}

export function VehicleDetailHeader({
  vehicle,
  showCatalogVerifiedBadge,
  showCatalogLinkBrokenBadge,
  linkedCatalog,
  setAlignModalOpen,
  onAssignDriver,
  handleUnassignTag,
  onUpdate,
}: VehicleDetailHeaderProps) {
  return (
      /* --- Header Section --- */
      <div className="grid grid-cols-1 gap-6">
          <Card className="overflow-hidden border-indigo-100 shadow-sm">
             <div className="flex flex-col md:flex-row h-full">
                 <div className="md:w-1/3 relative bg-slate-100 min-h-[200px]">
                     {vehicle.image?.startsWith('figma:') ? (
                        <ImageWithFallback src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                     ) : (
                        <img src={vehicle.image} alt={vehicle.model} className="h-full w-full object-cover" />
                     )}
                     <div className="absolute top-3 left-3">
                         <Badge className={vehicle.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-500'}>
                             {vehicle.status}
                         </Badge>
                     </div>
                 </div>
                 <div className="p-6 flex-1 flex flex-col justify-between">
                     <div>
                         <div className="flex justify-between items-start">
                             <div>
                                 <div className="flex flex-wrap items-center gap-2">
                                   <h1 className="text-2xl font-bold text-slate-900">
                                     {vehicle.year} {vehicle.model}
                                   </h1>
                                   {showCatalogVerifiedBadge && (
                                     <Badge
                                       className="border-0 bg-emerald-600 text-white hover:bg-emerald-600 gap-1 font-medium shadow-sm"
                                       title={
                                         linkedCatalog
                                           ? `Linked to catalog ${linkedCatalog.make} ${linkedCatalog.model} (${vehicle.vehicle_catalog_id})`
                                           : "This vehicle is linked to a motor catalog row (verified)."
                                       }
                                     >
                                       <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                                       Catalog verified
                                       {linkedCatalog
                                         ? ` · ${linkedCatalog.make} ${linkedCatalog.model}`
                                         : ""}
                                     </Badge>
                                   )}
                                   {showCatalogLinkBrokenBadge && (
                                     <>
                                       <Badge
                                         variant="outline"
                                         className="gap-1 border-amber-500 bg-amber-50 text-amber-900 font-medium"
                                         title="The saved catalog id no longer exists (e.g. after a catalog re-import). Use Fix catalog link to pick the current row."
                                       >
                                         <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                                         Catalog link issue
                                       </Badge>
                                       <Button
                                         type="button"
                                         size="sm"
                                         className="h-8 gap-1.5 bg-amber-600 text-white shadow-sm hover:bg-amber-700"
                                         onClick={() => setAlignModalOpen(true)}
                                       >
                                         <ListChecks className="h-3.5 w-3.5" aria-hidden />
                                         Fix catalog link
                                       </Button>
                                     </>
                                   )}
                                 </div>
                                 <div className="flex items-center gap-2 mt-1">
                                     <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded text-slate-600">{vehicle.licensePlate}</span>
                                     <span className="text-sm text-slate-400">|</span>
                                     <span className="text-sm text-slate-500">VIN: {vehicle.vin}</span>
                                 </div>
                             </div>
                             <div className="text-right">
                                 <p className="text-sm text-slate-500">Lifetime Earnings</p>
                                 <p className="text-2xl font-bold text-emerald-600">${vehicle.metrics.totalLifetimeEarnings.toLocaleString()}</p>
                             </div>
                         </div>
                         
                             <div className="mt-6 flex items-center gap-4">
                                 <div className="flex items-center gap-3 bg-indigo-50 p-3 rounded-lg border border-indigo-100 pr-8">
                                     <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                                         <Activity className="h-5 w-5" />
                                     </div>
                                     <div>
                                         <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">Current Driver</p>
                                         <p className="font-medium text-slate-900">{vehicle.currentDriverName || 'Unassigned'}</p>
                                     </div>
                                     <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="ml-4 h-8 text-xs bg-white"
                                        onClick={onAssignDriver}
                                     >
                                         Change Driver
                                     </Button>
                                 </div>

                                 <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 pr-8">
                                    <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                                        <Tag className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Toll Tag</p>
                                        <p className="font-medium text-slate-900">
                                            {vehicle.tollTagId ? `${vehicle.tollTagProvider} ${vehicle.tollTagId}` : 'None Assigned'}
                                        </p>
                                    </div>
                                    {vehicle.tollTagId && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="ml-4 h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                            onClick={handleUnassignTag}
                                            title="Unlink Tag"
                                        >
                                            <Unlink className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                             </div>
                             <div className="mt-3 max-w-md">
                               <TollClassPicker
                                 value={vehicle.tollClassId || 'class1'}
                                 needsReview={!!vehicle.tollClassNeedsReview || !vehicle.tollClassId}
                                 onChange={async (classId) => {
                                   const updatedVehicle = {
                                     ...vehicle,
                                     tollClassId: classId,
                                     tollClassNeedsReview: false,
                                   };
                                   try {
                                     await api.saveVehicle(updatedVehicle);
                                     onUpdate?.(updatedVehicle);
                                     toast.success('Toll class updated');
                                   } catch (e: any) {
                                     toast.error(e?.message || 'Failed to save toll class');
                                   }
                                 }}
                               />
                             </div>
                             <div className="mt-3 max-w-lg rounded-lg border border-slate-200 bg-slate-50 p-3">
                               <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                 Jamaica fitness class
                               </p>
                               <p className="mt-1 text-xs text-slate-500">
                                 Used by Expense Hub Fitness permit rules.
                               </p>
                               <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                 <div className="space-y-1.5">
                                   <Label className="text-xs text-slate-500">Usage category</Label>
                                   <Select
                                     value={vehicle.usageCategory || 'none'}
                                     onValueChange={async (v) => {
                                       const usageCategory =
                                         v === 'none'
                                           ? undefined
                                           : (v as Vehicle['usageCategory']);
                                       const updatedVehicle = {
                                         ...vehicle,
                                         usageCategory,
                                         fitnessFirstRegistration:
                                           usageCategory === 'Commercial'
                                             ? vehicle.fitnessFirstRegistration
                                             : undefined,
                                       };
                                       try {
                                         await api.saveVehicle(updatedVehicle);
                                         onUpdate?.(updatedVehicle);
                                         toast.success('Usage category updated');
                                       } catch (e: any) {
                                         toast.error(e?.message || 'Failed to update');
                                       }
                                     }}
                                   >
                                     <SelectTrigger className="min-h-10 bg-white">
                                       <SelectValue placeholder="Not set" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       <SelectItem value="none">Not set</SelectItem>
                                       <SelectItem value="Private">Private / SUV</SelectItem>
                                       <SelectItem value="Motorcycle">Motorcycle</SelectItem>
                                       <SelectItem value="Commercial">Commercial</SelectItem>
                                       <SelectItem value="PPV">Public passenger (PPV)</SelectItem>
                                       <SelectItem value="Trailer">Trailer / heavy tractor</SelectItem>
                                     </SelectContent>
                                   </Select>
                                 </div>
                                 <div className="space-y-1.5">
                                   <Label className="text-xs text-slate-500">Plate class</Label>
                                   <Select
                                     value={vehicle.plateClass || 'none'}
                                     onValueChange={async (v) => {
                                       const updatedVehicle = {
                                         ...vehicle,
                                         plateClass:
                                           v === 'none' ? undefined : (v as Vehicle['plateClass']),
                                       };
                                       try {
                                         await api.saveVehicle(updatedVehicle);
                                         onUpdate?.(updatedVehicle);
                                         toast.success('Plate class updated');
                                       } catch (e: any) {
                                         toast.error(e?.message || 'Failed to update');
                                       }
                                     }}
                                   >
                                     <SelectTrigger className="min-h-10 bg-white">
                                       <SelectValue placeholder="Not set" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       <SelectItem value="none">Not set</SelectItem>
                                       <SelectItem value="White">White</SelectItem>
                                       <SelectItem value="Green">Green</SelectItem>
                                       <SelectItem value="Red">Red</SelectItem>
                                     </SelectContent>
                                   </Select>
                                 </div>
                               </div>
                               {vehicle.usageCategory === 'Commercial' && (
                                 <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                                   <input
                                     type="checkbox"
                                     checked={!!vehicle.fitnessFirstRegistration}
                                     onChange={async (e) => {
                                       const updatedVehicle = {
                                         ...vehicle,
                                         fitnessFirstRegistration: e.target.checked,
                                       };
                                       try {
                                         await api.saveVehicle(updatedVehicle);
                                         onUpdate?.(updatedVehicle);
                                         toast.success('First registration flag updated');
                                       } catch (err: any) {
                                         toast.error(err?.message || 'Failed to update');
                                       }
                                     }}
                                   />
                                   First registration (brand-new commercial fitness)
                                 </label>
                               )}
                             </div>
                     </div>
                 </div>
             </div>
          </Card>

      </div>
  );
}
