/**
 * N-3 / R-3: server-side derive of tank-window timing + unattributed fill spend.
 * Same litre buckets + efficiencySource guard as FuelCalculationService (N-1/N-2).
 * Price is derived from entry spend/litres (R-3) — optional override for tests only.
 */
import {
  computeFirstFillTimingLiters,
  computeUnattributedFillCost,
  computeUnattributedFillLiters,
  computeWindowTimingCost,
} from './fuelCoverageSplit.ts';
import {
  countsInFuelLogSpend,
  fuelOpsLiters,
  fuelOpsSpendAmount,
  isFuelOpsLogEntry,
} from './fuelOpsEligibility.ts';
import { resolvePricePerLiter } from './resolvePricePerLiter.ts';

export type WindowMoneyEntry = {
  odometer?: number | null;
  liters?: number | null;
  amount?: number | null;
  metadata?: Record<string, unknown> | null;
  type?: string | null;
  paymentSource?: string | null;
  entryMode?: string | null;
  usageCategory?: string | null;
};

export type EfficiencySource = 'odometer' | 'vehicle_settings' | 'default_fallback';

export type DeriveWindowMoneyResult = {
  efficiencySource: EfficiencySource;
  odometeredFillCount: number;
  totalLiters: number;
  firstFillLiters: number;
  unattributedLiters: number;
  windowTimingCost: number;
  unattributedFillCost: number;
  /** True when spend/litres present but chain cannot support timing carve. */
  odometerChainUnusable: boolean;
  /** JMD/L used for carves (entry-derived unless overridden). */
  pricePerLiter: number;
};

export type DeriveWindowMoneyOpts = {
  /** Test/override only — production derives Σ spend / Σ litres from entries. */
  pricePerLiter?: number;
  hasVehicleEfficiencySettings?: boolean;
};

function asFuelOpsShape(e: WindowMoneyEntry) {
  return {
    odometer: e.odometer,
    liters: e.liters,
    amount: e.amount,
    metadata: e.metadata || undefined,
    type: e.type || undefined,
    paymentSource: e.paymentSource || undefined,
    entryMode: e.entryMode || undefined,
  } as Parameters<typeof fuelOpsLiters>[0];
}

/**
 * Derive window timing + unattributed from ops-eligible entries.
 * When efficiencySource !== 'odometer', both costs are 0 (N-1 guard).
 */
export function deriveWindowMoneyFromEntries(
  entries: WindowMoneyEntry[],
  opts?: DeriveWindowMoneyOpts,
): DeriveWindowMoneyResult {
  const ops = (entries || []).filter((e) => isFuelOpsLogEntry(asFuelOpsShape(e)));
  const totalLiters = ops.reduce((s, e) => s + fuelOpsLiters(asFuelOpsShape(e)), 0);
  const totalSpend = ops.reduce((s, e) => s + fuelOpsSpendAmount(asFuelOpsShape(e)), 0);

  const override = Number(opts?.pricePerLiter);
  const pricePerLiter =
    override > 0
      ? override
      : resolvePricePerLiter({
          totalLiters,
          totalGasCardCost: totalSpend,
        }).pricePerLiter;

  const entriesWithOdo = ops
    .filter((e) => {
      const row = asFuelOpsShape(e);
      return (
        countsInFuelLogSpend(row) &&
        e.odometer !== undefined &&
        e.odometer !== null &&
        Number(e.odometer) > 0 &&
        fuelOpsLiters(row) > 0
      );
    })
    .sort((a, b) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0));

  const odometeredFillCount = entriesWithOdo.length;
  const sumOdoLiters = entriesWithOdo.reduce((s, e) => s + fuelOpsLiters(asFuelOpsShape(e)), 0);
  const firstFillLiters =
    odometeredFillCount > 0
      ? computeFirstFillTimingLiters(fuelOpsLiters(asFuelOpsShape(entriesWithOdo[0])))
      : 0;
  const unattributedLiters = computeUnattributedFillLiters(totalLiters, sumOdoLiters);

  const efficiencySource: EfficiencySource =
    odometeredFillCount >= 3
      ? 'odometer'
      : opts?.hasVehicleEfficiencySettings
        ? 'vehicle_settings'
        : 'default_fallback';

  const priceOk = Number(pricePerLiter) > 0;
  const odometerChainUnusable =
    priceOk && totalLiters > 0 && efficiencySource !== 'odometer';

  let windowTimingCost = 0;
  let unattributedFillCost = 0;
  if (priceOk && efficiencySource === 'odometer') {
    windowTimingCost = computeWindowTimingCost(firstFillLiters, pricePerLiter);
    unattributedFillCost = computeUnattributedFillCost(unattributedLiters, pricePerLiter);
  }

  return {
    efficiencySource,
    odometeredFillCount,
    totalLiters,
    firstFillLiters,
    unattributedLiters,
    windowTimingCost,
    unattributedFillCost,
    odometerChainUnusable,
    pricePerLiter: priceOk ? pricePerLiter : 0,
  };
}
