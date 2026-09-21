import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Loader2, Plus, CalendarRange, Info, Users, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { fuelService } from '../../services/fuelService';
import type { FuelScenario, FuelScenarioVersion } from '../../types/fuel';
import { VersionScheduleEditor } from './VersionScheduleEditor';
import { FuelCoverageMatrix } from './FuelCoverageMatrix';
import {
  mondayYmdForDate,
  normalizeScenarioVersions,
  removeScenarioVersion,
  resolveVersionForWeek,
  versionWindowLabel,
} from '../../utils/fuelPolicyVersion';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { driversForPolicy, driversForVersion } from '../../utils/fuelPolicyAssignment';
import { api } from '../../services/api';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import { runFuelPolicyVersionDriverCutoverOnce } from '../../utils/fuelPolicyCutover';
import { useFuelServiceLine } from '../../contexts/FuelServiceLineContext';
import {
  buildLineOverrideScenario,
  resolvePoliciesForLens,
  type FuelPolicyServiceLine,
} from '../../utils/fuelScenarioServiceLine';
import { fuelServiceLineUiLabel } from '../../utils/vocabulary';

function driverDisplayName(d: any): string {
  return d?.name || [d?.firstName, d?.lastName].filter(Boolean).join(' ') || 'Driver';
}

function plateForDriver(vehicles: any[], driverId?: string): string {
  if (!driverId) return '';
  const v = vehicles.find((x: any) => x.currentDriverId === driverId);
  return v?.licensePlate || v?.plate || '';
}

