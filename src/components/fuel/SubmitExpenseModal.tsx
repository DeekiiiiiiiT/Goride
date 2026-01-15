import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Upload, X, Loader2, MapPin } from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { api } from '../../services/api';
import { searchAddress, AddressResult, debounce } from '../../utils/locationService';

interface SubmitExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: any) => Promise<void>;
    drivers: any[];
    vehicles: any[];
    initialData?: any;
}

export function SubmitExpenseModal({ isOpen, onClose, onSave, drivers, vehicles, initialData }: SubmitExpenseModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const getLocalDateString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [formData, setFormData] = useState({
        driverId: '',
        vehicleId: '',
        date: getLocalDateString(),
        amount: '',
        pricePerLiter: '',
        odometer: '',
        liters: '',
        notes: '',
        receiptUrl: '',
        stationName: '',
        stationLocation: ''
    });

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData({
                driverId: initialData.driverId || '',
                vehicleId: initialData.vehicleId || '',
                date: initialData.date || getLocalDateString(),
                amount: initialData.amount ? Math.abs(initialData.amount).toString() : '',
                pricePerLiter: initialData.metadata?.pricePerLiter ? initialData.metadata.pricePerLiter.toString() : '',
                odometer: initialData.odometer ? initialData.odometer.toString() : '',
                liters: initialData.quantity ? initialData.quantity.toString() : '',
                notes: initialData.description || '',
                receiptUrl: initialData.receiptUrl || '',
                stationName: initialData.vendor || '',
                stationLocation: initialData.metadata?.stationLocation || ''
            });
        } else if (isOpen && !initialData) {
            setFormData({
                driverId: '',
                vehicleId: '',
                date: getLocalDateString(),
                amount: '',
                pricePerLiter: '',
                odometer: '',
                liters: '',
                notes: '',
                receiptUrl: '',
                stationName: '',
                stationLocation: ''
            });
        }
    }, [isOpen, initialData]);
    const [isUploading, setIsUploading] = useState(false);
    
    // Address Autocomplete State
    const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close suggestions when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [wrapperRef]);

    const handleSearchAddress = useCallback(
        debounce(async (query: string) => {
            if (!query || query.length < 3) {
                setSuggestions([]);
                return;
            }
            const results = await searchAddress(query);
            setSuggestions(results);
            setShowSuggestions(true);
        }, 500),
        []
    );

    const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setFormData(prev => ({ ...prev, stationLocation: val }));
        handleSearchAddress(val);
    };

    const handleSelectAddress = (address: AddressResult) => {
        setFormData(prev => ({ ...prev, stationLocation: address.display_name }));
        setShowSuggestions(false);
    };

    const calculateVolume = (amount: string, price: string) => {
        const amt = parseFloat(amount);
        const prc = parseFloat(price);
        if (amt > 0 && prc > 0) {
            return (amt / prc).toFixed(2);
        }
        return '';
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const newVol = calculateVolume(val, formData.pricePerLiter);
        setFormData(prev => ({ 
            ...prev, 
            amount: val,
            liters: newVol !== '' ? newVol : prev.liters 
        }));
    };

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const newVol = calculateVolume(formData.amount, val);
        setFormData(prev => ({ 
            ...prev, 
            pricePerLiter: val,
            liters: newVol !== '' ? newVol : prev.liters 
        }));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const { url } = await api.uploadFile(file);
            setFormData(prev => ({ ...prev, receiptUrl: url }));
            toast.success("Receipt uploaded");
        } catch (error) {
            console.error(error);
            toast.error("Failed to upload receipt");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!formData.driverId) {
            toast.error("Please select a driver");
            return;
        }
        if (!formData.amount || parseFloat(formData.amount) <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }
        if (!formData.date) {
            toast.error("Please select a date");
            return;
        }

        setIsSubmitting(true);
        try {
            const driver = drivers.find(d => d.id === formData.driverId);
            const vehicle = vehicles.find(v => v.id === formData.vehicleId);

            const transactionData = {
                id: initialData?.id || crypto.randomUUID(),
                date: formData.date,
                time: initialData?.time || new Date().toLocaleTimeString(),
                driverId: formData.driverId,
                driverName: driver?.name || 'Unknown Driver',
                vehicleId: formData.vehicleId || undefined,
                vehiclePlate: vehicle?.licensePlate || undefined,
                type: 'Reimbursement',
                category: 'Fuel Reimbursement',
                description: formData.notes || 'Fuel Expense Reimbursement',
                amount: -parseFloat(formData.amount), // Expenses are negative in financial ledger? 
                // Wait, Reimbursement Request -> Amount Claimed. 
                // Usually represented as positive in the Request UI, but negative in ledger if it's an outflow.
                // However, "Pending" transaction might just store the magnitude.
                // Let's store as negative to be consistent with "Expense".
                paymentMethod: 'Cash', // Driver paid cash
                status: initialData?.status || 'Pending',
                receiptUrl: formData.receiptUrl,
                odometer: formData.odometer ? parseFloat(formData.odometer) : 0,
                quantity: formData.liters ? parseFloat(formData.liters) : undefined,
                vendor: formData.stationName,
                metadata: {
                    stationLocation: formData.stationLocation,
                    pricePerLiter: formData.pricePerLiter ? parseFloat(formData.pricePerLiter) : undefined,
                    source: 'Manual'
                },
                isReconciled: false
            };

            await onSave(transactionData);
            onClose();
            // Reset form
            setFormData({
                driverId: '',
                vehicleId: '',
                date: getLocalDateString(),
                amount: '',
                pricePerLiter: '',
                odometer: '',
                liters: '',
                notes: '',
                receiptUrl: '',
                stationName: '',
                stationLocation: ''
            });
        } catch (error) {
            console.error(error);
            toast.error("Failed to submit expense");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? "Edit Expense Claim" : "Submit Expense Claim"}</DialogTitle>
                    <DialogDescription>
                        {initialData ? "Update the details of this expense claim." : "Log a driver's out-of-pocket fuel expense for reimbursement."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
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
                        <div className="space-y-2">
                            <Label htmlFor="date">Date</Label>
                            <Input 
                                id="date" 
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="amount">Amount ($)</Label>
                            <Input 
                                id="amount" 
                                type="number" 
                                step="0.01"
                                placeholder="0.00"
                                value={formData.amount}
                                onChange={handleAmountChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price">Price ($/L)</Label>
                            <Input 
                                id="price" 
                                type="number" 
                                step="0.01"
                                placeholder="0.00"
                                value={formData.pricePerLiter}
                                onChange={handlePriceChange}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="liters">Volume (L) <span className="text-xs text-slate-400 font-normal">(Auto)</span></Label>
                            <Input 
                                id="liters" 
                                type="number" 
                                step="0.1"
                                placeholder="0.0"
                                value={formData.liters}
                                onChange={(e) => setFormData(prev => ({ ...prev, liters: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="vehicle">Vehicle <span className="text-xs text-slate-400 font-normal">(Optional)</span></Label>
                        <Select 
                            value={formData.vehicleId} 
                            onValueChange={(val) => setFormData(prev => ({ ...prev, vehicleId: val }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select Vehicle" />
                            </SelectTrigger>
                            <SelectContent>
                                {vehicles.map(v => (
                                    <SelectItem key={v.id} value={v.id}>{v.licensePlate}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="odometer">Odometer <span className="text-xs text-slate-400 font-normal">(Optional)</span></Label>
                            <Input 
                                id="odometer" 
                                type="number" 
                                placeholder="0"
                                value={formData.odometer}
                                onChange={(e) => setFormData(prev => ({ ...prev, odometer: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="stationName">Gas Station Name</Label>
                            <Input 
                                id="stationName"
                                placeholder="Enter gas station name (e.g. Fortune Texaco)"
                                value={formData.stationName}
                                onChange={(e) => setFormData(prev => ({ ...prev, stationName: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="space-y-2" ref={wrapperRef}>
                        <Label htmlFor="stationLocation">Gas Station Location</Label>
                        <div className="relative">
                            <Input 
                                id="stationLocation"
                                placeholder="Enter address (e.g. 123 Main St)"
                                value={formData.stationLocation}
                                onChange={handleLocationChange}
                                onFocus={() => formData.stationLocation.length >= 3 && setShowSuggestions(true)}
                                autoComplete="off"
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
                                    {suggestions.map((suggestion, index) => (
                                        <button
                                            key={index}
                                            className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-center gap-2"
                                            onClick={() => handleSelectAddress(suggestion)}
                                        >
                                            <MapPin className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                            <span className="truncate">{suggestion.display_name}</span>
                                        </button>
                                    ))}
                                    <div className="px-2 py-1 flex justify-end">
                                        <img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" className="h-4 opacity-75" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="receipt">Receipt Image</Label>
                        <div className="flex items-center gap-4">
                            {formData.receiptUrl ? (
                                <div className="relative h-20 w-20 border rounded-lg overflow-hidden group">
                                    <img src={formData.receiptUrl} alt="Receipt" className="h-full w-full object-cover" />
                                    <button 
                                        onClick={() => setFormData(prev => ({ ...prev, receiptUrl: '' }))}
                                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex-1">
                                    <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                        <div className="flex flex-col items-center justify-center pt-2 pb-3">
                                            {isUploading ? (
                                                <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
                                            ) : (
                                                <>
                                                    <Upload className="h-6 w-6 text-slate-400 mb-1" />
                                                    <p className="text-xs text-slate-500">Upload Receipt</p>
                                                </>
                                            )}
                                        </div>
                                        <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={isUploading} />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Textarea 
                            id="notes" 
                            placeholder="Additional details..." 
                            value={formData.notes}
                            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting || isUploading}>
                        {isSubmitting ? "Submitting..." : (initialData ? "Save Changes" : "Submit Claim")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
