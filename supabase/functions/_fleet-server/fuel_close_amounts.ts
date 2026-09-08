/**
 * Pure Close Week fuel amount preference — shared by seal + probe (no I/O).
 */
export type FuelCloseAmounts = {
  driverShare: number;
  companyShare: number;
  totalSpend: number;
  miscellaneousCost: number;
  source: string;
};

export type FuelCloseAmountOverride = {
  driverShare?: number;
  companyShare?: number;
  totalSpend?: number;
  miscellaneousCost?: number;
};

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Rebuild that zeroes driver share while inventing a huge company share is not Consumption. */
export function isSuspiciousFuelRebuild(a: FuelCloseAmounts): boolean {
  return (
    a.source === "fuel_week_rebuild" &&
    Math.abs(a.driverShare) < 0.005 &&
    Math.abs(a.companyShare) > 0.005
  );
}

/**
 * Preference order: override → consumption_strip → finalized KV (real driver share)
 * → rebuild → period columns. Seal and probe must use the same order.
 */
export function pickFuelCloseAmounts(input: {
  override?: FuelCloseAmountOverride | null;
  fromConsumption?: FuelCloseAmounts | null;
  fromKv?: FuelCloseAmounts | null;
  fromRebuild?: FuelCloseAmounts | null;
  periodFallback: FuelCloseAmounts;
}): FuelCloseAmounts {
  let amounts: FuelCloseAmounts | null = null;

  if (input.override) {
    amounts = {
      driverShare: round2(input.override.driverShare ?? 0),
      companyShare: round2(input.override.companyShare ?? 0),
      totalSpend: round2(input.override.totalSpend ?? 0),
      miscellaneousCost: round2(input.override.miscellaneousCost ?? 0),
      source: "consumption_strip",
    };
  }

  if (!amounts && input.fromConsumption) amounts = input.fromConsumption;

  if (!amounts && input.fromKv && Math.abs(input.fromKv.driverShare) > 0.005) {
    amounts = input.fromKv;
  }

  if (!amounts && input.fromRebuild && !isSuspiciousFuelRebuild(input.fromRebuild)) {
    amounts = input.fromRebuild;
  } else if (!amounts && input.fromRebuild) {
    amounts = input.fromKv || input.fromRebuild;
  }

  if (!amounts) amounts = input.periodFallback;

  if (
    amounts.source !== "fuel_week_rebuild" &&
    Math.abs(amounts.driverShare) < 0.005 &&
    input.fromRebuild &&
    Math.abs(input.fromRebuild.driverShare) > 0.005
  ) {
    amounts = input.fromRebuild;
  }

  return amounts;
}

/** Build sealFuelWeek amountsByDriver from finalize snapshots (major units). */
export function buildFuelSealAmountsByDriver(
  snapshots: Array<Record<string, unknown> | null | undefined>,
): Record<string, FuelCloseAmountOverride> {
  const amountsByDriver: Record<string, FuelCloseAmountOverride> = {};
  for (const snap of snapshots) {
    if (!snap) continue;
    const driverId = String(snap.driverId || "").trim();
    if (!driverId) continue;
    amountsByDriver[driverId] = {
      driverShare: Number(snap.driverShare) || 0,
      companyShare: Number(snap.companyShare) || 0,
      totalSpend:
        Number(snap.totalGasCardCost) ||
        Number(snap.gasCardSpend) ||
        Number(snap.driverSpend) ||
        0,
      miscellaneousCost: Number(snap.miscellaneousCost) || 0,
    };
  }
  return amountsByDriver;
}
