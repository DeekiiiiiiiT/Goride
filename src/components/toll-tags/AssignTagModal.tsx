import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Label } from "../ui/label";
import { Loader2 } from "lucide-react";
import { Vehicle, TollTag } from "../../types/vehicle";
import { api } from "../../services/api";

interface AssignTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  tag: TollTag;
  onAssign: () => void;
}

export function AssignTagModal({ isOpen, onClose, tag, onAssign }: AssignTagModalProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadVehicles();
    }
  }, [isOpen]);

  const loadVehicles = async () => {
    setIsLoading(true);
    try {
      const allVehicles = await api.getVehicles();
      // Filter for active vehicles that don't have a toll tag assigned (or allow overwriting?)
      // For now, let's just show all active vehicles, maybe mark ones that already have a tag
      const activeVehicles = allVehicles.filter((v: Vehicle) => v.status === 'Active');
      setVehicles(activeVehicles);
    } catch (error) {
      console.error("Failed to load vehicles", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedVehicleId) return;
    
    setIsSaving(true);
    try {
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      if (!vehicle) return;

      // 1. Update Vehicle
      const updatedVehicle = {
        ...vehicle,
        tollTagId: tag.tagNumber,
        tollTagUuid: tag.id,
        tollTagProvider: tag.provider
      };
      await api.saveVehicle(updatedVehicle);

      // 2. Update Toll Tag
      const updatedTag = {
        ...tag,
        assignedVehicleId: vehicle.id,
        assignedVehicleName: vehicle.licensePlate
      };
      await api.saveTollTag(updatedTag);

      onAssign();
      onClose();
    } catch (error) {
      console.error("Failed to assign tag", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Assign Toll Tag</DialogTitle>
          <DialogDescription>
            Assign tag <strong>{tag.tagNumber}</strong> ({tag.provider}) to a vehicle.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <Label>Select Vehicle</Label>
            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a vehicle..." />
              </SelectTrigger>
              <SelectContent>
                {isLoading ? (
                  <div className="p-2 text-sm text-slate-500 text-center">Loading vehicles...</div>
                ) : (
                  vehicles.map(vehicle => (
                    <SelectItem key={vehicle.id} value={vehicle.id}>
                      {vehicle.licensePlate} {vehicle.make} {vehicle.model}
                      {vehicle.tollTagId && " (Has Tag)"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedVehicleId && vehicles.find(v => v.id === selectedVehicleId)?.tollTagId && (
              <p className="text-amber-600 text-xs">
                Warning: This vehicle already has a tag assigned ({vehicles.find(v => v.id === selectedVehicleId)?.tollTagId}). It will be overwritten.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={!selectedVehicleId || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign Tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
