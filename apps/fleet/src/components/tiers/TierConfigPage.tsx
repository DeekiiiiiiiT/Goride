import React, { useEffect, useState } from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card";
import { Input } from "../ui/input";
import { Loader2, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { tierService } from '../../services/tierService';
import { TierConfig, QuotaConfig, PersonalAllowanceTierConfig } from '../../types/data';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { QuotaConfigTab } from './QuotaConfigTab';
import { PersonalAllowanceConfigTab } from './PersonalAllowanceConfigTab';
import {
  mergePersonalAllowanceDefaults,
  validatePersonalAllowanceBands,
} from '../../utils/personalAllowance';
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Info } from 'lucide-react';

export function TierConfigPage() {
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quotas, setQuotas] = useState<QuotaConfig>({
    daily: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
    weekly: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
    monthly: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] }
  });
  const [personalAllowance, setPersonalAllowance] = useState<PersonalAllowanceTierConfig>(
    mergePersonalAllowanceDefaults(null),
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [t, q, pa] = await Promise.all([
         tierService.getTiers(),
         tierService.getQuotaSettings(),
         tierService.getPersonalAllowanceSettings(),
      ]);
      setTiers(t);

      const fullWeek = [0, 1, 2, 3, 4, 5, 6];
      setQuotas({
        ...q,
        daily: { ...q.daily, workingDays: q.daily.workingDays || fullWeek },
        weekly: { ...q.weekly, workingDays: q.weekly.workingDays || fullWeek },
        monthly: { ...q.monthly, workingDays: q.monthly.workingDays || fullWeek }
      });
      setPersonalAllowance(pa);
    } catch (e) {
      toast.error("Failed to load tier settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (
      (quotas.daily.enabled && quotas.daily.amount < 0) ||
      (quotas.weekly.enabled && quotas.weekly.amount < 0) ||
      (quotas.monthly.enabled && quotas.monthly.amount < 0)
    ) {
      toast.error("Quota amounts cannot be negative");
      return;
    }

    const bandError = validatePersonalAllowanceBands(personalAllowance.bands);
    if (bandError) {
      toast.error(bandError);
      return;
    }
    if (
      personalAllowance.weeklyQuotaOverrideJmd != null &&
      personalAllowance.weeklyQuotaOverrideJmd < 0
    ) {
      toast.error("Weekly quota override cannot be negative");
      return;
    }

    setSaving(true);
    try {
      await tierService.saveTiers(tiers);
      await tierService.saveQuotaSettings(quotas);
      await tierService.savePersonalAllowanceSettings(personalAllowance);
      toast.success("Tier, Quota & Personal Allowance settings saved");
    } catch (e) {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const updateTier = (id: string, field: keyof TierConfig, value: any) => {
    setTiers(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, [field]: value };
      }
      return t;
    }));
  };

  const addTier = () => {
    const newTier: TierConfig = {
      id: crypto.randomUUID(),
      name: 'New Tier',
      minEarnings: 0,
      maxEarnings: null,
      sharePercentage: 25,
      color: '#000000'
    };
    setTiers([...tiers, newTier]);
  };

  const removeTier = (id: string) => {
    setTiers(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Legacy Tier Settings</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Global fallback for fleets that have not recreated settings as an Earnings Policy yet.
        </p>
      </div>

      <Alert className="bg-slate-50 border-slate-200 text-slate-900">
        <Info className="h-4 w-4 text-indigo-600" />
        <AlertTitle>Runtime fallback only</AlertTitle>
        <AlertDescription className="text-slate-700">
          Prefer <strong>Earnings Policy Configuration</strong> (Rules + Schedule). These values apply only until you create a Default earnings policy. Recreate your tier ladder, weekly quota, and Personal Allowance there, then Make default.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="tiers" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="tiers">Tier Configuration</TabsTrigger>
          <TabsTrigger value="quotas">Earning Quota</TabsTrigger>
          <TabsTrigger value="personal">Personal Allowance</TabsTrigger>
        </TabsList>

        <TabsContent value="tiers">
          <Card>
            <CardHeader>
              <CardTitle>Driver Tiers</CardTitle>
              <CardDescription>Configure earnings thresholds and profit share percentages.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border">
                <div className="grid grid-cols-12 gap-4 p-4 bg-slate-50 font-medium text-sm text-slate-500">
                   <div className="col-span-3">Tier Name</div>
                   <div className="col-span-3">Min Earnings ($)</div>
                   <div className="col-span-3">Max Earnings ($)</div>
                   <div className="col-span-2">Driver Share (%)</div>
                   <div className="col-span-1"></div>
                </div>
                <div className="divide-y">
                   {tiers.map(tier => (
                     <div key={tier.id} className="grid grid-cols-12 gap-4 p-4 items-center">
                        <div className="col-span-3">
                           <Input 
                              value={tier.name} 
                              onChange={e => updateTier(tier.id, 'name', e.target.value)} 
                           />
                        </div>
                        <div className="col-span-3">
                           <Input 
                              type="number" 
                              value={tier.minEarnings} 
                              onChange={e => updateTier(tier.id, 'minEarnings', Number(e.target.value))} 
                           />
                        </div>
                        <div className="col-span-3">
                           <Input 
                              type="number" 
                              placeholder="No Limit"
                              value={tier.maxEarnings === null ? '' : tier.maxEarnings} 
                              onChange={e => {
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
                                  onChange={e => updateTier(tier.id, 'sharePercentage', Number(e.target.value))} 
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
              <Button variant="outline" onClick={addTier} className="w-full">
                <Plus className="mr-2 h-4 w-4" /> Add Tier Level
              </Button>
            </CardContent>
            <CardFooter className="bg-slate-50 border-t px-6 py-4 flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                   {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                   Save Configuration
                </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="quotas">
          {loading ? (
             <div className="flex justify-center p-8">
               <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
             </div>
          ) : (
             <>
                <QuotaConfigTab 
                  config={quotas} 
                  onChange={setQuotas} 
                />
                <Card className="mt-6">
                    <CardFooter className="bg-slate-50 border-t px-6 py-4 flex justify-end rounded-b-lg">
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Configuration
                        </Button>
                    </CardFooter>
                </Card>
             </>
          )}
        </TabsContent>

        <TabsContent value="personal">
          {loading ? (
             <div className="flex justify-center p-8">
               <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
             </div>
          ) : (
             <>
                <PersonalAllowanceConfigTab
                  config={personalAllowance}
                  quotaConfig={quotas}
                  onChange={setPersonalAllowance}
                />
                <Card className="mt-6">
                    <CardFooter className="bg-slate-50 border-t px-6 py-4 flex justify-end rounded-b-lg">
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save Configuration
                        </Button>
                    </CardFooter>
                </Card>
             </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
