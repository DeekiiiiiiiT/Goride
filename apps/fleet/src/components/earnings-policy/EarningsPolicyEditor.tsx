import React, { useEffect, useState } from 'react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import type { EarningsPolicy } from '../../types/earningsPolicy';
import type { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from '../../types/data';
import { QuotaConfigTab } from '../tiers/QuotaConfigTab';
import { PersonalAllowanceConfigTab } from '../tiers/PersonalAllowanceConfigTab';
import {
  createEmptyPolicy,
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

export function EarningsPolicyEditor({ isOpen, onClose, onSave, initialData, isCreate }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [quotas, setQuotas] = useState<QuotaConfig>(createEmptyQuotas());
  const [personalAllowance, setPersonalAllowance] = useState<PersonalAllowanceTierConfig>(
    createDefaultPersonalAllowance(),
  );
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('tiers');

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setName(initialData.name);
      setDescription(initialData.description || '');
      setTiers(initialData.tiers.map(t => ({ ...t })));
      setQuotas({
        daily: { ...initialData.quotas.daily },
        weekly: { ...initialData.quotas.weekly },
        monthly: { ...initialData.quotas.monthly },
      });
      setPersonalAllowance({
        ...initialData.personalAllowance,
        bands: initialData.personalAllowance.bands.map(b => ({ ...b })),
      });
      setIsDefault(!!initialData.isDefault);
    } else {
      setName('');
      setDescription('');
      setTiers(createDefaultTiers());
      setQuotas(createEmptyQuotas());
      setPersonalAllowance(createDefaultPersonalAllowance());
      setIsDefault(false);
    }
    setTab('tiers');
  }, [isOpen, initialData]);

  const updateTier = (id: string, field: keyof TierConfig, value: any) => {
    setTiers(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
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
    setTiers(prev => prev.filter(t => t.id !== id));
  };

  const validate = (): string | null => {
    if (!name.trim()) return 'Policy name is required';
    if (tiers.length === 0) return 'At least one tier is required';
    for (const t of tiers) {
      if (!t.name.trim()) return 'All tiers must have a name';
      if (t.sharePercentage < 0 || t.sharePercentage > 100) {
        return 'Share percentage must be 0-100';
      }
    }
    const bandError = validatePersonalAllowanceBands(personalAllowance.bands);
    if (bandError) return bandError;
    return null;
  };

  const handleSave = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
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
          isDefault: isCreate ? isDefault : (initialData?.isDefault || false),
        },
      });
      await onSave(next);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save policy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <div className="shrink-0 px-6 pt-6 pb-3 border-b border-slate-100">
          <DialogHeader>
            <DialogTitle>{isCreate ? 'Create Policy' : 'Edit Policy'}</DialogTitle>
            <DialogDescription>
              Configure tier ladder, earning quotas, and personal allowance bands.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Policy Name</Label>
              <Input
                placeholder="e.g. Standard Fleet"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Brief description of this policy"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-[38px] min-h-[38px] resize-none"
              />
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="tiers">Tier Ladder</TabsTrigger>
              <TabsTrigger value="quotas">Quotas</TabsTrigger>
              <TabsTrigger value="personal">Personal Allow.</TabsTrigger>
            </TabsList>

            <TabsContent value="tiers" className="mt-4 space-y-4">
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
                          onChange={(e) => updateTier(tier.id, 'minEarnings', Number(e.target.value))}
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
                            onChange={(e) => updateTier(tier.id, 'sharePercentage', Number(e.target.value))}
                            className="pr-6"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
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

              {/* Mobile stacked cards */}
              <div className="space-y-3 md:hidden">
                {tiers.map((tier, index) => (
                  <div key={tier.id} className="rounded-md border border-slate-200 p-3 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Tier {index + 1}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeTier(tier.id)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                    <div className="space-y-2">
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
                          onChange={(e) => updateTier(tier.id, 'minEarnings', Number(e.target.value))}
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
                        onChange={(e) => updateTier(tier.id, 'sharePercentage', Number(e.target.value))}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <Button variant="outline" onClick={addTier} className="w-full">
                <Plus className="mr-2 h-4 w-4" /> Add Tier Level
              </Button>
            </TabsContent>

            <TabsContent value="quotas" className="mt-4">
              <QuotaConfigTab config={quotas} onChange={setQuotas} />
            </TabsContent>

            <TabsContent value="personal" className="mt-4">
              <PersonalAllowanceConfigTab
                config={personalAllowance}
                quotaConfig={quotas}
                onChange={setPersonalAllowance}
              />
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-slate-100 gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isCreate ? 'Create Policy' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
