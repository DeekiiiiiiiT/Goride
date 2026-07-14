import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Loader2, Plus, Trash2, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type { EarningsPolicy } from '../../types/earningsPolicy';
import type { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from '../../types/data';
import { QuotaConfigTab } from '../tiers/QuotaConfigTab';
import { PersonalAllowanceConfigTab } from '../tiers/PersonalAllowanceConfigTab';
import {
  createDefaultTiers,
  createEmptyQuotas,
  createDefaultPersonalAllowance,
} from '../../utils/earningsPolicyDefaults';
import { applyPolicyTemplateSave } from '../../utils/earningsPolicyVersion';
import { validatePersonalAllowanceBands } from '../../utils/personalAllowance';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (policy: EarningsPolicy) => Promise<void>;
  initialData: EarningsPolicy | null;
  isCreate: boolean;
}

const STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'tiers', label: 'Tiers' },
  { id: 'quotas', label: 'Quotas' },
  { id: 'personal', label: 'Allowance' },
  { id: 'review', label: 'Review' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

function validateTiers(tiers: TierConfig[]): string | null {
  if (tiers.length === 0) return 'At least one tier is required';
  for (const t of tiers) {
    if (!t.name.trim()) return 'Every tier needs a name';
    if (t.sharePercentage < 0 || t.sharePercentage > 100) {
      return 'Driver share must be between 0 and 100';
    }
    if (t.maxEarnings != null && t.maxEarnings < t.minEarnings) {
      return `"${t.name}" max must be greater than or equal to min`;
    }
  }
  const sorted = [...tiers].sort((a, b) => a.minEarnings - b.minEarnings);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.maxEarnings == null) {
      return `"${prev.name}" is open-ended — remove or set a max before adding higher tiers`;
    }
    if (cur.minEarnings < prev.maxEarnings) {
      return `Tier ranges overlap between "${prev.name}" and "${cur.name}"`;
    }
  }
  return null;
}

