import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { FuelEntry, FuelCard } from '../../types/fuel';
import { CalendarIcon } from 'lucide-react';

interface FuelLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (entry: FuelEntry) => void;
    initialData?: FuelEntry | null;
    vehicles: any[];
    drivers: any[];
    cards: FuelCard[];
}

export function FuelLogModal({ isOpen, onClose, onSave, initialData, vehicles, drivers, cards }: FuelLogModalProps) {
    const [formData, setFormData] = useState<Partial<FuelEntry>>({
        date: new Date().toISOString().split('T')[0],
        type: 'Card_Transaction',
        amount: 0,
        liters: 0,
        pricePerLiter: 0,
        odometer: 0,
        location: '',
        vehicleId: '',
        driverId: '',
        cardId: '',
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                date: initialData.date.split('T')[0], // Ensure date format for input
            });
        } else {
            setFormData({
                date: new Date().toISOString().split('T')[0],
                type: 'Card_Transaction',
                amount: 0,
                liters: 0,
                pricePerLiter: 0,
                odometer: 0,
                location: '',
                vehicleId: '',
                driverId: '',
                cardId: '',
            });
        }
    }, [initialData, isOpen]);

    // Auto-calculate Price per Liter if Amount and Liters are present
    const handleCalculation = (field: 'amount' | 'liters', value: number) => {
        const updates: any = { [field]: value };
        
        if (field === 'amount' && formData.liters && formData.liters > 0) {
            updates.pricePerLiter = Number((value / formData.liters).toFixed(3));
        } else if (field === 'liters' && formData.amount && formData.amount > 0) {
            updates.pricePerLiter = Number((formData.amount / value).toFixed(3));
        }

        setFormData(prev => ({ ...prev, ...updates }));
    };

    const handleSave = () => {
        if (!formData.amount || !formData.date || !formData.vehicleId) {
            // Basic validation
            return; 
        }

        const entry: FuelEntry = {
            id: initialData?.id || crypto.randomUUID(),
            date: formData.date!,
            type: formData.type as any,
            amount: Number(formData.amount),
            liters: Number(formData.liters),
            pricePerLiter: Number(formData.pricePerLiter),
            odometer: Number(formData.odometer),
            location: formData.location || '',
            vehicleId: formData.vehicleId,
            driverId: formData.driverId,
            cardId: formData.type === 'Card_Transaction' ? formData.cardId : undefined,
        };

        onSave(entry);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Fuel Entry' : 'Log Fuel Transaction'}</DialogTitle>
                    <DialogDescription>
                        Record a fuel purchase or mileage event.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <div className="relative">
                                <Input 
                                    id="date" 
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="type">Transaction Type</Label>
                            <Select 
                                value={formData.type} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, type: val as any }))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Card_Transaction">Fuel Card</SelectItem>
                                    <SelectItem value="Manual_Entry">Cash / Out of Pocket</SelectItem>
                                    <SelectItem value="Reimbursement">Reimbursement</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="vehicle">Vehicle</Label>
                            <Select 
                                value={formData.vehicleId} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, vehicleId: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Vehicle" />
                                </SelectTrigger>
                                <SelectContent>
                                    {vehicles.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.licensePlate} ({v.model})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="driver">Driver</Label>
                            <Select 
                                value={formData.driverId} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, driverId: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Driver" />
                                </SelectTrigger>
                                <SelectContent>
                                    {drivers.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {formData.type === 'Card_Transaction' && (
                        <div className="space-y-2">
                            <Label htmlFor="card">Fuel Card</Label>
                            <Select 
                                value={formData.cardId} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, cardId: val }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select Fuel Card" />
                                </SelectTrigger>
                                <SelectContent>
                                    {cards.filter(c => c.status === 'Active').map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.provider} - {c.cardNumber}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="amount">Total Cost ($)</Label>
                            <Input 
                                id="amount" 
                                type="number" 
                                step="0.01"
                                placeholder="0.00"
                                value={formData.amount}
                                onChange={(e) => handleCalculation('amount', parseFloat(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="liters">Volume (L)</Label>
                            <Input 
                                id="liters" 
                                type="number" 
                                step="0.1"
                                placeholder="0.0"
                                value={formData.liters}
                                onChange={(e) => handleCalculation('liters', parseFloat(e.target.value))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price">Price / L</Label>
                            <Input 
                                id="price" 
                                type="number" 
                                disabled
                                className="bg-slate-50"
                                value={formData.pricePerLiter}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="odometer">Odometer (km)</Label>
                            <Input 
                                id="odometer" 
                                type="number" 
                                placeholder="Current Reading"
                                value={formData.odometer}
                                onChange={(e) => setFormData(prev => ({ ...prev, odometer: parseFloat(e.target.value) }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="location">Location</Label>
                            <Input 
                                id="location" 
                                placeholder="Gas Station Name"
                                value={formData.location}
                                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Log</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
