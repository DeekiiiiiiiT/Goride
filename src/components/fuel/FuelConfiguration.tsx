import React, { useEffect, useState } from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card";
import { Loader2, Plus, Info } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { tierService } from '../../services/tierService';
import { ExpenseSplitRule } from '../../types/data';
import { ScenarioCard } from './ScenarioCard';
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";

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
            // Basic validation
            const fuelRules = splitRules.filter(r => r.category === 'Fuel');
            
            // Name validation
            const invalidNames = fuelRules.some(r => !r.name || r.name.trim() === '');
            if (invalidNames) {
                toast.error("All scenarios must have a name");
                setSaving(false);
                return;
            }

            // Numeric validation
            const invalidNumbers = fuelRules.some(r => {
                const total = (r.companyShare || 0) + (r.driverShare || 0);
                return Math.abs(total - 100) > 0.1; // Float tolerance
            });

            if (invalidNumbers) {
                toast.error("Split percentages must total 100%");
                setSaving(false);
                return;
            }
            
            // Ensure at least one default
            const hasDefault = fuelRules.some(r => r.isDefault);
            if (!hasDefault && fuelRules.length > 0) {
                 // Auto set first as default if none selected (shouldn't happen with UI logic, but good safety)
                 const firstId = fuelRules[0].id;
                 setSplitRules(prev => prev.map(r => r.id === firstId ? { ...r, isDefault: true } : r));
                 // Note: state update won't be immediate for the save call below, 
                 // but we can trust the user will see visual update or next save will catch it.
                 // Actually, let's fix the local var for saving
                 const updatedRules = splitRules.map(r => r.id === firstId ? { ...r, isDefault: true } : r);
                 await tierService.saveSplitRules(updatedRules);
            } else {
                 await tierService.saveSplitRules(splitRules);
            }

            toast.success("Fuel configuration saved");
        } catch (e) {
            toast.error("Failed to save configuration");
        } finally {
            setSaving(false);
        }
    };

    const handleUpdate = (id: string, field: keyof ExpenseSplitRule, value: any) => {
        setSplitRules(prev => prev.map(rule => 
            rule.id === id ? { ...rule, [field]: value } : rule
        ));
    };

    const handleDelete = (id: string) => {
        const ruleToDelete = splitRules.find(r => r.id === id);
        if (ruleToDelete?.isDefault) {
            toast.error("Cannot delete the default scenario. Please set another scenario as default first.");
            return;
        }

        if (splitRules.filter(r => r.category === 'Fuel').length <= 1) {
            toast.error("You must have at least one fuel scenario");
            return;
        }
        setSplitRules(prev => prev.filter(rule => rule.id !== id));
    };

    const handleSetDefault = (id: string) => {
        setSplitRules(prev => prev.map(rule => {
            if (rule.category !== 'Fuel') return rule; // Don't touch other categories
            return {
                ...rule,
                isDefault: rule.id === id
            };
        }));
    };

    const addNewScenario = () => {
        const newRule: ExpenseSplitRule = {
            id: crypto.randomUUID(),
            category: 'Fuel',
            name: 'New Scenario',
            companyShare: 50,
            driverShare: 50,
            isDefault: false
        };
        setSplitRules(prev => [...prev, newRule]);
    };

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        );
    }

    const fuelRules = splitRules.filter(r => r.category === 'Fuel');

    return (
        <Card className="border-0 shadow-none">
            <CardHeader className="px-0 pt-0">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle>Fuel Split Scenarios</CardTitle>
                        <CardDescription>
                            Define different split scenarios (e.g., Personal vs. Business) to apply during expense approval.
                        </CardDescription>
                    </div>
                    <Button onClick={addNewScenario} variant="outline" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Scenario
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="px-0">
                <Alert className="mb-6 bg-blue-50 border-blue-200 text-blue-900">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertTitle>How Scenarios Work</AlertTitle>
                    <AlertDescription className="text-blue-800">
                        These scenarios appear in the <strong>Expense Approval</strong> wizard. When approving a fuel expense, you can select a scenario (like "Ride Share") to automatically calculate the Company vs. Driver split based on these percentages. The default scenario will be pre-selected.
                    </AlertDescription>
                </Alert>

                {fuelRules.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
                        <p className="text-slate-500 mb-4">No fuel scenarios defined.</p>
                        <Button onClick={addNewScenario}>Create First Scenario</Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {fuelRules.map(rule => (
                            <ScenarioCard 
                                key={rule.id} 
                                rule={rule} 
                                onUpdate={handleUpdate} 
                                onDelete={handleDelete}
                                onSetDefault={handleSetDefault}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
            <CardFooter className="bg-slate-50 border-t -mx-6 -mb-6 px-6 py-4 flex justify-end mt-6 rounded-b-lg">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Changes
                </Button>
            </CardFooter>
        </Card>
    );
}
