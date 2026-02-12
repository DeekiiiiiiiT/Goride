// cache-bust: force recompile — 2026-02-10
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { 
  Drawer, 
  DrawerContent, 
  DrawerHeader, 
  DrawerTitle, 
  DrawerDescription, 
  DrawerFooter,
  DrawerClose
} from "../ui/drawer";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Wrench, Calendar, AlertTriangle, Info, Camera, MapPin } from "lucide-react";
import { ServiceRequest } from '../../types/data';
import { useIsMobile } from '../ui/use-mobile';

interface ServiceRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<ServiceRequest>) => void;
}

export function ServiceRequestForm({ open, onOpenChange, onSubmit }: ServiceRequestFormProps) {
  const isMobile = useIsMobile();
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'Maintenance' as ServiceRequest['type'],
    priority: 'Medium' as ServiceRequest['priority'],
    description: '',
    odometer: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      odometer: formData.odometer ? parseFloat(formData.odometer) : undefined,
      status: 'Pending',
      createdAt: new Date().toISOString()
    });
    onOpenChange(false);
  };

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-6 px-4 pb-8 sm:px-0">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-sm font-bold uppercase tracking-wide text-slate-500">Service Type</Label>
          <Select value={formData.type} onValueChange={(v: any) => setFormData({...formData, type: v})}>
            <SelectTrigger className="h-12 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Maintenance">Routine Maintenance</SelectItem>
              <SelectItem value="Repair">Mechanical Repair</SelectItem>
              <SelectItem value="Inspection">Safety Inspection</SelectItem>
              <SelectItem value="Emergency">Roadside / Emergency</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-bold uppercase tracking-wide text-slate-500">Urgency</Label>
          <Select value={formData.priority} onValueChange={(v: any) => setFormData({...formData, priority: v})}>
            <SelectTrigger className={`h-12 border-slate-200 ${
                formData.priority === 'Critical' ? 'bg-red-50 border-red-200 text-red-700' : 
                formData.priority === 'High' ? 'bg-amber-50 border-amber-200 text-amber-700' : ''
            }`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Low">Low (Next 30 days)</SelectItem>
              <SelectItem value="Medium">Medium (This week)</SelectItem>
              <SelectItem value="High">High (ASAP)</SelectItem>
              <SelectItem value="Critical">Critical (Ground Vehicle)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="date" className="text-sm font-bold uppercase tracking-wide text-slate-500">Occurrence Date</Label>
          <Input 
            id="date" 
            type="date" 
            className="h-12"
            value={formData.date}
            onChange={e => setFormData({...formData, date: e.target.value})}
            required 
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <Label htmlFor="odometer" className="text-sm font-bold uppercase tracking-wide text-slate-500">Current Odometer</Label>
            <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded uppercase tracking-wider">Audit Anchor</span>
          </div>
          <Input 
            id="odometer" 
            type="number" 
            inputMode="numeric"
            placeholder="Enter km reading"
            className="h-12 border-indigo-200 focus-visible:ring-indigo-500 text-lg font-mono"
            value={formData.odometer}
            onChange={e => setFormData({...formData, odometer: e.target.value})}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm font-bold uppercase tracking-wide text-slate-500">Detailed Description</Label>
        <Textarea 
          id="description" 
          placeholder="Describe unusual noises, smells, or physical damage..."
          className="min-h-[120px] text-base"
          value={formData.description}
          onChange={e => setFormData({...formData, description: e.target.value})}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
          <Button type="button" variant="outline" className="h-14 border-dashed border-slate-300 text-slate-500 gap-2">
              <Camera className="w-5 h-5" />
              Add Photo
          </Button>
          <Button type="button" variant="outline" className="h-14 border-dashed border-slate-300 text-slate-500 gap-2">
              <MapPin className="w-5 h-5" />
              Tag Location
          </Button>
      </div>

      <div className="bg-slate-50 p-4 rounded-xl flex gap-3 border border-slate-100">
        <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          <strong>Fleet Integrity Policy:</strong> Reporting mechanical issues immediately is required for insurance compliance. False reporting may result in audit flags.
        </p>
      </div>

      {!isMobile && (
        <DialogFooter className="pt-4 border-t">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 h-12 px-8">Submit Service Request</Button>
        </DialogFooter>
      )}
    </form>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[95vh]">
          <DrawerHeader className="text-left border-b pb-4">
            <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 rounded-xl">
                    <Wrench className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                    <DrawerTitle className="text-xl">Field Service Request</DrawerTitle>
                    <DrawerDescription>Submit mechanical issues for audit.</DrawerDescription>
                </div>
            </div>
          </DrawerHeader>
          <div className="overflow-y-auto px-2">
            {formContent}
          </div>
          <DrawerFooter className="border-t bg-slate-50 pt-4">
            <Button type="submit" className="h-14 text-lg bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit}>
                Submit Request
            </Button>
            <DrawerClose asChild>
              <Button variant="ghost" className="h-12 text-slate-500">Discard</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] p-8">
        <DialogHeader className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-indigo-100 rounded-xl">
                <Wrench className="h-6 w-6 text-indigo-600" />
            </div>
            <DialogTitle className="text-2xl">Vehicle Service Request</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Detailed reporting ensures faster maintenance turnaround and audit consistency.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}