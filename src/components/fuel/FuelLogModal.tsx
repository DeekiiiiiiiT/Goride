import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { LocationInput } from "../ui/LocationInput";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FuelEntry, FuelCard } from '../../types/fuel';
import { StationProfile } from '../../types/station';
import { Plus, X, History, Loader2, MapPin, Building2, Fuel } from 'lucide-react';
import { toast } from "sonner@2.0.3";
import { fuelService } from '../../services/fuelService';

const OTHER_BRAND = '__other__';

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
    const [time, setTime] = useState<string>('');

    // --- Verified Station Data ---
    const [verifiedStations, setVerifiedStations] = useState<StationProfile[]>([]);
    const [stationsLoading, setStationsLoading] = useState(false);
    const [parentCompanies, setParentCompanies] = useState<string[]>([]);

    // Single entry: brand + station selection
    const [selectedBrand, setSelectedBrand] = useState('');
    const [selectedStationId, setSelectedStationId] = useState('');

    // Bulk entry: brand is a common field
    const [bulkSelectedBrand, setBulkSelectedBrand] = useState('');

    // Single Entry State
    const [formData, setFormData] = useState<Record<string, any>>({
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
        editReason: '',
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
        matchedStationId: string;
    }>>([]);

    // --- Derive unique brands and filtered stations ---
    const uniqueBrands: string[] = useMemo(() => {
        // Parent Company tab is the single source of truth — no fallback to station brands
        return parentCompanies;
    }, [parentCompanies]);

    const stationsForBrand: StationProfile[] = useMemo(() => {
        if (!selectedBrand || selectedBrand === OTHER_BRAND) return [];
        return verifiedStations.filter(s => s.brand === selectedBrand);
    }, [verifiedStations, selectedBrand]);

    const bulkFilteredStations: StationProfile[] = useMemo(() => {
        if (!bulkSelectedBrand || bulkSelectedBrand === OTHER_BRAND) return [];
        return verifiedStations.filter(s => s.brand === bulkSelectedBrand);
    }, [verifiedStations, bulkSelectedBrand]);

    // --- Fetch verified stations and parent companies when modal opens ---
    useEffect(() => {
        if (!isOpen) return;

        // Fetch stations + parent companies
        const loadData = async () => {
            setStationsLoading(true);
            try {
                const [stations, companies] = await Promise.all([
                    fuelService.getStations(),
                    fuelService.getParentCompanies()
                ]);
                setVerifiedStations(stations || []);
                // Extract sorted company names, add "Independent / Other" at the end
                const companyNames = (companies || [])
                    .map((c: any) => c.name)
                    .filter(Boolean)
                    .sort() as string[];
                setParentCompanies(companyNames);
            } catch (error) {
                console.error('[FuelLogModal] Failed to load stations/companies:', error);
            } finally {
                setStationsLoading(false);
            }
        };
        loadData();

        if (initialData) {
            setActiveTab('single');
            const priceFromMetadata = initialData.metadata?.pricePerLiter;
            setFormData({
                ...initialData,
                date: initialData.date.split('T')[0],
                pricePerLiter: initialData.pricePerLiter || (typeof priceFromMetadata === 'number' ? priceFromMetadata : 0),
                editReason: initialData.metadata?.editReason || '',
            });

            if (initialData.time) {
                setTime(initialData.time.substring(0, 5));
            } else {
                setTime('');
            }

            if (initialData.matchedStationId) {
                setSelectedStationId(initialData.matchedStationId);
            } else {
                setSelectedBrand('');
                setSelectedStationId('');
            }
        } else {
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
            setTime('');
            setSelectedBrand('');
            setSelectedStationId('');
        }
    }, [initialData, isOpen]);

    // Resolve brand from matchedStationId once stations are loaded
    useEffect(() => {
        if (initialData?.matchedStationId && verifiedStations.length > 0) {
            const match = verifiedStations.find(s => s.id === initialData.matchedStationId);
            if (match) {
                setSelectedBrand(match.brand);
                setSelectedStationId(match.id);
            } else {
                setSelectedBrand(OTHER_BRAND);
                setSelectedStationId('');
            }
        }
    }, [initialData, verifiedStations]);

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

    // --- Brand / Station selection handlers (single entry) ---
    const handleBrandChange = (brand: string) => {
        setSelectedBrand(brand);
        setSelectedStationId('');
        setFormData(prev => ({ ...prev, location: '', stationAddress: '', matchedStationId: undefined }));
    };

    const handleStationSelect = (stationId: string) => {
        setSelectedStationId(stationId);
        const station = verifiedStations.find(s => s.id === stationId);
        if (station) {
            setFormData(prev => ({
                ...prev,
                location: station.name,
                stationAddress: station.address || '',
                matchedStationId: station.id,
            }));
        }
    };

    // Bulk Row Helpers
    const updateBulkEntry = (id: string, field: string, value: any) => {
        setBulkEntries(prev => prev.map(entry => {
            if (entry.id !== id) return entry;
            const updates: any = { [field]: value };
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

    const handleBulkStationSelect = (entryId: string, stationId: string) => {
        const station = verifiedStations.find(s => s.id === stationId);
        if (station) {
            setBulkEntries(prev => prev.map(entry => {
                if (entry.id !== entryId) return entry;
                return {
                    ...entry,
                    location: station.name,
                    stationAddress: station.address || '',
                    matchedStationId: station.id,
                };
            }));
        }
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
                stationAddress: '',
                matchedStationId: ''
            }
        ]);
    };

    const removeBulkRow = (id: string) => {
        if (bulkEntries.length > 1) {
            setBulkEntries(prev => prev.filter(e => e.id !== id));
        }
    };

    const handleSave = () => {
        if (!formData.date) { toast.error("Please select a date"); return; }
        if (!formData.vehicleId) { toast.error("Please select a vehicle"); return; }
        if (!formData.amount) { toast.error("Please enter a valid amount"); return; }

        const fullDate = formData.date;
        const finalTime = time ? (time.length === 5 ? `${time}:00` : time) : initialData?.time;

        const entry: any = {
            ...initialData,
            id: initialData?.id || crypto.randomUUID(),
            date: fullDate as string,
            time: finalTime,
            type: formData.type === 'Manual_Entry' ? 'Fuel_Manual_Entry' : formData.type,
            amount: Number(formData.amount),
            liters: Number(formData.liters),
            pricePerLiter: Number(formData.pricePerLiter),
            odometer: Number(formData.odometer),
            location: formData.location || '',
            stationAddress: formData.stationAddress || '',
            vehicleId: formData.vehicleId as string,
            driverId: formData.driverId as string,
            cardId: formData.type === 'Card_Transaction' ? formData.cardId : undefined,
            paymentSource: formData.type === 'Card_Transaction' ? 'Gas_Card' : 'RideShare_Cash',
            matchedStationId: formData.matchedStationId || undefined,
            metadata: {
                ...(initialData?.metadata || {}),
                pricePerLiter: Number(formData.pricePerLiter),
                editReason: formData.editReason,
                source: 'Fuel Log',
                portal_type: 'Manual_Entry',
                isManual: true,
                matchedStationId: formData.matchedStationId || undefined,
            }
        };

        onSave(entry);
        onClose();
    };

    const handleBulkSave = () => {
        if (!bulkCommon.vehicleId) { toast.error("Please select a Vehicle"); return; }
        if (!bulkCommon.driverId) { toast.error("Please select a Driver"); return; }

        const validEntries = bulkEntries.filter(e => e.amount > 0 && e.date);
        if (validEntries.length === 0) { toast.error("Please add at least one valid entry (Amount > 0)"); return; }

        const entries: any[] = validEntries.map(row => ({
            id: row.id,
            date: row.date,
            type: bulkCommon.type === 'Manual_Entry' ? 'Fuel_Manual_Entry' : bulkCommon.type,
            amount: row.amount,
            liters: row.liters,
            pricePerLiter: row.pricePerLiter,
            odometer: row.odometer,
            location: row.location,
            stationAddress: row.stationAddress,
            vehicleId: bulkCommon.vehicleId,
            driverId: bulkCommon.driverId,
            cardId: undefined,
            paymentSource: bulkCommon.type === 'Card_Transaction' ? 'Gas_Card' : 'RideShare_Cash',
            matchedStationId: row.matchedStationId || undefined,
            metadata: {
                pricePerLiter: row.pricePerLiter,
                source: 'Bulk Log',
                portal_type: 'Manual_Entry',
                isManual: true,
                matchedStationId: row.matchedStationId || undefined,
            }
        }));

        onSave(entries);
        onClose();
    };

    const stationDisplayName = (s: StationProfile) => {
        const label = s.name || s.brand;
        const city = s.city || s.parish || '';
        return city ? `${label} - ${city}` : label;
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
                                    <Label htmlFor="date">Date & Time</Label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <Input
                                                id="date"
                                                type="date"
                                                value={formData.date}
                                                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                                            />
                                        </div>
                                        <div className="w-[120px]">
                                            <Input
                                                type="time"
                                                value={time}
                                                onChange={(e) => setTime(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="type">Transaction Type</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(val) => setFormData(prev => ({ ...prev, type: val as any }))}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                                        <SelectTrigger><SelectValue placeholder="Select Vehicle" /></SelectTrigger>
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
                                        <SelectTrigger><SelectValue placeholder="Select Driver" /></SelectTrigger>
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
                                        <SelectTrigger><SelectValue placeholder="Select Fuel Card" /></SelectTrigger>
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
                                    <Input id="amount" type="number" step="0.01" placeholder="0.00"
                                        value={formData.amount}
                                        onChange={(e) => handleCalculation('amount', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="liters">Volume (L)</Label>
                                    <Input id="liters" type="number" disabled className="bg-slate-50"
                                        placeholder="Calculated" value={formData.liters || ''}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Input id="price" type="number" step="0.001" placeholder="0.000"
                                        value={formData.pricePerLiter || ''}
                                        onChange={(e) => handleCalculation('pricePerLiter', parseFloat(e.target.value))}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="odometer">Odometer (km)</Label>
                                <Input id="odometer" type="number" placeholder="Current Reading"
                                    value={formData.odometer}
                                    onChange={(e) => setFormData(prev => ({ ...prev, odometer: parseFloat(e.target.value) }))}
                                />
                            </div>

                            {/* === STATION PICKER: Brand -> Station Cascade === */}
                            <div className="space-y-3 p-4 border rounded-lg bg-slate-50/50">
                                <div className="flex items-center gap-2 mb-1">
                                    <Fuel className="w-4 h-4 text-slate-500" />
                                    <span className="text-sm font-medium text-slate-700">Gas Station</span>
                                    {stationsLoading && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
                                    {selectedStationId && (
                                        <span className="ml-auto text-[10px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-1">
                                            <MapPin className="w-2.5 h-2.5" /> Verified
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500">Brand (Parent Company)</Label>
                                        <Select value={selectedBrand} onValueChange={handleBrandChange}>
                                            <SelectTrigger>
                                                <SelectValue placeholder={stationsLoading ? "Loading brands..." : "Select Brand"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {uniqueBrands.map(brand => {
                                                    const count = verifiedStations.filter(s => s.brand === brand).length;
                                                    return (
                                                        <SelectItem key={brand} value={brand}>
                                                            <span className="flex items-center gap-2">
                                                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                                {brand}
                                                                {count > 0 && (
                                                                    <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0 rounded-full ml-1">
                                                                        {count} verified
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </SelectItem>
                                                    );
                                                })}
                                                <SelectItem value={OTHER_BRAND}>
                                                    <span className="flex items-center gap-2 text-slate-500 italic">
                                                        Independent / Other
                                                    </span>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500">Station</Label>
                                        {selectedBrand === OTHER_BRAND ? (
                                            <Input
                                                placeholder="Type station name"
                                                value={formData.location || ''}
                                                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value, matchedStationId: undefined }))}
                                            />
                                        ) : (
                                            <Select
                                                value={selectedStationId}
                                                onValueChange={handleStationSelect}
                                                disabled={!selectedBrand || stationsForBrand.length === 0}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder={
                                                        !selectedBrand
                                                            ? "Pick a brand first"
                                                            : stationsForBrand.length === 0
                                                                ? "No stations found"
                                                                : "Select Station"
                                                    } />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {stationsForBrand.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>
                                                            <span className="flex flex-col">
                                                                <span className="font-medium text-sm">{s.name}</span>
                                                                {s.address && (
                                                                    <span className="text-[11px] text-slate-400 truncate max-w-[250px]">{s.address}</span>
                                                                )}
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-500">Station Address</Label>
                                    {selectedBrand === OTHER_BRAND || !selectedStationId ? (
                                        <LocationInput
                                            id="stationAddress"
                                            placeholder="Enter address (e.g. 123 Main St)"
                                            value={formData.stationAddress || ''}
                                            onChange={(e) => setFormData(prev => ({ ...prev, stationAddress: e.target.value }))}
                                            onAddressSelect={(address) => setFormData(prev => ({ ...prev, stationAddress: address }))}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-md text-sm text-slate-700">
                                            <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                            <span className="truncate">{formData.stationAddress || '-'}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {initialData && (
                                <div className="space-y-2 mt-2 p-3 bg-amber-50 border border-amber-100 rounded-md">
                                    <Label htmlFor="editReason" className="text-amber-900 font-bold text-xs uppercase flex items-center gap-2">
                                        <History className="w-3 h-3" />
                                        Audit Change Reason
                                    </Label>
                                    <Textarea
                                        id="editReason"
                                        placeholder="Explain why this anchor value is being changed (e.g., Driver typo, OCR error correction)"
                                        value={formData.editReason || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, editReason: e.target.value }))}
                                        className="bg-white border-amber-200 text-sm h-20"
                                    />
                                    <p className="text-[10px] text-amber-700 italic">This reason will be visible in the audit history for this anchor.</p>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="bulk">
                        <div className="space-y-4 py-4">
                            <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-medium text-sm text-slate-900">Common Details</h3>
                                    <span className="text-xs text-slate-500">Applied to all entries below</span>
                                </div>
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="space-y-2">
                                        <Label>Driver</Label>
                                        <Select
                                            value={bulkCommon.driverId}
                                            onValueChange={(val) => setBulkCommon(prev => ({ ...prev, driverId: val }))}
                                        >
                                            <SelectTrigger className="bg-white"><SelectValue placeholder="Select Driver" /></SelectTrigger>
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
                                            <SelectTrigger className="bg-white"><SelectValue placeholder="Select Vehicle" /></SelectTrigger>
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
                                            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Card_Transaction">Fuel Card</SelectItem>
                                                <SelectItem value="Manual_Entry">Cash / Out of Pocket</SelectItem>
                                                <SelectItem value="Reimbursement">Reimbursement</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="flex items-center gap-1.5">
                                            <Building2 className="w-3 h-3 text-slate-400" />
                                            Brand
                                        </Label>
                                        <Select
                                            value={bulkSelectedBrand}
                                            onValueChange={(val) => {
                                                setBulkSelectedBrand(val);
                                                setBulkEntries(prev => prev.map(e => ({
                                                    ...e, location: '', stationAddress: '', matchedStationId: ''
                                                })));
                                            }}
                                        >
                                            <SelectTrigger className="bg-white">
                                                <SelectValue placeholder={stationsLoading ? "Loading..." : "Select Brand"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {uniqueBrands.map(brand => (
                                                    <SelectItem key={brand} value={brand}>{brand}</SelectItem>
                                                ))}
                                                <SelectItem value={OTHER_BRAND}>
                                                    <span className="italic text-slate-500">Other / Unlisted</span>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 px-2">
                                    <div className="col-span-2">Date</div>
                                    <div className="col-span-1">Amount ($)</div>
                                    <div className="col-span-1">Fuel Price</div>
                                    <div className="col-span-1">Odometer</div>
                                    <div className="col-span-3">Gas Station</div>
                                    <div className="col-span-3">Address</div>
                                    <div className="col-span-1"></div>
                                </div>

                                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                                    {bulkEntries.map((entry) => (
                                        <div key={entry.id} className="grid grid-cols-12 gap-2 items-start">
                                            <div className="col-span-2">
                                                <Input type="date" value={entry.date}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'date', e.target.value)}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <Input type="number" step="0.01" placeholder="0.00"
                                                    value={entry.amount || ''}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'amount', parseFloat(e.target.value))}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <Input type="number" step="0.001" placeholder="0.000"
                                                    value={entry.pricePerLiter || ''}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'pricePerLiter', parseFloat(e.target.value))}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-1">
                                                <Input type="number" placeholder="Odo"
                                                    value={entry.odometer || ''}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'odometer', parseFloat(e.target.value))}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                {bulkSelectedBrand === OTHER_BRAND ? (
                                                    <Input placeholder="Station name" value={entry.location}
                                                        onChange={(e) => updateBulkEntry(entry.id, 'location', e.target.value)}
                                                        className="h-9 text-sm px-2"
                                                    />
                                                ) : (
                                                    <Select
                                                        value={entry.matchedStationId}
                                                        onValueChange={(val) => handleBulkStationSelect(entry.id, val)}
                                                        disabled={!bulkSelectedBrand || bulkFilteredStations.length === 0}
                                                    >
                                                        <SelectTrigger className="h-9 text-sm px-2">
                                                            <SelectValue placeholder={!bulkSelectedBrand ? "Pick brand first" : "Select Station"} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {bulkFilteredStations.map(s => (
                                                                <SelectItem key={s.id} value={s.id}>
                                                                    {stationDisplayName(s)}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            </div>
                                            <div className="col-span-3">
                                                {bulkSelectedBrand === OTHER_BRAND || !entry.matchedStationId ? (
                                                    <LocationInput
                                                        placeholder="Address"
                                                        value={entry.stationAddress || ''}
                                                        onChange={(e) => updateBulkEntry(entry.id, 'stationAddress', e.target.value)}
                                                        onAddressSelect={(address) => updateBulkEntry(entry.id, 'stationAddress', address)}
                                                        className="h-9 text-sm px-2"
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-1 h-9 px-2 bg-white border rounded-md text-xs text-slate-600 truncate">
                                                        <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                                                        <span className="truncate">{entry.stationAddress || '-'}</span>
                                                    </div>
                                                )}
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