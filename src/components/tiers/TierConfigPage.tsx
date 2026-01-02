import React, { useEffect, useState } from 'react';
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "../ui/card";
import { Input } from "../ui/input";
import { Loader2, Trash2, Plus, X } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { tierService } from '../../services/tierService';
import { TierConfig, ExpenseSplitRule, QuotaConfig } from '../../types/data';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { QuotaConfigTab } from './QuotaConfigTab';

export function TierConfigPage() {
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [splitRules, setSplitRules] = useState<ExpenseSplitRule[]>([]);
  const [quotas, setQuotas] = useState<QuotaConfig>({
    daily: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
    weekly: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] },
    monthly: { enabled: false, amount: 0, workingDays: [0, 1, 2, 3, 4, 5, 6] }
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [t, s, q] = await Promise.all([
         tierService.getTiers(),
         tierService.getSplitRules(),
         tierService.getQuotaSettings()
      ]);
      setTiers(t);
      setSplitRules(s);
      
      // Ensure defaults for working days if not present
      const fullWeek = [0, 1, 2, 3, 4, 5, 6];
      setQuotas({
        ...q,
        daily: { ...q.daily, workingDays: q.daily.workingDays || fullWeek },
        weekly: { ...q.weekly, workingDays: q.weekly.workingDays || fullWeek },
        monthly: { ...q.monthly, workingDays: q.monthly.workingDays || fullWeek }
      });
    } catch (e) {
      toast.error("Failed to load tier settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (
      (quotas.daily.enabled && quotas.daily.amount < 0) ||
      (quotas.weekly.enabled && quotas.weekly.amount < 0) ||
      (quotas.monthly.enabled && quotas.monthly.amount < 0)
    ) {
      toast.error("Quota amounts cannot be negative");
      return;
    }

    setSaving(true);
    try {
      await tierService.saveTiers(tiers);
      await tierService.saveSplitRules(splitRules);
      await tierService.saveQuotaSettings(quotas);
      toast.success("Tier, Expense & Quota settings saved");
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

  // Helper to calculate driver share
  const calculateDriverShare = (company: number, custom: {percentage: number}[]) => {
    const customTotal = custom.reduce((sum, item) => sum + item.percentage, 0);
    return Math.max(0, 100 - company - customTotal);
  };

  const updateCompanyShare = (ruleId: string, newVal: number) => {
    setSplitRules(prev => prev.map(r => {
      if (r.id === ruleId) {
        const customSplits = r.customSplits || [];
        const driverShare = calculateDriverShare(newVal, customSplits);
        return { ...r, companyShare: newVal, driverShare };
      }
      return r;
    }));
  };

  const addCustomSplit = (ruleId: string) => {
    setSplitRules(prev => prev.map(r => {
      if (r.id === ruleId) {
        const newSplit = { id: crypto.randomUUID(), name: 'New Party', percentage: 0 };
        const customSplits = [...(r.customSplits || []), newSplit];
        const driverShare = calculateDriverShare(r.companyShare, customSplits);
        return { ...r, customSplits, driverShare };
      }
      return r;
    }));
  };

  const updateCustomSplit = (ruleId: string, splitId: string, field: 'name' | 'percentage', value: any) => {
    setSplitRules(prev => prev.map(r => {
      if (r.id === ruleId) {
        const customSplits = (r.customSplits || []).map(s => 
          s.id === splitId ? { ...s, [field]: value } : s
        );
        
        if (field === 'percentage') {
             const driverShare = calculateDriverShare(r.companyShare, customSplits);
             return { ...r, customSplits, driverShare };
        }
        return { ...r, customSplits };
      }
      return r;
    }));
  };

  const removeCustomSplit = (ruleId: string, splitId: string) => {
     setSplitRules(prev => prev.map(r => {
        if (r.id === ruleId) {
            const customSplits = (r.customSplits || []).filter(s => s.id !== splitId);
            const driverShare = calculateDriverShare(r.companyShare, customSplits);
            return { ...r, customSplits, driverShare };
        }
        return r;
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Tier Configuration</h2>
        <p className="text-slate-500 dark:text-slate-400">
          Manage driver earnings thresholds, profit sharing, and expense splits.
        </p>
      </div>

      <Tabs defaultValue="tiers" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="tiers">Tier Configuration</TabsTrigger>
          <TabsTrigger value="expenses">Expense Splits</TabsTrigger>
          <TabsTrigger value="quotas">Earning Quota</TabsTrigger>
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

        <TabsContent value="expenses">
          <Card>
             <CardHeader>
                <CardTitle>Expense Splits</CardTitle>
                <CardDescription>Default sharing rules for expenses.</CardDescription>
             </CardHeader>
             <CardContent>
                 {loading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                 ) : splitRules.length === 0 ? (
                    <div className="text-center p-8 text-slate-500">
                      No expense categories found.
                    </div>
                 ) : (
                   <Tabs defaultValue={splitRules[0]?.category} className="w-full">
                     <TabsList className="w-full justify-start h-auto p-1 bg-slate-100 dark:bg-slate-800">
                        {splitRules.map(rule => (
                           <TabsTrigger key={rule.id} value={rule.category} className="flex-1">
                              {rule.category}
                           </TabsTrigger>
                        ))}
                     </TabsList>
                     {splitRules.map(rule => (
                         <TabsContent key={rule.id} value={rule.category} className="mt-6">
                             <div className="border rounded-lg p-6 space-y-6">
                                 <div className="flex justify-between items-start">
                                     <div>
                                         <h3 className="text-lg font-medium text-slate-900">{rule.category} Configuration</h3>
                                         <p className="text-sm text-slate-500">Adjust the company and driver share for {rule.category.toLowerCase()}.</p>
                                     </div>
                                     <Button variant="outline" size="sm" onClick={() => addCustomSplit(rule.id)}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Split Column
                                     </Button>
                                 </div>
                                 
                                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                     {/* Company Share */}
                                     <div className="space-y-2 p-4 bg-slate-50 rounded-lg border">
                                         <label className="text-sm font-medium text-slate-700">Company Share (%)</label>
                                         <div className="relative mt-2">
                                             <Input 
                                                 type="number" 
                                                 value={rule.companyShare}
                                                 onChange={e => {
                                                     const val = Number(e.target.value);
                                                     if (val >= 0 && val <= 100) {
                                                         updateCompanyShare(rule.id, val);
                                                     }
                                                 }}
                                                 className="pr-8"
                                             />
                                             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                                         </div>
                                     </div>

                                     {/* Custom Splits */}
                                     {rule.customSplits?.map(split => (
                                         <div key={split.id} className="space-y-2 p-4 bg-slate-50 rounded-lg border relative group">
                                             <div className="flex justify-between items-center mb-2">
                                                 <Input 
                                                    value={split.name}
                                                    onChange={e => updateCustomSplit(rule.id, split.id, 'name', e.target.value)}
                                                    className="h-7 text-sm font-medium border-transparent hover:border-slate-300 focus:border-primary px-1 -ml-1 w-full"
                                                 />
                                                 <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="h-6 w-6 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={() => removeCustomSplit(rule.id, split.id)}
                                                 >
                                                    <X className="h-3 w-3 text-slate-400 hover:text-red-500" />
                                                 </Button>
                                             </div>
                                             
                                             <div className="relative">
                                                 <Input 
                                                     type="number" 
                                                     value={split.percentage}
                                                     onChange={e => {
                                                         const val = Number(e.target.value);
                                                         if (val >= 0 && val <= 100) {
                                                             updateCustomSplit(rule.id, split.id, 'percentage', val);
                                                         }
                                                     }}
                                                     className="pr-8"
                                                 />
                                                 <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                                             </div>
                                         </div>
                                     ))}
                                     
                                     {/* Driver Share */}
                                     <div className="space-y-2 p-4 bg-slate-50 rounded-lg border">
                                         <label className="text-sm font-medium text-slate-700">Driver Share (%)</label>
                                         <div className="relative mt-2">
                                             <Input 
                                                 type="number" 
                                                 value={rule.driverShare}
                                                 disabled
                                                 className="pr-8 bg-slate-100"
                                             />
                                             <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">%</span>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         </TabsContent>
                     ))}
                   </Tabs>
                 )}
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
      </Tabs>
    </div>
  );
}
