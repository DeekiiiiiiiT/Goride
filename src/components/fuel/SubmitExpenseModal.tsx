import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Upload, X, Loader2, MapPin, Plus, Trash2, ListFilter, FileText, Copy, AlertTriangle, Clock, Sparkles, Wand2 } from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { api } from '../../services/api';
import { aiVerificationService } from '../../services/aiVerificationService';
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
    const [activeTab, setActiveTab] = useState("single");
    
    const getLocalDateString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [commonData, setCommonData] = useState({
        driverId: '',
        vehicleId: '',
        date: '', // Default to no date
        paymentSource: 'driver_cash',
    });

    const stations = [
        "TotalEnergies",
        "Texaco",
        "Rubis",
        "FESCO",
        "Petcom",
        "Thrifty Gas",
        "Cool Oasis",
        "Jampet",
        "Independent"
    ];

    const [entries, setEntries] = useState<any[]>([{
        id: crypto.randomUUID(),
        date: '',
        time: '', // Default to no time
        amount: '',
        pricePerLiter: '',
        odometer: '',
        liters: '',
        notes: '',
        receiptUrl: '',
        stationName: '',
        stationLocation: '',
        // Local overrides
        paymentSource: '',
        // Verification State
        isFlagged: false,
        flagReason: undefined, 
    }]);

    const addEntry = () => {
        setEntries(prev => [...prev, {
            id: crypto.randomUUID(),
            date: commonData.date,
            time: '', // Default to no time for new rows
            amount: '',
            pricePerLiter: entries[entries.length - 1]?.pricePerLiter || '',
            odometer: '',
            liters: '',
            notes: '',
            receiptUrl: '',
            stationName: entries[entries.length - 1]?.stationName || '',
            stationLocation: entries[entries.length - 1]?.stationLocation || '',
            paymentSource: '',
            isFlagged: false,
        }]);
    };

    const duplicateEntry = (index: number) => {
        const entry = entries[index];
        const newEntry = {
            ...entry,
            id: crypto.randomUUID(),
            // We might want to clear unique things like receipt, but keep station/price
            receiptUrl: '',
            amount: '', // Amount is usually different
            notes: '',
            isFlagged: false,
            flagReason: undefined
        };
        const newEntries = [...entries];
        newEntries.splice(index + 1, 0, newEntry);
        setEntries(newEntries);
    };

    const removeEntry = (index: number) => {
        if (entries.length <= 1) return;
        setEntries(prev => prev.filter((_, i) => i !== index));
    };

    useEffect(() => {
        if (isOpen && initialData) {
            setActiveTab("single");
            const formattedDate = initialData.date ? initialData.date.split('T')[0] : '';
            setCommonData({
                driverId: initialData.driverId || '',
                vehicleId: initialData.vehicleId || '',
                date: formattedDate,
                paymentSource: initialData.metadata?.paymentSource || 'driver_cash',
            });
            setEntries([{
                id: initialData.id || crypto.randomUUID(),
                date: formattedDate,
                time: initialData.time || '',
                amount: initialData.amount ? Math.abs(initialData.metadata?.totalCost || initialData.amount).toString() : '',
                pricePerLiter: initialData.metadata?.pricePerLiter ? initialData.metadata.pricePerLiter.toString() : '',
                odometer: initialData.odometer ? initialData.odometer.toString() : '',
                liters: initialData.quantity ? initialData.quantity.toString() : '',
                notes: initialData.description || '',
                receiptUrl: initialData.receiptUrl || '',
                stationName: initialData.vendor || '',
                stationLocation: initialData.metadata?.stationLocation || '',
                paymentSource: initialData.metadata?.paymentSource || '',
                isFlagged: initialData.metadata?.isFlagged || false,
                flagReason: initialData.metadata?.flagReason,
            }]);
        } else if (isOpen && !initialData) {
            setCommonData({
                driverId: '',
                vehicleId: '',
                date: '', // No date by default
            });
            setEntries([{
                id: crypto.randomUUID(),
                date: '',
                time: '', // No time by default
                amount: '',
                pricePerLiter: '',
                odometer: '',
                liters: '',
                notes: '',
                receiptUrl: '',
                stationName: '',
                stationLocation: '',
                isFlagged: false,
            }]);
        }
    }, [isOpen, initialData]);
    const [isUploading, setIsUploading] = useState(false);
    
    // Address Autocomplete State
    const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const [activeLocationIndex, setActiveLocationIndex] = useState<number | null>(null);

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

    const updateEntry = (index: number, updates: any) => {
        setEntries(prev => prev.map((e, i) => i === index ? { ...e, ...updates } : e));
    };

    const handleLocationChange = (index: number, val: string) => {
        setActiveLocationIndex(index);
        updateEntry(index, { stationLocation: val });
        handleSearchAddress(val);
    };

    const handleSelectAddress = (index: number, address: AddressResult) => {
        updateEntry(index, { stationLocation: address.display_name });
        setShowSuggestions(false);
        setActiveLocationIndex(null);
    };

    const calculateVolume = (amount: string, price: string) => {
        const amt = parseFloat(amount);
        const prc = parseFloat(price);
        if (amt > 0 && prc > 0) {
            return (amt / prc).toFixed(2);
        }
        return '';
    };

    const handleAmountChange = (index: number, val: string) => {
        const updates: any = { amount: val };
        const price = entries[index].pricePerLiter;
        if (price && val) {
            updates.liters = calculateVolume(val, price);
        }
        updateEntry(index, updates);
    };

    const handlePriceChange = (index: number, val: string) => {
        const updates: any = { pricePerLiter: val };
        const amount = entries[index].amount;
        if (amount && val) {
            updates.liters = calculateVolume(amount, val);
        }
        updateEntry(index, updates);
    };

    const handleFileUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            // Upload to storage first
            const { url } = await api.uploadFile(file);
            updateEntry(index, { receiptUrl: url });
            toast.success("Receipt uploaded");

            // Phase 5: AI Auto-Scan
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                try {
                    toast.info("AI is scanning receipt...");
                    const aiResult = await aiVerificationService.processReceipt(base64);
                    
                    if (aiResult) {
                        const updates: any = {};
                        if (aiResult.odometer) updates.odometer = aiResult.odometer.toString();
                        if (aiResult.amount) {
                            updates.amount = aiResult.amount.toString();
                            // If we have amount, try to calculate liters if price exists
                            const currentPrice = entries[index].pricePerLiter;
                            if (currentPrice) {
                                const vol = (aiResult.amount / parseFloat(currentPrice)).toFixed(2);
                                updates.liters = vol;
                            }
                        }
                        if (aiResult.liters) updates.liters = aiResult.liters.toString();
                        if (aiResult.stationName) updates.stationName = aiResult.stationName;
                        if (aiResult.date) updates.date = aiResult.date;

                        // AI Confidence Flag
                        if (aiResult.confidence < 0.7) {
                            updates.isFlagged = true;
                            updates.flagReason = "Low confidence AI extraction";
                        }

                        updateEntry(index, updates);
                        toast.success("AI extracted receipt details", {
                            icon: <Sparkles className="h-4 w-4 text-blue-500" />
                        });
                    }
                } catch (err) {
                    console.error("AI Scan failed", err);
                }
            };
            reader.readAsDataURL(file);

        } catch (error) {
            console.error(error);
            toast.error("Failed to upload receipt");
        } finally {
            setIsUploading(false);
        }
    };

    // Phase 5: AI Odometer Verification
    const [isVerifying, setIsVerifying] = useState<string | null>(null);
    const verifyOdometerWithAI = async (index: number) => {
        const entry = entries[index];
        if (!entry.odometer || !commonData.vehicleId) {
            toast.error("Need odometer and vehicle to verify");
            return;
        }

        setIsVerifying(entry.id);
        try {
            // 1. Fetch Odometer History
            const history = await api.getOdometerHistory(commonData.vehicleId);
            // Sort descending by date/value
            const sortedHistory = history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            // Find the most recent verified reading
            // We need to be careful not to pick the current entry if it was somehow already logged
            const lastReading = sortedHistory[0];

            if (!lastReading) {
                 toast.info("No previous odometer history found. Cannot verify.", { description: "This will be the baseline." });
                 return;
            }

            const currentOdo = parseFloat(entry.odometer);
            const prevOdo = lastReading.value;
            
            if (currentOdo <= prevOdo) {
                 toast.warning("Odometer lower than previous reading", { description: `Previous: ${prevOdo} km` });
                 updateEntry(index, { isFlagged: true, flagReason: `Lower than previous reading (${prevOdo})` });
                 return;
            }

            // 2. Fetch Trips since last reading
            // We want trips that happened AFTER the last reading.
            const { data: trips } = await api.getTripsFiltered({
                vehicleId: commonData.vehicleId,
                startDate: lastReading.date,
                // If we have a date for the current entry, use it as end date
                endDate: entry.date || commonData.date || undefined 
            });

            const tripsDist = trips.reduce((sum, t) => sum + (t.distance || 0), 0);

            // 3. AI Verification
            const result = await aiVerificationService.verifyOdometer(currentOdo, prevOdo, tripsDist);
            
            if (result.correction && result.correction !== currentOdo) {
                toast("AI suggests a typo correction", {
                    description: `${result.message}. Correct to ${result.correction}?`,
                    action: {
                        label: "Correct",
                        onClick: () => updateEntry(index, { odometer: result.correction?.toString(), isFlagged: false, flagReason: undefined })
                    }
                });
                updateEntry(index, { isFlagged: true, flagReason: result.message });
            } else if (!result.isValid) {
                toast.warning("AI flagged this reading", { description: result.message });
                updateEntry(index, { isFlagged: true, flagReason: result.message });
            } else {
                toast.success("Odometer verified by AI");
                updateEntry(index, { isFlagged: false, flagReason: undefined });
            }
        } catch (err) {
            console.error(err);
            toast.error("Verification failed");
        } finally {
            setIsVerifying(null);
        }
    };

    // Odometer Sequential Validation
    const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
        const rows = entries.length;
        const cols = 6; // time, amount, price, station, odometer, receipt?

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextRow = Math.min(rowIndex + 1, rows - 1);
            const nextEl = document.querySelector(`[data-row="${nextRow}"][data-col="${colIndex}"]`) as HTMLElement;
            nextEl?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevRow = Math.max(rowIndex - 1, 0);
            const prevEl = document.querySelector(`[data-row="${prevRow}"][data-col="${colIndex}"]`) as HTMLElement;
            prevEl?.focus();
        } else if (e.key === 'ArrowRight' && (e.target as HTMLInputElement).selectionEnd === (e.target as HTMLInputElement).value.length) {
            const nextCol = Math.min(colIndex + 1, cols - 1);
            const nextEl = document.querySelector(`[data-row="${rowIndex}"][data-col="${nextCol}"]`) as HTMLElement;
            nextEl?.focus();
        } else if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0) {
            const prevCol = Math.max(colIndex - 1, 0);
            const prevEl = document.querySelector(`[data-row="${rowIndex}"][data-col="${prevCol}"]`) as HTMLElement;
            prevEl?.focus();
        }
    };

    const odometerErrors = useMemo(() => {
        if (activeTab !== 'bulk') return new Map();
        const errors = new Map<string, string>();
        
        const sorted = [...entries]
            .filter(e => e.odometer)
            .sort((a, b) => {
                const dateA = a.date || commonData.date;
                const dateB = b.date || commonData.date;
                if (dateA !== dateB) return dateA.localeCompare(dateB);
                return (a.time || '').localeCompare(b.time || '');
            });

        let lastOdo = 0;
        sorted.forEach((e, idx) => {
            const currentOdo = parseFloat(e.odometer);
            if (idx > 0 && currentOdo <= lastOdo) {
                errors.set(e.id, `Sequence Error: ${currentOdo} <= ${lastOdo}`);
            }
            if (idx > 0 && currentOdo - lastOdo > 2000) {
                errors.set(e.id, `Warning: Large jump detected (+${currentOdo - lastOdo} km)`);
            }
            lastOdo = currentOdo;
        });

        return errors;
    }, [entries, activeTab, commonData.date]);

    const handleSubmit = async () => {
        if (!commonData.driverId) {
            toast.error("Please select a driver");
            return;
        }

        if (!commonData.vehicleId) {
            toast.error("Please select a vehicle");
            return;
        }

        if (!commonData.date) {
            toast.error("Please select a date");
            return;
        }

        if (!commonData.paymentSource) {
            toast.error("Please select a payment source");
            return;
        }

        const validEntries = entries.filter(e => e.amount && parseFloat(e.amount) > 0);
        
        if (validEntries.length === 0) {
            toast.error("Please enter at least one valid amount");
            return;
        }

        // Validate that all entries have a Price Per Liter
        const missingPrice = validEntries.find(e => !e.pricePerLiter || parseFloat(e.pricePerLiter) <= 0);
        if (missingPrice) {
            toast.error("Price per liter is required for all entries");
            return;
        }

        setIsSubmitting(true);
        try {
            console.log(`Submitting ${validEntries.length} expense entries...`);
            const driver = drivers.find(d => d.id === commonData.driverId);
            const vehicle = vehicles.find(v => v.id === commonData.vehicleId);

            // Sequential submission to avoid race conditions in ledger/settlement
            for (let i = 0; i < validEntries.length; i++) {
                const entry = validEntries[i];
                const pSource = entry.paymentSource || commonData.paymentSource;
                const amountVal = parseFloat(entry.amount);
                const netAmount = pSource === 'driver_cash' ? amountVal : 0;
                
                // Only refresh on the VERY LAST entry to ensure UI only updates once
                const isLast = i === validEntries.length - 1;

                const transactionData = {
                    id: entry.id,
                    date: commonData.date || entry.date || getLocalDateString(),
                    time: entry.time || '',
                    driverId: commonData.driverId,
                    driverName: driver?.name || 'Unknown Driver',
                    vehicleId: commonData.vehicleId || undefined,
                    vehiclePlate: vehicle?.licensePlate || undefined,
                    type: 'Fuel_Manual_Entry',
                    category: 'Fuel',
                    description: entry.notes || 'Fuel Expense Log',
                    amount: netAmount, 
                    paymentMethod: pSource === 'company_card' ? 'Gas Card' : (pSource === 'petty_cash' ? 'Other' : 'Cash'),
                    status: initialData?.status || 'Pending',
                    receiptUrl: entry.receiptUrl,
                    odometer: entry.odometer ? parseFloat(entry.odometer) : 0,
                    quantity: entry.liters ? parseFloat(entry.liters) : undefined,
                    vendor: entry.stationName,
                    metadata: {
                        stationLocation: entry.stationLocation,
                        pricePerLiter: entry.pricePerLiter ? parseFloat(entry.pricePerLiter) : undefined,
                        source: entries.length > 1 ? 'Bulk Manual' : 'Manual',
                        portal_type: 'Manual_Entry',
                        isManual: true,
                        paymentSource: pSource,
                        totalCost: amountVal,
                        isFlagged: entry.isFlagged,
                        flagReason: entry.flagReason
                    },
                    isReconciled: false
                };
                
                // Cast to any to bypass type check since we added a new param
                await (onSave as any)(transactionData, isLast);
            }

            toast.success(validEntries.length > 1 
                ? `Successfully submitted batch of ${validEntries.length} expenses` 
                : "Expense successfully submitted");
            onClose();
        } catch (error) {
            console.error('Submit error:', error);
            toast.error("Failed to submit expense(s). Check your connection.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={activeTab === 'bulk' ? "sm:max-w-[1100px]" : "sm:max-w-[650px]"}>
                <DialogHeader>
                    <div className="flex items-center justify-between mr-8">
                        <div>
                            <DialogTitle>{initialData ? "Edit Manual Entry" : "Log Receipt / Manual Entry"}</DialogTitle>
                            <DialogDescription>
                                {initialData ? "Update the details of this receipt entry." : "Log a historical receipt or manual fuel entry for record keeping."}
                            </DialogDescription>
                        </div>
                        {!initialData && (
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                                <TabsList className="grid w-[200px] grid-cols-2">
                                    <TabsTrigger value="single" className="flex items-center gap-1.5">
                                        <FileText className="h-3.5 w-3.5" />
                                        Single
                                    </TabsTrigger>
                                    <TabsTrigger value="bulk" className="flex items-center gap-1.5">
                                        <ListFilter className="h-3.5 w-3.5" />
                                        Bulk
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        )}
                    </div>
                </DialogHeader>

                <div className="grid gap-6 py-4" ref={wrapperRef}>
                    {/* Common Details */}
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Common Details</Label>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="driver" className="text-xs">Driver <span className="text-red-500">*</span></Label>
                                <Select 
                                    value={commonData.driverId} 
                                    onValueChange={(val) => setCommonData(prev => ({ ...prev, driverId: val }))}
                                >
                                    <SelectTrigger className="bg-white h-9 text-sm">
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
                                <Label htmlFor="vehicle" className="text-xs">Vehicle <span className="text-red-500">*</span></Label>
                                <Select 
                                    value={commonData.vehicleId} 
                                    onValueChange={(val) => setCommonData(prev => ({ ...prev, vehicleId: val }))}
                                >
                                    <SelectTrigger className="bg-white h-9 text-sm">
                                        <SelectValue placeholder="Select Vehicle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {vehicles.map(v => (
                                            <SelectItem key={v.id} value={v.id}>{v.licensePlate}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="date" className="text-xs">Date <span className="text-red-500">*</span></Label>
                                    <button 
                                        onClick={() => setCommonData(prev => ({ ...prev, date: getLocalDateString() }))}
                                        className="text-[10px] text-blue-600 hover:underline"
                                    >
                                        Today
                                    </button>
                                </div>
                                <Input 
                                    id="date" 
                                    type="date"
                                    className="bg-white h-9 text-sm"
                                    value={commonData.date}
                                    onChange={(e) => setCommonData(prev => ({ ...prev, date: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 mt-2 border-t border-slate-200/60 pt-3">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase text-slate-400">Paid By <span className="text-red-500">*</span></Label>
                                <Select 
                                    value={commonData.paymentSource} 
                                    onValueChange={(val) => setCommonData(prev => ({ ...prev, paymentSource: val }))}
                                >
                                    <SelectTrigger className="bg-white h-9 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="driver_cash">Driver Cash / Out-of-pocket</SelectItem>
                                        <SelectItem value="company_card">Company Gas Card</SelectItem>
                                        <SelectItem value="petty_cash">Company Petty Cash</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsContent value="single" className="mt-0 space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="amount">Amount ($) <span className="text-red-500">*</span></Label>
                                    <Input 
                                        id="amount" 
                                        type="number" 
                                        step="0.01"
                                        placeholder="0.00"
                                        value={entries[0].amount}
                                        onChange={(e) => handleAmountChange(0, e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="price">Price ($/L) <span className="text-red-500">*</span></Label>
                                    <Input 
                                        id="price" 
                                        type="number" 
                                        step="0.01"
                                        placeholder="0.00"
                                        value={entries[0].pricePerLiter}
                                        onChange={(e) => handlePriceChange(0, e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="liters">Volume (L)</Label>
                                    <Input 
                                        id="liters" 
                                        type="number" 
                                        step="0.1"
                                        placeholder="0.0"
                                        readOnly
                                        className="bg-slate-50 cursor-not-allowed"
                                        value={entries[0].liters}
                                        onChange={(e) => updateEntry(0, { liters: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="time">Time</Label>
                                        <button 
                                            onClick={() => updateEntry(0, { time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })}
                                            className="text-[10px] text-blue-600 hover:underline"
                                        >
                                            Set to Now
                                        </button>
                                    </div>
                                    <Input 
                                        id="time" 
                                        type="time"
                                        value={entries[0].time}
                                        onChange={(e) => updateEntry(0, { time: e.target.value })}
                                    />
                                    <p className="text-[10px] text-slate-400 italic">Leave empty if not on receipt</p>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="odometer">Odometer Reading</Label>
                                        <button 
                                            onClick={() => verifyOdometerWithAI(0)}
                                            className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
                                            disabled={isVerifying === entries[0].id}
                                        >
                                            {isVerifying === entries[0].id ? <Loader2 className="h-2 w-2 animate-spin" /> : <Wand2 className="h-2 w-2" />}
                                            AI Verify
                                        </button>
                                    </div>
                                    <div className="relative">
                                        <Input 
                                            id="odometer" 
                                            type="number" 
                                            placeholder="0"
                                            value={entries[0].odometer}
                                            onChange={(e) => updateEntry(0, { odometer: e.target.value })}
                                            className={entries[0].isFlagged ? "border-amber-300 bg-amber-50" : ""}
                                        />
                                        {entries[0].isFlagged && (
                                            <div className="absolute right-2 top-2.5">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger>
                                                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="left">
                                                            <p>{entries[0].flagReason || "Flagged by AI"}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="stationName">Gas Station Name</Label>
                                    <Select 
                                        value={entries[0].stationName} 
                                        onValueChange={(val) => updateEntry(0, { stationName: val })}
                                    >
                                        <SelectTrigger id="stationName">
                                            <SelectValue placeholder="Select Gas Station" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stations.map(station => (
                                                <SelectItem key={station} value={station}>{station}</SelectItem>
                                            ))}
                                            {entries[0].stationName && !stations.includes(entries[0].stationName) && (
                                                <SelectItem value={entries[0].stationName}>{entries[0].stationName}</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="stationLocation">Station Location</Label>
                                    <div className="relative">
                                        <Input 
                                            id="stationLocation"
                                            placeholder="Enter address"
                                            value={entries[0].stationLocation}
                                            onChange={(e) => handleLocationChange(0, e.target.value)}
                                            onFocus={() => entries[0].stationLocation.length >= 3 && setShowSuggestions(true)}
                                            autoComplete="off"
                                        />
                                        {showSuggestions && suggestions.length > 0 && (
                                            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
                                                {suggestions.map((suggestion, index) => (
                                                    <button
                                                        key={index}
                                                        className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none flex items-center gap-2"
                                                        onClick={() => handleSelectAddress(0, suggestion)}
                                                    >
                                                        <MapPin className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                                        <span className="truncate">{suggestion.display_name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="receipt">Receipt Image</Label>
                                <div className="flex items-center gap-4">
                                    {entries[0].receiptUrl ? (
                                        <div className="relative h-24 w-full border rounded-lg overflow-hidden group">
                                            <img src={entries[0].receiptUrl} alt="Receipt" className="h-full w-full object-contain bg-slate-100" />
                                            <button 
                                                onClick={() => updateEntry(0, { receiptUrl: '' })}
                                                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex-1">
                                            <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                                <div className="flex flex-col items-center justify-center pt-2 pb-3">
                                                    {isUploading ? (
                                                        <Loader2 className="h-8 w-8 text-slate-400 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Upload className="h-8 w-8 text-slate-400 mb-2" />
                                                            <p className="text-sm text-slate-500">Upload Receipt Image</p>
                                                        </>
                                                    )}
                                                </div>
                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(0, e)} disabled={isUploading} />
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
                                    value={entries[0].notes}
                                    onChange={(e) => updateEntry(0, { notes: e.target.value })}
                                    className="min-h-[80px]"
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="bulk" className="mt-0">
                            <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                                <div className="bg-slate-50/80 backdrop-blur-sm px-4 py-2.5 border-b flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="h-5 w-5 rounded bg-blue-100 flex items-center justify-center">
                                            <ListFilter className="h-3 w-3 text-blue-600" />
                                        </div>
                                        <h4 className="text-xs font-bold uppercase text-slate-600 tracking-tight">Expense Line Items</h4>
                                    </div>
                                    <Button 
                                        size="sm" 
                                        variant="outline" 
                                        onClick={addEntry} 
                                        className="h-7 text-xs gap-1 hover:bg-white hover:text-blue-600 hover:border-blue-200 transition-all"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Add Row
                                    </Button>
                                </div>
                                <div className="max-h-[380px] overflow-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead className="bg-slate-50/50 sticky top-0 z-20 border-b border-slate-200">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[90px]">Time</th>
                                                <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[100px]">Amount ($)</th>
                                                <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[90px]">Price ($/L)</th>
                                                <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[90px]">Vol (L)</th>
                                                <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider min-w-[200px]">Station & Location</th>
                                                <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[100px]">Odometer</th>
                                                <th className="px-3 py-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[60px]">Rec.</th>
                                                <th className="px-3 py-2 w-[40px]"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {entries.map((entry, index) => (
                                                <tr key={entry.id} className="group hover:bg-slate-50/80 transition-colors">
                                                    <td className="px-2 py-1.5">
                                                        <div className="flex items-center gap-1 group/time">
                                                            <Input 
                                                                type="time" 
                                                                className="h-8 text-[11px] border-transparent focus:border-blue-200 bg-transparent focus:bg-white transition-all px-1 shadow-none w-full" 
                                                                value={entry.time}
                                                                onChange={(e) => updateEntry(index, { time: e.target.value })}
                                                                onKeyDown={(e) => handleKeyDown(e, index, 0)}
                                                                data-row={index}
                                                                data-col={0}
                                                            />
                                                            <button 
                                                                onClick={() => updateEntry(index, { time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })}
                                                                className="opacity-0 group-hover/time:opacity-100 p-1 text-slate-400 hover:text-blue-600 transition-all"
                                                                title="Set to Now"
                                                            >
                                                                <Clock className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <Input 
                                                            type="number" 
                                                            step="0.01"
                                                            placeholder="0.00"
                                                            className="h-8 text-xs border-transparent focus:border-blue-200 bg-transparent focus:bg-white transition-all px-2 shadow-none font-medium" 
                                                            value={entry.amount}
                                                            onChange={(e) => handleAmountChange(index, e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, index, 1)}
                                                            data-row={index}
                                                            data-col={1}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <Input 
                                                            type="number" 
                                                            step="0.01"
                                                            placeholder="0.00"
                                                            className="h-8 text-xs border-transparent focus:border-blue-200 bg-transparent focus:bg-white transition-all px-2 shadow-none" 
                                                            value={entry.pricePerLiter}
                                                            onChange={(e) => handlePriceChange(index, e.target.value)}
                                                            onKeyDown={(e) => handleKeyDown(e, index, 2)}
                                                            data-row={index}
                                                            data-col={2}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <div className="h-8 flex items-center px-2 text-xs text-slate-400 italic">
                                                            {entry.liters || '--'}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <div className="space-y-1">
                                                            <Select 
                                                                value={entry.stationName} 
                                                                onValueChange={(val) => updateEntry(index, { stationName: val })}
                                                            >
                                                                <SelectTrigger className="h-8 text-[11px] border-transparent focus:border-blue-200 bg-transparent focus:bg-white transition-all px-2 shadow-none">
                                                                    <SelectValue placeholder="Station" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {stations.map(station => (
                                                                        <SelectItem key={station} value={station}>{station}</SelectItem>
                                                                    ))}
                                                                    {entry.stationName && !stations.includes(entry.stationName) && (
                                                                        <SelectItem value={entry.stationName}>{entry.stationName}</SelectItem>
                                                                    )}
                                                                </SelectContent>
                                                            </Select>
                                                            <div className="relative">
                                                                <Input 
                                                                    placeholder="Address / Location"
                                                                    className="h-7 text-[10px] border-transparent focus:border-blue-200 bg-transparent focus:bg-white transition-all px-2 shadow-none text-slate-500" 
                                                                    value={entry.stationLocation}
                                                                    onChange={(e) => handleLocationChange(index, e.target.value)}
                                                                    onFocus={() => {
                                                                        setActiveLocationIndex(index);
                                                                        entry.stationLocation.length >= 3 && setShowSuggestions(true);
                                                                    }}
                                                                    autoComplete="off"
                                                                    onKeyDown={(e) => handleKeyDown(e, index, 4)}
                                                                    data-row={index}
                                                                    data-col={4}
                                                                />
                                                                {showSuggestions && activeLocationIndex === index && suggestions.length > 0 && (
                                                                    <div className="absolute z-[100] w-[300px] mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-auto py-1">
                                                                        {suggestions.map((suggestion, sIdx) => (
                                                                            <button
                                                                                key={sIdx}
                                                                                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-blue-50 focus:bg-blue-50 focus:outline-none flex items-start gap-2 border-b border-slate-50 last:border-0"
                                                                                onClick={() => handleSelectAddress(index, suggestion)}
                                                                            >
                                                                                <MapPin className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
                                                                                <span className="truncate leading-relaxed">{suggestion.display_name}</span>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <div className="relative">
                                                            <Input 
                                                                type="number" 
                                                                placeholder="0"
                                                                className={`h-8 text-xs border-transparent focus:border-blue-200 bg-transparent focus:bg-white transition-all px-2 shadow-none ${odometerErrors.has(entry.id) ? 'text-amber-600 font-bold' : ''} ${entry.isFlagged ? "border-amber-300 bg-amber-50" : ""}`} 
                                                                value={entry.odometer}
                                                                onChange={(e) => updateEntry(index, { odometer: e.target.value })}
                                                                onKeyDown={(e) => handleKeyDown(e, index, 5)}
                                                                data-row={index}
                                                                data-col={5}
                                                            />
                                                            {entry.isFlagged && (
                                                                <div className="absolute right-1 top-2">
                                                                    <TooltipProvider>
                                                                        <Tooltip>
                                                                            <TooltipTrigger>
                                                                                <AlertTriangle className="h-3 w-3 text-amber-500" />
                                                                            </TooltipTrigger>
                                                                            <TooltipContent side="left">
                                                                                <p>{entry.flagReason || "Flagged by AI"}</p>
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    </TooltipProvider>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-center">
                                                        <label className={`cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors ${entry.receiptUrl ? 'text-blue-500 bg-blue-50' : 'text-slate-300'}`}>
                                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(index, e)} disabled={isUploading} />
                                                            {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                                        </label>
                                                    </td>
                                                    <td className="px-1 py-1.5 text-center">
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button 
                                                                onClick={() => duplicateEntry(index)}
                                                                className="p-1 text-slate-400 hover:text-blue-600"
                                                                title="Duplicate Row"
                                                            >
                                                                <Copy className="h-3 w-3" />
                                                            </button>
                                                            <button 
                                                                onClick={() => removeEntry(index)}
                                                                className="p-1 text-slate-400 hover:text-red-600"
                                                                title="Remove Row"
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="px-4 py-2 border-t bg-slate-50 flex justify-between items-center text-xs text-slate-500">
                                    <span>{entries.length} items</span>
                                    <span>Use tab/arrow keys to navigate grid</span>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                <DialogFooter>
                    <div className="flex items-center justify-between w-full">
                        <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[120px] bg-slate-900 text-white hover:bg-slate-800 transition-all">
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    {initialData ? "Updating..." : "Saving..."}
                                </>
                            ) : (
                                initialData ? "Save Changes" : "Save Expense"
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
