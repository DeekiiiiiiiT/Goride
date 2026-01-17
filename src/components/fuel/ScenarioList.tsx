import React, { useEffect, useState } from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Loader2, Plus, Trash2, Edit2, Star, Fuel, Wrench, Ticket, ShieldCheck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { fuelService } from '../../services/fuelService';
import { FuelScenario, FuelRule } from '../../types/fuel';
import { ScenarioEditor } from './ScenarioEditor';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

export function ScenarioList() {
    const [scenarios, setScenarios] = useState<FuelScenario[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingScenario, setEditingScenario] = useState<FuelScenario | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);

    useEffect(() => {
        loadScenarios();
    }, []);

    const loadScenarios = async () => {
        setLoading(true);
        try {
            const data = await fuelService.getFuelScenarios();
            setScenarios(data);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load scenarios");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (scenario: FuelScenario) => {
        try {
            // Ensure only one default if this one is default
            if (scenario.isDefault) {
                 // In a real backend, this would be handled transactionally. 
                 // Here we might need to optimistic update or just reload.
            }
            
            const saved = await fuelService.saveFuelScenario(scenario);
            
            setScenarios(prev => {
                const index = prev.findIndex(s => s.id === saved.id);
                if (index >= 0) {
                    return prev.map((s, i) => i === index ? saved : (saved.isDefault ? { ...s, isDefault: false } : s));
                }
                return [...(saved.isDefault ? prev.map(s => ({ ...s, isDefault: false })) : prev), saved];
            });
            
            toast.success("Scenario saved");
            setIsEditorOpen(false);
            setEditingScenario(null);
        } catch (e) {
            console.error(e);
            toast.error("Failed to save scenario");
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            await fuelService.deleteFuelScenario(deleteId);
            setScenarios(prev => prev.filter(s => s.id !== deleteId));
            toast.success("Scenario deleted");
        } catch (e) {
            console.error(e);
            toast.error("Failed to delete scenario");
        } finally {
            setDeleteId(null);
        }
    };

    const handleSetDefault = async (scenario: FuelScenario) => {
        if (scenario.isDefault) return;
        try {
            const updated = { ...scenario, isDefault: true };
            await fuelService.saveFuelScenario(updated);
            // Reload all to ensure consistency or manual update
            loadScenarios(); 
            toast.success("Default scenario updated");
        } catch (e) {
            console.error(e);
            toast.error("Failed to update default");
        }
    };

    const getRuleSummary = (rules: FuelRule[], category: 'Fuel' | 'Maintenance' | 'Tolls') => {
        const rule = rules.find(r => r.category === category);
        if (!rule) return <span className="text-slate-400 italic">Not Covered</span>;

        let text = '';
        if (rule.coverageType === 'Full') text = '100% Covered';
        else if (rule.coverageType === 'Percentage') text = `${rule.coverageValue}% Covered`;
        else if (rule.coverageType === 'Fixed_Amount') text = `$${rule.coverageValue} Allowance`;

        return (
            <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-slate-700">{text}</span>
                {rule.conditions?.maxAmount && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        Max: ${rule.conditions.maxAmount}
                    </span>
                )}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium text-slate-900">Fuel Scenarios</h3>
                    <p className="text-sm text-slate-500">Define coverage rules for different fleet segments.</p>
                </div>
                <Button onClick={() => { setEditingScenario(null); setIsEditorOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Scenario
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {scenarios.map(scenario => (
                    <Card key={scenario.id} className={`relative group transition-all hover:shadow-md ${scenario.isDefault ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : ''}`}>
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <CardTitle className="text-base">{scenario.name}</CardTitle>
                                        {scenario.isDefault && (
                                            <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0">
                                                Default
                                            </Badge>
                                        )}
                                    </div>
                                    <CardDescription className="line-clamp-2 min-h-[40px]">
                                        {scenario.description || "No description provided."}
                                    </CardDescription>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingScenario(scenario); setIsEditorOpen(true); }}>
                                        <Edit2 className="h-4 w-4 text-slate-500" />
                                    </Button>
                                    {!scenario.isDefault && (
                                        <>
                                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSetDefault(scenario)} title="Set as Default">
                                                <Star className="h-4 w-4 text-slate-400" />
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-600" onClick={() => setDeleteId(scenario.id)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="p-2 bg-orange-50 rounded-lg flex items-center gap-3">
                                <div className="bg-orange-100 p-1.5 rounded-md text-orange-600">
                                    <Fuel className="h-4 w-4" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-orange-800 font-semibold mb-0.5">Fuel</div>
                                    {getRuleSummary(scenario.rules, 'Fuel')}
                                </div>
                            </div>
                            
                            <div className="p-2 bg-blue-50 rounded-lg flex items-center gap-3">
                                <div className="bg-blue-100 p-1.5 rounded-md text-blue-600">
                                    <Wrench className="h-4 w-4" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-blue-800 font-semibold mb-0.5">Maintenance</div>
                                    {getRuleSummary(scenario.rules, 'Maintenance')}
                                </div>
                            </div>

                            <div className="p-2 bg-purple-50 rounded-lg flex items-center gap-3">
                                <div className="bg-purple-100 p-1.5 rounded-md text-purple-600">
                                    <Ticket className="h-4 w-4" />
                                </div>
                                <div className="flex-1">
                                    <div className="text-xs text-purple-800 font-semibold mb-0.5">Tolls</div>
                                    {getRuleSummary(scenario.rules, 'Tolls')}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <ScenarioEditor 
                isOpen={isEditorOpen}
                onClose={() => { setIsEditorOpen(false); setEditingScenario(null); }}
                onSave={handleSave}
                initialData={editingScenario}
            />

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Scenario?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently remove this configuration. Vehicles assigned to this scenario may revert to default rules.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
