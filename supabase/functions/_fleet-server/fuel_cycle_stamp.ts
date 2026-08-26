/**
 * Unified fuel cycle metadata stamper — single server write path.
 * See apps/fleet/src/docs/fuel-brain-spine.md
 */
import * as kv from "./kv_store.tsx";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import * as fuelLogic from "./fuel_logic.ts";
import {
  evaluateCycleClose,
  resolveCycleCloseMode,
  type CycleCloseMode,
} from "./fuel_cycle_close_policy.ts";
import {
  isDeclinedOrFeeRow,
  isGasCardAdminAnchor,
  isJaaStatementLedgerRow,
  isLinkedGasCardPair,
} from "./fuel_jaa_ledger.ts";

export type FuelSignalTier = "observe" | "review" | "exception";

export type IntegrityStatus = "valid" | "warning" | "critical";

export function normalizeIntegrityStatus(
  status: unknown,
): IntegrityStatus {
  const s = String(status || "").toLowerCase();
  if (s === "critical") return "critical";
  if (s === "warning") return "warning";
  if (s === "stable") return "valid";
  if (s === "valid") return "valid";
  return "valid";
}

export function mapIntegrityToSignalTier(
  integrityStatus: IntegrityStatus,
  opts: {
    suppressedFrequency?: boolean;
    isHighFrequency?: boolean;
    odoCritical?: boolean;
  },
): FuelSignalTier {
  if (opts.odoCritical || integrityStatus === "critical") {
    if (opts.suppressedFrequency) return "observe";
    return "exception";
  }
  if (opts.isHighFrequency && !opts.suppressedFrequency) return "review";
  if (integrityStatus === "warning") return "observe";
  return "observe";
}

/** Recon Accept must stick across re-stamps (boolean or string JSON). */
export function isReconExceptionAcknowledged(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  if (!meta) return false;
  if (meta.exceptionResolvedAt) return true;
  const ack = meta.reconExceptionAck;
  return ack === true || ack === "true" || ack === 1 || ack === "1";
}

/** Whether this entry's liters participate in cash-lane tank cycle math. */
export function isCycleVolumeEligible(entry: Record<string, unknown>): boolean {
  if (isJaaStatementLedgerRow(entry)) return false;
  if (isDeclinedOrFeeRow(entry)) return false;

  const m = (entry.metadata || {}) as Record<string, unknown>;
  // Still waiting on CSV — no trusted pump liters yet
  if (m.awaitingCardStatement === true && isGasCardAdminAnchor(entry)) {
    return false;
  }

  // Matched Gas Card ops log: liters were copied from statement onto this row.
  // Statement stays Card Inventory only; the ops log must count or Full Tanks never closes.
  if (isGasCardAdminAnchor(entry) && isLinkedGasCardPair(entry)) {
    const liters = Math.max(0, Number(entry.liters) || Number(m.fuelVolume) || 0);
    return liters > 0;
  }

  const pay = String(entry.paymentSource || m.paymentSource || "");
  if (pay === "Gas_Card" || pay === "company_card") {
    if (entry.type === "Card_Transaction" && !isJaaStatementLedgerRow(entry)) {
      return false;
    }
  }

  return true;
}

export function effectiveCycleVolume(entry: Record<string, unknown>): number {
  if (!isCycleVolumeEligible(entry)) return 0;
  const m = (entry.metadata || {}) as Record<string, unknown>;
  const contributed = Number(m.volumeContributed);
  if (Number.isFinite(contributed) && contributed >= 0 && m.volumeContributed != null) {
    return contributed;
  }
  return Math.max(0, Number(entry.liters) || Number(m.fuelVolume) || 0);
}

export function shouldSuppressFrequencyFlag(entry: Record<string, unknown>): boolean {
  if (isJaaStatementLedgerRow(entry)) return true;
  if (isDeclinedOrFeeRow(entry)) return true;
  if (isLinkedGasCardPair(entry)) return true;
  const m = (entry.metadata || {}) as Record<string, unknown>;
  if (m.awaitingCardStatement === true) return true;
  return false;
}

