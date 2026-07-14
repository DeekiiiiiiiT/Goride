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
import { Loader2, Plus, CalendarRange, Info, Users, Trash2, Pencil, UserPlus } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { earningsPolicyService } from '../../services/earningsPolicyService';
import type {
  EarningsPolicy,
  EarningsPolicyDriverAssignment,
  EarningsPolicyVersion,
} from '../../types/earningsPolicy';
import { EarningsPolicyVersionEditor } from './EarningsPolicyVersionEditor';
import { EarningsPolicyAssignmentEditor } from './EarningsPolicyAssignmentEditor';
import { EarningsPolicyCardPreview } from './EarningsPolicyCardPreview';
import {
  assignmentWindowLabel,
  mondayYmdForDate,
  normalizePolicyVersions,
  removeDriverAssignment,
  removePolicyVersion,
  resolveVersionForWeek,
} from '../../utils/earningsPolicyVersion';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { driversForPolicy } from '../../utils/earningsPolicyAssignment';
import { api } from '../../services/api';
import { useFleetTimezone } from '../../utils/timezoneDisplay';

function driverDisplayName(d: any): string {
  return d?.name || [d?.firstName, d?.lastName].filter(Boolean).join(' ') || 'Driver';
}

function plateForDriver(vehicles: any[], driverId?: string): string {
  if (!driverId) return '';
  const v = vehicles.find((x: any) => x.currentDriverId === driverId);
  return v?.licensePlate || v?.plate || '';
}

