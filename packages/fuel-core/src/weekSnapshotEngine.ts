/**
 * Pure week snapshot money assembly — shared by Deno build-snapshots and golden tests.
 * Aligns settleable spend/shares with scenario Fuel rules (not a raw 50% default).
 */

export type WeekSnapFuelRule = {
  coverageType?: string;
  coverageValue?: number;
  rideShareCoverage?: number;
  companyUsageCoverage?: number;
  deadheadCoverage?: number;
  personalCoverage?: number;
  miscCoverage?: number;
  category?: string;
};

export type WeekSnapEntry = {
  id: string;
  amount: number;
  date: string;
  driverId: string;
  vehicleId: string;
  /** Prefer metadata ratio when already stamped by browser calc. */
  driverShareRatio?: number | null;
};

export type WeekSnapDriverContext = {
  driverId: string;
  vehicleId?: string;
  vehicleIds?: string[];
  fuelRule?: WeekSnapFuelRule | null;
};

export type BuiltWeekSnapshot = {
  weekStart: string;
  weekEnd: string;
  driverId: string;
  vehicleId: string;
  vehicleIds: string[];
  totalGasCardCost: number;
  gasCardSpend: number;
  driverSpend: number;
  companyShare: number;
  driverShare: number;
  miscellaneousCost: number;
  pendingCount: number;
  status: 'Finalized';
  finalizedAt: string;
  postedDriverShare: number;
  postedCompanyShare: number;
  netPay: number;
  fuelCycles: unknown[];
  orgId: string;
  org_id: string;
  metadata: {
    builtBy: string;
    settledEntries: Array<{
      id: string;
      amount: number;
      date: string;
      driverId: string;
      vehicleId: string;
    }>;
    blendedRatio: number;
    appliedFuelRule?: WeekSnapFuelRule | null;
    brain?: Record<string, unknown> | null;
  };
};

const EPS = 0.009;

