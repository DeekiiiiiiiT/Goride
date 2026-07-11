import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FuelScenario, FuelRule } from '../../types/fuel';
import { Fuel, AlertTriangle } from 'lucide-react';
import { normalizePercentageRule } from '../../utils/fuelCoverageSplit';

/**
 * Validates a Fuel rule before save. Blocks NaN/negative/>100% percentages and
 * non-positive allowances.
 */
export function validateFuelRule(rule: FuelRule): string | null {
    if (!Number.isFinite(rule.coverageValue) || rule.coverageValue < 0) {
        return rule.coverageType === 'Fixed_Amount'
            ? 'Allowance amount must be a positive number.'
            : 'Coverage value must be a number of 0 or greater.';
    }
    if (rule.coverageType === 'Fixed_Amount' && rule.coverageValue <= 0) {
        return 'Allowance amount must be greater than 0.';
    }
    if (rule.coverageType === 'Percentage') {
        const granular: [string, number | undefined][] = [
            ['Ride Share', rule.rideShareCoverage],
            ['Company Ops', rule.companyUsageCoverage],
            ['Deadhead', rule.deadheadCoverage],
            ['Personal Usage', rule.personalCoverage],
            ['Misc / Leakage', rule.miscCoverage],
        ];
        for (const [label, value] of granular) {
            if (value === undefined) continue;
            if (!Number.isFinite(value) || value < 0 || value > 100) {
                return `${label} must be a number between 0 and 100.`;
            }
        }
    }
    if (rule.conditions?.maxAmount !== undefined && (!Number.isFinite(rule.conditions.maxAmount) || rule.conditions.maxAmount <= 0)) {
        return 'Max amount cap must be a positive number.';
    }
    return null;
}

interface ScenarioEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (scenario: FuelScenario) => Promise<void>;
    initialData: FuelScenario | null;
    affectedVehicleCount?: number;
}

const GRANULAR_FIELDS: { key: keyof FuelRule; label: string }[] = [
    { key: 'rideShareCoverage', label: 'Ride Share' },
    { key: 'companyUsageCoverage', label: 'Company Ops' },
    { key: 'deadheadCoverage', label: 'Deadhead' },
    { key: 'personalCoverage', label: 'Personal' },
    { key: 'miscCoverage', label: 'Misc / Leakage' },
];

