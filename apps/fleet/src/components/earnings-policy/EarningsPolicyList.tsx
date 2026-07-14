import React, { useEffect, useMemo, useState } from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Loader2, Plus, Trash2, Edit2, Star, Users, Copy, CalendarRange } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { earningsPolicyService } from '../../services/earningsPolicyService';
import { api } from '../../services/api';
import type { EarningsPolicy } from '../../types/earningsPolicy';
import { EarningsPolicyEditor } from './EarningsPolicyEditor';
import { EarningsPolicyCardPreview } from './EarningsPolicyCardPreview';
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
import { driversForPolicy, driverCountOnPolicy } from '../../utils/earningsPolicyAssignment';
import { normalizePolicyVersions } from '../../utils/earningsPolicyVersion';
import {
  evaluateEarningsPolicyDeleteGuard,
  type EarningsPolicyDeleteGuardResult,
} from '../../utils/earningsPolicyDeleteGuard';
import { createDefaultPolicy, createEmptyPolicy } from '../../utils/earningsPolicyDefaults';

function driverDisplayName(d: any): string {
  return d?.name || [d?.firstName, d?.lastName].filter(Boolean).join(' ') || 'Driver';
}

export function EarningsPolicyList({
  onViewSchedule,
  policies: controlledPolicies,
  onPoliciesChange,
}: {
  onViewSchedule?: (policyId: string) => void;
  policies?: EarningsPolicy[];
  onPoliciesChange?: (policies: EarningsPolicy[]) => void;
}) {
  const isControlled = controlledPolicies !== undefined;
  const [localPolicies, setLocalPolicies] = useState<EarningsPolicy[]>([]);
  const policies = isControlled ? controlledPolicies! : localPolicies;
  const commitPolicies = (next: EarningsPolicy[]) => {
    if (!isControlled) setLocalPolicies(next);
    onPoliciesChange?.(next);
  };
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<EarningsPolicy | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteGuard, setDeleteGuard] = useState<EarningsPolicyDeleteGuardResult | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [pol, drvs] = await Promise.all([
        earningsPolicyService.getEarningsPolicies(),
        api.getDrivers().catch(() => []),
      ]);
      commitPolicies(pol || []);
      setDrivers(drvs || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load earnings policies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSave = async (policy: EarningsPolicy) => {
    try {
      const saved = await earningsPolicyService.saveEarningsPolicy(policy);
      commitPolicies((() => {
        const prev = policies;
        const index = prev.findIndex(p => p.id === saved.id);
        if (index >= 0) {
          return prev.map((p, i) => i === index ? saved : (saved.isDefault ? { ...p, isDefault: false } : p));
        }
        return [...(saved.isDefault ? prev.map(p => ({ ...p, isDefault: false })) : prev), saved];
      })());
      toast.success("Policy saved");
      setIsEditorOpen(false);
      setEditingPolicy(null);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save policy");
    }
  };

  const requestDelete = (policyId: string) => {
    const guard = evaluateEarningsPolicyDeleteGuard({
      policyId,
      policies,
      drivers,
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
      await earningsPolicyService.deleteEarningsPolicy(deleteId);
      commitPolicies(policies.filter(p => p.id !== deleteId));
      toast.success("Policy deleted");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to delete policy");
    } finally {
      closeDeleteDialog();
    }
  };

  const handleSetDefault = async (policy: EarningsPolicy) => {
    if (policy.isDefault) return;
    try {
      await earningsPolicyService.saveEarningsPolicy({ ...policy, isDefault: true });
      await loadAll();
      toast.success("Default policy updated");
    } catch (e) {
      console.error(e);
      toast.error("Failed to update default");
    }
  };

  const handleClone = (policy: EarningsPolicy) => {
    const normalized = normalizePolicyVersions(policy);
    const clone: EarningsPolicy = {
      ...createEmptyPolicy(),
      name: `${policy.name} (Copy)`,
      description: policy.description,
      tiers: normalized.tiers.map(t => ({ ...t, id: crypto.randomUUID() })),
      quotas: { ...normalized.quotas },
      personalAllowance: { ...normalized.personalAllowance, bands: normalized.personalAllowance.bands.map(b => ({ ...b })) },
      isDefault: false,
      versions: [],
    };
    setEditingPolicy(clone);
    setIsEditorOpen(true);
  };

  const handleCreateDefault = async () => {
    try {
      const defaultPolicy = createDefaultPolicy();
      const saved = await earningsPolicyService.saveEarningsPolicy(defaultPolicy);
      commitPolicies([saved]);
      toast.success("Default policy created");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create default policy");
    }
  };

  const deletePolicyName = policies.find((p) => p.id === deleteId)?.name || 'this policy';
  const isBlocked = deleteGuard && !deleteGuard.canHardDelete;

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
            Tier ladder, quotas, and personal allowance. Add periods and drivers on the Schedule tab.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => { setEditingPolicy(null); setIsEditorOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Policy
        </Button>
      </div>

      {policies.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-12 text-center space-y-4">
          <p className="text-sm text-slate-400">No earnings policies yet.</p>
          <Button variant="outline" onClick={handleCreateDefault}>
            <Plus className="h-4 w-4 mr-2" />
            Create Default Policy
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {policies.map((policy) => {
            const normalized = normalizePolicyVersions(policy);
            const assigned = driversForPolicy(policy, drivers);
            const versionCount = normalized.versions?.length || 0;
            return (
              <Card
                key={policy.id}
                className={`relative transition-all hover:shadow-md ${
                  policy.isDefault ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'
                }`}
              >
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{policy.name}</CardTitle>
                        {policy.isDefault && (
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
                        {policy.description || 'No description provided.'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <EarningsPolicyCardPreview policy={policy} />

                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {policy.tiers.length} tier{policy.tiers.length !== 1 ? 's' : ''} configured
                    </p>
                    <ul className="space-y-1">
                      {policy.tiers.slice(0, 4).map((t) => (
                        <li key={t.id} className="text-xs text-slate-700">
                          <span className="font-medium">{t.name}</span>
                          <span className="text-slate-400"> · </span>
                          {t.sharePercentage}% driver share
                        </li>
                      ))}
                      {policy.tiers.length > 4 && (
                        <li className="text-xs text-slate-400">+{policy.tiers.length - 4} more</li>
                      )}
                    </ul>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => { setEditingPolicy(policy); setIsEditorOpen(true); }}
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    {onViewSchedule && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => onViewSchedule(policy.id)}
                      >
                        <CalendarRange className="h-3.5 w-3.5 mr-1.5" />
                        Schedule
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="h-8" onClick={() => handleClone(policy)}>
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Clone
                    </Button>
                    {!policy.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => handleSetDefault(policy)}
                      >
                        <Star className="h-3.5 w-3.5 mr-1.5" />
                        Make default
                      </Button>
                    )}
                    {!policy.isDefault && policies.length > 1 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        onClick={() => requestDelete(policy.id)}
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

      <EarningsPolicyEditor
        isOpen={isEditorOpen}
        onClose={() => { setIsEditorOpen(false); setEditingPolicy(null); }}
        onSave={handleSave}
        initialData={editingPolicy}
        isCreate={!editingPolicy || !policies.some((p) => p.id === editingPolicy.id)}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isBlocked ? `Can't delete ${deletePolicyName}` : `Delete ${deletePolicyName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-slate-600">
                {isBlocked && deleteGuard && (
                  <>
                    {deleteGuard.isDefault && (
                      <p>Cannot delete the default policy. Set another policy as default first.</p>
                    )}
                    {deleteGuard.isLastPolicy && (
                      <p>Cannot delete the last remaining policy.</p>
                    )}
                    {deleteGuard.blockingDrivers.length > 0 && (
                      <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 text-rose-900">
                        <p className="font-medium mb-1">
                          {deleteGuard.blockingDrivers.length} driver
                          {deleteGuard.blockingDrivers.length !== 1 ? 's' : ''} on schedule versions
                        </p>
                        <ul className="list-disc pl-4 text-xs space-y-0.5">
                          {deleteGuard.blockingDrivers.slice(0, 8).map((d) => (
                            <li key={d.id}>{d.name}</li>
                          ))}
                        </ul>
                        <p className="text-xs mt-2">Remove drivers from schedule versions first.</p>
                      </div>
                    )}
                  </>
                )}
                {!isBlocked && (
                  <p>This permanently removes the policy. This cannot be undone.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isBlocked ? 'Close' : 'Cancel'}</AlertDialogCancel>
            {!isBlocked && (
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
