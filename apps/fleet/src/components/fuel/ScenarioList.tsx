import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Loader2, Plus, Trash2, Edit2, Star, AlertTriangle, Users, Copy, CalendarRange } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { fuelService } from '../../services/fuelService';
import { api } from '../../services/api';
import { FuelScenario, FuelRule, FuelEntry, FinalizedFuelReport } from '../../types/fuel';
import { ScenarioEditor } from './ScenarioEditor';
import { FuelCoverageMatrix } from './FuelCoverageMatrix';
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
import { orphanDrivers, driversForPolicy } from '../../utils/fuelPolicyAssignment';
import { normalizeScenarioVersions } from '../../utils/fuelPolicyVersion';
import { runFuelPolicyDriverCutoverOnce, runFuelPolicyVersionDriverCutoverOnce } from '../../utils/fuelPolicyCutover';
import {
  evaluateFuelPolicyDeleteGuard,
  type FuelPolicyDeleteGuardResult,
} from '../../utils/fuelPolicyDeleteGuard';
import { generateFuelWeekOptions } from '../../utils/fuelWeekPeriod';
import { useFleetTimezone } from '../../utils/timezoneDisplay';

function vehiclePlate(v: any): string {
  return v.licensePlate || v.plate || v.name || v.id?.slice(0, 8) || 'Vehicle';
}

function driverDisplayName(d: any): string {
  return d?.name || [d?.firstName, d?.lastName].filter(Boolean).join(' ') || 'Driver';
}

