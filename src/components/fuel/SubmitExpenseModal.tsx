import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { Upload, X, Loader2, MapPin, Plus, Trash2, ListFilter, FileText, Copy, AlertTriangle, Clock, Sparkles, Wand2, Building2 } from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { api } from '../../services/api';
import { aiVerificationService, AIReceiptResult } from '../../services/aiVerificationService';
import { AIExtractionReview } from './AIExtractionReview';
import { searchAddress, AddressResult, debounce } from '../../utils/locationService';
import { cn } from "../ui/utils";
import { fuelService } from '../../services/fuelService';
import { StationProfile } from '../../types/station';

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
    const [isUploading, setIsUploading] = useState(false);
    
    // AI Review Workflow (Phase 2 Step 2.3)
    const [aiReviewData, setAiReviewData] = useState<{ index: number, result: AIReceiptResult, image: string } | null>(null);

    // --- Verified Station Data for Brand → Station cascade ---
    const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
    const [stationsLoading, setStationsLoading] = useState(false);
    const [parentCompanies, setParentCompanies] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        setStationsLoading(true);
        Promise.all([
            fuelService.getStations(),
            fuelService.getParentCompanies()
        ])
            .then(([allStations, companies]: [StationProfile[], any[]]) => {
                if (cancelled) return;
                const verified = allStations.filter((s: StationProfile) => s.status === 'verified');
                setVerifiedStations(verified);
                const companyNames = (companies || [])
                    .map((c: any) => c.name)
                    .filter(Boolean)
                    .sort() as string[];
                setParentCompanies(companyNames);
            })
            .catch((err) => {
                console.error('Failed to fetch stations/parent companies:', err);
                if (!cancelled) {
                    setVerifiedStations([]);
                    setParentCompanies([]);
                }
            })
            .finally(() => {
                if (!cancelled) setStationsLoading(false);
            });
        return () => { cancelled = true; };
    }, [isOpen]);

    // Use parent companies as the single source of truth for brand list
    const uniqueBrands = useMemo(() => {
        return parentCompanies;
    }, [parentCompanies]);

    // Get verified stations filtered by a specific brand
    const getStationsForBrand = useCallback((brand: string): StationProfile[] => {
        if (!brand) return [];
        return verifiedStations
            .filter(s => s.brand === brand)
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [verifiedStations]);

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
        date: '',
        paymentSource: 'driver_cash',
    });

    const [entries, setEntries] = useState<any[]>([{
        id: crypto.randomUUID(),
        date: '',
        time: '',
        amount: '',
        pricePerLiter: '',
        odometer: '',
        liters: '',
        notes: '',
        receiptUrl: '',
        stationName: '',
        stationLocation: '',
        matchedStationId: '',
        paymentSource: '',
        isFlagged: false,
        flagReason: undefined, 
    }]);

    const addEntry = () => {
        setEntries(prev => [...prev, {
            id: crypto.randomUUID(),
            date: commonData.date,
            time: '',
            amount: '',
            pricePerLiter: entries[entries.length - 1]?.pricePerLiter || '',
            odometer: '',
            liters: '',
            notes: '',
            receiptUrl: '',
            stationName: entries[entries.length - 1]?.stationName || '',
            stationLocation: '',
            matchedStationId: '',
            paymentSource: '',
            isFlagged: false,
        }]);
    };

    const removeEntry = (index: number) => {
        if (entries.length <= 1) return;
        setEntries(prev => prev.filter((_, i) => i !== index));
    };

    const duplicateEntry = (index: number) => {
        const entry = entries[index];
        const newEntry = {
            ...entry,
            id: crypto.randomUUID(),
            receiptUrl: '',
            amount: '',
            notes: '',
            isFlagged: false,
            flagReason: undefined
        };
        const newEntries = [...entries];
        newEntries.splice(index + 1, 0, newEntry);
        setEntries(newEntries);
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
                matchedStationId: initialData.matchedStationId || initialData.metadata?.matchedStationId || '',
                paymentSource: initialData.metadata?.paymentSource || '',
                isFlagged: initialData.metadata?.isFlagged || false,
                flagReason: initialData.metadata?.flagReason,
            }]);
        } else if (isOpen && !initialData) {
            setCommonData({
                driverId: '',
                vehicleId: '',
                date: '',
                paymentSource: 'driver_cash',
            });
            setEntries([{
                id: crypto.randomUUID(),
                date: '',
                time: '',
                amount: '',
                pricePerLiter: '',
                odometer: '',
                liters: '',
                notes: '',
                receiptUrl: '',
                stationName: '',
                stationLocation: '',
                matchedStationId: '',
                isFlagged: false,
            }]);
        }
    }, [isOpen, initialData]);

    const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [activeLocationIndex, setActiveLocationIndex] = useState<number | null>(null);

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
        updateEntry(index, { stationLocation: val, matchedStationId: '' });
        handleSearchAddress(val);
    };

    const handleSelectAddress = (index: number, address: AddressResult) => {
        updateEntry(index, { stationLocation: address.display_name });
        setShowSuggestions(false);
        setActiveLocationIndex(null);
    };

    // Handler: when a verified station is picked from the Location dropdown
    const handleVerifiedStationSelect = (index: number, stationId: string) => {
        const station = verifiedStations.find(s => s.id === stationId);
        if (station) {
            updateEntry(index, {
                stationLocation: station.address || '',
                matchedStationId: station.id,
            });
        }
    };

    // Handler: when brand changes, clear the station selection for that entry
    const handleBrandChange = (index: number, brand: string) => {
        updateEntry(index, { stationName: brand, stationLocation: '', matchedStationId: '' });
    };

    const handleAmountChange = (index: number, val: string) => {
        const updates: any = { amount: val };
        const price = entries[index].pricePerLiter;
        if (price && val) {
            updates.liters = (parseFloat(val) / parseFloat(price)).toFixed(2);
        }
        updateEntry(index, updates);
    };

    const handlePriceChange = (index: number, val: string) => {
        const updates: any = { pricePerLiter: val };
        const amount = entries[index].amount;
        if (amount && val) {
            updates.liters = (parseFloat(amount) / parseFloat(val)).toFixed(2);
        }
        updateEntry(index, updates);
    };

    const handleFileUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const { url } = await api.uploadFile(file);
            updateEntry(index, { receiptUrl: url });
            toast.success("Receipt uploaded");

            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                try {
                    toast.info("Gemini Vision is scanning receipt...");
                    const aiResult = await aiVerificationService.processReceipt(base64);
                    if (aiResult) {
                        setAiReviewData({ index, result: aiResult, image: base64 });
                    }
                } catch (err) {
                    console.error("AI Scan failed", err);
                    toast.error("AI scan failed. Please enter details manually.");
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            toast.error("Failed to upload receipt");
        } finally {
            setIsUploading(false);
        }
    };

    const handleConfirmAI = (data: Partial<AIReceiptResult>) => {
        if (!aiReviewData) return;
        const index = aiReviewData.index;
        const updates: any = {};
        if (data.odometer) updates.odometer = data.odometer.toString();
        if (data.amount) {
            updates.amount = data.amount.toString();
            const currentPrice = entries[index].pricePerLiter;
            if (currentPrice) updates.liters = (data.amount / parseFloat(currentPrice)).toFixed(2);
        }
        if (data.liters) updates.liters = data.liters.toString();
        if (data.stationName) updates.stationName = data.stationName;
        if (data.date) updates.date = data.date;

        if ((data.confidence || 0) < 0.7) {
            updates.isFlagged = true;
            updates.flagReason = "Low confidence AI extraction verified by user";
        }

        updateEntry(index, updates);
        setAiReviewData(null);
        toast.success("AI data applied");
    };

    const [isVerifying, setIsVerifying] = useState<string | null>(null);
    const verifyOdometerWithAI = async (index: number) => {
        const entry = entries[index];
        if (!entry.odometer || !commonData.vehicleId) {
            toast.error("Need odometer and vehicle to verify");
            return;
        }

        setIsVerifying(entry.id);
        try {
            const history = await api.getOdometerHistory(commonData.vehicleId);
            const sortedHistory = history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const lastReading = sortedHistory[0];

            if (!lastReading) {
                 toast.info("No history found. Setting baseline.");
                 return;
            }

            const currentOdo = parseFloat(entry.odometer);
            const prevOdo = lastReading.value;
            
            if (currentOdo <= prevOdo) {
                 toast.warning("Odometer lower than previous reading");
                 updateEntry(index, { isFlagged: true, flagReason: `Lower than previous (${prevOdo})` });
                 return;
            }

            const { data: trips } = await api.getTripsFiltered({
                vehicleId: commonData.vehicleId,
                startDate: lastReading.date,
                endDate: entry.date || commonData.date || undefined 
            });

            const tripsDist = trips.reduce((sum, t) => sum + (t.distance || 0), 0);
            const entryDate = entry.date || commonData.date || new Date().toISOString().split('T')[0];
            const entryTime = entry.time || '12:00';
            const currentDateStr = `${entryDate}T${entryTime}`;
            const result = await aiVerificationService.verifyOdometer(currentOdo, prevOdo, tripsDist, lastReading.date, currentDateStr);
            
            if (result.correction && result.correction !== currentOdo) {
                toast("AI suggests correction", {
                    description: `${result.message}. Correct to ${result.correction}?`,
                    action: { label: "Correct", onClick: () => updateEntry(index, { odometer: result.correction?.toString(), isFlagged: false }) }
                });
                updateEntry(index, { isFlagged: true, flagReason: result.message });
            } else if (!result.isValid) {
                toast.warning("AI flagged reading", { description: result.message });
                updateEntry(index, { isFlagged: true, flagReason: result.message });
            } else {
                toast.success("Odometer verified");
                updateEntry(index, { isFlagged: false });
            }
        } catch (err) {
            toast.error("Verification failed");
        } finally {
            setIsVerifying(null);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
        const rows = entries.length;
        const cols = 6;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextRow = Math.min(rowIndex + 1, rows - 1);
            (document.querySelector(`[data-row="${nextRow}"][data-col="${colIndex}"]`) as HTMLElement)?.focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevRow = Math.max(rowIndex - 1, 0);
            (document.querySelector(`[data-row="${prevRow}"][data-col="${colIndex}"]`) as HTMLElement)?.focus();
        }
    };

    const handleSubmit = async () => {
        if (!commonData.driverId || !commonData.vehicleId || !commonData.date || !commonData.paymentSource) {
            toast.error("Please fill all common details");
            return;
        }

        const validEntries = entries.filter(e => e.amount && parseFloat(e.amount) > 0);
        if (validEntries.length === 0) {
            toast.error("Enter at least one valid amount");
            return;
        }

        setIsSubmitting(true);
        try {
            const driver = drivers.find(d => d.id === commonData.driverId);
            const vehicle = vehicles.find(v => v.id === commonData.vehicleId);

            for (let i = 0; i < validEntries.length; i++) {
                const entry = validEntries[i];
                const pSource = entry.paymentSource || commonData.paymentSource;
                const amountVal = parseFloat(entry.amount);
                const isLast = i === validEntries.length - 1;

                const transactionData = {
                    id: entry.id,
                    date: commonData.date || entry.date || getLocalDateString(),
                    time: entry.time || '',
                    driverId: commonData.driverId,
                    driverName: driver?.name || 'Unknown Driver',
                    vehicleId: commonData.vehicleId,
                    vehiclePlate: vehicle?.licensePlate,
                    type: 'Fuel_Manual_Entry',
                    category: 'Fuel',
                    description: entry.notes || 'Fuel Expense Log',
                    amount: amountVal, 
                    paymentMethod: pSource === 'company_card' ? 'Gas Card' : (pSource === 'petty_cash' ? 'Other' : (pSource === 'rideshare_cash' ? 'RideShare Cash' : 'Cash')),
                    status: initialData?.status || 'Pending',
                    receiptUrl: entry.receiptUrl,
                    odometer: entry.odometer ? parseFloat(entry.odometer) : 0,
                    quantity: entry.liters ? parseFloat(entry.liters) : undefined,
                    vendor: entry.stationName,
                    matchedStationId: entry.matchedStationId || undefined,
                    metadata: {
                        // Preserve all existing metadata (GPS coords, AI scores, etc.) on edit
                        ...(initialData?.metadata || {}),
                        stationLocation: entry.stationLocation,
                        pricePerLiter: entry.pricePerLiter ? parseFloat(entry.pricePerLiter) : undefined,
                        source: entries.length > 1 ? 'Bulk Manual' : 'Manual',
                        portal_type: 'Manual_Entry',
                        isManual: true,
                        paymentSource: pSource,
                        totalCost: amountVal,
                        isFlagged: entry.isFlagged,
                        flagReason: entry.flagReason,
                        matchedStationId: entry.matchedStationId || undefined,
                        // Preserve previous payment source so the parent can detect changes
                        previousPaymentSource: initialData?.metadata?.paymentSource || undefined,
                    },
                    isReconciled: initialData ? (initialData.isReconciled ?? false) : false
                };
                await (onSave as any)(transactionData, isLast);
            }
            toast.success("Submitted successfully");
            onClose();
        } catch (error) {
            toast.error("Submission failed");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={aiReviewData ? "sm:max-w-[800px]" : (activeTab === 'bulk' ? "sm:max-w-[1100px]" : "sm:max-w-[650px]")}>
                <DialogHeader>
                    <div className="flex items-center justify-between mr-8">
                        <div>
                            <DialogTitle>{aiReviewData ? "Confirm AI Extraction" : (initialData ? "Edit Manual Entry" : "Log Receipt / Manual Entry")}</DialogTitle>
                            <DialogDescription>
                                {aiReviewData ? "Verify extracted values from Gemini Vision." : (initialData ? "Update entry details." : "Log fuel historical data.")}
                            </DialogDescription>
                        </div>
                        {!initialData && !aiReviewData && (
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
                                <TabsList className="grid w-[200px] grid-cols-2">
                                    <TabsTrigger value="single" className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Single</TabsTrigger>
                                    <TabsTrigger value="bulk" className="flex items-center gap-1.5"><ListFilter className="h-3.5 w-3.5" />Bulk</TabsTrigger>
                                </TabsList>
                            </Tabs>
                        )}
                    </div>
                </DialogHeader>

                {aiReviewData ? (
                    <AIExtractionReview 
                        image={aiReviewData.image} 
                        result={aiReviewData.result} 
                        onConfirm={handleConfirmAI} 
                        onCancel={() => setAiReviewData(null)} 
                    />
                ) : (
                    <div className="grid gap-6 py-4" ref={wrapperRef}>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs">Driver *</Label>
                                    <Select value={commonData.driverId} onValueChange={(val) => setCommonData(prev => ({ ...prev, driverId: val }))}>
                                        <SelectTrigger className="bg-white h-9"><SelectValue placeholder="Driver" /></SelectTrigger>
                                        <SelectContent>{drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Vehicle *</Label>
                                    <Select value={commonData.vehicleId} onValueChange={(val) => setCommonData(prev => ({ ...prev, vehicleId: val }))}>
                                        <SelectTrigger className="bg-white h-9"><SelectValue placeholder="Vehicle" /></SelectTrigger>
                                        <SelectContent>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.licensePlate}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs">Date *</Label>
                                    <Input type="date" className="bg-white h-9" value={commonData.date} onChange={(e) => setCommonData(prev => ({ ...prev, date: e.target.value }))} />
                                </div>
                            </div>
                            <div className="pt-3 border-t border-slate-200">
                                <Label className="text-[10px] font-bold uppercase text-slate-400">Paid By *</Label>
                                <Select value={commonData.paymentSource} onValueChange={(val) => {
                                    setCommonData(prev => ({ ...prev, paymentSource: val }));
                                    // Sync payment source to all entries so it doesn't get overridden on save
                                    setEntries(prev => prev.map(e => ({ ...e, paymentSource: val })));
                                }}>
                                    <SelectTrigger className="bg-white h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent className="w-72">
                                        <SelectItem value="driver_cash">
                                            <div>
                                                <span className="font-medium">Driver Cash</span>
                                                <p className="text-[10px] text-slate-400 leading-tight">Driver paid out of pocket — needs reimbursement</p>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="rideshare_cash">
                                            <div>
                                                <span className="font-medium">RideShare Cash</span>
                                                <p className="text-[10px] text-slate-400 leading-tight">Paid with cash collected from customers / fares</p>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="company_card">
                                            <div>
                                                <span className="font-medium">Gas Card</span>
                                                <p className="text-[10px] text-slate-400 leading-tight">Used the company-issued fuel card</p>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="petty_cash">
                                            <div>
                                                <span className="font-medium">Petty Cash</span>
                                                <p className="text-[10px] text-slate-400 leading-tight">Paid from office petty cash — already company funds</p>
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto pr-2 space-y-6">
                            {activeTab === 'single' ? (
                                <SingleForm 
                                    entry={entries[0]} 
                                    brands={uniqueBrands}
                                    getStationsForBrand={getStationsForBrand}
                                    stationsLoading={stationsLoading}
                                    onUpdate={(u: any) => updateEntry(0, u)}
                                    onBrandChange={(brand: string) => handleBrandChange(0, brand)}
                                    onVerifiedStationSelect={(stationId: string) => handleVerifiedStationSelect(0, stationId)}
                                    onAmountChange={(v: string) => handleAmountChange(0, v)}
                                    onPriceChange={(v: string) => handlePriceChange(0, v)}
                                    onLocationChange={(v: string) => handleLocationChange(0, v)}
                                    onSelectAddress={(a: any) => handleSelectAddress(0, a)}
                                    onFileUpload={(e: any) => handleFileUpload(0, e)}
                                    onAIVerify={() => verifyOdometerWithAI(0)}
                                    isUploading={isUploading}
                                    isVerifying={isVerifying === entries[0].id}
                                    suggestions={suggestions}
                                    showSuggestions={showSuggestions}
                                />
                            ) : (
                                <BulkTable 
                                    entries={entries} 
                                    brands={uniqueBrands}
                                    getStationsForBrand={getStationsForBrand}
                                    stationsLoading={stationsLoading}
                                    onUpdate={updateEntry}
                                    onBrandChange={handleBrandChange}
                                    onVerifiedStationSelect={handleVerifiedStationSelect}
                                    onAdd={addEntry}
                                    onRemove={removeEntry}
                                    onDuplicate={duplicateEntry}
                                    onAmountChange={handleAmountChange}
                                    onPriceChange={handlePriceChange}
                                    onLocationChange={handleLocationChange}
                                    onSelectAddress={handleSelectAddress}
                                    onFileUpload={handleFileUpload}
                                    onAIVerify={verifyOdometerWithAI}
                                    onKeyDown={handleKeyDown}
                                    isUploading={isUploading}
                                    isVerifying={isVerifying}
                                    suggestions={suggestions}
                                    showSuggestions={showSuggestions}
                                    activeLocationIndex={activeLocationIndex}
                                />
                            )}
                        </div>
                    </div>
                )}

                {!aiReviewData && (
                    <DialogFooter className="bg-slate-50 -mx-6 -mb-6 p-6 border-t mt-2 rounded-b-lg">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
                            {initialData ? 'Update' : 'Submit'}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

function SingleForm({ entry, brands, getStationsForBrand, stationsLoading, onUpdate, onBrandChange, onVerifiedStationSelect, onAmountChange, onPriceChange, onLocationChange, onSelectAddress, onFileUpload, onAIVerify, isUploading, isVerifying, suggestions, showSuggestions }: any) {
    // Get verified stations for the currently selected brand
    const matchingStations: StationProfile[] = entry.stationName ? getStationsForBrand(entry.stationName) : [];
    const hasVerifiedStations = matchingStations.length > 0;

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                    <Label>Amount ($) *</Label>
                    <Input type="number" step="0.01" value={entry.amount} onChange={(e) => onAmountChange(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label>Price ($/L) *</Label>
                    <Input type="number" step="0.01" value={entry.pricePerLiter} onChange={(e) => onPriceChange(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <Label>Volume (L)</Label>
                    <Input value={entry.liters} readOnly className="bg-slate-50" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Time</Label>
                    <Input type="time" value={entry.time} onChange={(e) => onUpdate({ time: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between items-center"><Label>Odometer</Label><Button variant="link" size="sm" className="h-auto p-0 text-[10px]" onClick={onAIVerify} disabled={isVerifying}>AI Verify</Button></div>
                    <div className="relative">
                        <Input type="number" value={entry.odometer} onChange={(e) => onUpdate({ odometer: e.target.value })} className={entry.isFlagged ? "border-amber-300 bg-amber-50" : ""} />
                        {entry.isFlagged && <AlertTriangle className="absolute right-2 top-2.5 h-4 w-4 text-amber-500" />}
                    </div>
                </div>
            </div>

            {/* Station Brand + Verified Location Cascade */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Station</Label>
                    <Select value={entry.stationName} onValueChange={(val) => onBrandChange(val)}>
                        <SelectTrigger><SelectValue placeholder="Select Brand" /></SelectTrigger>
                        <SelectContent>
                            {brands.map((b: string) => (
                                <SelectItem key={b} value={b}>
                                    <span className="flex items-center gap-2">
                                        {b}
                                        {(getStationsForBrand(b) as StationProfile[]).length > 0 && (
                                            <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0 rounded-full">
                                                {(getStationsForBrand(b) as StationProfile[]).length} verified
                                            </span>
                                        )}
                                    </span>
                                </SelectItem>
                            ))}
                            <SelectItem value="__other_brand__">
                                <span className="text-slate-500 italic">Other / Unlisted</span>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Label>Location</Label>
                        {entry.matchedStationId && (
                            <span className="text-[9px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0 rounded-full flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" /> Verified
                            </span>
                        )}
                        {stationsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                    </div>
                    {hasVerifiedStations ? (
                        /* Show dropdown of verified stations for this brand */
                        <Select 
                            value={entry.matchedStationId || ''} 
                            onValueChange={(val) => {
                                if (val === '__custom__') {
                                    onUpdate({ matchedStationId: '', stationLocation: '' });
                                } else {
                                    onVerifiedStationSelect(val);
                                }
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select verified station" />
                            </SelectTrigger>
                            <SelectContent>
                                {matchingStations.map((s: StationProfile) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        <span className="flex flex-col">
                                            <span className="font-medium text-sm">{s.name}</span>
                                            {s.address && <span className="text-[10px] text-slate-400 truncate max-w-[220px]">{s.address}</span>}
                                        </span>
                                    </SelectItem>
                                ))}
                                <SelectItem value="__custom__">
                                    <span className="text-slate-500 italic text-xs">Type address manually...</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    ) : (
                        /* Fallback: free-text location input with address search */
                        <div className="relative">
                            <Input 
                                value={entry.stationLocation} 
                                onChange={(e) => onLocationChange(e.target.value)} 
                                placeholder={entry.stationName ? "Type address or location" : "Select a station first"}
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-lg max-h-40 overflow-auto">
                                    {suggestions.map((s: any, i: number) => <button key={i} className="w-full text-left p-2 text-xs hover:bg-slate-100 truncate" onClick={() => onSelectAddress(s)}>{s.display_name}</button>)}
                                </div>
                            )}
                        </div>
                    )}

                    {/* If user picked a verified station, show the address as read-only confirmation */}
                    {hasVerifiedStations && entry.matchedStationId && entry.stationLocation && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50/50 border border-emerald-100 rounded text-[10px] text-slate-600">
                            <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span className="truncate">{entry.stationLocation}</span>
                        </div>
                    )}

                    {/* If user chose "Type address manually" after seeing verified stations */}
                    {hasVerifiedStations && !entry.matchedStationId && (
                        <div className="relative mt-1">
                            <Input 
                                value={entry.stationLocation} 
                                onChange={(e) => onLocationChange(e.target.value)} 
                                placeholder="Type address manually"
                                className="h-8 text-sm"
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-lg max-h-40 overflow-auto">
                                    {suggestions.map((s: any, i: number) => <button key={i} className="w-full text-left p-2 text-xs hover:bg-slate-100 truncate" onClick={() => onSelectAddress(s)}>{s.display_name}</button>)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2">
                <Label>Receipt</Label>
                <div className="flex items-center gap-4">
                    {entry.receiptUrl ? (
                        <div className="relative h-20 w-full border rounded group"><img src={entry.receiptUrl} className="h-full w-full object-contain" /><Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onUpdate({ receiptUrl: '' })}><X className="h-3 w-3" /></Button></div>
                    ) : (
                        <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed rounded cursor-pointer hover:bg-slate-50">
                            {isUploading ? <Loader2 className="animate-spin" /> : <><Upload className="h-6 w-6 text-slate-400" /><span className="text-xs">Upload</span></>}
                            <input type="file" className="hidden" accept="image/*" onChange={onFileUpload} disabled={isUploading} />
                        </label>
                    )}
                </div>
            </div>
        </div>
    );
}

function BulkTable({ entries, brands, getStationsForBrand, stationsLoading, onUpdate, onBrandChange, onVerifiedStationSelect, onAdd, onRemove, onDuplicate, onAmountChange, onPriceChange, onLocationChange, onSelectAddress, onFileUpload, onAIVerify, onKeyDown, isUploading, isVerifying, suggestions, showSuggestions, activeLocationIndex }: any) {
    return (
        <div className="border rounded-lg bg-white overflow-hidden">
            <div className="bg-slate-50 p-2 flex justify-between items-center"><span className="text-xs font-bold uppercase text-slate-500">Items</span><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={onAdd}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
            <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                    <thead className="bg-slate-50 border-b">
                        <tr><th className="p-2 text-left">Time</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Price</th><th className="p-2 text-left">Vol</th><th className="p-2 text-left">Station</th><th className="p-2 text-left">Odo</th><th className="p-2"></th></tr>
                    </thead>
                    <tbody className="divide-y">
                        {entries.map((e: any, i: number) => {
                            const matchingStations: StationProfile[] = e.stationName ? getStationsForBrand(e.stationName) : [];
                            const hasVerified = matchingStations.length > 0;
                            return (
                                <tr key={e.id} className="hover:bg-slate-50">
                                    <td className="p-1"><Input className="h-7 text-[10px] px-1 w-16" type="time" value={e.time} onChange={(evt) => onUpdate(i, { time: evt.target.value })} /></td>
                                    <td className="p-1"><Input className="h-7 text-[10px] px-1 w-16" type="number" value={e.amount} onChange={(evt) => onAmountChange(i, evt.target.value)} /></td>
                                    <td className="p-1"><Input className="h-7 text-[10px] px-1 w-16" type="number" value={e.pricePerLiter} onChange={(evt) => onPriceChange(i, evt.target.value)} /></td>
                                    <td className="p-1 text-slate-400">{e.liters || '--'}</td>
                                    <td className="p-1">
                                        <div className="space-y-1">
                                            <Select value={e.stationName} onValueChange={(v) => onBrandChange(i, v)}>
                                                <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Station" /></SelectTrigger>
                                                <SelectContent>{brands.map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                                            </Select>
                                            {hasVerified ? (
                                                <Select value={e.matchedStationId || ''} onValueChange={(val) => {
                                                    if (val === '__custom__') {
                                                        onUpdate(i, { matchedStationId: '', stationLocation: '' });
                                                    } else {
                                                        onVerifiedStationSelect(i, val);
                                                    }
                                                }}>
                                                    <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Select location" /></SelectTrigger>
                                                    <SelectContent>
                                                        {matchingStations.map((s: StationProfile) => <SelectItem key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</SelectItem>)}
                                                        <SelectItem value="__custom__"><span className="italic text-slate-400">Manual...</span></SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            ) : (
                                                <div className="relative">
                                                    <Input className="h-7 text-[10px]" placeholder="Address" value={e.stationLocation} onChange={(evt) => onLocationChange(i, evt.target.value)} />
                                                    {showSuggestions && activeLocationIndex === i && suggestions.length > 0 && (
                                                        <div className="absolute z-50 w-48 mt-1 bg-white border rounded shadow-lg max-h-32 overflow-auto">
                                                            {suggestions.map((s: any, idx: number) => <button key={idx} className="w-full text-left p-1 text-[10px] hover:bg-slate-100 truncate" onClick={() => onSelectAddress(i, s)}>{s.display_name}</button>)}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-1">
                                        <div className="relative">
                                            <Input className={cn("h-7 text-[10px] w-16", e.isFlagged && "bg-amber-50 border-amber-200")} value={e.odometer} onChange={(evt) => onUpdate(i, { odometer: evt.target.value })} />
                                            <button className="absolute -top-3 right-0 text-[8px] text-blue-600 hover:underline" onClick={() => onAIVerify(i)}>Verify</button>
                                        </div>
                                    </td>
                                    <td className="p-1"><div className="flex gap-1"><label className="cursor-pointer p-1 text-slate-400 hover:text-indigo-600"><input type="file" className="hidden" accept="image/*" onChange={(evt) => onFileUpload(i, evt)} /><Upload className="h-3 w-3" /></label><Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-red-500" onClick={() => onRemove(i)}><Trash2 className="h-3 w-3" /></Button></div></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}