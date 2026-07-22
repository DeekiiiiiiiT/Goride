/**
 * Jamaica Fitness assignment: bucket fleet by fee/validity matrix.
 * Manual tier pick for vehicles missing usage/plate classification.
 */
import React from 'react';
import { Checkbox } from '../../ui/checkbox';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { formatMoney } from '../money';
import type { Vehicle } from '../../../types/vehicle';
import {
  FITNESS_TIERS,
  classifyFitnessTier,
  endDateFromValidity,
  type FitnessTier,
  type FitnessTierId,
} from '../../../utils/jamaicaFitnessMatrix';
import type { ExpenseRuleVehicleOverride } from '../../../types/expenseHub';
import { HubEmpty, HubError, HubLoading } from './HubStates';
import { useFleetVehiclesForFitness } from './useFleetVehiclesForFitness';

export type FitnessVehiclePlan = {
  vehicleId: string;
  label: string;
  tier: FitnessTier;
  override: ExpenseRuleVehicleOverride;
};

function vehicleLabel(v: Vehicle): string {
  const id = v.id || v.licensePlate || '';
  const name = [v.make, v.model].filter(Boolean).join(' ');
  return name ? `${v.licensePlate || id} — ${name}` : v.licensePlate || id;
}

function resolveStartDate(v: Vehicle, ruleStart: string): string {
  const expiry = (v.fitnessExpiry || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry) && expiry >= ruleStart) return expiry;
  return ruleStart;
}

function planForVehicle(
  v: Vehicle,
  tier: FitnessTier,
  ruleStart: string,
  startTime: string,
  endTime: string,
): FitnessVehiclePlan {
  const vehicleId = v.id || v.licensePlate || '';
  const startDateOverride = resolveStartDate(v, ruleStart);
  const endDateOverride = endDateFromValidity(startDateOverride, tier.validityYears);
  return {
    vehicleId,
    label: vehicleLabel(v),
    tier,
    override: {
      vehicleId,
      amount: tier.fee,
      validityYears: tier.validityYears,
      startDateOverride,
      startTimeOverride: startTime,
      endDateOverride,
      endTimeOverride: endTime,
    },
  };
}

