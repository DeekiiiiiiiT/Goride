import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { AuditRecord, Trip, DriverMetrics, VehicleMetrics } from '../../types/data';

interface EditAnomalyDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, type: 'trip' | 'driver' | 'vehicle', updatedData: any) => void;
    record: AuditRecord<Trip | DriverMetrics | VehicleMetrics> | null;
    type: 'trip' | 'driver' | 'vehicle';
}

export function EditAnomalyDialog({ isOpen, onClose, onSave, record, type }: EditAnomalyDialogProps) {
    const [formData, setFormData] = useState<any>({});

    useEffect(() => {
        if (record && record.data) {
            setFormData({ ...record.data });
        }
    }, [record]);

    const handleSave = () => {
        if (!record) return;
        const id = (record.data as any).id || (record.data as any).driverId || (record.data as any).vehicleId;
        onSave(id, type, formData);
        onClose();
    };

    const handleChange = (key: string, value: any) => {
        setFormData((prev: any) => ({ ...prev, [key]: value }));
    };

    if (!record) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit {type === 'trip' ? 'Trip' : type === 'driver' ? 'Driver' : 'Vehicle'} Record</DialogTitle>
                    <DialogDescription>
                        Correct the data to resolve the detected anomaly.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
                    {/* Dynamic Form Generation based on Type */}
                    
                    {type === 'driver' && (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="driverName">Driver Name</Label>
                                <Input id="driverName" value={formData.driverName || ''} onChange={(e) => handleChange('driverName', e.target.value)} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="totalEarnings">Total Earnings</Label>
                                <Input id="totalEarnings" type="number" value={formData.totalEarnings || ''} onChange={(e) => handleChange('totalEarnings', parseFloat(e.target.value))} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="rating">Rating</Label>
                                <Input id="rating" type="number" step="0.01" value={formData.ratingLast500 || ''} onChange={(e) => handleChange('ratingLast500', parseFloat(e.target.value))} />
                            </div>
                        </>
                    )}

                    {type === 'vehicle' && (
                        <>
                             <div className="grid gap-2">
                                <Label htmlFor="plateNumber">Plate Number</Label>
                                <Input id="plateNumber" value={formData.plateNumber || ''} onChange={(e) => handleChange('plateNumber', e.target.value)} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="totalEarnings">Total Earnings</Label>
                                <Input id="totalEarnings" type="number" value={formData.totalEarnings || ''} onChange={(e) => handleChange('totalEarnings', parseFloat(e.target.value))} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="onlineHours">Online Hours</Label>
                                <Input id="onlineHours" type="number" value={formData.onlineHours || ''} onChange={(e) => handleChange('onlineHours', parseFloat(e.target.value))} />
                            </div>
                        </>
                    )}

                    {type === 'trip' && (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="date">Date</Label>
                                <Input id="date" type="datetime-local" 
                                    value={formData.date ? new Date(formData.date).toISOString().slice(0, 16) : ''} 
                                    onChange={(e) => handleChange('date', new Date(e.target.value).toISOString())} 
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="amount">Amount</Label>
                                <Input id="amount" type="number" value={formData.amount || ''} onChange={(e) => handleChange('amount', parseFloat(e.target.value))} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="distance">Distance (km)</Label>
                                <Input id="distance" type="number" value={formData.distance || ''} onChange={(e) => handleChange('distance', parseFloat(e.target.value))} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="duration">Duration (min)</Label>
                                <Input id="duration" type="number" value={formData.duration || ''} onChange={(e) => handleChange('duration', parseFloat(e.target.value))} />
                            </div>
                             <div className="grid gap-2">
                                <Label htmlFor="status">Status</Label>
                                <Input id="status" value={formData.status || ''} onChange={(e) => handleChange('status', e.target.value)} />
                            </div>
                        </>
                    )}

                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Changes</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}