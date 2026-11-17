import React, { useState } from 'react';
import { Activity, AlertTriangle, ListChecks, ShieldCheck, Tag, Unlink } from 'lucide-react';
import { toast } from "sonner";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { VehicleColorRow, VehiclePicture } from '../add-vehicle/VehiclePicture';
import { MakerLogo } from '../find-parts/everyday/EverydayShared';
import { Vehicle } from '../../../types/vehicle';
import { api } from '../../../services/api';
import type { VehicleCatalogRecord } from '../../../types/vehicleCatalog';
import { TollClassPicker } from '../TollClassPicker';

function custodyChip(vehicle: Vehicle): { label: string; className: string } | null {
  if (!vehicle.currentDriverId) return null;
  const status = vehicle.custodyStatus || 'assigned';
  if (status === 'in_custody') {
    return { label: 'In custody', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  }
  if (status === 'handed_over') {
    return { label: 'Waiting for driver confirm', className: 'bg-amber-100 text-amber-900 border-amber-200' };
  }
  return { label: 'Assigned — awaiting handover', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
}

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
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const chip = custodyChip(vehicle);
  const canHandOver =
    Boolean(vehicle.currentDriverId) &&
    (vehicle.custodyStatus === 'assigned' || !vehicle.custodyStatus || vehicle.custodyStatus === 'none');

  const confirmHandOver = async () => {
    setHandoverBusy(true);
    try {
      const res = await api.handOverVehicle(vehicle.id);
      const updated = (res.vehicle || { ...vehicle, custodyStatus: 'handed_over' }) as Vehicle;
      onUpdate?.(updated);
      toast.success(res.already ? 'Already handed over' : 'Marked as handed over');
      setHandoverOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark handed over');
    } finally {
      setHandoverBusy(false);
    }
  };

  return (
      /* --- Header Section --- */
      <div className="grid grid-cols-1 gap-6">
          <Card className="overflow-hidden border-indigo-100 shadow-sm">
             <div className="flex flex-col md:flex-row h-full">
                 {/* Studio picture (Stitch F14): shared picture for this car + colour, or the outline. */}
                 <div className="md:w-[42%] relative flex flex-col gap-2 bg-white p-6 dark:bg-slate-900">
                     <VehiclePicture
                       picture={vehicle.picture}
                       vehicleId={vehicle.id}
                       slot="detail"
                       className="rounded-[16px] border-[#e2e8f0] bg-[#f8fafc] dark:border-[#3a3a3d]"
                     />
                     {vehicle.picture?.status === 'ready' ? (
                       <p className="px-1 text-[13px] text-[#47464c] dark:text-slate-400">
                         Studio picture of this model — your vehicle may look different.
                       </p>
                     ) : null}
                 </div>
                 <div className="p-6 flex-1 flex flex-col justify-between">
                     <div>
                         <div className="flex justify-between items-start gap-4">
                             <div className="min-w-0">
                                 {/* Stitch F14 hero: maker logo, make + model, generation line, plate block, colour. */}
                                 <div className="flex items-center gap-3">
                                   <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eff4ff] dark:bg-[#2a2a2d]">
                                     <MakerLogo make={vehicle.make} size={28} />
                                   </span>
                                   <div className="min-w-0">
                                     <h1 className="text-[30px] font-semibold leading-tight tracking-tight text-[#0b1c30] dark:text-slate-50">
                                       {vehicle.make} {vehicle.model}
                                     </h1>
                                     <p className="text-[15px] text-[#47464c] dark:text-slate-400">
                                       {[vehicle.year, vehicle.vehicle_catalog_generation_hint, vehicle.bodyType].filter((x) => x && String(x).trim()).join(' · ')}
                                     </p>
                                   </div>
                                 </div>
                                 <div className="mt-3 flex flex-wrap items-center gap-2">
                                   {showCatalogVerifiedBadge && (
                                     <Badge
                                       className="gap-1 rounded-full border-0 bg-[#ecfdf5] px-2.5 py-0.5 font-medium text-[#047857] hover:bg-[#ecfdf5] dark:bg-[#064e3b] dark:text-[#34d399]"
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
                                 <div className="mt-4 flex flex-wrap items-center gap-3">
                                     <span className="inline-flex items-center gap-2 rounded-lg bg-[#dbe7ff] px-3 py-1.5 dark:bg-[#1e3a8a]/40">
                                       <span className="text-[9px] font-bold leading-none text-[#47464c] dark:text-slate-300">JM</span>
                                       <span className="font-mono text-[20px] font-bold tracking-[0.2em] text-[#0b1c30] dark:text-slate-50">{vehicle.licensePlate}</span>
                                     </span>
                                     <VehicleColorRow vehicle={vehicle} onUpdated={onUpdate} />
                                 </div>
                                 {vehicle.vin ? (
                                   <p className="mt-2 text-[13px] text-[#47464c] dark:text-slate-400">VIN: {vehicle.vin}</p>
                                 ) : null}
                             </div>
                             <div className="flex shrink-0 flex-col items-end gap-3 text-right">
                                 <span
                                   className={
                                     vehicle.status === 'Active'
                                       ? 'inline-flex items-center gap-1.5 rounded-full bg-[#85f8c4]/30 px-3 py-1 text-[13px] font-semibold uppercase tracking-wide text-[#069669] dark:bg-[#064e3b] dark:text-[#34d399]'
                                       : 'inline-flex items-center gap-1.5 rounded-full bg-[#e5eeff] px-3 py-1 text-[13px] font-semibold uppercase tracking-wide text-[#47464c] dark:bg-[#2a2a2d] dark:text-slate-300'
                                   }
                                 >
                                   <span className={`h-2 w-2 rounded-full ${vehicle.status === 'Active' ? 'bg-[#069669]' : 'bg-[#94a3b8]'}`} />
                                   {vehicle.status}
                                 </span>
                                 <div>
                                   <p className="text-sm text-slate-500">Lifetime Earnings</p>
                                   <p className="text-2xl font-bold text-emerald-600">${vehicle.metrics.totalLifetimeEarnings.toLocaleString()}</p>
                                 </div>
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
                                         {chip ? (
                                           <Badge variant="outline" className={`mt-1 text-[10px] ${chip.className}`}>
                                             {chip.label}
                                           </Badge>
                                         ) : null}
                                     </div>
                                     <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className="ml-4 h-8 text-xs bg-white"
                                        onClick={onAssignDriver}
                                     >
                                         Change Driver
                                     </Button>
                                     {canHandOver ? (
                                       <Button
                                         size="sm"
                                         className="ml-2 h-8 text-xs bg-indigo-600 hover:bg-indigo-700"
                                         onClick={() => setHandoverOpen(true)}
                                       >
                                         Mark handed over
                                       </Button>
                                     ) : null}
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

          <Dialog open={handoverOpen} onOpenChange={setHandoverOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mark vehicle handed over?</DialogTitle>
                <DialogDescription>
                  Confirm that {vehicle.currentDriverName || 'the driver'} has physically received{' '}
                  <span className="font-mono font-semibold">{vehicle.licensePlate}</span>. They will
                  complete Vehicle Handover (odometer photo) in the Roam Driver app to confirm custody.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setHandoverOpen(false)} disabled={handoverBusy}>
                  Cancel
                </Button>
                <Button onClick={() => void confirmHandOver()} disabled={handoverBusy}>
                  {handoverBusy ? 'Saving…' : 'Confirm hand-over'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

      </div>
  );
}
