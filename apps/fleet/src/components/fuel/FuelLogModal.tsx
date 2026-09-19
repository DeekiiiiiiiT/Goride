import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { Plus, X, History, Loader2, MapPin, Building2, Fuel, Camera } from 'lucide-react';
import { toast } from "sonner";
import { fuelService } from '../../services/fuelService';
import { FuelCalculationService } from '../../services/fuelCalculationService';
import { useQuery } from '@tanstack/react-query';
import { formatCustomerFacingFuelCardLabel } from '../../utils/fuelCardDisplay';
import { findActiveFuelCardForSession } from '../../utils/fuelCardMatch';
import {
    asGasCardAnchorSavePayload,
    buildGasCardOdometerAnchor,
} from '../../utils/buildGasCardOdometerAnchor';
import { uploadEvidenceFile } from '../../services/uploadEvidence';
import { validateGasCardCreateGates } from '../../utils/gasCardCreateGates';
import { stampAdminKnownFillCashMeta } from '../../utils/adminKnownFillStamp';
import { useAuth } from '../auth/AuthContext';

export type FuelLogSavePayload =
    | FuelEntry
    | FuelEntry[]
    | ReturnType<typeof asGasCardAnchorSavePayload>;

const PAYMENT_SOURCE_MAP: Record<string, string> = {
    'driver_cash': 'Personal',
    'rideshare_cash': 'RideShare_Cash',
    'company_card': 'Gas_Card',
    'petty_cash': 'Petty_Cash',
};

type KnownFillPaymentKey = 'driver_cash' | 'rideshare_cash' | 'company_card' | 'petty_cash';

function isKnownFillPaymentKey(val: string): val is KnownFillPaymentKey {
    return val === 'driver_cash' || val === 'rideshare_cash' || val === 'company_card' || val === 'petty_cash';
}

// Reverse-map: resolve ANY stored paymentSource value back to a dropdown key
const PAYMENT_SOURCE_TO_DROPDOWN: Record<string, string> = {
    // Dropdown keys (identity — already correct)
    'driver_cash': 'driver_cash',
    'rideshare_cash': 'rideshare_cash',
    'company_card': 'company_card',
    'petty_cash': 'petty_cash',
    // Enum values (top-level paymentSource written by Phase 2+)
    'Personal': 'driver_cash',
    'RideShare_Cash': 'rideshare_cash',
    'Gas_Card': 'company_card',
    'Petty_Cash': 'petty_cash',
    // Legacy human-readable values (pre-Phase 2)
    'Cash': 'driver_cash',
    'RideShare Cash': 'rideshare_cash',
    'Gas Card': 'company_card',
    'Other': 'petty_cash',
};

interface FuelLogModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (entry: FuelLogSavePayload) => void;
    initialData?: FuelEntry | null;
    vehicles: any[];
    drivers: any[];
    cards: FuelCard[];
    isRoamManagedCard?: (card: FuelCard) => boolean;
}

