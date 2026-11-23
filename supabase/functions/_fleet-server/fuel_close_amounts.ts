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

/** One current (not reversed) fuel line, as `fuel_week_lines_list` returns it. */
export type FuelWeekLineAmounts = {
  driver_id?: string | null;
  driver_amount_minor?: number | null;
  company_amount_minor?: number | null;
  reversed_at?: string | null;
};

/** Lines that still count: a reopen marks the old ones reversed (F-03). */
export function currentFuelLines<T extends FuelWeekLineAmounts>(lines: T[]): T[] {
  return (lines || []).filter((l) => l && !l.reversed_at);
}

/**
 * F-24: a v3 week's statement for one driver = the sum of that driver's current lines, and
 * nothing else. A driver with no line in a v3 week had no fuel cost: J$0.
 */
export function amountsFromFuelLines(
  lines: FuelWeekLineAmounts[],
  driverId: string,
): FuelCloseAmounts {
  let driverMinor = 0;
  let companyMinor = 0;
  for (const l of currentFuelLines(lines)) {
    if (String(l.driver_id || "") !== driverId) continue;
    driverMinor += Math.round(Number(l.driver_amount_minor) || 0);
    companyMinor += Math.round(Number(l.company_amount_minor) || 0);
  }
  return {
    driverShare: driverMinor / 100,
    companyShare: companyMinor / 100,
    totalSpend: (driverMinor + companyMinor) / 100,
    miscellaneousCost: 0,
    source: "fuel_week_lines",
  };
}

/**
 * Preference order: lines (v3 weeks, F-24: the only source) → override → consumption_strip
 * → finalized KV (real driver share) → rebuild → period columns. The chain after `fromLines`
 * runs only for weeks locked under v2.2. Seal and probe must use the same order.
 */
export function pickFuelCloseAmounts(input: {
  fromLines?: FuelCloseAmounts | null;
  override?: FuelCloseAmountOverride | null;
  fromConsumption?: FuelCloseAmounts | null;
  fromKv?: FuelCloseAmounts | null;
  fromRebuild?: FuelCloseAmounts | null;
  periodFallback: FuelCloseAmounts;
}): FuelCloseAmounts {
  if (input.fromLines) return input.fromLines;

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

  // C-2a: never overwrite an approved/override zero driverShare with rebuild.
  // A correct company-covered / priceUnavailable / Full-rule zero is not a defect.

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
