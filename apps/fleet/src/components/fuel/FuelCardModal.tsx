import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { FuelCard, JaaCardType } from '../../types/fuel';

// Minimal interfaces if full types aren't available yet or to decouple
interface ModalDriver {
    id: string;
    name: string;
}

interface ModalVehicle {
    id: string;
    licensePlate: string;
    make: string;
    model: string;
}

interface FuelCardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (card: FuelCard) => void;
    initialData?: FuelCard | null;
    vehicles?: ModalVehicle[];
    drivers?: ModalDriver[];
    /** Self-serve JAA programs owned by this fleet (enables creating JAA cards) */
    selfServePrograms?: { companyCode: string; displayName: string }[];
    /** Roam-managed card: only assignment/status editable */
    lockIdentity?: boolean;
}

const PROVIDERS = [
    'Jamaica Automobile Association (JAA) Advance',
    'TotalEnergies Card',
    'FESCO Prepaid Fleet Management',
    'RUBiS Card',
    'RPL Gas Club Cards',
];

export function isJaaFuelProvider(provider: string | undefined): boolean {
    return /JAA|Jamaica Automobile/i.test(String(provider || ''));
}

export function FuelCardModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    vehicles = [],
    drivers = [],
    selfServePrograms = [],
    lockIdentity = false,
}: FuelCardModalProps) {
    const [formData, setFormData] = useState<Partial<FuelCard>>({
        provider: '',
        cardNumber: '',
        status: 'Active',
        jaaCardType: undefined,
        jaaCompanyCode: undefined,
        expiryDate: '',
        assignedVehicleId: 'unassigned', // Use string 'unassigned' for Select handling
        assignedDriverId: 'unassigned',
    });
    const [noExpiration, setNoExpiration] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);

    const isJaa = isJaaFuelProvider(formData.provider);
    const defaultSelfServeCode = selfServePrograms[0]?.companyCode;

    useEffect(() => {
        if (!isOpen) return; // Guard: don't reset state when modal is closed
        if (initialData) {
            const hasNoExpiry = !initialData.expiryDate;
            setNoExpiration(hasNoExpiry);
            setFormData({
                ...initialData,
                expiryDate: initialData.expiryDate || '',
                jaaCardType: initialData.jaaCardType,
                jaaCompanyCode: initialData.jaaCompanyCode,
                assignedVehicleId: initialData.assignedVehicleId || 'unassigned',
                assignedDriverId: initialData.assignedDriverId || 'unassigned',
            });
        } else {
            setNoExpiration(false);
            setFormData({
                provider: '',
                cardNumber: '',
                status: 'Active',
                jaaCardType: undefined,
                jaaCompanyCode: defaultSelfServeCode,
                expiryDate: '',
                assignedVehicleId: 'unassigned',
                assignedDriverId: 'unassigned',
            });
        }
        setValidationError(null);
    }, [initialData, isOpen]);

    const handleProviderChange = (val: string) => {
        const jaa = isJaaFuelProvider(val);
        if (jaa && selfServePrograms.length === 0 && !lockIdentity) {
            setValidationError('Your fleet has no self-serve JAA program. Roam-managed cards are issued by Roam admin.');
        } else {
            setValidationError(null);
        }
        setFormData((prev) => ({
            ...prev,
            provider: val,
            jaaCardType: jaa ? (prev.jaaCardType || 'rental') : undefined,
            jaaCompanyCode: jaa ? (prev.jaaCompanyCode || defaultSelfServeCode) : undefined,
        }));
    };

    const handleSave = () => {
        if (!formData.provider || !formData.cardNumber) {
            setValidationError('Provider and card code are required.');
            return;
        }
        if (isJaaFuelProvider(formData.provider) && !formData.jaaCardType) {
            setValidationError('Select whether this is a Rental or Driver card.');
            return;
        }
        if (isJaaFuelProvider(formData.provider) && !lockIdentity && selfServePrograms.length === 0) {
            setValidationError('Cannot create JAA cards without a self-serve program. Contact Roam.');
            return;
        }
        if (isJaaFuelProvider(formData.provider) && !formData.jaaCompanyCode && !lockIdentity) {
            setValidationError('Select your JAA company code.');
            return;
        }
        // Driver-tied JAA cards should have a driver (vehicle optional but encouraged)
        if (formData.jaaCardType === 'driver_tied' && formData.assignedDriverId === 'unassigned' && formData.assignedVehicleId === 'unassigned') {
            setValidationError('Driver cards should be assigned to a driver (or vehicle).');
            return;
        }

        const card: FuelCard = {
            id: initialData?.id || crypto.randomUUID(),
            provider: formData.provider!,
            cardNumber: formData.cardNumber!,
            status: formData.status as 'Active' | 'Inactive' | 'Lost',
            jaaCardType: isJaaFuelProvider(formData.provider) ? (formData.jaaCardType as JaaCardType) : undefined,
            jaaCompanyCode: isJaaFuelProvider(formData.provider)
                ? String(formData.jaaCompanyCode || '').replace(/\D/g, '') || undefined
                : undefined,
            expiryDate: noExpiration ? undefined : formData.expiryDate || undefined,
            assignedVehicleId: formData.assignedVehicleId === 'unassigned' ? undefined : formData.assignedVehicleId,
            assignedDriverId: formData.assignedDriverId === 'unassigned' ? undefined : formData.assignedDriverId,
            organizationId: initialData?.organizationId,
        };

        onSave(card);
        onClose();
    };

    const assignmentHint =
        formData.jaaCardType === 'rental'
            ? 'Rental cards are flexible — reassign the driver or vehicle anytime without replacing the card.'
            : formData.jaaCardType === 'driver_tied'
              ? 'Driver cards stay with one driver. Assign a driver (vehicle optional if they switch cars often).'
              : 'Assigning to a vehicle is preferred for clearer expense tracking. Assign to a driver only if they switch vehicles often.';

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Fuel Card' : 'Add New Fuel Card'}</DialogTitle>
                    <DialogDescription>
                        Enter the card details and assignment information.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {lockIdentity && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                            Roam-managed card — you can change assignment and status only. Card code is fixed.
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="provider">Provider</Label>
                            <Select 
                                value={formData.provider} 
                                onValueChange={handleProviderChange}
                                disabled={lockIdentity}
                            >
                                <SelectTrigger id="provider">
                                    <SelectValue placeholder="Select Provider" />
                                </SelectTrigger>
                                <SelectContent>
                                    {PROVIDERS.map(p => (
                                        <SelectItem key={p} value={p}>{p}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cardNumber">{isJaa ? 'Card Code (JAA)' : 'Card Number'}</Label>
                            <Input 
                                id="cardNumber" 
                                placeholder={isJaa ? '00002920RN2783' : 'xxxx-xxxx-xxxx-1234'} 
                                value={formData.cardNumber}
                                disabled={lockIdentity}
                                onChange={(e) => setFormData(prev => ({ ...prev, cardNumber: e.target.value.trim() }))}
                            />
                            {isJaa && (
                                <p className="text-[10px] text-slate-500">
                                    Exact CARD_CODE from the JAA statement (company # + Reg#).
                                </p>
                            )}
                        </div>
                    </div>

                    {isJaa && (
                        <div className="space-y-2">
                            <Label htmlFor="jaaCardType">JAA card type</Label>
                            <Select
                                value={formData.jaaCardType || ''}
                                disabled={lockIdentity}
                                onValueChange={(val) =>
                                    setFormData((prev) => ({ ...prev, jaaCardType: val as JaaCardType }))
                                }
                            >
                                <SelectTrigger id="jaaCardType">
                                    <SelectValue placeholder="Select card type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="rental">
                                        Rental — flexible (swap drivers anytime)
                                    </SelectItem>
                                    <SelectItem value="driver_tied">
                                        Driver card — tied to a specific driver
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            {selfServePrograms.length > 1 && !lockIdentity && (
                                <>
                                    <Label htmlFor="jaaCompanyCode">Your JAA company code</Label>
                                    <Select
                                        value={formData.jaaCompanyCode || ''}
                                        onValueChange={(val) =>
                                            setFormData((prev) => ({ ...prev, jaaCompanyCode: val }))
                                        }
                                    >
                                        <SelectTrigger id="jaaCompanyCode">
                                            <SelectValue placeholder="Company code" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {selfServePrograms.map((p) => (
                                                <SelectItem key={p.companyCode} value={p.companyCode}>
                                                    {p.companyCode} — {p.displayName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </>
                            )}
                            <p className="text-[10px] text-slate-500">
                                Rental cards say “RENTAL” / Reg# like RN2783. Driver cards show the vehicle plate and make/model.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select 
                                value={formData.status} 
                                onValueChange={(val) => setFormData(prev => ({ ...prev, status: val as any }))}
                            >
                                <SelectTrigger id="status">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Active">Active</SelectItem>
                                    <SelectItem value="Inactive">Inactive</SelectItem>
                                    <SelectItem value="Lost">Lost / Stolen</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="expiry">Expiry Date</Label>
                            <Input
                                id="expiry"
                                type="date"
                                disabled={noExpiration}
                                value={noExpiration ? '' : (formData.expiryDate || '')}
                                onChange={(e) => setFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
                            />
                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <Checkbox
                                    checked={noExpiration}
                                    onCheckedChange={(checked) => {
                                        const on = checked === true;
                                        setNoExpiration(on);
                                        if (on) setFormData(prev => ({ ...prev, expiryDate: '' }));
                                    }}
                                />
                                No expiration
                            </label>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>
                            Assignment{' '}
                            {formData.jaaCardType === 'driver_tied' ? '(required)' : '(Optional)'}
                        </Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Vehicle</span>
                                <Select 
                                    value={formData.assignedVehicleId} 
                                    onValueChange={(val) => setFormData(prev => ({
                                        ...prev,
                                        assignedVehicleId: val,
                                        // Driver-tied: keep driver when changing vehicle; rental: vehicle clears driver (vehicle preferred)
                                        assignedDriverId: formData.jaaCardType === 'rental' && val !== 'unassigned'
                                            ? 'unassigned'
                                            : prev.assignedDriverId,
                                    }))}
                                >
                                    <SelectTrigger className="text-xs h-9">
                                        <SelectValue placeholder="Assign Vehicle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {vehicles.map(v => (
                                            <SelectItem key={v.id} value={v.id}>{v.licensePlate} ({v.make})</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs text-slate-500">Driver</span>
                                <Select 
                                    value={formData.assignedDriverId} 
                                    onValueChange={(val) => setFormData(prev => ({
                                        ...prev,
                                        assignedDriverId: val,
                                        // Rental: assigning driver clears vehicle so card can float with the person
                                        assignedVehicleId: formData.jaaCardType === 'rental' && val !== 'unassigned'
                                            ? 'unassigned'
                                            : formData.jaaCardType === 'driver_tied'
                                              ? prev.assignedVehicleId
                                              : (val !== 'unassigned' ? 'unassigned' : prev.assignedVehicleId),
                                    }))}
                                >
                                    <SelectTrigger className="text-xs h-9">
                                        <SelectValue placeholder="Assign Driver" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {drivers.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1">{assignmentHint}</p>
                    </div>

                    {validationError && (
                        <p className="text-sm text-rose-600">{validationError}</p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave}>Save Card</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