export function PolicySchedulePanel({
  initialPolicyId,
  scenarios: controlledScenarios,
  onScenariosChange,
}: {
  initialPolicyId?: string | null;
  scenarios?: FuelScenario[];
  onScenariosChange?: (scenarios: FuelScenario[]) => void;
}) {
  const fleetTz = useFleetTimezone();
  const { showTabs, line } = useFuelServiceLine();
  const policyLens = showTabs
    ? line === 'delivery'
      ? 'rush_delivery'
      : line === 'rideshare'
        ? 'rideshare'
        : 'all'
    : 'all';
  const isControlled = controlledScenarios !== undefined;
  const [localScenarios, setLocalScenarios] = useState<FuelScenario[]>([]);
  const scenarios = isControlled ? controlledScenarios! : localScenarios;
  const commitScenarios = (next: FuelScenario[]) => {
    if (!isControlled) setLocalScenarios(next);
    onScenariosChange?.(next);
  };
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialPolicyId || null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<FuelScenarioVersion | null>(null);
  const [versionToDelete, setVersionToDelete] = useState<FuelScenarioVersion | null>(null);
  const [deletingVersion, setDeletingVersion] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      await runFuelPolicyVersionDriverCutoverOnce().catch(() => 0);
      const [scen, drvs, vehs] = await Promise.all([
        fuelService.getFuelScenarios(),
        api.getDrivers().catch(() => []),
        api.getVehicles().catch(() => []),
      ]);
      commitScenarios(scen || []);
      setDrivers(drvs || []);
      setVehicles(vehs || []);
      setSelectedId((prev) => {
        if (initialPolicyId && (scen || []).some((s: FuelScenario) => s.id === initialPolicyId)) {
          return initialPolicyId;
        }
        if (prev && (scen || []).some((s: FuelScenario) => s.id === prev)) return prev;
        return scen?.[0]?.id || null;
      });
    } catch (e) {
      console.error(e);
      toast.error('Failed to load policy schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (initialPolicyId) setSelectedId(initialPolicyId);
  }, [initialPolicyId]);

  const policyRows = useMemo(
    () => resolvePoliciesForLens(scenarios, policyLens),
    [scenarios, policyLens],
  );

  const selected = useMemo(() => {
    const row = policyRows.find((r) => r.scenario.id === selectedId);
    if (row) return row.scenario;
    return policyRows[0]?.scenario || null;
  }, [policyRows, selectedId]);

  const selectedRow = useMemo(
    () => policyRows.find((r) => r.scenario.id === selected?.id) || null,
    [policyRows, selected],
  );

  useEffect(() => {
    if (!selectedId || !policyRows.some((r) => r.scenario.id === selectedId)) {
      setSelectedId(policyRows[0]?.scenario.id || null);
    }
  }, [policyRows, selectedId]);

  const handleCustomizeForLine = async (parent: FuelScenario, lineKey: FuelPolicyServiceLine) => {
    const existing = scenarios.find(
      (s) => s.overridesOfId === parent.id && s.serviceLine === lineKey,
    );
    if (existing) {
      setSelectedId(existing.id);
      return;
    }
    try {
      const override = buildLineOverrideScenario(parent, lineKey, crypto.randomUUID());
      const saved = await fuelService.saveFuelScenario(override);
      commitScenarios([...scenarios, saved]);
      setSelectedId(saved.id);
      toast.success(`Created ${fuelServiceLineUiLabel(lineKey)} override`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create line override');
    }
  };

  const handleRevertOverride = async (overrideId: string) => {
    try {
      await fuelService.deleteFuelScenario(overrideId);
      const parentId = scenarios.find((s) => s.id === overrideId)?.overridesOfId;
      commitScenarios(scenarios.filter((s) => s.id !== overrideId));
      setSelectedId(parentId || null);
      toast.success('Reverted to org default');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to revert override');
    }
  };

  const normalized = useMemo(
    () => (selected ? normalizeScenarioVersions(selected) : null),
    [selected],
  );

  const thisMonday = useMemo(
    () => mondayYmdForDate(new Date(), fleetTz || undefined),
    [fleetTz],
  );

  const currentVersionId = useMemo(() => {
    if (!normalized) return null;
    return resolveVersionForWeek(normalized, thisMonday)?.id || null;
  }, [normalized, thisMonday]);

  const versionsNewestFirst = useMemo(() => {
    const list = [...(normalized?.versions || [])];
    return list.reverse();
  }, [normalized]);

  const handleSave = async (scenario: FuelScenario) => {
    try {
      const saved = await fuelService.saveFuelScenario(scenario);
      const idx = scenarios.findIndex((s) => s.id === saved.id);
      commitScenarios(
        idx >= 0
          ? scenarios.map((s, i) => (i === idx ? saved : s))
          : [...scenarios, saved],
      );
      setSelectedId(saved.id);
      toast.success('Version saved');
      setEditorOpen(false);
      setEditingVersion(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save version');
    }
  };

  const canDeleteVersion = (versionsNewestFirst.length || 0) > 1;

  const confirmDeleteVersion = async () => {
    if (!selected || !versionToDelete) return;
    setDeletingVersion(true);
    try {
      const next = removeScenarioVersion(selected, versionToDelete.id);
      const saved = await fuelService.saveFuelScenario(next);
      commitScenarios(scenarios.map((s) => (s.id === saved.id ? saved : s)));
      toast.success('Version deleted');
      setVersionToDelete(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to delete version');
    } finally {
      setDeletingVersion(false);
    }
  };

  const openAdd = () => {
    setEditingVersion(null);
    setEditorOpen(true);
  };

  const openEdit = (ver: FuelScenarioVersion) => {
    setEditingVersion(ver);
    setEditorOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (policyRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
        Create a policy on the Rules tab first, then manage its schedule here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert className="bg-slate-50 border-slate-200">
        <Info className="h-4 w-4 text-indigo-600" />
        <AlertTitle>How schedule works</AlertTitle>
        <AlertDescription className="text-slate-700">
          Each version is a Monday period plus drivers. Splits come from Rules (frozen when the
          version is created). The same dates can cover different drivers; one driver cannot
          overlap two versions. Drivers with no version assignment use Default.
          {policyLens !== 'all'
            ? ` Viewing ${fuelServiceLineUiLabel(policyLens)} — customize to edit a line override.`
            : ''}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1 mb-2">
            Policies
          </p>
          {policyRows.map((row) => {
            const s = row.scenario;
            const n = normalizeScenarioVersions(s);
            const count = n.versions?.length || 0;
            const nDrivers = driversForPolicy(s, drivers).length;
            const label = row.kind === 'inherited' ? row.parent.name : s.name;
            return (
              <button
                key={`${row.kind}-${s.id}`}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors ${
                  selectedId === s.id
                    ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">{label}</span>
                  {s.isDefault && row.kind !== 'override' && (
                    <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0 text-[10px]">
                      Default
                    </Badge>
                  )}
                  {row.kind === 'inherited' && (
                    <Badge variant="outline" className="text-[10px]">Inherited</Badge>
                  )}
                  {row.kind === 'override' && (
                    <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 border-0 text-[10px]">
                      Override
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {count} version{count !== 1 ? 's' : ''} · {nDrivers} driver
                  {nDrivers !== 1 ? 's' : ''}
                </p>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {selected && normalized ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-medium text-slate-900 flex items-center gap-2">
                    <CalendarRange className="h-5 w-5 text-indigo-600" />
                    {selectedRow?.kind === 'inherited' ? selectedRow.parent.name : selected.name}
                  </h3>
                  <p className="text-sm text-slate-500">Version windows by Monday period</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedRow?.kind === 'inherited' && policyLens !== 'all' ? (
                    <Button
                      variant="default"
                      onClick={() =>
                        void handleCustomizeForLine(
                          selectedRow.parent,
                          policyLens as FuelPolicyServiceLine,
                        )
                      }
                    >
                      Customize for {fuelServiceLineUiLabel(policyLens)}
                    </Button>
                  ) : null}
                  {selectedRow?.kind === 'override' ? (
                    <Button
                      variant="outline"
                      onClick={() => void handleRevertOverride(selected.id)}
                    >
                      Revert to org default
                    </Button>
                  ) : null}
                  {selectedRow?.kind !== 'inherited' ? (
                    <Button onClick={openAdd}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add version
                    </Button>
                  ) : null}
                </div>
              </div>

              {versionsNewestFirst.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                  No versions yet. Add a period and assign drivers to use this policy in recon.
                </div>
              ) : (
                <div className="space-y-3">
                  {versionsNewestFirst.map((ver) => {
                    const fuelRule = ver.rules?.find((r) => r.category === 'Fuel');
                    const isCurrent = ver.id === currentVersionId;
                    const versionDrivers = driversForVersion(ver, drivers);
                    return (
                      <Card key={ver.id} className={isCurrent ? 'border-indigo-200' : 'border-slate-200'}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-sm font-semibold">
                                  {versionWindowLabel(ver)}
                                </CardTitle>
                                {isCurrent && (
                                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                                    Current
                                  </Badge>
                                )}
                                {!ver.effectiveUntil && (
                                  <Badge variant="outline" className="text-slate-500 font-normal text-[10px]">
                                    Open-ended
                                  </Badge>
                                )}
                              </div>
                              <CardDescription className="text-xs">
                                {ver.effectiveUntil
                                  ? 'Applies to weeks starting on/after the start Monday and before the end Monday.'
                                  : 'Applies to weeks starting on/after the start Monday with no end (Never).'}
                              </CardDescription>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              {selectedRow?.kind !== 'inherited' ? (
                                <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-slate-600"
                                title="Edit period and drivers"
                                onClick={() => openEdit(ver)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Edit version</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                disabled={!canDeleteVersion}
                                title={
                                  canDeleteVersion
                                    ? 'Delete this version'
                                    : 'A policy must keep at least one version'
                                }
                                onClick={() => setVersionToDelete(ver)}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Delete version</span>
                              </Button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <FuelCoverageMatrix rule={fuelRule} compact />

                          <div>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                              <Users className="h-3 w-3" />
                              Drivers on this version
                            </p>
                            {versionDrivers.length === 0 ? (
                              <p className="text-xs text-slate-400">
                                No drivers on this version — edit to assign.
                              </p>
                            ) : (
                              <ul className="space-y-1">
                                {versionDrivers.slice(0, 8).map((d: any) => {
                                  const plate = plateForDriver(vehicles, d.id);
                                  return (
                                    <li key={d.id} className="text-xs text-slate-700">
                                      <span className="font-medium">{driverDisplayName(d)}</span>
                                      {plate ? (
                                        <>
                                          <span className="text-slate-400"> · </span>
                                          {plate}
                                        </>
                                      ) : null}
                                    </li>
                                  );
                                })}
                                {versionDrivers.length > 8 && (
                                  <li className="text-xs text-slate-400">
                                    +{versionDrivers.length - 8} more
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              <VersionScheduleEditor
                isOpen={editorOpen}
                onClose={() => {
                  setEditorOpen(false);
                  setEditingVersion(null);
                }}
                onSave={handleSave}
                scenario={selected}
                allScenarios={scenarios}
                editingVersion={editingVersion}
                drivers={drivers}
                vehicles={vehicles}
              />

              <AlertDialog
                open={!!versionToDelete}
                onOpenChange={(open) => !open && !deletingVersion && setVersionToDelete(null)}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this version?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Removes{' '}
                      <span className="font-medium text-slate-800">
                        {versionToDelete ? versionWindowLabel(versionToDelete) : ''}
                      </span>{' '}
                      from {selected.name}. Drivers on it will fall back to Default unless they are
                      on another version for that week.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deletingVersion}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      disabled={deletingVersion}
                      onClick={(e) => {
                        e.preventDefault();
                        void confirmDeleteVersion();
                      }}
                    >
                      {deletingVersion ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Delete version'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <p className="text-sm text-slate-400 py-8 text-center">Select a policy</p>
          )}
        </div>
      </div>
    </div>
  );
}