/** Dedupe linked pairs: each match cluster counts as one swipe. */
export async function countRecentCardSwipes(
  vehicleId: string,
  entryDate: string,
  excludeId: string,
  windowHours = 4,
): Promise<number> {
  const recentTimeWindow = new Date(
    new Date(entryDate).getTime() - windowHours * 60 * 60 * 1000,
  ).toISOString();

  const { data } = await fromKvStore()
    .select("value")
    .like("key", "fuel_entry:%")
    .eq("value->>vehicleId", vehicleId)
    .gte("value->>date", recentTimeWindow)
    .neq("value->>id", excludeId);

  const clusters = new Set<string>();
  for (const row of data || []) {
    const e = row.value as Record<string, unknown>;
    if (!e?.id) continue;
    if (shouldSuppressFrequencyFlag(e)) continue;

    const isCard =
      e.type === "Card_Transaction" ||
      e.paymentSource === "Gas_Card" ||
      (e.metadata as Record<string, unknown>)?.paymentSource === "company_card";
    if (!isCard) continue;

    const m = (e.metadata || {}) as Record<string, unknown>;
    const clusterKey = String(
      m.jaaMatchedStatementId ||
        m.jaaMatchedDriverEntryId ||
        e.id,
    );
    clusters.add(clusterKey);
  }
  return clusters.size;
}

/** In-memory frequency count for batch recalculate (same dedupe rules). */
export function countRecentCardSwipesInBatch(
  entries: Record<string, unknown>[],
  currentIndex: number,
  windowHours = 4,
): number {
  const current = entries[currentIndex];
  if (!current?.date) return 0;
  const windowStart = new Date(current.date as string).getTime() - windowHours * 60 * 60 * 1000;
  const clusters = new Set<string>();

  for (let j = 0; j < currentIndex; j++) {
    const e = entries[j];
    if (!e?.id || e.id === current.id) continue;
    if (new Date(String(e.date)).getTime() < windowStart) continue;
    if (shouldSuppressFrequencyFlag(e)) continue;

    const isCard =
      e.type === "Card_Transaction" ||
      e.paymentSource === "Gas_Card" ||
      (e.metadata as Record<string, unknown>)?.paymentSource === "company_card";
    if (!isCard) continue;

    const m = (e.metadata || {}) as Record<string, unknown>;
    clusters.add(String(m.jaaMatchedStatementId || m.jaaMatchedDriverEntryId || e.id));
  }
  return clusters.size;
}

export type CycleStampContext = {
  auditConfig?: Record<string, unknown> | null;
  closeMode?: CycleCloseMode;
  skipIntegrity?: boolean;
  weekBoundaryClose?: boolean;
  /** Batch recalculate: pass pre-sorted prior entries in same open cycle */
  batchPriorEntries?: Record<string, unknown>[];
  batchRecentTxCount?: number;
};

export type CycleStampResult = {
  metadata: Record<string, unknown>;
  integrityStatus: IntegrityStatus;
  signalTier: FuelSignalTier;
  closeMode: CycleCloseMode;
};

function sumEligibleCycleVolume(
  cycleEntries: Record<string, unknown>[],
  excludeId?: string,
): number {
  let sum = 0;
  for (const ce of cycleEntries) {
    if (!ce?.id || ce.id === excludeId) continue;
    sum = Number((sum + effectiveCycleVolume(ce)).toFixed(4));
  }
  return sum;
}

/**
 * Stamp cycle spine + integrity metadata on a fuel entry (mutates entry.metadata).
 */