export function EarningsPolicyEditor({ isOpen, onClose, onSave, initialData, isCreate }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [quotas, setQuotas] = useState<QuotaConfig>(createEmptyQuotas());
  const [personalAllowance, setPersonalAllowance] = useState<PersonalAllowanceTierConfig>(
    createDefaultPersonalAllowance(),
  );
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  /** User confirmed leaving weekly quota disabled (intentional, not skipped). */
  const [confirmQuotaOff, setConfirmQuotaOff] = useState(false);
  /** User confirmed leaving Personal Allowance disabled. */
  const [confirmPaOff, setConfirmPaOff] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStepIndex(0);
    setConfirmQuotaOff(false);
    setConfirmPaOff(false);
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description || '');
      setTiers(initialData.tiers.map((t) => ({ ...t })));
      setQuotas({
        daily: { ...initialData.quotas.daily },
        weekly: { ...initialData.quotas.weekly },
        monthly: { ...initialData.quotas.monthly },
      });
      setPersonalAllowance({
        ...initialData.personalAllowance,
        bands: initialData.personalAllowance.bands.map((b) => ({ ...b })),
      });
      setIsDefault(!!initialData.isDefault);
      // Edit: already configured — don't force re-confirm unless they turn things off
      if (!initialData.quotas.weekly.enabled || initialData.quotas.weekly.amount <= 0) {
        setConfirmQuotaOff(true);
      }
      if (!initialData.personalAllowance.enabled) {
        setConfirmPaOff(true);
      }
    } else {
      setName('');
      setDescription('');
      setTiers(createDefaultTiers());
      setQuotas(createEmptyQuotas());
      setPersonalAllowance(createDefaultPersonalAllowance());
      setIsDefault(false);
    }
  }, [isOpen, initialData]);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;

  const weeklyOn = quotas.weekly.enabled && quotas.weekly.amount > 0;
  const paOn = personalAllowance.enabled;

  const updateTier = (id: string, field: keyof TierConfig, value: any) => {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const addTier = () => {
    setTiers([
      ...tiers,
      {
        id: crypto.randomUUID(),
        name: 'New Tier',
        minEarnings: 0,
        maxEarnings: null,
        sharePercentage: 25,
        color: '#000000',
      },
    ]);
  };

  const removeTier = (id: string) => {
    if (tiers.length <= 1) {
      toast.error('Must have at least one tier');
      return;
    }
    setTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const validateStep = (id: StepId): string | null => {
    switch (id) {
      case 'basics':
        if (!name.trim()) return 'Enter a policy name to continue';
        return null;
      case 'tiers':
        return validateTiers(tiers);
      case 'quotas':
        if (quotas.weekly.amount < 0) return 'Weekly quota cannot be negative';
        if (!weeklyOn && !confirmQuotaOff) {
          return 'Set a weekly quota, or confirm you want to leave it off';
        }
        return null;
      case 'personal': {
        if (!paOn && !confirmPaOff) {
          return 'Enable Personal Allowance, or confirm you want to leave it off';
        }
        if (paOn) {
          const bandError = validatePersonalAllowanceBands(personalAllowance.bands);
          if (bandError) return bandError;
          if (
            personalAllowance.weeklyQuotaOverrideJmd != null &&
            personalAllowance.weeklyQuotaOverrideJmd < 0
          ) {
            return 'Weekly quota override cannot be negative';
          }
        }
        return null;
      }
      case 'review':
        return null;
      default:
        return null;
    }
  };

  const goNext = () => {
    const error = validateStep(step.id);
    if (error) {
      toast.error(error);
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  };

  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const handleSave = async () => {
    for (const s of STEPS) {
      if (s.id === 'review') continue;
      const error = validateStep(s.id);
      if (error) {
        toast.error(error);
        const idx = STEPS.findIndex((x) => x.id === s.id);
        if (idx >= 0) setStepIndex(idx);
        return;
      }
    }
    setSaving(true);
    try {
      const next = applyPolicyTemplateSave({
        previous: initialData,
        next: {
          id: initialData?.id || crypto.randomUUID(),
          name: name.trim(),
          description: description.trim() || undefined,
          tiers,
          quotas,
          personalAllowance,
          isDefault: isCreate ? isDefault : initialData?.isDefault || false,
        },
      });
      await onSave(next);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  const topTierShare = useMemo(() => {
    if (!tiers.length) return null;
    return [...tiers].sort((a, b) => b.minEarnings - a.minEarnings)[0];
  }, [tiers]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <div className="shrink-0 px-6 pt-6 pb-3 border-b border-slate-100 space-y-4">
          <DialogHeader>
            <DialogTitle>{isCreate ? 'Create Policy' : 'Edit Policy'}</DialogTitle>
            <DialogDescription>
              Step {stepIndex + 1} of {STEPS.length}: {step.label}. Finish every step to save a
              complete policy.
            </DialogDescription>
          </DialogHeader>

          {/* Progress — completed steps only clickable to go back */}
          <nav aria-label="Policy setup steps" className="flex items-center gap-1 w-full">
            {STEPS.map((s, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={i > stepIndex}
                  onClick={() => i < stepIndex && setStepIndex(i)}
                  className={`flex-1 min-w-0 rounded-md px-2 py-2 text-center text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : done
                        ? 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100 cursor-pointer'
                        : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-1">
                    {done ? <Check className="h-3 w-3 shrink-0" /> : <span>{i + 1}.</span>}
                    <span className="truncate">{s.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          {step.id === 'basics' && (
            <div className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <Label htmlFor="policy-name">Policy name</Label>
                <Input
                  id="policy-name"
                  placeholder="e.g. Standard Fleet"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="policy-desc">Description (optional)</Label>
                <Textarea
                  id="policy-desc"
                  placeholder="Who this rule is for"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              {isCreate && (
                <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 cursor-pointer">
                  <Checkbox
                    checked={isDefault}
                    onCheckedChange={(v) => setIsDefault(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-900">Make this the Default</span>
                    <span className="block text-sm text-slate-500">
                      Drivers with no Schedule assignment use Default.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {step.id === 'tiers' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Set the monthly earnings ladder and each band&apos;s driver share %.
              </p>
              <div className="rounded-md border hidden md:block">
                <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50 font-medium text-xs text-slate-500">
                  <div className="col-span-3">Tier Name</div>
                  <div className="col-span-3">Min Earnings ($)</div>
                  <div className="col-span-3">Max Earnings ($)</div>
                  <div className="col-span-2">Driver Share (%)</div>
                  <div className="col-span-1"></div>
                </div>
                <div className="divide-y">
                  {tiers.map((tier) => (
                    <div key={tier.id} className="grid grid-cols-12 gap-4 p-3 items-center">
                      <div className="col-span-3">
                        <Input
                          value={tier.name}
                          onChange={(e) => updateTier(tier.id, 'name', e.target.value)}
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          value={tier.minEarnings}
                          onChange={(e) =>
                            updateTier(tier.id, 'minEarnings', Number(e.target.value))
                          }
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          placeholder="No Limit"
                          value={tier.maxEarnings === null ? '' : tier.maxEarnings}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateTier(tier.id, 'maxEarnings', val === '' ? null : Number(val));
                          }}
                        />
                      </div>
                      <div className="col-span-2">
                        <div className="relative">
                          <Input
                            type="number"
                            value={tier.sharePercentage}
                            onChange={(e) =>
                              updateTier(tier.id, 'sharePercentage', Number(e.target.value))
                            }
                            className="pr-6"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                            %
                          </span>
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button variant="ghost" size="icon" onClick={() => removeTier(tier.id)}>
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 md:hidden">
                {tiers.map((tier, index) => (
                  <div key={tier.id} className="rounded-md border border-slate-200 p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Tier {index + 1}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeTier(tier.id)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                    <Input
                      placeholder="Tier name"
                      value={tier.name}
                      onChange={(e) => updateTier(tier.id, 'name', e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder="Min $"
                        value={tier.minEarnings}
                        onChange={(e) =>
                          updateTier(tier.id, 'minEarnings', Number(e.target.value))
                        }
                      />
                      <Input
                        type="number"
                        placeholder="Max $"
                        value={tier.maxEarnings === null ? '' : tier.maxEarnings}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateTier(tier.id, 'maxEarnings', val === '' ? null : Number(val));
                        }}
                      />
                    </div>
                    <Input
                      type="number"
                      placeholder="Driver share %"
                      value={tier.sharePercentage}
                      onChange={(e) =>
                        updateTier(tier.id, 'sharePercentage', Number(e.target.value))
                      }
                    />
                  </div>
                ))}
              </div>

              <Button variant="outline" onClick={addTier} className="w-full">
                <Plus className="mr-2 h-4 w-4" /> Add Tier Level
              </Button>
            </div>
          )}

          {step.id === 'quotas' && (
            <div className="space-y-4">
              <QuotaConfigTab
                config={quotas}
                onChange={(next) => {
                  setQuotas(next);
                  if (next.weekly.enabled && next.weekly.amount > 0) {
                    setConfirmQuotaOff(false);
                  }
                }}
              />
              {!weeklyOn && (
                <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 cursor-pointer">
                  <Checkbox
                    checked={confirmQuotaOff}
                    onCheckedChange={(v) => setConfirmQuotaOff(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-900">
                      Leave weekly quota off for this policy
                    </span>
                    <span className="block text-sm text-slate-600">
                      Goals and Personal Allowance quota % will not use a weekly target unless you
                      set one here (or a PA override later).
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {step.id === 'personal' && (
            <div className="space-y-4">
              <PersonalAllowanceConfigTab
                config={personalAllowance}
                quotaConfig={quotas}
                onChange={(next) => {
                  setPersonalAllowance(next);
                  if (next.enabled) setConfirmPaOff(false);
                }}
              />
              {!paOn && (
                <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 cursor-pointer">
                  <Checkbox
                    checked={confirmPaOff}
                    onCheckedChange={(v) => setConfirmPaOff(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm font-medium text-slate-900">
                      Leave Personal Allowance off for this policy
                    </span>
                    <span className="block text-sm text-slate-600">
                      Drivers on this policy will not earn free Personal km from quota %.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          {step.id === 'review' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Confirm everything looks right, then {isCreate ? 'create' : 'save'} the policy.
              </p>
              <div className="rounded-md border border-slate-200 divide-y text-sm">
                <div className="p-4 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Basics
                  </div>
                  <div className="font-medium text-slate-900">{name.trim() || '—'}</div>
                  {description.trim() ? (
                    <p className="text-slate-600">{description.trim()}</p>
                  ) : null}
                  {isCreate && isDefault ? (
                    <p className="text-indigo-700 text-xs font-medium">Will be Default</p>
                  ) : null}
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tier ladder
                  </div>
                  <p className="text-slate-800">
                    {tiers.length} tier{tiers.length === 1 ? '' : 's'}
                    {topTierShare
                      ? ` · Top share ${topTierShare.sharePercentage}% (${topTierShare.name})`
                      : ''}
                  </p>
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Earning quota
                  </div>
                  <p className="text-slate-800">
                    {weeklyOn
                      ? `Weekly $${quotas.weekly.amount.toLocaleString()} · ${
                          quotas.weekly.workingDays?.length || 0
                        } working days`
                      : 'Weekly quota off'}
                  </p>
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Personal Allowance
                  </div>
                  <p className="text-slate-800">
                    {paOn
                      ? `On · ${personalAllowance.bands.length} band${
                          personalAllowance.bands.length === 1 ? '' : 's'
                        }`
                      : 'Off'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-slate-100 gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button type="button" variant="outline" onClick={goBack} disabled={saving}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
            )}
            {!isLast ? (
              <Button type="button" onClick={goNext}>
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isCreate ? 'Create Policy' : 'Save Changes'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
