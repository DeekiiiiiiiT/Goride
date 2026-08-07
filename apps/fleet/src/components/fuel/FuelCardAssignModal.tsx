/**
 * Slim assignment dialog for Roam-managed JAA cards (no identity edits).
 */
import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { FuelCard } from '../../types/fuel';

interface ModalDriver {
  id: string;
  name: string;
}

interface ModalVehicle {
  id: string;
  licensePlate: string;
  make: string;
  model: string;
}

interface FuelCardAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (card: FuelCard) => void;
  card: FuelCard;
  drivers?: ModalDriver[];
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
  const [vehicleId, setVehicleId] = useState('unassigned');

  useEffect(() => {
    if (!isOpen) return;
    setDriverId(card.assignedDriverId || 'unassigned');
    setVehicleId(card.assignedVehicleId || 'unassigned');
  }, [card, isOpen]);

  const handleSave = () => {
    const isRental = card.jaaCardType === 'rental';
    let nextDriver = driverId === 'unassigned' ? undefined : driverId;
    let nextVehicle = vehicleId === 'unassigned' ? undefined : vehicleId;
    // Rental: prefer one assignee so the card can float with the person
    if (isRental && nextDriver && nextVehicle) {
      nextVehicle = undefined;
    }
    onSave({
      ...card,
      assignedDriverId: nextDriver,
      assignedVehicleId: nextVehicle,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Assign Driver</DialogTitle>
          <DialogDescription>
            Roam Fuels card <span className="font-mono text-slate-700">{card.cardNumber}</span>
            {card.jaaCardType === 'rental' ? ' (rental — reassign anytime).' : '.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Driver</Label>
            <Select
              value={driverId}
              onValueChange={(val) => {
                setDriverId(val);
                if (card.jaaCardType === 'rental' && val !== 'unassigned') {
                  setVehicleId('unassigned');
                }
              }}
            >
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

          <div className="space-y-2">
            <Label>Vehicle (optional)</Label>
            <Select
              value={vehicleId}
              onValueChange={(val) => {
                setVehicleId(val);
                if (card.jaaCardType === 'rental' && val !== 'unassigned') {
                  setDriverId('unassigned');
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.licensePlate} ({v.make})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-500">
              Prefer driver for rental cards. Use vehicle only if the card stays with that car.
            </p>
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