export async function stampEntryCycleMetadata(
  entry: Record<string, unknown>,
  vehicle: Record<string, unknown> | null,
  ctx: CycleStampContext = {},
): Promise<CycleStampResult | null> {
  if (!entry?.vehicleId || !vehicle) return null;

  const tankCapacity = fuelLogic.resolveTankCapacity(vehicle);
  const { baselineEfficiencyL100km, rangeMin } = fuelLogic.getVehicleBaselines(vehicle);
  const profileKmPerLiter = baselineEfficiencyL100km > 0 ? 100 / baselineEfficiencyL100km : 0;

  const auditConfig = ctx.auditConfig ?? (await kv.get("config:audit_settings"));
  const closeMode = ctx.closeMode ?? resolveCycleCloseMode(vehicle, auditConfig);

  const lastAnchor = await fuelLogic.getLastAnchor(String(entry.vehicleId), {
    asOfDate: String(entry.date || ""),
    excludeId: String(entry.id || ""),
  });
  const lastAnchorOdo = Number(lastAnchor?.odometer) || 0;
  const lastAnchorDate = lastAnchor?.date || null;

  const cycleEntries = ctx.batchPriorEntries ??
    (await fuelLogic.getEntriesSinceLastAnchor(
      String(entry.vehicleId),
      lastAnchorDate,
      { asOfDate: String(entry.date || ""), excludeId: String(entry.id || "") },
    ));

  let carryover = 0;
  if (
    lastAnchor?.metadata?.isSoftAnchor ||
    lastAnchor?.metadata?.isCapacityClose
  ) {
    carryover = Number(lastAnchor?.metadata?.excessVolume) || 0;
  }

  const prevCumulative = Number(
    (carryover + sumEligibleCycleVolume(cycleEntries, String(entry.id))).toFixed(4),
  );

  const m = (entry.metadata || {}) as Record<string, unknown>;
  const volumeAtEntry = isCycleVolumeEligible(entry)
    ? Math.max(0, Number(entry.liters) || Number(m.fuelVolume) || 0)
    : 0;

  const adminConfirmed = m.adminConfirmedFullTank === true;

  const close = ctx.weekBoundaryClose
    ? {
        shouldClose: true,
        reason: "week_boundary" as const,
        isSoft: false,
        isCapacityClose: false,
        isAnchor: true,
        volumeContributed: volumeAtEntry,
        excessVolume: 0,
        totalVolumeInCycle: prevCumulative + volumeAtEntry,
        percentOfTank: tankCapacity > 0
          ? ((prevCumulative + volumeAtEntry) / tankCapacity) * 100
          : 0,
      }
    : evaluateCycleClose({
        closeMode,
        prevCumulative,
        volume: volumeAtEntry,
        tankCapacity,
        entryType: String(entry.type || ""),
        paymentSource: String(entry.paymentSource || m.paymentSource || ""),
        entryMode: String(entry.entryMode || m.entryMode || ""),
        adminConfirmedFullTank: adminConfirmed,
      });

  const distanceSinceAnchor =
    entry.odometer && lastAnchorOdo
      ? Number(entry.odometer) - lastAnchorOdo
      : 0;

  const rollingAvg = await fuelLogic.calculateRollingEfficiency(
    String(entry.vehicleId),
    String(entry.date || ""),
  );
  const effectiveBaseline = rollingAvg?.avgKmPerLiter || 0;

  let integrityStatus: IntegrityStatus = "valid";
  let anomalyReason: string | null = null;
  let auditStatus = "Clear";
  let isHighFrequency = false;
  const suppressedFrequency = shouldSuppressFrequencyFlag(entry);

  if (!ctx.skipIntegrity) {
    const recentTxCount = ctx.batchRecentTxCount ??
      (await countRecentCardSwipes(
        String(entry.vehicleId),
        String(entry.date || ""),
        String(entry.id || ""),
      ));

    const isCardTransaction =
      entry.type === "Card_Transaction" || entry.paymentSource === "Gas_Card";

    const frequencyThreshold = Number(auditConfig?.frequencyThreshold) || 3;
    const efficiencyThreshold = Number(auditConfig?.efficiencyThreshold) || 0.30;

    const integrity = fuelLogic.calculateIntegrity({
      volume: volumeAtEntry,
      tankCapacity,
      prevCumulative,
      distanceSinceAnchor,
      profileEfficiency: profileKmPerLiter,
      recentTxCount: suppressedFrequency ? 0 : recentTxCount,
      isTopUp: m.isTopUp === true,
      isAnchor: close.isAnchor,
      rangeMin,
      isCardTransaction: isCardTransaction && !suppressedFrequency,
      frequencyThreshold,
      rollingAvgEfficiency: effectiveBaseline,
      efficiencyThreshold,
      suppressFrequency: suppressedFrequency,
    });

    integrityStatus = normalizeIntegrityStatus(integrity.status);
    anomalyReason = integrity.reason;
    auditStatus = integrity.auditStatus || "Clear";

    const prevEntry = await fuelLogic.getPreviousFuelEntry(
      String(entry.vehicleId),
      String(entry.date || ""),
      String(entry.id || ""),
    );
    const odoAudit = fuelLogic.auditOdometerSequence({
      currentOdo: Number(entry.odometer),
      prevOdo: Number(prevEntry?.odometer || 0),
      maxExpectedDistance: rangeMin * 1.5,
    });

    if (
      odoAudit.status === "critical" ||
      (odoAudit.status === "warning" && integrityStatus === "valid")
    ) {
      integrityStatus = normalizeIntegrityStatus(odoAudit.status);
      anomalyReason = odoAudit.reason;
      auditStatus = odoAudit.auditStatus || auditStatus;
    }

    isHighFrequency =
      !suppressedFrequency &&
      isCardTransaction &&
      recentTxCount >= frequencyThreshold - 1;
  }

  const signalTierRaw = mapIntegrityToSignalTier(integrityStatus, {
    suppressedFrequency,
    isHighFrequency,
    odoCritical: integrityStatus === "critical" && !suppressedFrequency,
  });
  // Recon ack must stick — do not re-block Finalize after ops accepted the flag.
  const signalTier: FuelSignalTier = isReconExceptionAcknowledged(m)
    ? "observe"
    : signalTierRaw;

  let actualKmPerLiter = 0;
  let efficiencyVariance = 0;
  const totalVolumeInCycle = close.totalVolumeInCycle;
  if (distanceSinceAnchor > 0 && totalVolumeInCycle > 0) {
    actualKmPerLiter = distanceSinceAnchor / totalVolumeInCycle;
    if (effectiveBaseline > 0) {
      efficiencyVariance = (effectiveBaseline - actualKmPerLiter) / effectiveBaseline;
    }
  }

  const openCycleId = fuelLogic.resolveCycleIdForOpenCycle(
    cycleEntries.map((e) => ({ metadata: e?.metadata })),
  );

  const nextMeta: Record<string, unknown> = {
    ...m,
    volumeContributed: Number(close.volumeContributed.toFixed(2)),
    cumulativeLitersAtEntry: Number(close.totalVolumeInCycle.toFixed(2)),
    tankUtilizationPercentage: tankCapacity > 0
      ? Number(((close.totalVolumeInCycle / tankCapacity) * 100).toFixed(1))
      : 0,
    distanceSinceAnchor,
    actualKmPerLiter: Number(actualKmPerLiter.toFixed(2)),
    profileKmPerLiter,
    rollingAvgKmPerLiter: rollingAvg?.avgKmPerLiter ?? null,
    rollingAvgWindow: rollingAvg?.window ?? null,
    rollingAvgEntryCount: rollingAvg?.entryCount ?? 0,
    efficiencyBaseline: rollingAvg ? "rolling" : "skipped",
    efficiencyVariance: Number((efficiencyVariance * 100).toFixed(1)),
    isSoftAnchor: close.isSoft,
    isCapacityClose: close.isCapacityClose || undefined,
    isFullTank: close.isCapacityClose || undefined,
    isAnchor: close.isAnchor,
    isHardAnchor: undefined,
    integrityStatus,
    anomalyReason,
    auditStatus,
    isHighFrequency,
    signalTier,
    cycleCloseMode: closeMode,
    cycleCloseReason: close.reason,
    cycleId: openCycleId,
    tankCapacityAtEntry: tankCapacity,
    cycleVolumeEligible: isCycleVolumeEligible(entry),
    flaggedAt:
      signalTier !== "observe" ? new Date().toISOString() : m.flaggedAt,
  };

  if (close.excessVolume > 0) {
    nextMeta.excessVolume = Number(close.excessVolume.toFixed(2));
  } else {
    delete nextMeta.excessVolume;
  }

  entry.metadata = nextMeta;

  return {
    metadata: nextMeta,
    integrityStatus,
    signalTier,
    closeMode,
  };
}