export function FuelLogModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    vehicles,
    drivers,
    cards,
    isRoamManagedCard,
}: FuelLogModalProps) {
    const { user } = useAuth();
    // Phase 5: Use React Query for parent companies caching
    const { data: parentCompaniesData = [] } = useQuery({
        queryKey: ['parentCompanies'],
        queryFn: () => fuelService.getParentCompanies(),
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        enabled: isOpen,
    });

    const [activeTab, setActiveTab] = useState('single');
    const [time, setTime] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [assignedGasCard, setAssignedGasCard] = useState<FuelCard | null>(null);
    const [gasCardLookupDone, setGasCardLookupDone] = useState(false);
    const [odometerPreviewUrl, setOdometerPreviewUrl] = useState('');
    const [pendingOdometerFile, setPendingOdometerFile] = useState<File | null>(null);
    const odometerFileInputRef = useRef<HTMLInputElement>(null);

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
        type: 'company_card',
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
    const [bulkCommon, setBulkCommon] = useState<{
        driverId: string;
        vehicleId: string;
        type: KnownFillPaymentKey;
    }>({
        driverId: '',
        vehicleId: '',
        type: 'rideshare_cash',
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
        if (!selectedBrand) return [];
        return verifiedStations.filter(s => s.brand === selectedBrand);
    }, [verifiedStations, selectedBrand]);

    const bulkFilteredStations: StationProfile[] = useMemo(() => {
        if (!bulkSelectedBrand) return [];
        return verifiedStations.filter(s => s.brand === bulkSelectedBrand);
    }, [verifiedStations, bulkSelectedBrand]);

    // --- Fetch verified stations and parent companies when modal opens ---
    useEffect(() => {
        if (!isOpen) return;

        // Fetch stations + parent companies
        const loadData = async () => {
            setStationsLoading(true);
            try {
                const stations = await fuelService.getStations();
                setVerifiedStations((stations || []).filter((s: any) => s.status === 'verified'));
                
                // Phase 5: Use cached parent companies from React Query
                const companyNames = (parentCompaniesData || [])
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
            // Map legacy type values to new "Paid By" dropdown values
            const legacyTypeMap: Record<string, string> = {
                'Card_Transaction': 'company_card',
                'Manual_Entry': 'driver_cash',
                'Fuel_Manual_Entry': 'driver_cash',
                'Reimbursement': 'driver_cash',
            };
            // Priority: metadata.paymentSource (most accurate) → top-level paymentSource → legacy type fallback
            const rawMeta = initialData.metadata?.paymentSource;
            const rawTop = (initialData as any).paymentSource;
            const mappedType =
                (rawMeta && PAYMENT_SOURCE_TO_DROPDOWN[rawMeta]) ||
                (rawTop && PAYMENT_SOURCE_TO_DROPDOWN[rawTop]) ||
                legacyTypeMap[initialData.type] ||
                'company_card';
            setFormData({
                ...initialData,
                date: initialData.date.split('T')[0],
                type: mappedType,
                pricePerLiter: initialData.pricePerLiter || (typeof priceFromMetadata === 'number' ? priceFromMetadata : 0),
                editReason: initialData.metadata?.editReason || '',
            });

            if (initialData.time) {
                setTime(initialData.time.substring(0, 5));
            } else if (initialData.date && initialData.date.includes('T')) {
                const timePart = initialData.date.split('T')[1];
                if (timePart) setTime(timePart.substring(0, 5));
                else setTime('');
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
                type: 'company_card',
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
    }, [initialData, isOpen, parentCompaniesData]);

    // Resolve brand from matchedStationId once stations are loaded
    useEffect(() => {
        if (initialData?.matchedStationId && verifiedStations.length > 0) {
            const match = verifiedStations.find(s => s.id === initialData.matchedStationId);
            if (match) {
                setSelectedBrand(match.brand);
                setSelectedStationId(match.id);
            } else {
                setSelectedBrand('');
                setSelectedStationId('');
            }
        }
    }, [initialData, verifiedStations]);

    const isRideShareCash = formData.type === 'rideshare_cash';
    const isGasCard = formData.type === 'company_card';
    const isBulkRideShareCash = bulkCommon.type === 'rideshare_cash';

    // Active inventory card (vehicle first, then driver) — same as Submit Expense / driver claim
    useEffect(() => {
        if (!isOpen || !isGasCard) {
            setAssignedGasCard(null);
            setGasCardLookupDone(!isGasCard);
            return;
        }
        const card =
            findActiveFuelCardForSession(cards, {
                vehicleId: formData.vehicleId,
                driverId: formData.driverId,
            }) || null;
        setAssignedGasCard(card);
        setGasCardLookupDone(true);
        if (card) {
            setFormData((prev) => (prev.cardId === card.id ? prev : { ...prev, cardId: card.id }));
        }
    }, [isOpen, isGasCard, cards, formData.vehicleId, formData.driverId]);

    // Reset odometer proof when modal opens for a new Known fill
    useEffect(() => {
        if (!isOpen) return;
        if (initialData?.odometerImageUrl) {
            setOdometerPreviewUrl(initialData.odometerImageUrl);
            setPendingOdometerFile(null);
        } else {
            setOdometerPreviewUrl('');
            setPendingOdometerFile(null);
        }
    }, [isOpen, initialData?.id, initialData?.odometerImageUrl]);

    // RideShare / cash: amount ÷ liters → $/L.
    // Fallback: amount ÷ $/L → liters when price is typed first.
    const handleCalculation = (field: 'amount' | 'pricePerLiter' | 'liters', value: number) => {
        const updates: any = { [field]: Number.isFinite(value) ? value : 0 };
        const currentAmount = field === 'amount' ? updates[field] : formData.amount;
        const currentLiters = field === 'liters' ? updates[field] : formData.liters;
        const currentPrice = field === 'pricePerLiter' ? updates[field] : formData.pricePerLiter;
        if (field === 'liters' || (field === 'amount' && Number(currentLiters) > 0)) {
            updates.pricePerLiter =
                FuelCalculationService.calculatePricePerLiter(currentAmount, currentLiters) ?? 0;
        } else if (
            (field === 'pricePerLiter' || field === 'amount') &&
            currentAmount > 0 &&
            currentPrice > 0
        ) {
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
            const currentLiters = field === 'liters' ? numValue : entry.liters;
            const currentPrice = field === 'pricePerLiter' ? numValue : entry.pricePerLiter;
            if (field === 'liters' || (field === 'amount' && currentLiters > 0)) {
                updates.pricePerLiter =
                    FuelCalculationService.calculatePricePerLiter(currentAmount, currentLiters) ?? 0;
            } else if (
                (field === 'amount' || field === 'pricePerLiter') &&
                currentAmount > 0 &&
                currentPrice > 0
            ) {
                updates.liters = Number((currentAmount / currentPrice).toFixed(2));
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

    const handleSave = async () => {
        if (!formData.date) { toast.error("Please select a date"); return; }
        if (!formData.vehicleId) { toast.error("Please select a vehicle"); return; }
        if (!formData.driverId) { toast.error("Please select a driver"); return; }
        if (!(Number(formData.odometer) > 0)) { toast.error("Odometer reading is required"); return; }
        if (!formData.matchedStationId) {
            toast.error("Select a verified station from the Dominion list");
            return;
        }
        if (initialData && (initialData.isLocked || initialData.status === 'Finalized') && !String(formData.editReason || '').trim()) {
            toast.error("Enter a correction reason for locked entries");
            return;
        }

        const fullDate = formData.date;
        const finalTime = time ? (time.length === 5 ? `${time}:00` : time) : initialData?.time;
        const dateWithTime = finalTime ? `${fullDate}T${finalTime}` : fullDate;

        // ——— Gas Card Known fill = driver/admin claim (odo + card + station; CSV supplies $ later) ———
        if (isGasCard && !initialData) {
            const gate = validateGasCardCreateGates({
                assignedGasCard,
                gasCardLookupDone,
                matchedStationId: formData.matchedStationId,
                odometer: formData.odometer,
                hasOdometerPhoto: !!(odometerPreviewUrl || pendingOdometerFile),
            });
            if (!gate.ok) {
                toast.error(gate.error);
                return;
            }

            setIsSubmitting(true);
            try {
                const entryId = crypto.randomUUID();
                let odometerImageUrl = odometerPreviewUrl || '';
                if (pendingOdometerFile) {
                    const { url } = await uploadEvidenceFile(pendingOdometerFile, {
                        evidenceType: 'odometer_proof',
                        sourceType: 'fuel_entry',
                        sourceId: entryId,
                        retentionClass: 'ephemeral',
                        parentStatus: 'Pending',
                    });
                    odometerImageUrl = url;
                }
                const driver = drivers.find((d: any) => d.id === formData.driverId);
                const fuelEntry = buildGasCardOdometerAnchor({
                    id: entryId,
                    date: dateWithTime,
                    time: finalTime,
                    cardId: assignedGasCard!.id,
                    vehicleId: formData.vehicleId,
                    driverId: formData.driverId,
                    odometer: Number(formData.odometer),
                    odometerImageUrl: odometerImageUrl || undefined,
                    location: formData.location || undefined,
                    stationAddress: formData.stationAddress || undefined,
                    matchedStationId: formData.matchedStationId,
                    entrySource: 'admin-manual',
                    driverName: driver?.name,
                });
                onSave(asGasCardAnchorSavePayload(fuelEntry));
                onClose();
            } catch (e) {
                console.error('[FuelLogModal] Gas Card Known fill failed', e);
                toast.error(e instanceof Error ? e.message : 'Failed to save Gas Card log');
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (!formData.amount) { toast.error("Please enter a valid amount"); return; }
        if (!(Number(formData.liters) > 0)) {
            toast.error(
                isRideShareCash
                    ? "Enter liters for RideShare Cash"
                    : "Enter volume (L) or a price so volume can be calculated",
            );
            return;
        }

        const entry: any = {
            ...initialData,
            id: initialData?.id || crypto.randomUUID(),
            date: dateWithTime as string,
            time: finalTime,
            type: initialData?.type
                ? initialData.type
                : (formData.type === 'company_card' ? 'Card_Transaction' : 'Fuel_Manual_Entry'),
            amount: Number(formData.amount),
            liters: Number(formData.liters),
            pricePerLiter: FuelCalculationService.calculatePricePerLiter(formData.amount, formData.liters)
                ?? Number(formData.pricePerLiter)
                ?? 0,
            odometer: Number(formData.odometer),
            location: formData.location || '',
            stationAddress: formData.stationAddress || '',
            vehicleId: formData.vehicleId as string,
            driverId: formData.driverId as string,
            cardId: formData.type === 'company_card' ? formData.cardId : undefined,
            paymentSource: PAYMENT_SOURCE_MAP[formData.type] || 'Personal',
            matchedStationId: formData.matchedStationId || undefined,
            entrySource: initialData
                ? (initialData.entrySource === 'admin-manual' || initialData.metadata?.entrySource === 'admin-manual'
                    ? 'admin-manual'
                    : 'admin-edit')
                : 'admin-manual',
            metadata: {
                ...(initialData?.metadata || {}),
                pricePerLiter: FuelCalculationService.calculatePricePerLiter(formData.amount, formData.liters)
                    ?? Number(formData.pricePerLiter)
                    ?? 0,
                editReason: formData.editReason,
                source: 'Fuel Log',
                portal_type: 'Manual_Entry',
                isManual: true,
                entrySource: initialData
                    ? (initialData.entrySource === 'admin-manual' || initialData.metadata?.entrySource === 'admin-manual'
                        ? 'admin-manual'
                        : 'admin-edit')
                    : 'admin-manual',
                paymentSource: formData.type,
                matchedStationId: formData.matchedStationId || undefined,
                ...(!initialData && formData.type !== 'company_card'
                    ? stampAdminKnownFillCashMeta({}, user?.id)
                    : {}),
            },
            ...(initialData && formData.editReason
                ? { correctionReason: formData.editReason }
                : {}),
        } as FuelEntry & { correctionReason?: string };

        onSave(entry);
        onClose();
    };

    const handleBulkSave = async () => {
        if (!bulkCommon.vehicleId) { toast.error("Please select a Vehicle"); return; }
        if (!bulkCommon.driverId) { toast.error("Please select a Driver"); return; }

        // Bulk Gas Card — same anchors as Driver claim loops
        if (bulkCommon.type === 'company_card') {
            const card = findActiveFuelCardForSession(cards, {
                vehicleId: bulkCommon.vehicleId,
                driverId: bulkCommon.driverId,
            }) ?? null;
            const gasRows = bulkEntries.filter((e) => Number(e.odometer) > 0 && e.date);
            if (gasRows.length === 0) {
                toast.error('Add at least one row with date and odometer');
                return;
            }
            for (const row of gasRows) {
                const gate = validateGasCardCreateGates({
                    assignedGasCard: card,
                    gasCardLookupDone: true,
                    matchedStationId: row.matchedStationId,
                    odometer: row.odometer,
                    hasOdometerPhoto: !!(pendingOdometerFile || odometerPreviewUrl),
                });
                if (!gate.ok) {
                    toast.error(gate.error);
                    return;
                }
            }
            if (!card) {
                toast.error('No Active gas card assigned to this vehicle/driver in Card Inventory');
                return;
            }
            setIsSubmitting(true);
            try {
                let sharedOdoUrl = odometerPreviewUrl || '';
                if (pendingOdometerFile) {
                    const { url } = await uploadEvidenceFile(pendingOdometerFile, {
                        evidenceType: 'odometer_proof',
                        sourceType: 'fuel_entry',
                        sourceId: crypto.randomUUID(),
                        retentionClass: 'ephemeral',
                        parentStatus: 'Pending',
                    });
                    sharedOdoUrl = url;
                }
                const driver = drivers.find((d: any) => d.id === bulkCommon.driverId);
                const anchors = gasRows.map((row) =>
                    buildGasCardOdometerAnchor({
                        id: row.id,
                        date: row.date,
                        cardId: card.id,
                        vehicleId: bulkCommon.vehicleId,
                        driverId: bulkCommon.driverId,
                        odometer: Number(row.odometer),
                        odometerImageUrl: sharedOdoUrl || undefined,
                        location: row.location || undefined,
                        stationAddress: row.stationAddress || undefined,
                        matchedStationId: row.matchedStationId,
                        entrySource: 'admin-manual',
                        driverName: driver?.name,
                    }),
                );
                onSave(anchors);
                onClose();
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Failed to save Gas Card bulk logs');
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        const validEntries = bulkEntries.filter(e => e.amount > 0 && e.date);
        if (validEntries.length === 0) { toast.error("Please add at least one valid entry (Amount > 0)"); return; }
        if (validEntries.some(e => !(e.liters > 0))) {
            toast.error("Enter liters for each row");
            return;
        }

        const entries: any[] = validEntries.map(row => ({
            id: row.id,
            date: row.date,
            type: 'Fuel_Manual_Entry',
            amount: row.amount,
            liters: row.liters,
            pricePerLiter: isBulkRideShareCash
                ? (FuelCalculationService.calculatePricePerLiter(row.amount, row.liters) ?? 0)
                : row.pricePerLiter,
            odometer: row.odometer,
            location: row.location,
            stationAddress: row.stationAddress,
            vehicleId: bulkCommon.vehicleId,
            driverId: bulkCommon.driverId,
            cardId: undefined,
            paymentSource: PAYMENT_SOURCE_MAP[bulkCommon.type] || 'Personal',
            matchedStationId: row.matchedStationId || undefined,
            entrySource: 'bulk-import',
            metadata: stampAdminKnownFillCashMeta({
                pricePerLiter: isBulkRideShareCash
                    ? (FuelCalculationService.calculatePricePerLiter(row.amount, row.liters) ?? 0)
                    : row.pricePerLiter,
                source: 'Bulk Log',
                portal_type: 'Manual_Entry',
                isManual: true,
                entrySource: 'bulk-import',
                paymentSource: bulkCommon.type,
                matchedStationId: row.matchedStationId || undefined,
            }, user?.id),
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
                    <DialogTitle>{initialData ? 'Edit known fill' : 'Known fill'}</DialogTitle>
                    <DialogDescription>
                        {initialData
                          ? 'Update this posted fill-up.'
                          : 'Post a fill you already know is real into Transaction Logs.'}
                    </DialogDescription>
                </DialogHeader>

                {!initialData && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 -mt-2 mb-2">
                    {isGasCard
                      ? 'Gas Card Known fill logs odometer only. Amount and liters come from the Roam Fuels CSV when matched.'
                      : 'Known fill — use this when you already know the fill is real.'}
                  </div>
                )}

                <Tabs value={activeTab} onValueChange={(v) => {
                    setActiveTab(v);
                }} className="w-full">
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
                                    <Label htmlFor="type">Paid By</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(val) => {
                                            setFormData(prev => ({ ...prev, type: val as any }));
                                        }}
                                    >
                                        <SelectTrigger><SelectValue /></SelectTrigger>
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

                            {isGasCard && (
                                <div className="space-y-2">
                                    <Label>Fuel Card</Label>
                                    <div className={`rounded-md border px-3 py-2 text-sm ${
                                        gasCardLookupDone && !assignedGasCard
                                            ? 'border-amber-200 bg-amber-50 text-amber-900'
                                            : 'border-slate-200 bg-white text-slate-800'
                                    }`}>
                                        {!gasCardLookupDone ? (
                                            <span className="text-slate-500">Looking up Active card…</span>
                                        ) : assignedGasCard ? (
                                            <span>
                                                {formatCustomerFacingFuelCardLabel(
                                                    assignedGasCard,
                                                    !!isRoamManagedCard?.(assignedGasCard),
                                                )}
                                                {' '}
                                                <span className="font-mono text-xs text-slate-500">
                                                    {assignedGasCard.cardNumber}
                                                </span>
                                            </span>
                                        ) : (
                                            <span>
                                                No Active gas card assigned to this vehicle/driver in Card Inventory
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!isGasCard && (
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="amount">{isRideShareCash ? 'Cash Amount ($)' : 'Total Cost ($)'}</Label>
                                    <Input id="amount" type="number" step="0.01" placeholder="0.00"
                                        value={formData.amount}
                                        onChange={(e) => handleCalculation('amount', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="liters">Volume (L)</Label>
                                    <Input
                                        id="liters"
                                        type="number"
                                        step="0.001"
                                        placeholder={isRideShareCash ? "0.000" : "0.000"}
                                        value={formData.liters || ''}
                                        onChange={(e) => handleCalculation('liters', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="price">Price ($/L)</Label>
                                    {isRideShareCash ? (
                                        <Input
                                            id="price"
                                            disabled
                                            className="bg-slate-50"
                                            value={formData.pricePerLiter ? `$${Number(formData.pricePerLiter).toFixed(3)}` : '—'}
                                        />
                                    ) : (
                                        <Input
                                            id="price"
                                            type="number"
                                            step="0.001"
                                            placeholder="Auto from $ ÷ L"
                                            value={formData.pricePerLiter || ''}
                                            onChange={(e) => handleCalculation('pricePerLiter', parseFloat(e.target.value))}
                                        />
                                    )}
                                </div>
                            </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="odometer">Odometer (km)</Label>
                                    <Input id="odometer" type="number" placeholder="Current Reading"
                                        value={formData.odometer || ''}
                                        onChange={(e) => setFormData(prev => ({ ...prev, odometer: parseFloat(e.target.value) }))}
                                    />
                                </div>
                                {isGasCard && (
                                    <div className="space-y-2">
                                        <Label>Odometer photo</Label>
                                        <input
                                            ref={odometerFileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                setPendingOdometerFile(file);
                                                setOdometerPreviewUrl(URL.createObjectURL(file));
                                            }}
                                        />
                                        {odometerPreviewUrl ? (
                                            <div className="relative h-20 w-full border rounded group">
                                                <img src={odometerPreviewUrl} alt="Odometer proof" className="h-full w-full object-contain" />
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="destructive"
                                                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                                                    onClick={() => {
                                                        setPendingOdometerFile(null);
                                                        setOdometerPreviewUrl('');
                                                        if (odometerFileInputRef.current) odometerFileInputRef.current.value = '';
                                                    }}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="w-full h-20 border-dashed text-slate-500"
                                                onClick={() => odometerFileInputRef.current?.click()}
                                            >
                                                <Camera className="h-4 w-4 mr-2" /> Upload odometer photo
                                            </Button>
                                        )}
                                    </div>
                                )}
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
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500">Station</Label>
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
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-500">Station Address</Label>
                                    {!selectedStationId ? (
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
                                        <Label>Paid By</Label>
                                        <Select
                                            value={bulkCommon.type}
                                            onValueChange={(val) => {
                                                if (!isKnownFillPaymentKey(val)) return;
                                                setBulkCommon((prev) => ({ ...prev, type: val }));
                                            }}
                                        >
                                            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                                            <SelectContent className="w-72">
                                                <SelectItem value="driver_cash">
                                                    <div>
                                                        <span className="font-medium">Driver Cash</span>
                                                        <p className="text-[10px] text-slate-400 leading-tight">Driver paid out of pocket</p>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="rideshare_cash">
                                                    <div>
                                                        <span className="font-medium">RideShare Cash</span>
                                                        <p className="text-[10px] text-slate-400 leading-tight">Cash from fares</p>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="petty_cash">
                                                    <div>
                                                        <span className="font-medium">Petty Cash</span>
                                                        <p className="text-[10px] text-slate-400 leading-tight">Office petty cash</p>
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="company_card">
                                                    <div>
                                                        <span className="font-medium">Gas Card</span>
                                                        <p className="text-[10px] text-slate-400 leading-tight">Odometer anchors — money from statement</p>
                                                    </div>
                                                </SelectItem>
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
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>

                            {bulkCommon.type === 'company_card' && (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
                                <p className="text-xs text-slate-600">
                                  Bulk Gas Card needs one shared odometer photo plus date, odometer, and verified station on each row (amount/liters ignored).
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => odometerFileInputRef.current?.click()}
                                >
                                  <Camera className="h-4 w-4" />
                                  {odometerPreviewUrl ? 'Change shared odometer photo' : 'Upload shared odometer photo'}
                                </Button>
                              </div>
                            )}

                            <div className="space-y-2">
                                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 px-2">
                                    <div className="col-span-2">Date</div>
                                    <div className="col-span-1">{isBulkRideShareCash ? 'Cash $' : 'Amount ($)'}</div>
                                    <div className="col-span-1">{isBulkRideShareCash ? 'Liters' : 'Fuel Price'}</div>
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
                                                {isBulkRideShareCash ? (
                                                    <Input type="number" step="0.001" placeholder="0.000"
                                                        value={entry.liters || ''}
                                                        onChange={(e) => updateBulkEntry(entry.id, 'liters', parseFloat(e.target.value))}
                                                        className="h-9 text-sm px-2"
                                                    />
                                                ) : (
                                                    <Input type="number" step="0.001" placeholder="0.000"
                                                        value={entry.pricePerLiter || ''}
                                                        onChange={(e) => updateBulkEntry(entry.id, 'pricePerLiter', parseFloat(e.target.value))}
                                                        className="h-9 text-sm px-2"
                                                    />
                                                )}
                                            </div>
                                            <div className="col-span-1">
                                                <Input type="number" placeholder="Odo"
                                                    value={entry.odometer || ''}
                                                    onChange={(e) => updateBulkEntry(entry.id, 'odometer', parseFloat(e.target.value))}
                                                    className="h-9 text-sm px-2"
                                                />
                                            </div>
                                            <div className="col-span-3">
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
                                            </div>
                                            <div className="col-span-3">
                                                {!entry.matchedStationId ? (
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
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button
                        onClick={() => activeTab === 'single' ? void handleSave() : handleBulkSave()}
                        disabled={isSubmitting || (isGasCard && (!gasCardLookupDone || !assignedGasCard))}
                    >
                        {isSubmitting
                            ? 'Saving…'
                            : activeTab === 'single'
                                ? (isGasCard && !initialData ? 'Submit Odometer Log' : 'Save Log')
                                : `Save ${bulkEntries.filter(e => e.amount > 0).length} Logs`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}