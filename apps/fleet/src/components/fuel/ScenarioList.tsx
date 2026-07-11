import React, { useEffect, useMemo, useState } from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Loader2, Plus, Trash2, Edit2, Star, AlertTriangle, Car, Copy, UserPlus } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { fuelService } from '../../services/fuelService';
import { api } from '../../services/api';
import { FuelScenario, FuelRule } from '../../types/fuel';
import { ScenarioEditor } from './ScenarioEditor';
import { FuelCoverageMatrix } from './FuelCoverageMatrix';
import { AssignVehiclesToPolicySheet, type AssignVehicleRow } from './AssignVehiclesToPolicySheet';
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
import {
  SAMPLE_WEEK_COSTS,
  splitAllCategoryCosts,
  sumSplitTotals,
} from '../../utils/fuelCoverageSplit';
import { orphanVehicles, vehiclesForPolicy } from '../../utils/fuelPolicyAssignment';

function vehiclePlate(v: any): string {
  return v.licensePlate || v.plate || v.name || v.id?.slice(0, 8) || 'Vehicle';
}

export function ScenarioList() {
    const [scenarios, setScenarios] = useState<FuelScenario[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingScenario, setEditingScenario] = useState<FuelScenario | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [assignTarget, setAssignTarget] = useState<FuelScenario | null>(null);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [scen, vehs, drvs] = await Promise.all([
                fuelService.getFuelScenarios(),
                api.getVehicles().catch(() => []),
                api.getDrivers().catch(() => []),
            ]);
            setScenarios(scen);
            setVehicles(vehs || []);
            setDrivers(drvs || []);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load fuel policies");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAll();
    }, []);

    const driverName = (driverId?: string | null) => {
        if (!driverId) return 'Unassigned';
        const d = drivers.find((x: any) => x.id === driverId || x.driverId === driverId);
        if (!d) return 'Unassigned';
        return d.name || [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unassigned';
    };

    const policyLabelForVehicle = (v: any): string => {
        if (!v.fuelScenarioId) {
            const def = scenarios.find((s) => s.isDefault);
            return def ? `Default · ${def.name}` : 'Default';
        }
        const s = scenarios.find((x) => x.id === v.fuelScenarioId);
        return s ? s.name : 'Unknown (orphan)';
    };

    const getAffectedVehicleCount = (scenario: FuelScenario): number =>
        vehiclesForPolicy(scenario, vehicles).length;

    const orphans = useMemo(() => orphanVehicles(vehicles, scenarios), [vehicles, scenarios]);

    const handleSave = async (scenario: FuelScenario) => {
        try {
            const saved = await fuelService.saveFuelScenario(scenario);
            setScenarios(prev => {
                const index = prev.findIndex(s => s.id === saved.id);
                if (index >= 0) {
                    return prev.map((s, i) => i === index ? saved : (saved.isDefault ? { ...s, isDefault: false } : s));
                }
                return [...(saved.isDefault ? prev.map(s => ({ ...s, isDefault: false })) : prev), saved];
            });
            toast.success("Policy saved");
            setIsEditorOpen(false);
            setEditingScenario(null);
        } catch (e: any) {
            console.error(e);
            toast.error(e?.message || "Failed to save policy");
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            const orphanIds = vehicles
                .filter((v: any) => v.fuelScenarioId === deleteId)
                .map((v: any) => v.id);
            await fuelService.deleteFuelScenario(deleteId);
            // Clear orphan assignments so vehicles fall back to Default cleanly
            for (const id of orphanIds) {
                const v = vehicles.find((x: any) => x.id === id);
                if (!v) continue;
                try {
                    await api.saveVehicle({ ...v, fuelScenarioId: undefined });
                } catch (err) {
                    console.error('Failed to clear fuelScenarioId after delete', err);
                }
            }
            setScenarios(prev => prev.filter(s => s.id !== deleteId));
            if (orphanIds.length) {
                setVehicles((prev) =>
                    prev.map((v) => (orphanIds.includes(v.id) ? { ...v, fuelScenarioId: undefined } : v)),
                );
            }
            toast.success("Policy deleted");
        } catch (e: any) {
            console.error(e);
            toast.error(e?.message || "Failed to delete policy");
        } finally {
            setDeleteId(null);
        }
    };

    const handleSetDefault = async (scenario: FuelScenario) => {
        if (scenario.isDefault) return;
        try {
            await fuelService.saveFuelScenario({ ...scenario, isDefault: true });
            await loadAll();
            toast.success("Default policy updated");
        } catch (e) {
            console.error(e);
            toast.error("Failed to update default");
        }
    };

    const handleDuplicate = (scenario: FuelScenario) => {
        const fuelRule = scenario.rules.find((r) => r.category === 'Fuel');
        const clone: FuelScenario = {
            id: crypto.randomUUID(),
            name: `${scenario.name} (Copy)`,
            description: scenario.description,
            isDefault: false,
            rules: fuelRule
                ? [{ ...fuelRule, id: crypto.randomUUID() }]
                : [],
        };
        setEditingScenario(clone);
        setIsEditorOpen(true);
    };

    const assignRows: AssignVehicleRow[] = useMemo(() => {
        if (!assignTarget) return [];
        return vehicles.map((v: any) => ({
            id: v.id,
            plate: vehiclePlate(v),
            driverName: driverName(v.currentDriverId),
            currentPolicyLabel: policyLabelForVehicle(v),
            alreadyAssigned: assignTarget.isDefault
                ? !v.fuelScenarioId || v.fuelScenarioId === assignTarget.id
                : v.fuelScenarioId === assignTarget.id,
        }));
    }, [assignTarget, vehicles, drivers, scenarios]);

    const handleAssignConfirm = async (selectedIds: string[]) => {
        if (!assignTarget) return;
        const selected = new Set(selectedIds);
        let ok = 0;
        let fail = 0;
        const nextVehicles = [...vehicles];

        for (let i = 0; i < nextVehicles.length; i++) {
            const v = nextVehicles[i];
            let nextId: string | undefined | null = v.fuelScenarioId;

            if (assignTarget.isDefault) {
                // Selected → use Default (clear custom id). Unselected left unchanged.
                if (!selected.has(v.id)) continue;
                nextId = undefined;
            } else {
                if (selected.has(v.id)) {
                    nextId = assignTarget.id;
                } else if (v.fuelScenarioId === assignTarget.id) {
                    nextId = undefined; // unchecked → back to Default
                } else {
                    continue;
                }
            }

            const same =
                (nextId === undefined || nextId === null) && !v.fuelScenarioId
                    ? true
                    : nextId === v.fuelScenarioId;
            if (same) continue;

            const updated = { ...v, fuelScenarioId: nextId || undefined };
            try {
                await api.saveVehicle(updated);
                nextVehicles[i] = updated;
                ok++;
            } catch (e) {
                console.error(e);
                fail++;
            }
        }

        setVehicles(nextVehicles);
        if (fail === 0) toast.success(`Updated ${ok} vehicle assignment${ok !== 1 ? 's' : ''}`);
        else if (ok === 0) toast.error('Failed to update assignments');
        else toast.error(`Updated ${ok}, failed ${fail}`);
    };

    const clearOrphan = async (vehicleId: string) => {
        const v = vehicles.find((x) => x.id === vehicleId);
        if (!v) return;
        try {
            await api.saveVehicle({ ...v, fuelScenarioId: undefined });
            setVehicles((prev) => prev.map((x) => (x.id === vehicleId ? { ...x, fuelScenarioId: undefined } : x)));
            toast.success('Assignment cleared — vehicle uses Default');
        } catch (e: any) {
            toast.error(e?.message || 'Failed to clear assignment');
        }
    };

    const examplePreview = (rule: FuelRule | undefined) => {
        const split = splitAllCategoryCosts(SAMPLE_WEEK_COSTS, rule);
        return sumSplitTotals(split);
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-lg font-medium text-slate-900">Fuel Policies</h3>
                    <p className="text-sm text-slate-500">
                        Create policies outside Default, then assign vehicles to them.
                    </p>
                </div>
                <Button
                    className="shrink-0"
                    onClick={() => { setEditingScenario(null); setIsEditorOpen(true); }}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    New Policy
                </Button>
            </div>

            {orphans.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-amber-900">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p className="text-sm font-medium">
                            {orphans.length} vehicle{orphans.length !== 1 ? 's' : ''} reference a missing policy and fall back to Default.
                        </p>
                    </div>
                    <ul className="space-y-1 pl-6">
                        {orphans.map((v) => (
                            <li key={v.id} className="flex items-center justify-between gap-2 text-xs text-amber-900">
                                <span>{vehiclePlate(v)} · {driverName(v.currentDriverId)}</span>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => clearOrphan(v.id)}>
                                    Clear assignment
                                </Button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {scenarios.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
                    No fuel policies yet. Create a Default policy to get started.
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    {scenarios.map((scenario) => {
                        const rule = scenario.rules.find((r) => r.category === 'Fuel');
                        const assigned = vehiclesForPolicy(scenario, vehicles);
                        const preview = examplePreview(rule);
                        return (
                            <Card
                                key={scenario.id}
                                className={`relative transition-all hover:shadow-md ${
                                    scenario.isDefault ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
                                }`}
                            >
                                <CardHeader className="pb-3 border-b border-slate-100">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CardTitle className="text-base">{scenario.name}</CardTitle>
                                                {scenario.isDefault && (
                                                    <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0">
                                                        Default
                                                    </Badge>
                                                )}
                                                <Badge variant="outline" className="gap-1 text-slate-500 font-normal">
                                                    <Car className="h-3 w-3" />
                                                    {assigned.length} vehicle{assigned.length !== 1 ? 's' : ''}
                                                </Badge>
                                            </div>
                                            <CardDescription className="line-clamp-2">
                                                {scenario.description || 'No description provided.'}
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4 pt-4">
                                    <FuelCoverageMatrix rule={rule} compact />

                                    <div>
                                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                            Assigned vehicles
                                        </p>
                                        {assigned.length === 0 ? (
                                            <p className="text-xs text-slate-400">No vehicles on this policy yet.</p>
                                        ) : (
                                            <ul className="space-y-1">
                                                {assigned.slice(0, 5).map((v: any) => (
                                                    <li key={v.id} className="text-xs text-slate-700">
                                                        <span className="font-medium">{vehiclePlate(v)}</span>
                                                        <span className="text-slate-400"> · </span>
                                                        {driverName(v.currentDriverId)}
                                                    </li>
                                                ))}
                                                {assigned.length > 5 && (
                                                    <li className="text-xs text-slate-400">+{assigned.length - 5} more</li>
                                                )}
                                            </ul>
                                        )}
                                    </div>

                                    <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                        Example week preview:{' '}
                                        <span className="font-medium text-indigo-700">
                                            Company ${preview.company.toFixed(0)}
                                        </span>
                                        {' · '}
                                        <span className="font-medium text-rose-600">
                                            Driver ${preview.driver.toFixed(0)}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8"
                                            onClick={() => { setEditingScenario(scenario); setIsEditorOpen(true); }}
                                        >
                                            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                                            Edit
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-8" onClick={() => handleDuplicate(scenario)}>
                                            <Copy className="h-3.5 w-3.5 mr-1.5" />
                                            Duplicate
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-8"
                                            onClick={() => setAssignTarget(scenario)}
                                        >
                                            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                                            Assign vehicles
                                        </Button>
                                        {!scenario.isDefault && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8"
                                                onClick={() => handleSetDefault(scenario)}
                                            >
                                                <Star className="h-3.5 w-3.5 mr-1.5" />
                                                Make default
                                            </Button>
                                        )}
                                        {!scenario.isDefault && scenarios.length > 1 && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                                onClick={() => setDeleteId(scenario.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                                Delete
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <ScenarioEditor
                isOpen={isEditorOpen}
                onClose={() => { setIsEditorOpen(false); setEditingScenario(null); }}
                onSave={handleSave}
                initialData={editingScenario}
                affectedVehicleCount={editingScenario ? getAffectedVehicleCount(editingScenario) : 0}
            />

            <AssignVehiclesToPolicySheet
                open={!!assignTarget}
                onOpenChange={(open) => !open && setAssignTarget(null)}
                policyName={assignTarget?.name || ''}
                isDefaultPolicy={!!assignTarget?.isDefault}
                vehicles={assignRows}
                onConfirm={handleAssignConfirm}
            />

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Policy?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                <p>This permanently removes this policy. Assigned vehicles will be cleared back to Default.</p>
                                {(() => {
                                    const scenario = scenarios.find(s => s.id === deleteId);
                                    const count = scenario ? getAffectedVehicleCount(scenario) : 0;
                                    if (count === 0) return null;
                                    return (
                                        <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-900">
                                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                            <span className="text-sm">
                                                {count} vehicle{count !== 1 ? 's' : ''} currently {count !== 1 ? 'use' : 'uses'} this policy. Live (unfinalized) reconciliation numbers will change immediately.
                                            </span>
                                        </div>
                                    );
                                })()}
                            </div>
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
