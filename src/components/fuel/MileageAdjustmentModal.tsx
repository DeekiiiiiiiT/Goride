import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { format } from "date-fns";
import { CalendarIcon, Car, User } from "lucide-react";
import { cn } from "../ui/utils";
import { Vehicle } from '../../types/vehicle';
import { MileageAdjustment, AdjustmentType } from '../../types/fuel';

interface MileageAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (adjustment: MileageAdjustment) => void;
    vehicles: Vehicle[];
    initialVehicleId?: string;
    initialDate?: Date;
}

export function MileageAdjustmentModal({ 
    isOpen, 
    onClose, 
    onSave, 
    vehicles,
    initialVehicleId,
    initialDate
}: MileageAdjustmentModalProps) {
    const [vehicleId, setVehicleId] = useState(initialVehicleId || '');
    const [date, setDate] = useState<Date>(initialDate || new Date());
    const [type, setType] = useState<AdjustmentType>('Personal');
    const [distance, setDistance] = useState('');
    const [notes, setNotes] = useState('');

    // Reset/Sync form when modal opens or defaults change
    React.useEffect(() => {
        if (isOpen) {
            setVehicleId(initialVehicleId || '');
            setDate(initialDate || new Date());
            setDistance('');
            setNotes('');
            setType('Personal');
        }
    }, [isOpen, initialVehicleId, initialDate]);

    const handleSubmit = () => {
        if (!vehicleId || !distance) return;

        // Try to find the driver associated with the vehicle
        const selectedVehicle = vehicles.find(v => v.id === vehicleId);
        const driverId = selectedVehicle?.currentDriverId || 'unassigned';

        const newAdjustment: MileageAdjustment = {
            id: Math.random().toString(36).substr(2, 9),
            vehicleId,
            driverId,
            date: date.toISOString(),
            type,
            distance: parseFloat(distance),
            reason: notes
        };

        onSave(newAdjustment);
        resetForm();
    };

    const resetForm = () => {
        setVehicleId(initialVehicleId || '');
        setDate(new Date());
        setType('Personal');
        setDistance('');
        setNotes('');
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add Mileage Adjustment</DialogTitle>
                    <DialogDescription>
                        Correct mileage variances to ensure accurate fuel cost allocation.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4">
                    {/* Vehicle Select */}
                    <div className="grid gap-2">
                        <Label>Vehicle</Label>
                        <Select value={vehicleId} onValueChange={setVehicleId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select vehicle" />
                            </SelectTrigger>
                            <SelectContent>
                                {vehicles.map(v => (
                                    <SelectItem key={v.id} value={v.id}>
                                        {v.licensePlate} ({v.model})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Date Picker */}
                    <div className="grid gap-2">
                        <Label>Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "w-full justify-start text-left font-normal",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={(d) => d && setDate(d)}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Type Select */}
                    <div className="grid gap-2">
                        <Label>Adjustment Type</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <Button 
                                variant={type === 'Personal' ? 'default' : 'outline'}
                                onClick={() => setType('Personal')}
                                className="w-full justify-start"
                            >
                                <User className="mr-2 h-4 w-4" />
                                Personal
                            </Button>
                            <Button 
                                variant={type === 'Company_Misc' ? 'default' : 'outline'}
                                onClick={() => setType('Company_Misc')}
                                className="w-full justify-start"
                            >
                                <Car className="mr-2 h-4 w-4" />
                                Company Misc
                            </Button>
                        </div>
                    </div>

                    {/* Distance Input */}
                    <div className="grid gap-2">
                        <Label>Distance (km)</Label>
                        <Input 
                            type="number" 
                            placeholder="e.g. 45" 
                            value={distance} 
                            onChange={(e) => setDistance(e.target.value)} 
                        />
                        <p className="text-xs text-slate-500">
                            Adding this distance will move cost from "Leakage" to {type === 'Personal' ? 'Driver Share' : 'Company Share'}.
                        </p>
                    </div>

                    {/* Notes */}
                    <div className="grid gap-2">
                        <Label>Notes / Reason</Label>
                        <Textarea 
                            placeholder="e.g. Weekend usage authorized by manager..." 
                            value={notes} 
                            onChange={(e) => setNotes(e.target.value)} 
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!vehicleId || !distance}>Save Adjustment</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