export function ScenarioList({
  onViewSchedule,
}: {
  /** Switch parent to Schedule tab for this policy id. */
  onViewSchedule?: (policyId: string) => void;
}) {
    const queryClient = useQueryClient();
    const fleetTz = useFleetTimezone();
    const [scenarios, setScenarios] = useState<FuelScenario[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
    const [finalizedReports, setFinalizedReports] = useState<FinalizedFuelReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingScenario, setEditingScenario] = useState<FuelScenario | null>(null);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [deleteGuard, setDeleteGuard] = useState<FuelPolicyDeleteGuardResult | null>(null);

    const weekOptions = useMemo(
      () => generateFuelWeekOptions(16, fleetTz || undefined),
      [fleetTz],
    );

    const loadAll = async () => {
        setLoading(true);
        try {
            await runFuelPolicyDriverCutoverOnce().catch(() => 0);
            await runFuelPolicyVersionDriverCutoverOnce().catch(() => 0);
            const [scen, vehs, drvs, logs, finalized] = await Promise.all([
                fuelService.getFuelScenarios(),
                api.getVehicles().catch(() => []),
                api.getDrivers().catch(() => []),
                fuelService.getFuelEntries({ limit: 5000 }).catch(() => []),
                api.getFinalizedReports().catch(() => []),
            ]);
            setScenarios(scen);
            setVehicles(vehs || []);
            setDrivers(drvs || []);
            setFuelEntries(Array.isArray(logs) ? logs : []);
            setFinalizedReports(Array.isArray(finalized) ? finalized : []);
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

    const plateForDriver = (driverId?: string | null) => {
        if (!driverId) return 'No vehicle';
        const v = vehicles.find((x: any) => x.currentDriverId === driverId);
        return v ? vehiclePlate(v) : 'No vehicle';
    };

    const orphans = useMemo(() => orphanDrivers(drivers, scenarios), [drivers, scenarios]);

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

    const requestDelete = (policyId: string) => {
        const guard = evaluateFuelPolicyDeleteGuard({
            policyId,
            scenarios,
            drivers,
            fuelEntries,
            finalizedReports,
            weekOptions,
            timezone: fleetTz || undefined,
        });
        setDeleteGuard(guard);
        setDeleteId(policyId);
    };

    const closeDeleteDialog = () => {
        setDeleteId(null);
        setDeleteGuard(null);
    };

    const handleDelete = async () => {
        if (!deleteId || !deleteGuard) return;
        if (!deleteGuard.canHardDelete) return;

        try {
            await fuelService.deleteFuelScenario(deleteId);
            setScenarios(prev => prev.filter(s => s.id !== deleteId));
            await queryClient.invalidateQueries({ queryKey: ['drivers'] });
            toast.success("Policy deleted");
        } catch (e: any) {
            console.error(e);
            toast.error(e?.message || "Failed to delete policy");
        } finally {
            closeDeleteDialog();
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

    const handleClone = (scenario: FuelScenario) => {
        const normalized = normalizeScenarioVersions(scenario);
        const fuelRule = normalized.rules.find((r) => r.category === 'Fuel');
        const clone: FuelScenario = {
            id: crypto.randomUUID(),
            name: `${scenario.name} (Copy)`,
            description: scenario.description,
            isDefault: false,
            rules: fuelRule
                ? [{ ...fuelRule, id: crypto.randomUUID() }]
                : [],
            versions: undefined,
        };
        setEditingScenario(clone);
        setIsEditorOpen(true);
    };

    const clearOrphan = async (driverId: string) => {
        const d = drivers.find((x) => x.id === driverId);
        if (!d) return;
        try {
            await api.saveDriver({ ...d, fuelScenarioId: undefined });
            setDrivers((prev) => prev.map((x) => (x.id === driverId ? { ...x, fuelScenarioId: undefined } : x)));
            await queryClient.invalidateQueries({ queryKey: ['drivers'] });
            toast.success('Legacy assignment cleared — driver uses Default until placed on a Schedule version');
        } catch (e: any) {
            toast.error(e?.message || 'Failed to clear assignment');
        }
    };

    const examplePreview = (rule: FuelRule | undefined) => {
        const split = splitAllCategoryCosts(SAMPLE_WEEK_COSTS, rule);
        return sumSplitTotals(split);
    };

    const deletePolicyName = scenarios.find((s) => s.id === deleteId)?.name || 'this policy';
    const isBlocked = deleteGuard && !deleteGuard.canHardDelete;
    const isWarnOnly = deleteGuard?.warnOnly;

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
                    <h3 className="text-lg font-medium text-slate-900">Rules</h3>
                    <p className="text-sm text-slate-500">
                        Split percentages only. Add periods and drivers on the Schedule tab.
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
                            {orphans.length} driver{orphans.length !== 1 ? 's' : ''} still have a legacy policy id pointing at a missing policy.
                        </p>
                    </div>
                    <ul className="space-y-1 pl-6">
                        {orphans.map((d) => (
                            <li key={d.id} className="flex items-center justify-between gap-2 text-xs text-amber-900">
                                <span>{driverDisplayName(d)} · {plateForDriver(d.id)}</span>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => clearOrphan(d.id)}>
                                    Clear legacy id
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
                        const normalized = normalizeScenarioVersions(scenario);
                        const rule = normalized.rules.find((r) => r.category === 'Fuel');
                        const assigned = driversForPolicy(scenario, drivers);
                        const preview = examplePreview(rule);
                        const versionCount = normalized.versions?.length || 0;
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
                                                    <Users className="h-3 w-3" />
                                                    {assigned.length} driver{assigned.length !== 1 ? 's' : ''}
                                                </Badge>
                                                <Badge variant="outline" className="gap-1 text-slate-500 font-normal">
                                                    <CalendarRange className="h-3 w-3" />
                                                    {versionCount} version{versionCount !== 1 ? 's' : ''}
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
                                            Drivers on schedule versions
                                        </p>
                                        {assigned.length === 0 ? (
                                            <p className="text-xs text-slate-400">
                                                None yet — assign on Schedule. Unassigned drivers use Default.
                                            </p>
                                        ) : (
                                            <ul className="space-y-1">
                                                {assigned.slice(0, 5).map((d: any) => (
                                                    <li key={d.id} className="text-xs text-slate-700">
                                                        <span className="font-medium">{driverDisplayName(d)}</span>
                                                        <span className="text-slate-400"> · </span>
                                                        {plateForDriver(d.id)}
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
                                            Edit splits
                                        </Button>
                                        {onViewSchedule && (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8"
                                                onClick={() => onViewSchedule(scenario.id)}
                                            >
                                                <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
                                                Schedule
                                            </Button>
                                        )}
                                        <Button variant="outline" size="sm" className="h-8" onClick={() => handleClone(scenario)}>
                                            <Copy className="h-3.5 w-3.5 mr-1.5" />
                                            Clone as new policy
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
                                                onClick={() => requestDelete(scenario.id)}
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
                isCreate={!editingScenario || !scenarios.some((s) => s.id === editingScenario.id)}
            />

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && closeDeleteDialog()}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {isBlocked
                                ? `Can't delete ${deletePolicyName}`
                                : isWarnOnly
                                  ? `Delete ${deletePolicyName}?`
                                  : `Delete ${deletePolicyName}?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3 text-sm text-slate-600">
                                {isBlocked && (
                                    <>
                                        <p>
                                            This policy is still in use. Finalize remaining periods or remove drivers from its Schedule versions before deleting.
                                        </p>
                                        {deleteGuard!.blockingDrivers.length > 0 && (
                                            <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-rose-900">
                                                <p className="font-medium mb-1">
                                                    {deleteGuard!.blockingDrivers.length} driver
                                                    {deleteGuard!.blockingDrivers.length !== 1 ? 's' : ''} on schedule versions
                                                </p>
                                                <ul className="list-disc pl-4 text-xs space-y-0.5">
                                                    {deleteGuard!.blockingDrivers.slice(0, 8).map((d) => (
                                                        <li key={d.id}>{d.name}</li>
                                                    ))}
                                                </ul>
                                                <p className="text-xs mt-2">Next: Open Schedule and remove drivers from versions.</p>
                                            </div>
                                        )}
                                        {deleteGuard!.openWeeks.length > 0 && (
                                            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                                                <p className="font-medium mb-1">
                                                    {deleteGuard!.openWeeks.length} week
                                                    {deleteGuard!.openWeeks.length !== 1 ? 's' : ''} not finalized
                                                </p>
                                                <ul className="list-disc pl-4 text-xs space-y-0.5">
                                                    {deleteGuard!.openWeeks.slice(0, 6).map((w) => (
                                                        <li key={w.startDate}>{w.label}</li>
                                                    ))}
                                                </ul>
                                                <p className="text-xs mt-2">Next: Finalize remaining periods in Consumption Reconciliation.</p>
                                            </div>
                                        )}
                                    </>
                                )}
                                {isWarnOnly && (
                                    <>
                                        <p>
                                            No drivers are on schedule versions and no open weeks need this policy, but{' '}
                                            <strong>{deleteGuard!.finalizedWeeks.length}</strong> finalized week
                                            {deleteGuard!.finalizedWeeks.length !== 1 ? 's' : ''} used it.
                                        </p>
                                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                            <span>
                                                Locked statements stay safe. If you later reset one of those weeks, recalculation will fall back to Default unless you recreate this policy.
                                            </span>
                                        </div>
                                    </>
                                )}
                                {!isBlocked && !isWarnOnly && (
                                    <p>This permanently removes the policy. This cannot be undone.</p>
                                )}
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{isBlocked ? 'Close' : 'Cancel'}</AlertDialogCancel>
                        {!isBlocked && (
                            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                                {isWarnOnly ? 'Delete anyway' : 'Delete'}
                            </AlertDialogAction>
                        )}
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
