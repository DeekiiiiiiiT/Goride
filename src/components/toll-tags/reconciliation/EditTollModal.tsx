import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { FinancialTransaction } from "../../../types/data";
import { Pencil, Loader2 } from "lucide-react";

interface EditTollModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: FinancialTransaction | null;
    onSave: (transactionId: string, updates: Record<string, any>) => Promise<void>;
}

export function EditTollModal({ isOpen, onClose, transaction, onSave }: EditTollModalProps) {
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [amount, setAmount] = useState('');
    const [vehiclePlate, setVehiclePlate] = useState('');
    const [driverName, setDriverName] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);

    // Populate fields when transaction changes
    useEffect(() => {
        if (transaction) {
            setDate(transaction.date || '');
            setTime(transaction.time || '');
            setAmount(Math.abs(transaction.amount).toString());
            setVehiclePlate(transaction.vehiclePlate || transaction.vehicleId || '');
            setDriverName(transaction.driverName || '');
            setDescription(transaction.description || '');
        }
    }, [transaction]);

    const handleSave = async () => {
        if (!transaction) return;
        setSaving(true);
        try {
            const updates: Record<string, any> = {};

            // Only include fields that actually changed
            if (date !== (transaction.date || '')) updates.date = date;
            if (time !== (transaction.time || '')) updates.time = time;
            
            const newAmount = parseFloat(amount);
            if (!isNaN(newAmount) && newAmount !== Math.abs(transaction.amount)) {
                // Store as negative (expense)
                updates.amount = -Math.abs(newAmount);
            }
            
            const origPlate = transaction.vehiclePlate || transaction.vehicleId || '';
            if (vehiclePlate !== origPlate) {
                updates.vehiclePlate = vehiclePlate;
                updates.vehicleId = vehiclePlate;
            }
            
            if (driverName !== (transaction.driverName || '')) updates.driverName = driverName;
            if (description !== (transaction.description || '')) updates.description = description;

            if (Object.keys(updates).length === 0) {
                onClose();
                return;
            }

            await onSave(transaction.id, updates);
            onClose();
        } catch (e) {
            console.error("Failed to save toll edit:", e);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Pencil className="h-5 w-5 text-indigo-600" />
                        Edit Toll Transaction
                    </DialogTitle>
                    <DialogDescription>
                        Update the details of this toll charge. Changes are saved immediately.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Date & Time row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1 block">Date</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700 mb-1 block">Time</label>
                            <input
                                type="time"
                                value={time ? time.substring(0, 5) : ''}
                                onChange={(e) => setTime(e.target.value + ':00')}
                                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1 block">Amount ($)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full h-9 rounded-md border border-slate-200 bg-white pl-7 pr-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Vehicle Plate */}
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1 block">Vehicle Plate</label>
                        <input
                            type="text"
                            value={vehiclePlate}
                            onChange={(e) => setVehiclePlate(e.target.value)}
                            placeholder="e.g. 5179KZ"
                            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    {/* Driver Name */}
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1 block">Driver Name</label>
                        <input
                            type="text"
                            value={driverName}
                            onChange={(e) => setDriverName(e.target.value)}
                            placeholder="e.g. Kenny Gregory Rattray"
                            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-sm font-medium text-slate-700 mb-1 block">Description</label>
                        <input
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. Toll Usage - Highway 2000"
                            className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700">
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            'Save Changes'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
