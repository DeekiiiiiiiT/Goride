/**
 * TR-C5: PERFECT_MATCH auto-match scan + writes (extracted from toll_controller).
 * Route registration stays on toll_controller; this module owns the scan loop.
 */
export const AUTO_MATCH_SCAN_CAP = 3000;

export type AutoMatchCostResult = {
  expectedCost: number | null | undefined;
  officialAmount?: number | null;
  tagAmount?: number | null;
  usedOfficialRate?: boolean;
  rateDrift?: unknown;
};

export type AutoMatchCandidate = {
  tripId: string;
  confidenceScore: number;
  matchType?: string;
  isAmbiguous?: boolean;
};

export type PerfectMatchAutoMatchDeps = {
  resolveExpectedCostsBatch: (txs: any[]) => Promise<AutoMatchCostResult[]>;
  findMatches: (
    tx: any,
    trips: any[],
    timezone: string,
    driverAliasMap: Map<string, string> | Record<string, string> | any,
    expectedCost: number | null | undefined,
    extras: {
      officialAmount?: number | null;
      tagAmount?: number | null;
      usedOfficialRate?: boolean;
      rateDrift?: unknown;
    },
  ) => AutoMatchCandidate[];
  updateTollLedgerEntry: (
    id: string,
    patch: Record<string, unknown>,
    action: string,
    actorId: string,
    note?: string,
  ) => Promise<unknown>;
  syncTripRefundOnTollLink: (opts: {
    transactionId: string;
    tripId: string;
    auto: boolean;
    source: string;
    actorId: string;
  }) => Promise<unknown>;
  writeTollLedgerEntry: (opts: Record<string, unknown>) => Promise<unknown>;
};

/**
 * Explicit auto-match writes (was GET ?autoMatch=1).
 * On mid-pipeline failure after ledger reconcile, best-effort compensation unreconciles.
 */
export async function runPerfectMatchAutoMatch(
  opts: {
    unreconciled: any[];
    trips: any[];
    timezone: string;
    driverAliasMap: Map<string, string> | Record<string, string> | any;
    actorId: string;
  },
  deps: PerfectMatchAutoMatchDeps,
): Promise<{ autoReconciled: number; errors: string[] }> {
  const { unreconciled, trips, timezone, driverAliasMap, actorId } = opts;
  let autoReconciled = 0;
  const errors: string[] = [];

  const scanSet = unreconciled.slice(0, AUTO_MATCH_SCAN_CAP);
  if (unreconciled.length > AUTO_MATCH_SCAN_CAP) {
    console.log(
      `[TollReconciliation] Auto-match scan capped at ${AUTO_MATCH_SCAN_CAP} of ${unreconciled.length} unreconciled tolls`,
    );
  }

  const autoMatchCosts = await deps.resolveExpectedCostsBatch(scanSet);

  for (let i = 0; i < scanSet.length; i++) {
    const tx = scanSet[i];
    const txId = tx.id;

    if (tx.isReconciled && tx.tripId) continue;
    if (tx.metadata?.autoMatchOverridden) continue;

    const cost = autoMatchCosts[i];
    const matches = deps.findMatches(
      tx,
      trips,
      timezone,
      driverAliasMap,
      cost.expectedCost,
      {
        officialAmount: cost.officialAmount,
        tagAmount: cost.tagAmount,
        usedOfficialRate: cost.usedOfficialRate,
        rateDrift: cost.rateDrift,
      },
    );
    const best = matches[0];
    if (best?.isAmbiguous) continue;
    if (best?.matchType !== "PERFECT_MATCH") continue;

    const tripId = best.tripId;
    const trip = trips.find((t: any) => t.id === tripId);
    if (!trip) continue;

    let ledgerWritten = false;
    try {
      await deps.updateTollLedgerEntry(
        txId,
        {
          status: "reconciled",
          tripId,
          isReconciled: true,
          driverId: trip.driverId || tx.driverId,
          driverName: trip.driverName || tx.driverName,
          matchConfidence: best.confidenceScore,
          matchedAt: new Date().toISOString(),
          matchedBy: "system-auto",
        },
        "reconciled",
        actorId || "system-auto",
      );
      ledgerWritten = true;

      await deps.syncTripRefundOnTollLink({
        transactionId: txId,
        tripId,
        auto: true,
        source: "system:toll_reconcile_sync:auto_match",
        actorId,
      });

      await deps.writeTollLedgerEntry({
        eventType: "toll_reconciled",
        category: "Toll Reconciliation",
        description: `Auto-matched toll to trip: ${(trip.pickupLocation || "").substring(0, 30)} \u2192 ${(trip.dropoffLocation || "").substring(0, 30)}`,
        grossAmount: Math.abs(Number(tx.amount) || 0),
        netAmount: 0,
        direction: "neutral",
        sourceType: "reconciliation",
        sourceId: txId,
        driverId: tx.driverId || trip.driverId || "unknown",
        driverName: tx.driverName || trip.driverName || "Unknown",
        vehicleId: tx.vehicleId || trip.vehicleId,
        date: tx.date,
        actorId: actorId || "system-auto",
        strict: true,
        metadata: {
          tripId,
          matchedAt: new Date().toISOString(),
          matchedBy: "system-auto",
          tollAmount: Math.abs(Number(tx.amount) || 0),
          tripTollCharges: trip.tollCharges || 0,
        },
      });

      autoReconciled++;
      console.log(
        `[TollReconciliation] Auto-confirmed PERFECT_MATCH: tx ${txId} \u2192 trip ${tripId} (score: ${best.confidenceScore})`,
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(`[TollReconciliation] Auto-confirm failed for tx ${txId}: ${msg}`);
      errors.push(`${txId}: ${msg}`);
      // TR-H4: compensate partial write so we do not leave reconciled-without-audit.
      if (ledgerWritten) {
        try {
          await deps.updateTollLedgerEntry(
            txId,
            {
              status: "pending",
              tripId: null,
              isReconciled: false,
            },
            "unreconciled",
            actorId || "system-auto",
            "auto-match compensation",
          );
        } catch (compErr: any) {
          console.error(
            `[TollReconciliation] Auto-match compensation failed for ${txId}: ${compErr?.message}`,
          );
          errors.push(`${txId}: compensation failed: ${compErr?.message}`);
        }
      }
    }
  }

  if (autoReconciled > 0) {
    console.log(`[TollReconciliation] Auto-confirmed ${autoReconciled} perfect match(es)`);
  }
  return { autoReconciled, errors };
}
