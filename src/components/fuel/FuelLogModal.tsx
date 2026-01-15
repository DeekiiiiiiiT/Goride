import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { LocationInput } from "../ui/LocationInput";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FuelEntry, FuelCard } from '../../types/fuel';
import { CalendarIcon, Plus, X } from 'lucide-react';
import { toast } from "sonner@2.0.3";

interface FuelLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (entry: FuelEntry | FuelEntry[]) => void;
    initialData?: FuelEntry | null;
    vehicles: any[];
    drivers: any[];
    cards: FuelCard[];
}

export function FuelLogModal({ isOpen, onClose, onSave, initialData, vehicles, drivers, cards }: FuelLogModalProps) {
    const [activeTab, setActiveTab] = useState('single');
    // Single Entry State
    const [formData, setFormData] = useState<Partial<FuelEntry>>({
        date: new Date().toISOString().split('T')[0],
        type: 'Card_Transaction',
        amount: 0,
        liters: 0,
        pricePerLiter: 0,
        odometer: 0,
        location: '',
        stationAddress: '',
        vehicleId: '',
        driverId: '',
        cardId: '',
    });

    // Bulk Entry State
    const [bulkCommon, setBulkCommon] = useState({
        driverId: '',
        vehicleId: '',
        type: 'Manual_Entry' as const
    });

    const [bulkEntries, setBulkEntries] = useState<Array<{
        id: string;
        date: string;
        amount: number;
        liters: number;
        pricePerLiter: number;
        odometer: number;
        location: string;
        stationAddress: string;
    }>>([]);

    // Initialize one empty row for bulk when switching or opening
    useEffect(() => {
        if (activeTab === 'bulk' && bulkEntries.length === 0) {
            setBulkEntries([{
                id: crypto.randomUUID(),
                date: new Date().toISOString().split('T')[0],
                amount: 0,
                liters: 0,
                pricePerLiter: 0,
                odometer: 0,
                location: '',
                stationAddress: ''
            }]);
        }
    }, [activeTab]);

    useEffect(() => {
        if (initialData) {
            setActiveTab('single');
            setFormData({
                ...initialData,
                date: initialData.date.split('T')[0], // Ensure date format for input
            });
        } else {
            // Reset to defaults when opening fresh
            // If activeTab logic needs to persist or reset, handle here.
            // For now, let's keep user's last tab choice or force 'single' only on specific triggers?
            // Let's not force reset activeTab here unless we want to always start on single.
            setFormData({
                date: new Date().toISOString().split('T')[0],
                type: 'Card_Transaction',
                amount: 0,
                liters: 0,
                pricePerLiter: 0,
                odometer: 0,
                location: '',
                stationAddress: '',
                vehicleId: '',
                driverId: '',
                cardId: '',
            });
        }
    }, [initialData, isOpen]);

    // Auto-calculate Volume (Liters) if Amount and Price per Liter are present
    const handleCalculation = (field: 'amount' | 'pricePerLiter', value: number) => {
        const updates: any = { [field]: value };
        
        const currentAmount = field === 'amount' ? value : formData.amount;
        const currentPrice = field === 'pricePerLiter' ? value : formData.pricePerLiter;

        if (currentAmount && currentAmount > 0 && currentPrice && currentPrice > 0) {
            updates.liters = Number((currentAmount / currentPrice).toFixed(2));
        }

        setFormData(prev => ({ ...prev, ...updates }));
    };

    // Bulk Row Helpers
    const updateBulkEntry = (id: string, field: string, value: any) => {
        setBulkEntries(prev => prev.map(entry => {
            if (entry.id !== id) return entry;
            
            const updates: any = { [field]: value };
            // Ensure we're working with numbers for calculation
            const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
            
            const currentAmount = field === 'amount' ? numValue : entry.amount;
            const currentPrice = field === 'pricePerLiter' ? numValue : entry.pricePerLiter;

            if (field === 'amount' || field === 'pricePerLiter') {
                 if (currentAmount > 0 && currentPrice > 0) {
                     updates.liters = Number((currentAmount / currentPrice).toFixed(2));
                 }
            }
            
            return { ...entry, ...updates };
        }));
    };

    const addBulkRow = () => {
        setBulkEntries(prev => [
            ...prev, 
            {
                id: crypto.randomUUID(),
                date: prev.length > 0 ? prev[prev.length - 1].date : new Date().toISOString().split('T')[0],
                amount: 0,
                liters: 0,
                pricePerLiter: 0,
                odometer: 0,
                location: '',
                stationAddress: ''
            }
        ]);
    };

    const removeBulkRow = (id: string) => {
        if (bulkEntries.length > 1) {
            setBulkEntries(prev => prev.filter(e => e.id !== id));
        }
    };

    const handleSave = () => {
        if (!formData.date) {
            toast.error("Please select a date");
            return;
        }
        if (!formData.vehicleId) {
            toast.error("Please select a vehicle");
            return;
        }
        if (!formData.amount) {
            toast.error("Please enter a valid amount");
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
            stationAddress: formData.stationAddress || '',
            vehicleId: formData.vehicleId,
            driverId: formData.driverId,
            cardId: formData.type === 'Card_Transaction' ? formData.cardId : undefined,
        };

        onSave(entry);
        onClose();
    };

    const handleBulkSave = () => {
        // Validate Common Fields
        if (!bulkCommon.vehicleId) {
            toast.error("Please select a Vehicle");
            return;
        }
        if (!bulkCommon.driverId) {
            toast.error("Please select a Driver");
            return;
        }

        // Validate Rows
        const validEntries = bulkEntries.filter(e => e.amount > 0 && e.date);
        
        if (validEntries.length === 0) {
            toast.error("Please add at least one valid entry (Amount > 0)");
            return;
        }

        const entries: FuelEntry[] = validEntries.map(row => ({
            id: row.id,
            date: row.date,
            type: bulkCommon.type as any,
            amount: row.amount,
            liters: row.liters,
            pricePerLiter: row.pricePerLiter,
            odometer: row.odometer,
            location: row.location,
            stationAddress: row.stationAddress,
            vehicleId: bulkCommon.vehicleId,
            driverId: bulkCommon.driverId,
            // Card ID is undefined for manual entries usually, but if type is Card, we might need it.
            // For now assuming bulk is mostly for cash/manual. If card needed, add to common.
            cardId: undefined 
        }));

        onSave(entries);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[1000px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Fuel Entry' : 'Log Fuel Transaction'}</DialogTitle>
                    <DialogDescription>
                        Record a fuel purchase or mileage event.
                    </DialogDescription>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="single">Single Entry</TabsTrigger>
                        <TabsTrigger value="bulk" disabled={!!initialData}>Bulk Entry</TabsTrigger>
                    </TabsList>

                    <TabsContent value="single">
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
                                        disabled
                                        className="bg-slate-50"
                                        placeholder="Calculated"
                                        value={formData.liters || ''}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="price">Price / L ($)</Label>
                                    <Input 
                                        id="price" 
                                        type="number" 
                                        step="0.001"
                                        placeholder="0.000"
                                        value={formData.pricePerLiter || ''}
                                        onChange={(e) => handleCalculation('pricePerLiter', parseFloat(e.target.value))}
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
                                    <Label htmlFor="location">Gas Station Name</Label>
                                    <Input 
                                        id="location" 
                                        placeholder="Enter gas station name (e.g. Fortune Texaco)"
                                        value={formData.location}
                                        onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2 col-span-2">
                                    <Label htmlFor="stationAddress">Gas Station Location</Label>
                                    <LocationInput 
                                        id="stationAddress" 
                                        placeholder="Enter address (e.g. 123 Main St)"
                                        value={formData.stationAddress || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, stationAddress: e.target.value }))}
                                        onAddressSelect={(address) => setFormData(prev => ({ ...prev, stationAddress: address }))}
                                    />
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="bulk">
                        <div className="space-y-4 py-4">
                            {/* Common Fields */}
                            <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium text-sm text-slate-900">Common Details</h3>
                                    <span className="text-xs text-slate-500">Applied to all entries below</span>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Driver</Label>
                                        <Select 
                                            value={bulkCommon.driverId} 
                                            onValueChange={(val) => setBulkCommon(prev => ({ ...prev, driverId: val }))}
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue placeholder="Select Driver" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {drivers.map(d => (
                                                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Vehicle</Label>
                                        <Select 
                                            value={bulkCommon.vehicleId} 
                                            onValueChange={(val) => setBulkCommon(prev => ({ ...prev, vehicleId: val }))}
                                        >
                                            <SelectTrigger className="bg-white">
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
                                        <Label>Type</Label>
                                        <Select 
                                            value={bulkCommon.type} 
                                            onValueChange={(val) => setBulkCommon(prev => ({ ...prev, type: val as any }))}
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Card_Transaction">Fuel Card</SelectItem>
                                                <SelectItem value="Manual_Entry">Cash / Out of Pocket</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {/* Bulk Rows */}
                            <div className="space-y-2">
                                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 px-2">
                                    <div className="col-span-2">Date</div>
                                    <div className="col-span-1">Amount ($)</div>
                                    <div className="col-span-1">Price / L ($)</div>
                                    <div className="col-span-1">Odometer</div>
                                    <div className="col-span-3">Gas Station Name</div>
                                    <div className="col-span-3">Location Address</div>
                                    <div className="col-span-1"></div>
                                </div>
                                
                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                    {bulkEntries.map((entry, index) => (
                                        <div key={entry.id} className="grid grid-cols-12 gap-2 items-start">
                                            <div className="col-span-2">
                                                <Input 
                                                    type="date" 
                                                    value={entry.date}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'date', e.target.value)}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <Input 
                                                    type="number" 
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={entry.amount || ''}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'amount', parseFloat(e.target.value))}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <Input 
                                                    type="number" 
                                                    step="0.001"
                                                    placeholder="0.000"
                                                    value={entry.pricePerLiter || ''}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'pricePerLiter', parseFloat(e.target.value))}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <Input 
                                                    type="number" 
                                                    placeholder="Odo"
                                                    value={entry.odometer || ''}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'odometer', parseFloat(e.target.value))}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <Input 
                                                    placeholder="Gas Station"
                                                    value={entry.location}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'location', e.target.value)}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <LocationInput 
                                                    placeholder="Address"
                                                    value={entry.stationAddress || ''}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'stationAddress', e.target.value)}
                                                    onAddressSelect={(address) => updateBulkEntry(entry.id, 'stationAddress', address)}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-center pt-1">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => removeBulkRow(entry.id)}
                                                    disabled={bulkEntries.length === 1}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={addBulkRow} 
                                    className="w-full mt-2 border-dashed text-slate-500 hover:text-slate-900"
                                >
                                    <Plus className="h-4 w-4 mr-2" /> Add Transaction
                                </Button>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => activeTab === 'single' ? handleSave() : handleBulkSave()}>
                        {activeTab === 'single' ? 'Save Log' : `Save ${bulkEntries.filter(e => e.amount > 0).length} Logs`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