export function FitnessBucketAssign({
  ruleStartDate,
  startTime,
  endTime,
  selectedIds,
  onChangeSelected,
  tierOverrides,
  onTierOverride,
  onPlansChange,
}: {
  ruleStartDate: string;
  startTime: string;
  endTime: string;
  selectedIds: string[];
  onChangeSelected: (ids: string[]) => void;
  /** Manual tier when auto-classify fails. */
  tierOverrides: Record<string, FitnessTierId>;
  onTierOverride: (vehicleId: string, tierId: FitnessTierId | 'none') => void;
  onPlansChange: (plans: FitnessVehiclePlan[]) => void;
}) {
  const vehiclesQuery = useFleetVehiclesForFitness();

  const classified = React.useMemo(() => {
    const vehicles = vehiclesQuery.data || [];
    const ready: FitnessVehiclePlan[] = [];
    const needsClass: Array<{ vehicle: Vehicle; id: string; label: string }> = [];

    for (const v of vehicles) {
      const id = v.id || v.licensePlate || '';
      if (!id) continue;
      const manualId = tierOverrides[id];
      const tier = manualId
        ? FITNESS_TIERS.find((t) => t.id === manualId) || null
        : classifyFitnessTier({
            usageCategory: v.usageCategory,
            plateClass: v.plateClass,
            year: v.year,
            odometerKm: v.metrics?.odometer,
            firstRegistration: v.fitnessFirstRegistration,
          });
      if (!tier) {
        needsClass.push({ vehicle: v, id, label: vehicleLabel(v) });
        continue;
      }
      ready.push(planForVehicle(v, tier, ruleStartDate, startTime, endTime));
    }
    return { ready, needsClass };
  }, [vehiclesQuery.data, tierOverrides, ruleStartDate, startTime, endTime]);

  const buckets = React.useMemo(() => {
    const map = new Map<FitnessTierId, FitnessVehiclePlan[]>();
    for (const plan of classified.ready) {
      const list = map.get(plan.tier.id) || [];
      list.push(plan);
      map.set(plan.tier.id, list);
    }
    return FITNESS_TIERS.map((tier) => ({
      tier,
      plans: map.get(tier.id) || [],
    })).filter((b) => b.plans.length > 0);
  }, [classified.ready]);

  React.useEffect(() => {
    const selectedPlans = classified.ready.filter((p) => selectedIds.includes(p.vehicleId));
    onPlansChange(selectedPlans);
  }, [classified.ready, selectedIds, onPlansChange]);

  // Auto-select newly classified vehicles once when they first appear
  const primed = React.useRef(false);
  React.useEffect(() => {
    if (primed.current || classified.ready.length === 0) return;
    primed.current = true;
    onChangeSelected(classified.ready.map((p) => p.vehicleId));
  }, [classified.ready, onChangeSelected]);

  if (vehiclesQuery.isLoading) return <HubLoading label="Loading fleet for fitness…" />;
  if (vehiclesQuery.isError) {
    return (
      <HubError
        message="Failed to load vehicles."
        onRetry={() => void vehiclesQuery.refetch()}
      />
    );
  }

  if ((vehiclesQuery.data || []).length === 0) {
    return (
      <HubEmpty
        title="No vehicles in fleet"
        description="Add vehicles and set usage / plate class before creating a Fitness rule."
      />
    );
  }

  const toggle = (id: string) => {
    onChangeSelected(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  };

  const toggleBucket = (plans: FitnessVehiclePlan[], include: boolean) => {
    const ids = plans.map((p) => p.vehicleId);
    if (include) {
      onChangeSelected(Array.from(new Set([...selectedIds, ...ids])));
    } else {
      onChangeSelected(selectedIds.filter((id) => !ids.includes(id)));
    }
  };

  return (
    <div className="space-y-4">
      {buckets.map(({ tier, plans }) => {
        const selectedCount = plans.filter((p) => selectedIds.includes(p.vehicleId)).length;
        const allSelected = selectedCount === plans.length;
        return (
          <div key={tier.id} className="rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{tier.label}</p>
                <p className="text-xs text-slate-500">
                  {formatMoney(tier.fee)} · every {tier.validityYears} year
                  {tier.validityYears === 1 ? '' : 's'} · {plans.length} vehicle
                  {plans.length === 1 ? '' : 's'}
                </p>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(c) => toggleBucket(plans, c === true)}
                />
                Include bucket ({selectedCount}/{plans.length})
              </label>
            </div>
            <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
              {plans.map((p) => (
                <li key={p.vehicleId}>
                  <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <span className="flex min-w-0 items-center gap-3">
                      <Checkbox
                        checked={selectedIds.includes(p.vehicleId)}
                        onCheckedChange={() => toggle(p.vehicleId)}
                      />
                      <span className="truncate">{p.label}</span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      until {p.override.endDateOverride}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {classified.needsClass.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
          <div className="border-b border-amber-200 px-4 py-3 dark:border-amber-900">
            <p className="font-medium text-amber-900 dark:text-amber-200">Needs classification</p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              Set usage + plate on the vehicle, or pick a fitness tier here.
            </p>
          </div>
          <ul className="divide-y divide-amber-100 dark:divide-amber-900/50">
            {classified.needsClass.map(({ id, label }) => (
              <li key={id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium">{label}</span>
                <div className="space-y-1 sm:w-72">
                  <Label className="text-xs">Fitness tier</Label>
                  <Select
                    value={tierOverrides[id] || 'none'}
                    onValueChange={(v) => onTierOverride(id, v === 'none' ? 'none' : (v as FitnessTierId))}
                  >
                    <SelectTrigger className="min-h-11 bg-white dark:bg-slate-950">
                      <SelectValue placeholder="Pick tier…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not set</SelectItem>
                      {FITNESS_TIERS.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label} ({formatMoney(t.fee)} / {t.validityYears}y)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
