import React, { useEffect, useState } from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card";
import { Input } from "../ui/input";
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { tierService } from '../../services/tierService';
import { ExpenseSplitRule } from '../../types/data';

export function FuelConfiguration() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [splitRules, setSplitRules] = useState<ExpenseSplitRule[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const s = await tierService.getSplitRules();
            setSplitRules(s);
        } catch (e) {
            toast.error("Failed to load configuration");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await tierService.saveSplitRules(splitRules);
            toast.success("Fuel configuration saved");
        } catch (e) {
            toast.error("Failed to save configuration");
        } finally {
            setSaving(false);
        }
    };

    // Helper to calculate driver share
    const calculateDriverShare = (company: number, custom: {percentage: number}[]) => {
        const customTotal = custom.reduce((sum, item) => sum + item.percentage, 0);
        return Math.max(0, 100 - company - customTotal);
    };

    const updateCompanyShare = (ruleId: string, newVal: number) => {
        setSplitRules(prev => prev.map(r => {
            if (r.id === ruleId) {
                const customSplits = r.customSplits || [];
                const driverShare = calculateDriverShare(newVal, customSplits);
                return { ...r, companyShare: newVal, driverShare };
            }
            return r;
        }));
    };

    const addCustomSplit = (ruleId: string) => {
        setSplitRules(prev => prev.map(r => {
            if (r.id === ruleId) {
                const newSplit = { id: crypto.randomUUID(), name: 'New Party', percentage: 0 };
                const customSplits = [...(r.customSplits || []), newSplit];
                const driverShare = calculateDriverShare(r.companyShare, customSplits);
                return { ...r, customSplits, driverShare };
            }
            return r;
        }));
    };

    const updateCustomSplit = (ruleId: string, splitId: string, field: 'name' | 'percentage', value: any) => {
        setSplitRules(prev => prev.map(r => {
            if (r.id === ruleId) {
                const customSplits = (r.customSplits || []).map(s => 
                    s.id === splitId ? { ...s, [field]: value } : s
                );
                
                if (field === 'percentage') {
                    const driverShare = calculateDriverShare(r.companyShare, customSplits);
                    return { ...r, customSplits, driverShare };
                }
                return { ...r, customSplits };
            }
            return r;
        }));
    };

    const removeCustomSplit = (ruleId: string, splitId: string) => {
        setSplitRules(prev => prev.map(r => {
            if (r.id === ruleId) {
                const customSplits = (r.customSplits || []).filter(s => s.id !== splitId);
                const driverShare = calculateDriverShare(r.companyShare, customSplits);
                return { ...r, customSplits, driverShare };
            }
            return r;
        }));
    };

    const fuelRule = splitRules.find(r => r.category === 'Fuel');

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (!fuelRule) {
        return (
            <Card>
                <CardContent className="p-8 text-center text-slate-500">
                    Fuel configuration not found. Please initialize expense splits in System Settings.
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Fuel Expense Splits</CardTitle>
                <CardDescription>Adjust the company and driver share for fuel expenses.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-medium text-slate-900">Split Configuration</h3>
                            <p className="text-sm text-slate-500">Define default percentage splits.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => addCustomSplit(fuelRule.id)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Split Column
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Company Share */}
                        <div className="space-y-2 p-4 bg-slate-50 rounded-lg border">
                            <label className="text-sm font-medium text-slate-700">Company Share (%)</label>
                            <div className="relative mt-2">
                                <Input 
                                    type="number" 
                                    value={fuelRule.companyShare}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        if (val >= 0 && val <= 100) {
                                            updateCompanyShare(fuelRule.id, val);
                                        }
                                    }}
                                    className="pr-8"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                            </div>
                        </div>

                        {/* Custom Splits */}
                        {fuelRule.customSplits?.map(split => (
                            <div key={split.id} className="space-y-2 p-4 bg-slate-50 rounded-lg border relative group">
                                <div className="flex justify-between items-center mb-2">
                                    <Input 
                                        value={split.name}
                                        onChange={e => updateCustomSplit(fuelRule.id, split.id, 'name', e.target.value)}
                                        className="h-7 text-sm font-medium border-transparent hover:border-slate-300 focus:border-primary px-1 -ml-1 w-full"
                                    />
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => removeCustomSplit(fuelRule.id, split.id)}
                                    >
                                        <X className="h-3 w-3 text-slate-400 hover:text-red-500" />
                                    </Button>
                                </div>
                                
                                <div className="relative">
                                    <Input 
                                        type="number" 
                                        value={split.percentage}
                                        onChange={e => {
                                            const val = Number(e.target.value);
                                            if (val >= 0 && val <= 100) {
                                                updateCustomSplit(fuelRule.id, split.id, 'percentage', val);
                                            }
                                        }}
                                        className="pr-8"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                                </div>
                            </div>
                        ))}
                        
                        {/* Driver Share */}
                        <div className="space-y-2 p-4 bg-slate-50 rounded-lg border">
                            <label className="text-sm font-medium text-slate-700">Driver Share (%)</label>
                            <div className="relative mt-2">
                                <Input 
                                    type="number" 
                                    value={fuelRule.driverShare}
                                    disabled
                                    className="pr-8 bg-slate-100"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
            <CardFooter className="bg-slate-50 border-t px-6 py-4 flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Configuration
                </Button>
            </CardFooter>
        </Card>
    );
}