export function ScenarioEditor({ isOpen, onClose, onSave, initialData, affectedVehicleCount = 0 }: ScenarioEditorProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [rules, setRules] = useState<FuelRule[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setDescription(initialData.description || '');
                const fuelRule = initialData.rules.find(r => r.category === 'Fuel');
                if (fuelRule) {
                     setRules([fuelRule.coverageType === 'Percentage' ? normalizePercentageRule(fuelRule) : fuelRule]);
                } else {
                     setRules([{
                        id: crypto.randomUUID(),
                        category: 'Fuel',
                        coverageType: 'Percentage',
                        coverageValue: 50,
                        rideShareCoverage: 80,
                        companyUsageCoverage: 100,
                        deadheadCoverage: 50,
                        personalCoverage: 0,
                        miscCoverage: 50,
                    }]);
                }
            } else {
                setName('');
                setDescription('');
                setRules([{
                    id: crypto.randomUUID(),
                    category: 'Fuel',
                    coverageType: 'Percentage',
                    coverageValue: 50,
                    rideShareCoverage: 80,
                    companyUsageCoverage: 100,
                    deadheadCoverage: 50,
                    personalCoverage: 0,
                    miscCoverage: 50,
                }]);
            }
        }
    }, [isOpen, initialData]);

    const updateFuelRule = (field: keyof FuelRule, value: any) => {
        setRules(prev => prev.map(r => {
            if (r.category !== 'Fuel') return r;
            if (field === 'coverageType' && value === 'Full') {
                return { ...r, coverageType: value, coverageValue: 100 };
            }
            if (field === 'coverageType' && value === 'Percentage') {
                return normalizePercentageRule({ ...r, coverageType: 'Percentage' });
            }
            return { ...r, [field]: value };
        }));
    };

    const fuelRule = rules.find(r => r.category === 'Fuel');
    const validationError = fuelRule ? validateFuelRule(fuelRule) : null;

    const handleSubmit = async () => {
        if (!name.trim() || !fuelRule || validationError) return;
        setIsSubmitting(true);
        try {
            const ruleToSave =
                fuelRule.coverageType === 'Percentage' ? normalizePercentageRule(fuelRule) : fuelRule;
            const scenario: FuelScenario = {
                id: initialData?.id || crypto.randomUUID(),
                name,
                description,
                rules: [ruleToSave],
                isDefault: initialData?.isDefault || false
            };
            await onSave(scenario);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!fuelRule) return null;

    const companyPct = (field: keyof FuelRule) => {
        const v = fuelRule[field];
        return typeof v === 'number' ? v : fuelRule.coverageValue;
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
                <div className="shrink-0 space-y-3 px-6 pt-6 pb-3 border-b border-slate-100">
                    <DialogHeader>
                        <DialogTitle>{initialData ? 'Edit Policy' : 'Create New Policy'}</DialogTitle>
                        <DialogDescription>
                            Set how much the company covers vs what the driver pays for each fuel category.
                        </DialogDescription>
                    </DialogHeader>

                    {initialData && affectedVehicleCount > 0 && (
                        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span className="text-sm">
                                {affectedVehicleCount} vehicle{affectedVehicleCount !== 1 ? 's' : ''} currently {affectedVehicleCount !== 1 ? 'use' : 'uses'} this policy. Saving changes recalculates live unfinalized weeks — finalized weeks are unaffected.
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Policy Name</Label>
                            <Input
                                placeholder="e.g. Owner Operators (Standard)"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                placeholder="Describe who this applies to…"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="h-20 resize-none"
                            />
                        </div>
                    </div>

                    <div className="border rounded-xl p-4 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium text-sm text-slate-900 flex items-center gap-2">
                                <Fuel className="h-4 w-4 text-indigo-500" />
                                Fuel Coverage Rules
                            </h3>
                        </div>

                        <div className="bg-white border rounded-lg p-5 space-y-5 shadow-sm">
                            <div className="space-y-2">
                                <Label>Coverage Type</Label>
                                <Select
                                    value={fuelRule.coverageType}
                                    onValueChange={(val) => updateFuelRule('coverageType', val)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Full">Full (work categories 100% company; Personal on driver)</SelectItem>
                                        <SelectItem value="Percentage">Percentage Split</SelectItem>
                                        <SelectItem value="Fixed_Amount">Fixed Allowance</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500">
                                    {fuelRule.coverageType === 'Percentage' && 'Company covers %; Driver pays = 100 − Company.'}
                                    {fuelRule.coverageType === 'Full' && 'Ride Share, Company Ops, Deadhead, and Misc are fully company. Personal is always paid by the driver.'}
                                    {fuelRule.coverageType === 'Fixed_Amount' && 'One weekly allowance covers Ride Share + Misc. Company Ops and Deadhead are fully company; Personal is fully driver.'}
                                </p>
                            </div>

                            {fuelRule.coverageType === 'Fixed_Amount' && (
                                <div className="space-y-2">
                                    <Label>Weekly Allowance ($)</Label>
                                    <Input
                                        type="number"
                                        min="0"
                                        value={fuelRule.coverageValue}
                                        onChange={(e) => updateFuelRule('coverageValue', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                    />
                                </div>
                            )}

                            {fuelRule.coverageType === 'Full' && (
                                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
                                    <p><span className="font-medium text-indigo-700">Company 100%:</span> Ride Share, Company Ops, Deadhead, Misc</p>
                                    <p><span className="font-medium text-rose-600">Driver 100%:</span> Personal</p>
                                </div>
                            )}

                            {fuelRule.coverageType === 'Percentage' && (
                                <div className="border rounded-md bg-slate-50 p-4 space-y-3">
                                    <div>
                                        <Label className="text-sm font-semibold text-slate-900">Company covers by category</Label>
                                        <p className="text-xs text-slate-500">Driver pays updates automatically.</p>
                                    </div>
                                    {GRANULAR_FIELDS.map(({ key, label }) => {
                                        const company = companyPct(key);
                                        const driver = 100 - company;
                                        return (
                                            <div key={key} className="flex items-center gap-3">
                                                <Label className="w-28 shrink-0 text-xs font-medium text-slate-700">{label}</Label>
                                                <div className="relative w-28">
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        className="pr-8"
                                                        value={company}
                                                        onChange={(e) =>
                                                            updateFuelRule(
                                                                key,
                                                                e.target.value === '' ? 0 : parseFloat(e.target.value),
                                                            )
                                                        }
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                                                </div>
                                                <span className="text-xs text-rose-600 tabular-nums">
                                                    Driver pays {driver}%
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="shrink-0 space-y-3 border-t border-slate-100 px-6 py-4 bg-white">
                    {validationError && (
                        <div className="flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-900">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span className="text-sm">{validationError}</span>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim() || !!validationError}>
                            {isSubmitting ? "Saving..." : "Save Policy"}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