/** Heal entries with impossible cumulative (> 1.5× tank). Returns count healed. */
export async function healCorruptedCycleCumulative(
  limit = 200,
): Promise<{ scanned: number; healed: number }> {
  const { data } = await fromKvStore()
    .select("key, value")
    .like("key", "fuel_entry:%")
    .limit(limit * 3);

  let scanned = 0;
  let healed = 0;

  for (const row of data || []) {
    if (healed >= limit) break;
    const entry = row.value as Record<string, unknown>;
    if (!entry?.id || !entry?.vehicleId) continue;

    const m = (entry.metadata || {}) as Record<string, unknown>;
    const cum = Number(m.cumulativeLitersAtEntry);
    const tank = Number(m.tankCapacityAtEntry);
    if (!Number.isFinite(cum) || cum <= 0) continue;

    scanned++;
    const vehicle = await kv.get(`vehicle:${entry.vehicleId}`);
    const cap = fuelLogic.resolveTankCapacity(vehicle) || tank || 36;
    if (cum <= cap * 1.5) continue;

    await stampEntryCycleMetadata(
      entry,
      vehicle as Record<string, unknown>,
      { skipIntegrity: true },
    );
    await kv.set(`fuel_entry:${entry.id}`, entry);
    healed++;
  }

  return { scanned, healed };
}

