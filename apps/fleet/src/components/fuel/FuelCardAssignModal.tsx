/**
 * Slim assignment dialog for Roam-managed JAA cards (no identity edits).
 * Card → driver only; vehicle comes from driver↔vehicle assignment elsewhere.
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { FuelCard } from '../../types/fuel';
import { mergeFuelCardWithAssignmentHistory } from '../../utils/mergeFuelCardWithAssignmentHistory';

interface ModalDriver {
  id: string;
  name: string;
}

interface ModalVehicle {
  id: string;
  licensePlate: string;
  make: string;
  model: string;
  currentDriverId?: string;
}

interface FuelCardAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (card: FuelCard) => void;
  card: FuelCard;
  drivers?: ModalDriver[];
  /** Used only for handoff vehicle snapshot from driver's current car */
  vehicles?: ModalVehicle[];
}

export function FuelCardAssignModal({
  isOpen,
  onClose,
  onSave,
  card,
  drivers = [],
  vehicles = [],
}: FuelCardAssignModalProps) {
  const [driverId, setDriverId] = useState('unassigned');

  useEffect(() => {
    if (!isOpen) return;
    setDriverId(card.assignedDriverId || 'unassigned');
  }, [card, isOpen]);

  const handleSave = () => {
    const nextDriver = driverId === 'unassigned' ? undefined : driverId;
    const draft: FuelCard = {
      ...card,
      assignedDriverId: nextDriver,
      // Card inventory assigns people only — clear any legacy vehicle pointer
      assignedVehicleId: undefined,
    };
    onSave(
      mergeFuelCardWithAssignmentHistory(card, draft, {
        drivers,
        vehicles,
      }),
    );
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Assign Driver</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Driver</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Select driver" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save assignment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
