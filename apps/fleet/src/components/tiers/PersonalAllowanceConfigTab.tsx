import React from 'react';
import { PersonalAllowanceBand, PersonalAllowanceTierConfig, QuotaConfig } from '../../types/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { Plus, Trash2 } from 'lucide-react';
import { resolveWeeklyQuotaJmd } from '../../utils/personalAllowance';

interface Props {
  config: PersonalAllowanceTierConfig;
  quotaConfig: QuotaConfig;
  onChange: (next: PersonalAllowanceTierConfig) => void;
}

export function PersonalAllowanceConfigTab({ config, quotaConfig, onChange }: Props) {
  const linkedWeekly = resolveWeeklyQuotaJmd(
    { ...config, weeklyQuotaOverrideJmd: null },
    quotaConfig,
  );

  const updateBand = (index: number, patch: Partial<PersonalAllowanceBand>) => {
    const bands = config.bands.map((b, i) => (i === index ? { ...b, ...patch } : b));
    onChange({ ...config, bands });
  };

  const addBand = () => {
    const last = config.bands[config.bands.length - 1];
    const min = last?.maxPctExclusive ?? (last?.minPctInclusive ?? 0) + 20;
    onChange({
      ...config,
      bands: [
        ...config.bands.map((b) =>
          b.maxPctExclusive == null ? { ...b, maxPctExclusive: min } : b,
        ),
        { minPctInclusive: min, maxPctExclusive: null, earnedKm: 0 },
      ],
    });
  };

  const removeBand = (index: number) => {
    if (config.bands.length <= 1) return;
    onChange({ ...config, bands: config.bands.filter((_, i) => i !== index) });
  };

  const previewQuota = linkedWeekly;
  const previewEarned = 40;
  const previewMeasured = 162;
  const previewOverage = previewMeasured - previewEarned;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal Allowance</CardTitle>
        <CardDescription>
          Earn free Personal km from weekly quota %. Company covers earned Personal fuel 100%;
          driver pays overage at period fuel $/km.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
          <div>
            <Label htmlFor="pa-enabled">Enable Personal Allowance</Label>
            <p className="text-sm text-slate-500">Off by default — fleets opt in.</p>
          </div>
          <Switch
            id="pa-enabled"
            checked={config.enabled}
            onCheckedChange={(enabled) => onChange({ ...config, enabled })}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Uses Earning Quota weekly target:{' '}
            <span className="font-medium text-slate-900">
              ${linkedWeekly.toLocaleString()} JMD
            </span>
          </p>
          <Label htmlFor="pa-override">Weekly quota override (JMD)</Label>
          <Input
            id="pa-override"
            type="number"
            min={0}
            placeholder="Leave blank to use Earning Quota"
            value={config.weeklyQuotaOverrideJmd ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              onChange({
                ...config,
                weeklyQuotaOverrideJmd: val === '' ? null : Number(val),
              });
            }}
          />
        </div>

        <div className="space-y-3">
          <Label>Milestone bands</Label>
          <div className="rounded-md border hidden md:block">
            <div className="grid grid-cols-12 gap-4 p-3 bg-slate-50 font-medium text-sm text-slate-500">
              <div className="col-span-3">Min %</div>
              <div className="col-span-3">Max %</div>
              <div className="col-span-4">Earned Personal km</div>
              <div className="col-span-2" />
            </div>
            <div className="divide-y">
              {config.bands.map((band, index) => (
                <div key={index} className="grid grid-cols-12 gap-4 p-3 items-center">
                  <div className="col-span-3">
                    <Input
                      type="number"
                      value={band.minPctInclusive}
                      onChange={(e) =>
                        updateBand(index, { minPctInclusive: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      placeholder="Open"
                      value={band.maxPctExclusive ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateBand(index, {
                          maxPctExclusive: val === '' ? null : Number(val),
                        });
                      }}
                    />
                  </div>
                  <div className="col-span-4">
                    <Input
                      type="number"
                      min={0}
                      value={band.earnedKm}
                      onChange={(e) => updateBand(index, { earnedKm: Number(e.target.value) })}
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeBand(index)}
                      disabled={config.bands.length <= 1}
                    >
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile stacked cards */}
          <div className="space-y-3 md:hidden">
            {config.bands.map((band, index) => (
              <div key={index} className="rounded-md border border-slate-200 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">Band {index + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeBand(index)}
                    disabled={config.bands.length <= 1}
                  >
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Min %</Label>
                    <Input
                      type="number"
                      value={band.minPctInclusive}
                      onChange={(e) =>
                        updateBand(index, { minPctInclusive: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Max %</Label>
                    <Input
                      type="number"
                      placeholder="Open"
                      value={band.maxPctExclusive ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateBand(index, {
                          maxPctExclusive: val === '' ? null : Number(val),
                        });
                      }}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Earned Personal km</Label>
                  <Input
                    type="number"
                    min={0}
                    value={band.earnedKm}
                    onChange={(e) => updateBand(index, { earnedKm: Number(e.target.value) })}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={addBand}>
            <Plus className="mr-2 h-4 w-4" /> Add row
          </Button>
          <p className="text-xs text-slate-500">Bands must be sorted with no overlaps.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pa-bonus">Next week bonus km when hitting top tier</Label>
          <Input
            id="pa-bonus"
            type="number"
            min={0}
            value={config.nextWeekBonusKm}
            onChange={(e) =>
              onChange({ ...config, nextWeekBonusKm: Math.max(0, Number(e.target.value) || 0) })
            }
          />
          <p className="text-xs text-slate-500">Set to 0 to disable.</p>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          At 72% of ${previewQuota.toLocaleString()} → {previewEarned} km earned; measured{' '}
          {previewMeasured} km → {previewOverage} km overage at fuel $/km.
        </div>
      </CardContent>
    </Card>
  );
}