/** Batch recalculate fuel_entry metadata for one vehicle (recalculate-all path). */
export async function recalculateVehicleFuelEntries(
  entries: Record<string, unknown>[],
  vehicle: Record<string, unknown>,
  auditConfig: Record<string, unknown> | null,
): Promise<{ modified: Record<string, unknown>[]; count: number }> {
  const closeMode = resolveCycleCloseMode(vehicle, auditConfig);
  const tankCapacity = fuelLogic.resolveTankCapacity(vehicle);
  const { baselineEfficiencyL100km, rangeMin } = fuelLogic.getVehicleBaselines(vehicle);
  const profileKmPerLiter = baselineEfficiencyL100km > 0 ? 100 / baselineEfficiencyL100km : 0;
  const frequencyThreshold = Number(auditConfig?.frequencyThreshold) || 3;
  const efficiencyThreshold = Number(auditConfig?.efficiencyThreshold) || 0.30;

  const sorted = [...entries].sort((a, b) => {
    const da = new Date(String(a.date || "")).getTime();
    const db = new Date(String(b.date || "")).getTime();
    if (da !== db) return da - db;
    return (Number(a.odometer) || 0) - (Number(b.odometer) || 0);
  });

  let carryover = 0;
  let lastAnchorOdo = 0;
  let openCycleEntries: Record<string, unknown>[] = [];
  let currentCycleId = fuelLogic.isStableCycleId(sorted[0]?.metadata?.cycleId)
    ? String((sorted[0]?.metadata as Record<string, unknown>).cycleId)
    : fuelLogic.mintCycleId();

  const modified: Record<string, unknown>[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    if (
      entry.auditStatus === "Resolved" ||
      entry.auditStatus === "Auto-Resolved" ||
      (entry.metadata as Record<string, unknown>)?.isHealed
    ) {
      const m = entry.metadata as Record<string, unknown>;
      if (m?.isAnchor) {
        carryover = Number(m.excessVolume) || 0;
        lastAnchorOdo = Number(entry.odometer) || lastAnchorOdo;
        openCycleEntries = [];
        currentCycleId = fuelLogic.resolveNextCycleIdAfterAnchor(sorted[i + 1], currentCycleId);
      }
      continue;
    }

    const prevCumulative = Number(
      (carryover + sumEligibleCycleVolume(openCycleEntries)).toFixed(4),
    );
    const m = (entry.metadata || {}) as Record<string, unknown>;
    const volumeAtEntry = isCycleVolumeEligible(entry)
      ? Math.max(0, Number(entry.liters) || Number(m.fuelVolume) || 0)
      : 0;

    const close = evaluateCycleClose({
      closeMode,
      prevCumulative,
      volume: volumeAtEntry,
      tankCapacity,
      entryType: String(entry.type || ""),
      paymentSource: String(entry.paymentSource || m.paymentSource || ""),
      entryMode: String(entry.entryMode || m.entryMode || ""),
      adminConfirmedFullTank: m.adminConfirmedFullTank === true,
    });

    const distanceSinceAnchor =
      entry.odometer && lastAnchorOdo ? Number(entry.odometer) - lastAnchorOdo : 0;

    const recentTxCount = countRecentCardSwipesInBatch(sorted, i);
    const suppressedFrequency = shouldSuppressFrequencyFlag(entry);
    const isCardTransaction =
      entry.type === "Card_Transaction" || entry.paymentSource === "Gas_Card";

    const integrity = fuelLogic.calculateIntegrity({
      volume: volumeAtEntry,
      tankCapacity,
      prevCumulative,
      distanceSinceAnchor,
      profileEfficiency: profileKmPerLiter,
      recentTxCount: suppressedFrequency ? 0 : recentTxCount,
      isTopUp: m.isTopUp === true,
      isAnchor: close.isAnchor,
      rangeMin,
      isCardTransaction: isCardTransaction && !suppressedFrequency,
      frequencyThreshold,
      rollingAvgEfficiency: 0,
      efficiencyThreshold,
      suppressFrequency: suppressedFrequency,
    });

    let integrityStatus = normalizeIntegrityStatus(integrity.status);
    let anomalyReason = integrity.reason;
    let auditStatus = integrity.auditStatus || "Clear";
    const isHighFrequency =
      !suppressedFrequency &&
      isCardTransaction &&
      recentTxCount >= frequencyThreshold - 1;
    const signalTierRaw = mapIntegrityToSignalTier(integrityStatus, {
      suppressedFrequency,
      isHighFrequency,
      odoCritical: integrityStatus === "critical" && !suppressedFrequency,
    });
    const signalTier: FuelSignalTier = isReconExceptionAcknowledged(m)
      ? "observe"
      : signalTierRaw;

    const cycleId = openCycleEntries.length
      ? fuelLogic.resolveCycleIdForOpenCycle(openCycleEntries.map((e) => ({ metadata: e.metadata })))
      : currentCycleId;

    const nextMeta: Record<string, unknown> = {
      ...m,
      volumeContributed: Number(close.volumeContributed.toFixed(2)),
      cumulativeLitersAtEntry: Number(close.totalVolumeInCycle.toFixed(2)),
      tankCapacityAtEntry: tankCapacity,
      distanceSinceAnchor,
      isSoftAnchor: close.isSoft,
      isCapacityClose: close.isCapacityClose || undefined,
      isFullTank: close.isCapacityClose || undefined,
      isAnchor: close.isAnchor,
      isHardAnchor: undefined,
      integrityStatus,
      anomalyReason,
      auditStatus,
      isHighFrequency,
      signalTier,
      cycleCloseMode: closeMode,
      cycleCloseReason: close.reason,
      cycleId,
      cycleVolumeEligible: isCycleVolumeEligible(entry),
      recalculatedAt: new Date().toISOString(),
    };

    if (close.excessVolume > 0) nextMeta.excessVolume = Number(close.excessVolume.toFixed(2));
    else delete nextMeta.excessVolume;

    const changed =
      m.integrityStatus !== nextMeta.integrityStatus ||
      m.cycleId !== nextMeta.cycleId ||
      m.cumulativeLitersAtEntry !== nextMeta.cumulativeLitersAtEntry ||
      m.excessVolume !== nextMeta.excessVolume;

    if (changed) {
      entry.metadata = nextMeta;
      entry.isFlagged = integrityStatus === "critical" && !suppressedFrequency;
      entry.auditStatus = auditStatus;
      entry.anomalyReason = anomalyReason;
      modified.push(entry);
    }

    openCycleEntries.push(entry);

    if (close.isAnchor) {
      carryover = close.excessVolume;
      lastAnchorOdo = Number(entry.odometer) || lastAnchorOdo;
      openCycleEntries = [];
      currentCycleId = fuelLogic.resolveNextCycleIdAfterAnchor(sorted[i + 1], cycleId);
    }
  }

  return { modified, count: modified.length };
}

/** Close open cycles at week finalize — stamps week_boundary on last open entry per vehicle. */
export async function closeOpenCyclesForWeek(
  vehicleId: string,
  weekEnd: string,
): Promise<number> {
  const vehicle = await kv.get(`vehicle:${vehicleId}`);
  if (!vehicle) return 0;

  const { data } = await fromKvStore()
    .select("key, value")
    .like("key", "fuel_entry:%")
    .eq("value->>vehicleId", vehicleId)
    .lte("value->>date", weekEnd)
    .order("value->>date", { ascending: false })
    .limit(50);

  const entries = (data || []).map((r) => r.value as Record<string, unknown>);
  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  let closed = 0;
  for (const entry of entries) {
    const m = (entry.metadata || {}) as Record<string, unknown>;
    if (m.isAnchor) break;
    if (!isCycleVolumeEligible(entry)) continue;

    await stampEntryCycleMetadata(entry, vehicle as Record<string, unknown>, {
      weekBoundaryClose: true,
    });
    await kv.set(`fuel_entry:${entry.id}`, entry);
    closed++;
    break;
  }
  return closed;
}
