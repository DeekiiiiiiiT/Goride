import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { FuelCard } from '../../types/fuel';
import { Vehicle } from '../../types/vehicle';
import { Driver } from '../../types/driver'; // Assuming this exists, if not I'll define a minimal interface locally

// Minimal interfaces if full types aren't available yet or to decouple
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

interface FuelCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (card: FuelCard) => void;
    initialData?: FuelCard | null;
    vehicles?: ModalVehicle[];
    drivers?: ModalDriver[];
}

const PROVIDERS = ['Shell', 'FleetCor', 'Wex', 'PetroJam', 'Total', 'Esso', 'Rubis', 'Texaco'];

export function FuelCardModal({ isOpen, onClose, onSave, initialData, vehicles = [], drivers = [] }: FuelCardModalProps) {
    const [formData, setFormData] = useState<Partial<FuelCard>>({
        provider: '',
        cardNumber: '',
        status: 'Active',
        expiryDate: '',
        notes: '',
        assignedVehicleId: 'unassigned', // Use string 'unassigned' for Select handling
        assignedDriverId: 'unassigned',
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                assignedVehicleId: initialData.assignedVehicleId || 'unassigned',
                assignedDriverId: initialData.assignedDriverId || 'unassigned',
            });
        } else {
            setFormData({
                provider: '',
                cardNumber: '',
                status: 'Active',
                expiryDate: '',
                notes: '',
                assignedVehicleId: 'unassigned',
                assignedDriverId: 'unassigned',
            });
        }
    }, [initialData, isOpen]);

    const handleSave = () => {
        // Validation
        if (!formData.provider || !formData.cardNumber) {
            return; // Add validation UI later
        }

        const card: FuelCard = {
            id: initialData?.id || crypto.randomUUID(),
            provider: formData.provider,
            cardNumber: formData.cardNumber,
            status: formData.status as 'Active' | 'Inactive' | 'Lost',
            expiryDate: formData.expiryDate,
            notes: formData.notes,
            assignedVehicleId: formData.assignedVehicleId === 'unassigned' ? undefined : formData.assignedVehicleId,
            assignedDriverId: formData.assignedDriverId === 'unassigned' ? undefined : formData.assignedDriverId,
        };

        onSave(card);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Fuel Card' : 'Add New Fuel Card'}</DialogTitle>
                    <DialogDescription>
                        Enter the card details and assignment information.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="provider">Provider</Label>
                            <Select 
                                value={formData.provider} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, provider: val }))}
                            >
                                <SelectTrigger id="provider">
                                    <SelectValue placeholder="Select Provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROVIDERS.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cardNumber">Card Number</Label>
                            <Input 
                                id="cardNumber" 
                                placeholder="xxxx-xxxx-xxxx-1234" 
                                value={formData.cardNumber}
                                onChange={(e) => setFormData(prev => ({ ...prev, cardNumber: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select 
                                value={formData.status} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, status: val as any }))}
                            >
                                <SelectTrigger id="status">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Active">Active</SelectItem>
                                    <SelectItem value="Inactive">Inactive</SelectItem>
                                    <SelectItem value="Lost">Lost / Stolen</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="expiry">Expiry Date</Label>
                            <Input 
                                id="expiry" 
                                type="date"
                                value={formData.expiryDate}
                                onChange={(e) => setFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Assignment (Optional)</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Vehicle</span>
                                <Select 
                                    value={formData.assignedVehicleId} 
                                    onValueChange={(val) => setFormData(prev => ({ ...prev, assignedVehicleId: val, assignedDriverId: 'unassigned' }))}
                                >
                                    <SelectTrigger className="text-xs h-9">
                                        <SelectValue placeholder="Assign Vehicle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {vehicles.map(v => (
                                            <SelectItem key={v.id} value={v.id}>{v.licensePlate} ({v.make})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Driver</span>
                                <Select 
                                    value={formData.assignedDriverId} 
                                    onValueChange={(val) => setFormData(prev => ({ ...prev, assignedDriverId: val, assignedVehicleId: 'unassigned' }))}
                                >
                                    <SelectTrigger className="text-xs h-9">
                                        <SelectValue placeholder="Assign Driver" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {drivers.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">
                            Assigning to a vehicle is preferred for clearer expense tracking. Assign to a driver only if they switch vehicles often.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea 
                            id="notes" 
                            placeholder="Optional notes..." 
                            className="resize-none h-20"
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Card</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