/** Company coverage % for rideshare-heavy weeks (primary gas-card bucket). */
export function companyCoveragePercentFromFuelRule(rule?: WeekSnapFuelRule | null): number {
  if (!rule) return 50;
  if (rule.coverageType === 'Full') return 100;
  if (rule.coverageType === 'Fixed_Amount') return 50;
  const pct =
    rule.rideShareCoverage ??
    rule.coverageValue ??
    50;
  const n = Number(pct);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

export function driverShareRatioFromFuelRule(rule?: WeekSnapFuelRule | null): number {
  return 1 - companyCoveragePercentFromFuelRule(rule) / 100;
}

export function resolveEntryDriverRatio(
  entry: WeekSnapEntry,
  rule?: WeekSnapFuelRule | null,
): number {
  const stamped = Number(entry.driverShareRatio);
  if (Number.isFinite(stamped) && stamped >= 0 && stamped <= 1) return stamped;
  return driverShareRatioFromFuelRule(rule);
}

export function assembleWeekSnapshotsFromCalcInput(input: {
  weekStart: string;
  weekEnd: string;
  orgId: string;
  entriesByDriver: Map<string, WeekSnapEntry[]>;
  driverContexts: Map<string, WeekSnapDriverContext>;
  brainByDriver?: Map<string, Record<string, unknown>>;
  builtBy?: string;
}): BuiltWeekSnapshot[] {
  const {
    weekStart,
    weekEnd,
    orgId,
    entriesByDriver,
    driverContexts,
    brainByDriver,
    builtBy = 'fuel_week_engine',
  } = input;
  const snapshots: BuiltWeekSnapshot[] = [];

  for (const [driverId, entries] of entriesByDriver) {
    if (!entries.length) continue;
    const ctx = driverContexts.get(driverId) || { driverId };
    const rule = ctx.fuelRule || null;
    let totalGasCardCost = 0;
    let driverShare = 0;
    for (const e of entries) {
      const amt = Number(e.amount) || 0;
      if (amt <= 0) continue;
      totalGasCardCost += amt;
      driverShare += amt * resolveEntryDriverRatio(e, rule);
    }
    if (totalGasCardCost <= EPS) continue;
    const companyShare = Math.max(0, totalGasCardCost - driverShare);
    const vehicleIds = [
      ...new Set(
        [
          ...(ctx.vehicleIds || []),
          ctx.vehicleId || '',
          ...entries.map((e) => e.vehicleId),
        ].filter(Boolean),
      ),
    ];
    const vehicleId = ctx.vehicleId || vehicleIds[0] || '';
    const blendedRatio = totalGasCardCost > 0 ? driverShare / totalGasCardCost : 0;

    snapshots.push({
      weekStart,
      weekEnd,
      driverId,
      vehicleId,
      vehicleIds,
      totalGasCardCost,
      gasCardSpend: totalGasCardCost,
      driverSpend: 0,
      companyShare,
      driverShare,
      miscellaneousCost: 0,
      pendingCount: entries.length,
      status: 'Finalized',
      finalizedAt: new Date().toISOString(),
      postedDriverShare: driverShare,
      postedCompanyShare: companyShare,
      netPay: 0 - driverShare,
      fuelCycles: [],
      orgId,
      org_id: orgId,
      metadata: {
        builtBy,
        settledEntries: entries.map((e) => ({
          id: e.id,
          amount: Number(e.amount) || 0,
          date: String(e.date || '').split('T')[0],
          driverId: e.driverId || driverId,
          vehicleId: e.vehicleId || vehicleId,
        })),
        blendedRatio,
        appliedFuelRule: rule,
        brain: brainByDriver?.get(driverId) || null,
      },
    });
  }

  return snapshots;
}

/** Compare browser vs Deno money fields within tolerance. */
export function weekSnapshotMoneyDelta(
  a: {
    totalGasCardCost?: number;
    driverShare?: number;
    companyShare?: number;
    miscellaneousCost?: number;
  },
  b: {
    totalGasCardCost?: number;
    driverShare?: number;
    companyShare?: number;
    miscellaneousCost?: number;
  },
): { spend: number; driver: number; company: number; misc: number } {
  return {
    spend: Math.abs((Number(a.totalGasCardCost) || 0) - (Number(b.totalGasCardCost) || 0)),
    driver: Math.abs((Number(a.driverShare) || 0) - (Number(b.driverShare) || 0)),
    company: Math.abs((Number(a.companyShare) || 0) - (Number(b.companyShare) || 0)),
    misc: Math.abs((Number(a.miscellaneousCost) || 0) - (Number(b.miscellaneousCost) || 0)),
  };
}

/** Pending/Verified pool, else all entries (matches Deno settle semantics). */
export function pickSettlePoolEntries<T extends { reconciliationStatus?: string }>(
  weekEntries: T[],
): T[] {
  const pending = weekEntries.filter((e) => {
    const status = String(e.reconciliationStatus || 'Pending');
    return status === 'Pending' || status === 'Verified';
  });
  return pending.length ? pending : weekEntries;
}

/**
 * Map raw week fills + optional per-driver fuel rules into snapshots via the shared assembler.
 * Used by Deno build-snapshots (scenario path + 50% emergency path) and Node parity tests.
 */
export function assembleWeekSnapshotsFromRawEntries(input: {
  weekStart: string;
  weekEnd: string;
  orgId: string;
  entries: Array<{
    id: string;
    amount: number;
    date: string;
    driverId: string;
    vehicleId: string;
    reconciliationStatus?: string;
    driverShareRatio?: number | null;
  }>;
  /** Per-driver fuel rule; omit / null → 50% company default. */
  fuelRuleByDriver?: Map<string, WeekSnapFuelRule | null>;
  brainByDriver?: Map<string, Record<string, unknown>>;
  builtBy?: string;
}): BuiltWeekSnapshot[] {
  const byDriver = new Map<string, typeof input.entries>();
  for (const e of input.entries) {
    const driverId = String(e.driverId || '').trim() || `vehicle:${e.vehicleId || 'unknown'}`;
    const list = byDriver.get(driverId) || [];
    list.push({ ...e, driverId });
    byDriver.set(driverId, list);
  }

  const entriesByDriver = new Map<string, WeekSnapEntry[]>();
  const driverContexts = new Map<string, WeekSnapDriverContext>();

  for (const [driverId, weekEntries] of byDriver) {
    const settlePool = pickSettlePoolEntries(weekEntries);
    if (!settlePool.length) continue;
    const snapEntries: WeekSnapEntry[] = settlePool.map((e) => ({
      id: String(e.id),
      amount: Number(e.amount) || 0,
      date: String(e.date || '').split('T')[0],
      driverId: e.driverId || driverId,
      vehicleId: String(e.vehicleId || ''),
      driverShareRatio: e.driverShareRatio,
    }));
    entriesByDriver.set(driverId, snapEntries);
    const vehicleIds = [...new Set(snapEntries.map((e) => e.vehicleId).filter(Boolean))];
    driverContexts.set(driverId, {
      driverId,
      vehicleId: vehicleIds[0] || '',
      vehicleIds,
      fuelRule: input.fuelRuleByDriver?.get(driverId) ?? null,
    });
  }

  return assembleWeekSnapshotsFromCalcInput({
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    orgId: input.orgId,
    entriesByDriver,
    driverContexts,
    brainByDriver: input.brainByDriver,
    builtBy: input.builtBy,
  });
}