function versionDisplayName(ver: EarningsPolicyVersion): string {
  if (ver.name?.trim()) return ver.name.trim();
  try {
    return `Version · ${new Date(ver.createdAt).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  } catch {
    return 'Version';
  }
}

export function EarningsPolicySchedulePanel({
  initialPolicyId,
  policies: controlledPolicies,
  onPoliciesChange,
}: {
  initialPolicyId?: string | null;
  policies?: EarningsPolicy[];
  onPoliciesChange?: (policies: EarningsPolicy[]) => void;
}) {
  const fleetTz = useFleetTimezone();
  const isControlled = controlledPolicies !== undefined;
  const [localPolicies, setLocalPolicies] = useState<EarningsPolicy[]>([]);
  const policies = isControlled ? controlledPolicies! : localPolicies;
  const commitPolicies = (next: EarningsPolicy[]) => {
    if (!isControlled) setLocalPolicies(next);
    onPoliciesChange?.(next);
  };
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(initialPolicyId || null);
  const [versionEditorOpen, setVersionEditorOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<EarningsPolicyVersion | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignVersion, setAssignVersion] = useState<EarningsPolicyVersion | null>(null);
  const [editingAssignment, setEditingAssignment] =
    useState<EarningsPolicyDriverAssignment | null>(null);
  const [versionToDelete, setVersionToDelete] = useState<EarningsPolicyVersion | null>(null);
  const [deletingVersion, setDeletingVersion] = useState(false);
  const [assignmentToRemove, setAssignmentToRemove] = useState<{
    version: EarningsPolicyVersion;
    assignment: EarningsPolicyDriverAssignment;
  } | null>(null);
  const [removingAssignment, setRemovingAssignment] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pol, drvs, vehs] = await Promise.all([
        earningsPolicyService.getEarningsPolicies(),
        api.getDrivers().catch(() => []),
        api.getVehicles().catch(() => []),
      ]);
      commitPolicies(pol || []);
      setDrivers(drvs || []);
      setVehicles(vehs || []);
      setSelectedId((prev) => {
        if (initialPolicyId && (pol || []).some((p: EarningsPolicy) => p.id === initialPolicyId)) {
          return initialPolicyId;
        }
        if (prev && (pol || []).some((p: EarningsPolicy) => p.id === prev)) return prev;
        return pol?.[0]?.id || null;
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

  const selected = useMemo(
    () => policies.find((p) => p.id === selectedId) || null,
    [policies, selectedId],
  );

  const normalized = useMemo(
    () => (selected ? normalizePolicyVersions(selected) : null),
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

  const handleSave = async (policy: EarningsPolicy, successMsg = 'Saved') => {
    try {
      const saved = await earningsPolicyService.saveEarningsPolicy(policy);
      const idx = policies.findIndex((p) => p.id === saved.id);
      commitPolicies(
        idx >= 0 ? policies.map((p, i) => (i === idx ? saved : p)) : [...policies, saved],
      );
      setSelectedId(saved.id);
      toast.success(successMsg);
      setVersionEditorOpen(false);
      setEditingVersion(null);
      setAssignOpen(false);
      setAssignVersion(null);
      setEditingAssignment(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save');
    }
  };

  const canDeleteVersion = (versionsNewestFirst.length || 0) > 1;

  const confirmDeleteVersion = async () => {
    if (!selected || !versionToDelete) return;
    setDeletingVersion(true);
    try {
      const next = removePolicyVersion(selected, versionToDelete.id);
      const saved = await earningsPolicyService.saveEarningsPolicy(next);
      commitPolicies(policies.map((p) => (p.id === saved.id ? saved : p)));
      toast.success('Version deleted');
      setVersionToDelete(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to delete version');
    } finally {
      setDeletingVersion(false);
    }
  };

  const confirmRemoveAssignment = async () => {
    if (!selected || !assignmentToRemove) return;
    setRemovingAssignment(true);
    try {
      const next = removeDriverAssignment({
        policy: selected,
        versionId: assignmentToRemove.version.id,
        driverId: assignmentToRemove.assignment.driverId,
      });
      const saved = await earningsPolicyService.saveEarningsPolicy(next);
      commitPolicies(policies.map((p) => (p.id === saved.id ? saved : p)));
      toast.success('Driver removed');
      setAssignmentToRemove(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to remove driver');
    } finally {
      setRemovingAssignment(false);
    }
  };

  const openAddVersion = () => {
    setEditingVersion(null);
    setVersionEditorOpen(true);
  };

  const openRenameVersion = (ver: EarningsPolicyVersion) => {
    setEditingVersion(ver);
    setVersionEditorOpen(true);
  };

  const openAssign = (ver: EarningsPolicyVersion, assignment?: EarningsPolicyDriverAssignment) => {
    setAssignVersion(ver);
    setEditingAssignment(assignment || null);
    setAssignOpen(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (policies.length === 0) {
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
          A version freezes the Rules (tiers, quotas, personal allowance). Each driver has their own
          start Monday on a version — hire someone later on the same plan without creating a new
          version. Change the rules later → add Version 2 and move drivers. Unassigned drivers use
          Default.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-1 mb-2">
            Policies
          </p>
          {policies.map((p) => {
            const n = normalizePolicyVersions(p);
            const count = n.versions?.length || 0;
            const nDrivers = driversForPolicy(p, drivers).length;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left rounded-md border px-3 py-2.5 transition-colors ${
                  selectedId === p.id
                    ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900 truncate">{p.name}</span>
                  {p.isDefault && (
                    <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-0 text-[10px]">
                      Default
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
                    {selected.name}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Frozen versions · per-driver start Mondays
                  </p>
                </div>
                <Button onClick={openAddVersion}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add version
                </Button>
              </div>

              {versionsNewestFirst.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                  No versions yet. Add a version to freeze Rules, then assign drivers.
                </div>
              ) : (
                <div className="space-y-3">
                  {versionsNewestFirst.map((ver) => {
                    const isCurrent = ver.id === currentVersionId;
                    const assignments = ver.assignments || [];
                    return (
                      <Card
                        key={ver.id}
                        className={isCurrent ? 'border-indigo-200' : 'border-slate-200'}
                      >
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-sm font-semibold">
                                  {versionDisplayName(ver)}
                                </CardTitle>
                                {isCurrent && (
                                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0">
                                    Current
                                  </Badge>
                                )}
                              </div>
                              <CardDescription className="text-xs">
                                Frozen snapshot — assign drivers below with their own start Mondays.
                              </CardDescription>
                            </div>
                            <div className="flex shrink-0 gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-slate-600"
                                title="Rename version"
                                onClick={() => openRenameVersion(ver)}
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Rename version</span>
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
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <EarningsPolicyCardPreview
                            policy={{
                              ...selected,
                              tiers: ver.tiers,
                              quotas: ver.quotas,
                              personalAllowance: ver.personalAllowance,
                            }}
                            compact
                          />

                          <div>
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                                <Users className="h-3 w-3" />
                                Drivers ({assignments.length})
                              </p>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => openAssign(ver)}
                              >
                                <UserPlus className="h-3.5 w-3.5 mr-1" />
                                Assign driver
                              </Button>
                            </div>
                            {assignments.length === 0 ? (
                              <p className="text-xs text-slate-400">
                                No drivers yet — assign with a personal start Monday.
                              </p>
                            ) : (
                              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                                {assignments.map((a) => {
                                  const d = drivers.find((x) => x.id === a.driverId);
                                  const plate = plateForDriver(vehicles, a.driverId);
                                  return (
                                    <li
                                      key={a.driverId}
                                      className="flex items-center gap-2 px-3 py-2 text-xs"
                                    >
                                      <div className="min-w-0 flex-1">
                                        <span className="font-medium text-slate-800">
                                          {d ? driverDisplayName(d) : a.driverId}
                                        </span>
                                        {plate ? (
                                          <span className="text-slate-400"> · {plate}</span>
                                        ) : null}
                                        <p className="text-slate-500 mt-0.5">
                                          {assignmentWindowLabel(a)}
                                        </p>
                                      </div>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-slate-500"
                                        title="Edit period"
                                        onClick={() => openAssign(ver, a)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                        title="Remove"
                                        onClick={() =>
                                          setAssignmentToRemove({ version: ver, assignment: a })
                                        }
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              <EarningsPolicyVersionEditor
                isOpen={versionEditorOpen}
                onClose={() => {
                  setVersionEditorOpen(false);
                  setEditingVersion(null);
                }}
                onSave={(p) => handleSave(p, editingVersion ? 'Version updated' : 'Version added')}
                policy={selected}
                editingVersion={editingVersion}
              />

              {assignVersion && (
                <EarningsPolicyAssignmentEditor
                  isOpen={assignOpen}
                  onClose={() => {
                    setAssignOpen(false);
                    setAssignVersion(null);
                    setEditingAssignment(null);
                  }}
                  onSave={(p) =>
                    handleSave(p, editingAssignment ? 'Assignment updated' : 'Driver assigned')
                  }
                  policy={selected}
                  allPolicies={policies}
                  version={assignVersion}
                  editingAssignment={editingAssignment}
                  drivers={drivers}
                  vehicles={vehicles}
                />
              )}

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
                        {versionToDelete ? versionDisplayName(versionToDelete) : ''}
                      </span>{' '}
                      from {selected.name}. Drivers on it fall back to Default unless assigned
                      elsewhere.
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

              <AlertDialog
                open={!!assignmentToRemove}
                onOpenChange={(open) =>
                  !open && !removingAssignment && setAssignmentToRemove(null)
                }
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove this driver?</AlertDialogTitle>
                    <AlertDialogDescription>
                      They will fall back to Default for weeks that were covered by this assignment.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={removingAssignment}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      disabled={removingAssignment}
                      onClick={(e) => {
                        e.preventDefault();
                        void confirmRemoveAssignment();
                      }}
                    >
                      {removingAssignment ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Remove'
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
