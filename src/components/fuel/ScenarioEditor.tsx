import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { FuelScenario, FuelRule, FuelCoverageType } from '../../types/fuel';
import { Fuel, Wrench, Ticket, Info } from 'lucide-react';

interface ScenarioEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (scenario: FuelScenario) => Promise<void>;
    initialData: FuelScenario | null;
}

const CATEGORIES = ['Fuel', 'Maintenance', 'Tolls'] as const;

export function ScenarioEditor({ isOpen, onClose, onSave, initialData }: ScenarioEditorProps) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [rules, setRules] = useState<FuelRule[]>([]);
    const [activeTab, setActiveTab] = useState<string>('Fuel');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setName(initialData.name);
                setDescription(initialData.description || '');
                setRules(initialData.rules);
            } else {
                // Default new scenario
                setName('');
                setDescription('');
                setRules(CATEGORIES.map(cat => ({
                    id: crypto.randomUUID(),
                    category: cat,
                    coverageType: 'Full',
                    coverageValue: 100,
                    conditions: { requiresReceipt: true }
                })));
            }
            setActiveTab('Fuel');
        }
    }, [isOpen, initialData]);

    const updateRule = (category: string, field: keyof FuelRule | 'maxAmount' | 'requiresReceipt', value: any) => {
        setRules(prev => prev.map(r => {
            if (r.category !== category) return r;

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

    const getRule = (category: string) => rules.find(r => r.category === category);

    const handleSubmit = async () => {
        if (!name.trim()) return;
        setIsSubmitting(true);
        try {
            const scenario: FuelScenario = {
                id: initialData?.id || crypto.randomUUID(),
                name,
                description,
                rules,
                isDefault: initialData?.isDefault || false
            };
            await onSave(scenario);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{initialData ? 'Edit Scenario' : 'Create New Scenario'}</DialogTitle>
                    <DialogDescription>
                        Configure how expenses are covered for this group.
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
                            <h3 className="font-medium text-sm text-slate-900">Coverage Rules</h3>
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                Configure per category
                            </span>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList className="w-full grid grid-cols-3 mb-4">
                                <TabsTrigger value="Fuel" className="flex items-center gap-2">
                                    <Fuel className="h-4 w-4" /> Fuel
                                </TabsTrigger>
                                <TabsTrigger value="Maintenance" className="flex items-center gap-2">
                                    <Wrench className="h-4 w-4" /> Maintenance
                                </TabsTrigger>
                                <TabsTrigger value="Tolls" className="flex items-center gap-2">
                                    <Ticket className="h-4 w-4" /> Tolls
                                </TabsTrigger>
                            </TabsList>

                            {CATEGORIES.map(cat => {
                                const rule = getRule(cat);
                                if (!rule) return null;

                                return (
                                    <TabsContent key={cat} value={cat} className="space-y-4 animate-in fade-in-50 duration-300">
                                        <div className="bg-white border rounded-lg p-5 space-y-5 shadow-sm">
                                            <div className="grid grid-cols-2 gap-5">
                                                <div className="space-y-2">
                                                    <Label>Coverage Type</Label>
                                                    <Select 
                                                        value={rule.coverageType} 
                                                        onValueChange={(val) => updateRule(cat, 'coverageType', val)}
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
                                                
                                                <div className="space-y-2">
                                                    <Label>
                                                        {rule.coverageType === 'Percentage' ? 'Company Share (%)' : 
                                                         rule.coverageType === 'Fixed_Amount' ? 'Allowance Amount ($)' : 'Coverage Value'}
                                                    </Label>
                                                    <Input 
                                                        type="number" 
                                                        min="0"
                                                        disabled={rule.coverageType === 'Full'}
                                                        value={rule.coverageValue}
                                                        onChange={(e) => updateRule(cat, 'coverageValue', parseFloat(e.target.value))}
                                                    />
                                                    {rule.coverageType === 'Percentage' && (
                                                        <p className="text-xs text-slate-500 text-right mt-1">
                                                            Driver pays: {100 - rule.coverageValue}%
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="border-t pt-4 space-y-4">
                                                <Label className="text-xs uppercase text-slate-500 font-bold tracking-wider">Conditions</Label>
                                                
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-0.5">
                                                        <Label className="text-sm">Require Receipt</Label>
                                                        <p className="text-xs text-slate-500">Must upload photo proof for reimbursement</p>
                                                    </div>
                                                    <Switch 
                                                        checked={rule.conditions?.requiresReceipt ?? true}
                                                        onCheckedChange={(c) => updateRule(cat, 'requiresReceipt', c)}
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
                                                            value={rule.conditions?.maxAmount || ''}
                                                            onChange={(e) => updateRule(cat, 'maxAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>
                                );
                            })}
                        </Tabs>
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
