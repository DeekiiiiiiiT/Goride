import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { FuelScenario, FuelRule } from '../../types/fuel';
import { Fuel } from 'lucide-react';
import { normalizePercentageRule } from '../../utils/fuelCoverageSplit';
import { applyPolicyTemplateSave } from '../../utils/fuelPolicyVersion';
import { toast } from 'sonner@2.0.3';

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
    /** @deprecated unused — drivers assigned on Schedule */
    affectedVehicleCount?: number;
    /** @deprecated unused — drivers assigned on Schedule */
    affectedDriverCount?: number;
    /** True for brand-new or unsaved clone. */
    isCreate?: boolean;
}

const GRANULAR_FIELDS: { key: keyof FuelRule; label: string }[] = [
    { key: 'rideShareCoverage', label: 'Ride Share' },
    { key: 'companyUsageCoverage', label: 'Company Ops' },
    { key: 'deadheadCoverage', label: 'Deadhead' },
    { key: 'personalCoverage', label: 'Personal' },
    { key: 'miscCoverage', label: 'Misc / Leakage' },
];

const DEFAULT_RULE = (): FuelRule => ({
    id: crypto.randomUUID(),
    category: 'Fuel',
    coverageType: 'Percentage',
    coverageValue: 50,
    rideShareCoverage: 80,
    companyUsageCoverage: 100,
    deadheadCoverage: 50,
    personalCoverage: 0,
    miscCoverage: 50,
});

/** Rules tab: name + split % only. Periods and drivers live on Schedule. */
export function ScenarioEditor({
    isOpen,
    onClose,
    onSave,
    initialData,
    isCreate = false,
}: ScenarioEditorProps) {
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
                     setRules([DEFAULT_RULE()]);
                }
            } else {
                setName('');
                setDescription('');
                setRules([DEFAULT_RULE()]);
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
            const draft: FuelScenario = {
                id: initialData?.id || crypto.randomUUID(),
                name,
                description,
                rules: [ruleToSave],
                isDefault: initialData?.isDefault || false,
                versions: initialData?.versions,
            };
            const scenario = applyPolicyTemplateSave({
                previous: isCreate ? null : initialData,
                next: draft,
            });
            await onSave(scenario);
        } catch (e: any) {
            toast.error(e?.message || 'Failed to save policy');
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
                        <DialogTitle>
                            {initialData && !isCreate ? 'Edit Policy' : 'Create New Policy'}
                        </DialogTitle>
                        <DialogDescription>
                            Set company vs driver split percentages. Periods and drivers are managed on the Schedule tab.
                        </DialogDescription>
                    </DialogHeader>
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
                                <div className="space-y-3">
                                    <Label className="text-slate-700">Company covers by category</Label>
                                    {GRANULAR_FIELDS.map(({ key, label }) => (
                                        <div key={key} className="flex items-center gap-3">
                                            <span className="w-28 text-sm text-slate-600 shrink-0">{label}</span>
                                            <Input
                                                type="number"
                                                min={0}
                                                max={100}
                                                className="h-9 w-20"
                                                value={companyPct(key) as number}
                                                onChange={(e) =>
                                                    updateFuelRule(
                                                        key,
                                                        e.target.value === '' ? 0 : Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                                                    )
                                                }
                                            />
                                            <span className="text-xs text-slate-500">% company</span>
                                            <span className="text-xs text-rose-600 ml-auto">
                                                Driver {100 - (companyPct(key) as number)}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="shrink-0 px-6 py-4 border-t border-slate-100 gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !!validationError || !name.trim()}>
                        {isSubmitting ? 'Saving…' : 'Save Policy'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
