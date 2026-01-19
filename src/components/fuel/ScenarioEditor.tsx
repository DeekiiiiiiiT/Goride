import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { FuelScenario, FuelRule } from '../../types/fuel';
import { Fuel, Info } from 'lucide-react';

interface ScenarioEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (scenario: FuelScenario) => Promise<void>;
    initialData: FuelScenario | null;
}

export function ScenarioEditor({ isOpen, onClose, onSave, initialData }: ScenarioEditorProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [rules, setRules] = useState<FuelRule[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setDescription(initialData.description || '');
                // Ensure we have a fuel rule, or create one if missing
                const fuelRule = initialData.rules.find(r => r.category === 'Fuel');
                if (fuelRule) {
                     setRules([fuelRule]);
                } else {
                     setRules([{
                        id: crypto.randomUUID(),
                        category: 'Fuel',
                        coverageType: 'Full',
                        coverageValue: 100,
                        conditions: { requiresReceipt: true }
                    }]);
                }
            } else {
                // Default new scenario
                setName('');
                setDescription('');
                setRules([{
                    id: crypto.randomUUID(),
                    category: 'Fuel',
                    coverageType: 'Full',
                    coverageValue: 100,
                    conditions: { requiresReceipt: true }
                }]);
            }
        }
    }, [isOpen, initialData]);

    const updateFuelRule = (field: keyof FuelRule | 'maxAmount' | 'requiresReceipt', value: any) => {
        setRules(prev => prev.map(r => {
            if (r.category !== 'Fuel') return r;

            if (field === 'maxAmount' || field === 'requiresReceipt') {
                return {
                    ...r,
                    conditions: {
                        ...r.conditions,
                        [field]: value
                    }
                };
            }
            
            // If changing to Full, force value to 100
            if (field === 'coverageType' && value === 'Full') {
                return { ...r, coverageType: value, coverageValue: 100 };
            }

            return { ...r, [field]: value };
        }));
    };

    const fuelRule = rules.find(r => r.category === 'Fuel');

    const handleSubmit = async () => {
        if (!name.trim()) return;
        setIsSubmitting(true);
        try {
            const scenario: FuelScenario = {
                id: initialData?.id || crypto.randomUUID(),
                name,
                description,
                rules, // Will only contain Fuel rule
                isDefault: initialData?.isDefault || false
            };
            await onSave(scenario);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!fuelRule) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Scenario' : 'Create New Scenario'}</DialogTitle>
                    <DialogDescription>
                        Configure how fuel expenses are covered for this group.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Scenario Name</Label>
                            <Input 
                                placeholder="e.g. Owner Operators (Standard)" 
                                value={name} 
                                onChange={(e) => setName(e.target.value)} 
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea 
                                placeholder="Describe who this applies to..." 
                                value={description} 
                                onChange={(e) => setDescription(e.target.value)}
                                className="h-20 resize-none"
                            />
                        </div>
                    </div>

                    {/* Rules Configuration */}
                    <div className="border rounded-xl p-4 bg-slate-50/50">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium text-sm text-slate-900 flex items-center gap-2">
                                <Fuel className="h-4 w-4 text-indigo-500" />
                                Fuel Coverage Rules
                            </h3>
                        </div>

                        <div className="bg-white border rounded-lg p-5 space-y-5 shadow-sm">
                            <div className="grid grid-cols-1 gap-5">
                                <div className="grid grid-cols-2 gap-5">
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
                                                <SelectItem value="Full">Full Coverage (100%)</SelectItem>
                                                <SelectItem value="Percentage">Percentage Split</SelectItem>
                                                <SelectItem value="Fixed_Amount">Fixed Allowance</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    
                                    {fuelRule.coverageType !== 'Percentage' && (
                                        <div className="space-y-2">
                                            <Label>
                                                {fuelRule.coverageType === 'Fixed_Amount' ? 'Allowance Amount ($)' : 'Coverage Value'}
                                            </Label>
                                            <Input 
                                                type="number" 
                                                min="0"
                                                disabled={fuelRule.coverageType === 'Full'}
                                                value={fuelRule.coverageValue}
                                                onChange={(e) => updateFuelRule('coverageValue', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                            />
                                        </div>
                                    )}
                                </div>

                                {fuelRule.coverageType === 'Percentage' && (
                                    <div className="border rounded-md bg-slate-50 p-4">
                                        <div className="mb-4">
                                            <Label className="text-sm font-semibold text-slate-900">Granular Coverage Rules</Label>
                                            <p className="text-xs text-slate-500">Define the percentage of cost covered by the Company for each category.</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-medium text-slate-700">Ride Share</Label>
                                                <div className="relative">
                                                    <Input 
                                                        type="number" min="0" max="100" className="pr-8"
                                                        value={fuelRule.rideShareCoverage ?? fuelRule.coverageValue ?? 100}
                                                        onChange={(e) => updateFuelRule('rideShareCoverage', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-medium text-slate-700">Company Ops</Label>
                                                <div className="relative">
                                                    <Input 
                                                        type="number" min="0" max="100" className="pr-8"
                                                        value={fuelRule.companyUsageCoverage ?? 100}
                                                        onChange={(e) => updateFuelRule('companyUsageCoverage', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-medium text-slate-700">Personal Usage</Label>
                                                <div className="relative">
                                                    <Input 
                                                        type="number" min="0" max="100" className="pr-8"
                                                        value={fuelRule.personalCoverage ?? 0}
                                                        onChange={(e) => updateFuelRule('personalCoverage', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-medium text-slate-700">Misc / Leakage</Label>
                                                <div className="relative">
                                                    <Input 
                                                        type="number" min="0" max="100" className="pr-8"
                                                        value={fuelRule.miscCoverage ?? fuelRule.coverageValue ?? 50}
                                                        onChange={(e) => updateFuelRule('miscCoverage', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">%</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="border-t pt-4 space-y-4">
                                <Label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Conditions</Label>
                                
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm">Require Receipt</Label>
                                        <p className="text-xs text-slate-500">Must upload photo proof for reimbursement</p>
                                    </div>
                                    <Switch 
                                        checked={fuelRule.conditions?.requiresReceipt ?? true}
                                        onCheckedChange={(c) => updateFuelRule('requiresReceipt', c)}
                                    />
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex-1 space-y-0.5">
                                        <Label className="text-sm">Max Amount Cap ($)</Label>
                                        <p className="text-xs text-slate-500">Optional limit per transaction</p>
                                    </div>
                                    <div className="w-32">
                                        <Input 
                                            type="number" 
                                            placeholder="No Limit"
                                            value={fuelRule.conditions?.maxAmount || ''}
                                            onChange={(e) => updateFuelRule('maxAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isSubmitting || !name}>
                        {isSubmitting ? "Saving..." : "Save Scenario"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
