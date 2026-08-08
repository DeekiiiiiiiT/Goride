import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { FuelCard, JaaCardType } from '../../types/fuel';
import { mergeFuelCardWithAssignmentHistory } from '../../utils/mergeFuelCardWithAssignmentHistory';
import {
    buildJaaCardCode,
    hintJaaTypeFromReg,
    normalizeFuelCardCode,
    splitJaaCardCode,
} from '../../utils/fuelCardMatch';

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
    currentDriverId?: string;
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

type JaaEntryMode = 'statement' | 'physical';

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
    // JAA: paste full CARD_CODE vs company # + Reg# from the plastic
    const [jaaEntryMode, setJaaEntryMode] = useState<JaaEntryMode>('physical');
    const [jaaCompanyNumber, setJaaCompanyNumber] = useState('');
    const [jaaRegNumber, setJaaRegNumber] = useState('');

    const isJaa = isJaaFuelProvider(formData.provider);
    const defaultSelfServeCode = selfServePrograms[0]?.companyCode;
    const composedPhysicalCode = buildJaaCardCode(jaaCompanyNumber, jaaRegNumber);

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
            // Edit: default to statement so existing CARD_CODE stays visible as-is
            setJaaEntryMode('statement');
            const split = splitJaaCardCode(initialData.cardNumber, initialData.jaaCompanyCode || defaultSelfServeCode);
            setJaaCompanyNumber(split.companyNumber);
            setJaaRegNumber(split.regNumber);
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
            setJaaEntryMode('physical');
            setJaaCompanyNumber(String(defaultSelfServeCode || '').replace(/\D/g, ''));
            setJaaRegNumber('');
        }
        setValidationError(null);
    }, [initialData, isOpen, defaultSelfServeCode]);

    const handleProviderChange = (val: string) => {
        const jaa = isJaaFuelProvider(val);
        setValidationError(null);
        setFormData((prev) => ({
            ...prev,
            provider: val,
            jaaCardType: jaa ? (prev.jaaCardType || 'rental') : undefined,
            jaaCompanyCode: jaa ? (prev.jaaCompanyCode || defaultSelfServeCode) : undefined,
        }));
        if (jaa && !jaaCompanyNumber) {
            setJaaCompanyNumber(String(defaultSelfServeCode || '').replace(/\D/g, ''));
        }
    };

    const applyPhysicalFields = (company: string, reg: string) => {
        const companyDigits = company.replace(/\D/g, '');
        const regNorm = normalizeFuelCardCode(reg);
        setJaaCompanyNumber(companyDigits);
        setJaaRegNumber(regNorm);
        const code = buildJaaCardCode(companyDigits, regNorm);
        const hint = regNorm ? hintJaaTypeFromReg(regNorm) : undefined;
        setFormData((prev) => ({
            ...prev,
            cardNumber: code,
            jaaCompanyCode: companyDigits || prev.jaaCompanyCode,
            jaaCardType: hint || prev.jaaCardType,
        }));
    };

    const resolveCardNumber = (): string => {
        if (isJaa && !lockIdentity && jaaEntryMode === 'physical') {
            return composedPhysicalCode;
        }
        return normalizeFuelCardCode(formData.cardNumber) || String(formData.cardNumber || '').trim();
    };

    const handleSave = () => {
        const cardNumber = resolveCardNumber();
        if (!formData.provider || !cardNumber) {
            setValidationError(
                isJaa && jaaEntryMode === 'physical'
                    ? 'Provider, company number, and Reg# are required.'
                    : 'Provider and card code are required.',
            );
            return;
        }
        if (isJaaFuelProvider(formData.provider) && jaaEntryMode === 'physical' && !lockIdentity) {
            if (!jaaCompanyNumber.replace(/\D/g, '') || !normalizeFuelCardCode(jaaRegNumber)) {
                setValidationError('Enter company number (bottom of card) and Reg#.');
                return;
            }
        }
        if (isJaaFuelProvider(formData.provider) && !formData.jaaCardType) {
            setValidationError('Select whether this is a Rental or Driver card.');
            return;
        }
        if (isJaaFuelProvider(formData.provider) && !lockIdentity && selfServePrograms.length === 0) {
            setValidationError('Cannot create JAA cards without a self-serve program. Contact Roam.');
            return;
        }

        const companyFromPhysical = jaaCompanyNumber.replace(/\D/g, '');
        const jaaCompanyCode =
            isJaaFuelProvider(formData.provider)
                ? (
                    (!lockIdentity && jaaEntryMode === 'physical' && companyFromPhysical) ||
                    String(formData.jaaCompanyCode || '').replace(/\D/g, '') ||
                    undefined
                )
                : undefined;

        if (isJaaFuelProvider(formData.provider) && !jaaCompanyCode && !lockIdentity) {
            setValidationError('Select your JAA company code.');
            return;
        }

        const draft: FuelCard = {
            id: initialData?.id || crypto.randomUUID(),
            provider: formData.provider!,
            cardNumber,
            status: formData.status as 'Active' | 'Inactive' | 'Lost',
            jaaCardType: isJaaFuelProvider(formData.provider) ? (formData.jaaCardType as JaaCardType) : undefined,
            jaaCompanyCode,
            expiryDate: noExpiration ? undefined : formData.expiryDate || undefined,
            // Assignment happens via Assign Driver after create — not on this form
            assignedVehicleId: undefined,
            assignedDriverId: undefined,
            organizationId: initialData?.organizationId,
            assignmentHistory: initialData?.assignmentHistory,
            notes: initialData?.notes,
        };

        // Preserve existing driver when editing identity/status fields
        if (initialData) {
            draft.assignedDriverId = initialData.assignedDriverId;
            draft.assignedVehicleId = undefined;
        }

        onSave(
            mergeFuelCardWithAssignmentHistory(initialData || null, draft, {
                drivers,
                vehicles,
            }),
        );
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Fuel Card' : 'Add New Fuel Card'}</DialogTitle>
                    <DialogDescription>
                        Enter the card details.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {lockIdentity && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                            Roam-managed card — you can change assignment and status only. Card code is fixed.
                        </p>
                    )}
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

                    {!isJaa && (
                        <div className="space-y-2">
                            <Label htmlFor="cardNumber">Card Number</Label>
                            <Input
                                id="cardNumber"
                                placeholder="xxxx-xxxx-xxxx-1234"
                                value={formData.cardNumber}
                                disabled={lockIdentity}
                                onChange={(e) => setFormData(prev => ({ ...prev, cardNumber: e.target.value.trim() }))}
                            />
                        </div>
                    )}

                    {isJaa && (
                        <div className="space-y-3">
                            {!lockIdentity && (
                                <div className="space-y-2">
                                    <Label>Card code source</Label>
                                    <RadioGroup
                                        value={jaaEntryMode}
                                        onValueChange={(val) => {
                                            const mode = val as JaaEntryMode;
                                            setJaaEntryMode(mode);
                                            setValidationError(null);
                                            if (mode === 'physical') {
                                                const split = splitJaaCardCode(
                                                    formData.cardNumber,
                                                    formData.jaaCompanyCode || defaultSelfServeCode,
                                                );
                                                applyPhysicalFields(
                                                    split.companyNumber || String(defaultSelfServeCode || ''),
                                                    split.regNumber,
                                                );
                                            }
                                        }}
                                        className="grid gap-2"
                                    >
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <RadioGroupItem value="physical" id="jaa-entry-physical" />
                                            From physical card
                                        </label>
                                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                                            <RadioGroupItem value="statement" id="jaa-entry-statement" />
                                            From statement (full CARD_CODE)
                                        </label>
                                    </RadioGroup>
                                </div>
                            )}

                            {(lockIdentity || jaaEntryMode === 'statement') && (
                                <div className="space-y-2">
                                    <Label htmlFor="cardNumber">Card Code (JAA)</Label>
                                    <Input
                                        id="cardNumber"
                                        placeholder="00002920RN2783"
                                        value={formData.cardNumber}
                                        disabled={lockIdentity}
                                        onChange={(e) => {
                                            const next = normalizeFuelCardCode(e.target.value);
                                            setFormData((prev) => ({
                                                ...prev,
                                                cardNumber: next,
                                                jaaCardType: next
                                                    ? hintJaaTypeFromReg(splitJaaCardCode(next, prev.jaaCompanyCode).regNumber)
                                                    : prev.jaaCardType,
                                            }));
                                        }}
                                    />
                                    <p className="text-[10px] text-slate-500">
                                        Exact CARD_CODE from the JAA statement (company # + Reg#).
                                    </p>
                                </div>
                            )}

                            {!lockIdentity && jaaEntryMode === 'physical' && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="jaaCompanyNumber">Company number</Label>
                                            <Input
                                                id="jaaCompanyNumber"
                                                placeholder="00002920"
                                                inputMode="numeric"
                                                value={jaaCompanyNumber}
                                                onChange={(e) =>
                                                    applyPhysicalFields(e.target.value, jaaRegNumber)
                                                }
                                            />
                                            <p className="text-[10px] text-slate-500">
                                                Bottom of the plastic card
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="jaaRegNumber">Reg #</Label>
                                            <Input
                                                id="jaaRegNumber"
                                                placeholder="RN2783 or 5179KZ"
                                                value={jaaRegNumber}
                                                onChange={(e) =>
                                                    applyPhysicalFields(jaaCompanyNumber, e.target.value)
                                                }
                                            />
                                            <p className="text-[10px] text-slate-500">
                                                Rental code or plate on the card
                                            </p>
                                        </div>
                                    </div>
                                    {composedPhysicalCode && (
                                        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5">
                                            Card code saved as{' '}
                                            <span className="font-mono font-medium">{composedPhysicalCode}</span>
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

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
                            {selfServePrograms.length > 1 && !lockIdentity && jaaEntryMode === 'statement' && (
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
