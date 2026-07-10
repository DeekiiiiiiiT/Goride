import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { FinancialTransaction, Trip, DisputeRefund } from '../types/data';
import { findTollMatches, MatchResult } from '../utils/tollReconciliation';
import { toast } from 'sonner@2.0.3';

/**
 * Phase 4: Server-driven toll reconciliation hook.
 *
 * Data flow:
 *   - Unreconciled tolls + match suggestions come from GET /toll-reconciliation/unreconciled
 *   - Reconciled tolls come from GET /toll-reconciliation/reconciled
 *   - Unclaimed refunds come from GET /toll-reconciliation/unclaimed-refunds
 *   - Trips are still loaded client-side for ManualMatchModal + driver inference
 *   - All mutation actions (reconcile, unreconcile, approve, reject) go through
 *     the Phase 3 server endpoints which write ledger entries.
 *
 * The public API (return signature) is identical to the pre-Phase-4 hook,
 * so zero UI component changes are needed.
 */

/**
 * @internal Paginate through ALL trips.
 * Still needed for:
 *  - ManualMatchModal (client-side trip search)
 *  - unreconcile() fallback (re-generate suggestions locally via findTollMatches)
 * Phase 8 note: This is the only remaining full-data-dump call.
 * If ManualMatchModal is ever given a server search endpoint, this can be removed.
 */
async function fetchAllTrips(): Promise<Trip[]> {
  const PAGE_SIZE = 500;
  let offset = 0;
  const all: Trip[] = [];
  while (true) {
    const batch = await api.getTrips({ limit: PAGE_SIZE, offset });
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
  }
  return all;
}

/** Paginate through all unreconciled tolls (server caps each page at 100). */
async function fetchAllUnreconciled(
  params: { driverId?: string; autoMatch?: boolean; from?: string; to?: string },
): Promise<{ data: FinancialTransaction[]; suggestions: Record<string, any[]>; autoReconciled: number; total: number }> {
  const PAGE_SIZE = 100;
  let offset = 0;
  const all: FinancialTransaction[] = [];
  const suggestions: Record<string, any[]> = {};
  let autoReconciled = 0;
  let total = 0;

  while (true) {
    const res = await api.getTollUnreconciled({
      ...params,
      limit: PAGE_SIZE,
      offset,
    });
    const batch: FinancialTransaction[] = res.data || [];
    all.push(...batch);
    if (res.suggestions) {
      Object.assign(suggestions, res.suggestions);
    }
    autoReconciled += res.autoReconciled || 0;
    total = res.total ?? all.length;
    if (batch.length < PAGE_SIZE || all.length >= total) break;
    offset += PAGE_SIZE;
  }

  return { data: all, suggestions, autoReconciled, total };
}

/**
 * Convert server-side suggestion format (flat trip fields) into the
 * client-side MatchResult shape expected by SuggestedMatchCard et al.
 */
function convertServerSuggestions(
  serverSuggestions: Record<string, any[]>,
  unreconciledTolls: FinancialTransaction[]
): Map<string, MatchResult[]> {
  const txLookup = new Map(unreconciledTolls.map(tx => [tx.id, tx]));
  const result = new Map<string, MatchResult[]>();

  for (const [txId, matches] of Object.entries(serverSuggestions)) {
    if (!matches || matches.length === 0) continue;
    const tx = txLookup.get(txId);
    if (!tx) continue;

    const converted: MatchResult[] = matches.map((m: any) => ({
      transaction: tx,
      trip: {
        id: m.tripId,
        date: m.tripDate,
        amount: m.tripAmount,
        tollCharges: m.tripTollCharges,
        pickupLocation: m.tripPickup,
        dropoffLocation: m.tripDropoff,
        platform: m.tripPlatform,
        driverId: m.tripDriverId,
        driverName: m.tripDriverName,
        // Phase 3: Trip timing & detail fields for overlay display
        requestTime: m.tripRequestTime,
        dropoffTime: m.tripDropoffTime,
        vehicleId: m.tripVehicleId,
        duration: m.tripDuration,
        distance: m.tripDistance,
        serviceType: m.tripServiceType,
      } as Trip,
      confidence: m.confidence,
      reason: m.reason,
      timeDifferenceMinutes: m.timeDifferenceMinutes,
      matchType: m.matchType,
      varianceAmount: m.varianceAmount,
      // Phase 1 enrichment fields (server-populated)
      confidenceScore: m.confidenceScore,
      vehicleMatch: m.vehicleMatch,
      driverMatch: m.driverMatch,
      dataQuality: m.dataQuality,
      windowHit: m.windowHit,
      isAmbiguous: m.isAmbiguous,
      reasonCode: m.reasonCode,
    }));

    result.set(txId, converted);
  }

  return result;
}

export interface RefundSuggestion {
  status: 'cash_wash' | 'phantom' | 'expense_logged' | 'pending';
  confidence: number;
  reason: string;
}

export interface UnlinkedShortfallSuggestion {
  claimId: string | null;
  tollId: string;
  tripId: string;
  tripRefund: number;
  tollAmount: number;
  remainingShortfall: number;
  leftoverShortfall: number;
  coversFully: boolean;
  confidence: number;
  date: string;
  claimStatus: string | null;
  matchType: 'claim' | 'toll';
  location?: string | null;
  tollPlatform?: string | null;
  tripPlatform?: string | null;
  platformMismatch?: boolean;
}

export interface ReconciliationPeriodScope {
  startDate: string;
  endDate: string;
}

export function useTollReconciliation(driverId?: string, period?: ReconciliationPeriodScope) {
  const [loading, setLoading] = useState(true);
  const [unreconciledTolls, setUnreconciledTolls] = useState<FinancialTransaction[]>([]);
  const [reconciledTolls, setReconciledTolls] = useState<FinancialTransaction[]>([]);
  /** Unscoped reconciled tolls — used to recover same-week rows the date filter drops. */
  const [allReconciledTolls, setAllReconciledTolls] = useState<FinancialTransaction[]>([]);
  const [unclaimedRefunds, setUnclaimedRefunds] = useState<Trip[]>([]);
  // Phase 3: refund resolution
  const [resolvedRefunds, setResolvedRefunds] = useState<Trip[]>([]);
  const [refundSuggestions, setRefundSuggestions] = useState<Map<string, RefundSuggestion>>(new Map());
  const [shortfallSuggestions, setShortfallSuggestions] = useState<Map<string, UnlinkedShortfallSuggestion[]>>(new Map());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [suggestions, setSuggestions] = useState<Map<string, MatchResult[]>>(new Map());
  // Phase 6: Track auto-reconciled count for dashboard banner
  const [autoReconciledCount, setAutoReconciledCount] = useState(0);
  // Phase 6 (Dispute Refunds): Imported Support Adjustment refunds
  const [disputeRefunds, setDisputeRefunds] = useState<DisputeRefund[]>([]);
  // Only blank the UI on first load (or driver filter change) — action refreshes stay silent
  const isInitialLoad = useRef(true);

  // Ignore stale shortfall responses when overlapping refreshes race.
  const shortfallFetchGen = useRef(0);

  const fetchData = useCallback(async (opts?: { autoMatch?: boolean }) => {
    const blockUi = isInitialLoad.current;
    if (blockUi) setLoading(true);
    // Keep prior shortfall chips until the new fetch lands — clearing here made
    // Accept flash first, then orange Apply only after Accept/refresh.
    const shortfallGen = ++shortfallFetchGen.current;
    try {
      const dateParams = period ? { from: period.startDate, to: period.endDate } : {};
      const filterParams = { ...(driverId ? { driverId } : {}), ...dateParams, autoMatch: opts?.autoMatch };

      // Step 1: Fetch unreconciled in pages (server caps page size; avoids edge timeout)
      const unreconciledRes = await fetchAllUnreconciled(filterParams);

      // Step 2: Now fetch reconciled + refunds + trips (after auto-reconciliation writes have persisted)
      const [reconciledRes, reconciledAllRes, refundsRes, allTrips] = await Promise.all([
        api.getTollReconciled({ limit: 1000, ...(driverId ? { driverId } : {}), ...dateParams }),
        period
          ? api.getTollReconciled({ limit: 1000, ...(driverId ? { driverId } : {}) })
          : Promise.resolve({ data: [] as FinancialTransaction[] }),
        api.getTollUnclaimedRefunds({ limit: 1000, ...(driverId ? { driverId } : {}), ...dateParams }),
        fetchAllTrips()
      ]);

      const unreconciled: FinancialTransaction[] = unreconciledRes.data || [];
      const reconciled: FinancialTransaction[] = reconciledRes.data || [];
      const reconciledAll: FinancialTransaction[] = reconciledAllRes.data || reconciled;
      const refunds: Trip[] = refundsRes.data || [];

      setUnreconciledTolls(unreconciled);
      setReconciledTolls(reconciled);
      setAllReconciledTolls(reconciledAll);
      setUnclaimedRefunds(refunds);
      setTrips(allTrips);

      // Convert server suggestions to client MatchResult format
      if (unreconciledRes.suggestions) {
        setSuggestions(convertServerSuggestions(unreconciledRes.suggestions, unreconciled));
      } else {
        setSuggestions(new Map());
      }

      // Phase 2/6: Notify admin if auto-matching occurred + persist count for banner
      const autoCount = unreconciledRes.autoReconciled;
      setAutoReconciledCount(autoCount || 0);
      if (autoCount && autoCount > 0) {
        toast.info(`${autoCount} toll${autoCount === 1 ? '' : 's'} auto-matched to trips`, {
          description: 'Perfect matches confirmed automatically. View in Matched History.',
          duration: 5000,
        });
      }

      // Phase 6 (Dispute Refunds): Fetch imported dispute refunds
      try {
        const drRes = await api.getDisputeRefunds(
          period ? { dateFrom: period.startDate, dateTo: period.endDate } : undefined,
        );
        setDisputeRefunds(drRes.data || []);
      } catch (drErr) {
        console.error('[Reconciliation] Failed to fetch dispute refunds:', drErr);
        setDisputeRefunds([]);
      }

      // Phase 3: leftovers + underpaid Apply targets together so Unlinked rows show
      // orange Apply from first paint (not only after a later Accept refresh).
      try {
        const [sugRes, resolvedRes, shortRes] = await Promise.all([
          api.getRefundSuggestions(driverId ? { driverId } : undefined),
          api.getResolvedRefunds(filterParams),
          api.getUnlinkedShortfallSuggestions({
            ...(driverId ? { driverId } : {}),
            ...(period ? { from: period.startDate, to: period.endDate } : {}),
          }),
        ]);
        const sugMap = new Map<string, RefundSuggestion>();
        const rawSug = sugRes?.suggestions || {};
        for (const [tripId, s] of Object.entries(rawSug)) {
          sugMap.set(tripId, s as RefundSuggestion);
        }
        setRefundSuggestions(sugMap);
        setResolvedRefunds(resolvedRes?.data || []);

        if (shortfallGen === shortfallFetchGen.current) {
          const shortMap = new Map<string, UnlinkedShortfallSuggestion[]>();
          const rawShort = shortRes?.suggestions || {};
          for (const [tripId, list] of Object.entries(rawShort)) {
            shortMap.set(tripId, list as UnlinkedShortfallSuggestion[]);
          }
          setShortfallSuggestions(shortMap);
        }
      } catch (refErr) {
        console.error('[Reconciliation] Failed to fetch refund/shortfall suggestions:', refErr);
        setRefundSuggestions(new Map());
        setResolvedRefunds([]);
        if (shortfallGen === shortfallFetchGen.current) {
          setShortfallSuggestions(new Map());
        }
      }

    } catch (error) {
      console.error("Failed to fetch reconciliation data", error);
    } finally {
      isInitialLoad.current = false;
      if (blockUi) setLoading(false);
    }
  }, [driverId, period?.startDate, period?.endDate]);

  useEffect(() => {
    isInitialLoad.current = true;
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const reconcile = async (transaction: FinancialTransaction, trip: Trip) => {
    try {
        // Phase 4: Use server endpoint (writes ledger entry)
        const result = await api.serverReconcileToll(transaction.id, trip.id);
        const updatedTx = result.data?.transaction || { ...transaction, tripId: trip.id, isReconciled: true, driverId: trip.driverId, driverName: trip.driverName };
        const updatedTrip = result.data?.trip || trip;
        
        // Optimistic local state updates (identical shape to pre-Phase-4)
        setUnreconciledTolls(prev => prev.filter(t => t.id !== transaction.id));
        setReconciledTolls(prev => {
            const exists = prev.some(t => t.id === updatedTx.id);
            if (exists) {
                return prev.map(t => t.id === updatedTx.id ? updatedTx : t);
            }
            return [updatedTx, ...prev];
        });
        
        setSuggestions(prev => {
            const next = new Map(prev);
            next.delete(transaction.id);
            return next;
        });
        
        // Update trips list
        setTrips(prev => prev.map(t => t.id === trip.id ? updatedTrip : t));

        // Update unclaimed refunds (if this trip was one, it is now linked)
        setUnclaimedRefunds(prev => prev.filter(t => t.id !== trip.id));

        return { transaction: updatedTx, trip: updatedTrip };
    } catch (error) {
        console.error("Reconciliation failed", error);
        throw error;
    }
  };

  const unreconcile = async (transaction: FinancialTransaction) => {
      try {
          if (!transaction.tripId) return;
          
          // Phase 4: Use server endpoint (writes reversal ledger entry)
          const result = await api.serverUnreconcileToll(transaction.id);
          const updatedTx = result.data?.transaction || { ...transaction, tripId: null, isReconciled: false };
          const returnedTrip = result.data?.trip;

          // Update local state
          setReconciledTolls(prev => prev.filter(t => t.id !== transaction.id));
          
          // Add back to unreconciled
          setUnreconciledTolls(prev => {
              const next = [...prev, updatedTx];
              return next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          });

          // Re-generate suggestions for this one toll using client-side matching
          // (trips array is available for ManualMatchModal anyway)
          const matches = findTollMatches(updatedTx, trips);
          setSuggestions(prev => {
              const next = new Map(prev);
              if (matches.length > 0) next.set(updatedTx.id, matches);
              return next;
          });
          
          // Refresh to ensure consistency (unclaimed refunds may change)
          fetchData();

      } catch (error) {
          console.error("Unreconcile failed", error);
          throw error;
      }
  };

  const approve = async (transaction: FinancialTransaction, notes?: string) => {
      try {
          // Phase 4: Use toll-specific approve (writes toll_approved ledger entry)
          const updatedTx = await api.approveToll(transaction.id, notes);

          // Update local state
          setUnreconciledTolls(prev => prev.filter(t => t.id !== transaction.id));
          setReconciledTolls(prev => {
              const exists = prev.some(t => t.id === updatedTx.id);
              if (exists) return prev.map(t => t.id === updatedTx.id ? updatedTx : t);
              return [updatedTx, ...prev];
          });
          
          setSuggestions(prev => {
              const next = new Map(prev);
              next.delete(transaction.id);
              return next;
          });
          
          return updatedTx;
      } catch (error) {
          console.error("Approve failed", error);
          throw error;
      }
  };

  const reject = async (transaction: FinancialTransaction, reason?: string) => {
      try {
          // Phase 4: Use toll-specific reject (writes toll_rejected ledger entry)
          const updatedTx = await api.rejectToll(transaction.id, reason);

          // Update local state
          setUnreconciledTolls(prev => prev.filter(t => t.id !== transaction.id));
          // Add to reconciled so it appears in history (marked as Rejected)
          setReconciledTolls(prev => {
              const exists = prev.some(t => t.id === updatedTx.id);
              if (exists) return prev.map(t => t.id === updatedTx.id ? updatedTx : t);
              return [updatedTx, ...prev];
          });
          
          setSuggestions(prev => {
              const next = new Map(prev);
              next.delete(transaction.id);
              return next;
          });

          return updatedTx;
      } catch (error) {
          console.error("Reject failed", error);
          throw error;
      }
  };

  const autoMatchAll = async () => {
    // Filter for high confidence matches
    const highConfidenceMatches: { transactionId: string, tripId: string }[] = [];
    
    unreconciledTolls.forEach(tx => {
        const matches = suggestions.get(tx.id);
        if (matches && matches.length > 0) {
            const best = matches[0];
            if (best.confidence === 'high') {
                highConfidenceMatches.push({ transactionId: tx.id, tripId: best.trip.id });
            }
        }
    });

    if (highConfidenceMatches.length === 0) return;

    try {
        // Phase 4: Use bulk endpoint (1 call instead of N sequential calls)
        const result = await api.bulkReconcileTolls(highConfidenceMatches);
        console.log(`[AutoMatch] Bulk result: ${result.matched} matched, ${result.skipped} skipped, ${result.failed} failed`);
        if (result.errors?.length > 0) {
            console.warn('[AutoMatch] Errors:', result.errors);
        }

        // Silent refresh — keep the dashboard mounted while data syncs
        await fetchData();
    } catch (e) {
        console.error("Auto-match failed", e);
    }
  };

  /** Instant UI update after linking a dispute refund to a toll (before silent refresh). */
  const applyDisputeMatch = useCallback((refundId: string, tollId: string) => {
    const now = new Date().toISOString();
    setDisputeRefunds(prev =>
      prev.map(r =>
        r.id === refundId
          ? { ...r, status: 'matched' as const, matchedTollId: tollId, resolvedAt: now }
          : r,
      ),
    );
    // Drop the toll from the open queue immediately; silent refresh reconciles history.
    setUnreconciledTolls(prev => prev.filter(t => t.id !== tollId));
    setSuggestions(prev => {
      const next = new Map(prev);
      next.delete(tollId);
      return next;
    });
  }, []);

  /** Instant UI update after unlinking a dispute refund (before silent refresh). */
  const applyDisputeUnmatch = useCallback((refundId: string) => {
    setDisputeRefunds(prev =>
      prev.map(r =>
        r.id === refundId
          ? {
              ...r,
              status: 'unmatched' as const,
              matchedTollId: null,
              matchedClaimId: null,
              resolvedAt: null,
              resolvedBy: null,
            }
          : r,
      ),
    );
  }, []);

  // ── Phase 3: Refund resolution actions ──
  type RefundResolution = 'cash_wash' | 'phantom' | 'expense_logged' | 'pending';

  const resolveRefund = async (
    tripId: string,
    resolution: RefundResolution,
    opts?: { notes?: string; driverId?: string },
  ) => {
    await api.resolveRefund({ tripId, resolution, notes: opts?.notes, driverId: opts?.driverId });
    // Optimistic: move the trip out of unclaimed and refresh authoritative state.
    setUnclaimedRefunds(prev => prev.filter(t => t.id !== tripId));
    await fetchData();
  };

  const bulkResolveRefunds = async (
    items: Array<{ tripId: string; resolution: RefundResolution; notes?: string; driverId?: string }>,
  ) => {
    if (items.length === 0) return { resolved: 0, failed: 0 };
    const result = await api.bulkResolveRefunds(items);
    const ids = new Set(items.map(i => i.tripId));
    setUnclaimedRefunds(prev => prev.filter(t => !ids.has(t.id)));
    await fetchData();
    return result;
  };

  const applyUnlinkedToClaim = async (
    tripId: string,
    opts: {
      claimId?: string | null;
      tollId?: string | null;
      acknowledgedPlatformMismatch?: boolean;
    },
  ) => {
    const result = await api.applyUnlinkedRefundToClaim({
      tripId,
      claimId: opts.claimId,
      tollId: opts.tollId,
      acknowledgedPlatformMismatch: opts.acknowledgedPlatformMismatch,
      // UI requires Proceed anyway checkbox — enforce on server too.
      rejectOnPlatformMismatch: true,
    });
    setUnclaimedRefunds(prev => prev.filter(t => t.id !== tripId));
    setShortfallSuggestions(prev => {
      const next = new Map(prev);
      next.delete(tripId);
      return next;
    });
    await fetchData();
    return result;
  };

  // Undo leftover resolutions (cash wash / phantom / etc.) — routes apply rows to full undo.
  const undoRefund = async (tripId: string) => {
    const trip = resolvedRefunds.find((t) => t.id === tripId);
    const isApply =
      trip &&
      (trip.tollRefundResolution?.appliedToClaimId ||
        (typeof trip.tollRefundResolution?.source === 'string' &&
          trip.tollRefundResolution.source.startsWith('system:unlinked_shortfall:')));
    if (isApply) {
      return undoApplyToUnderpaid(tripId);
    }
    await api.resolveRefund({ tripId, resolution: 'pending' });
    setResolvedRefunds((prev) => prev.filter((t) => t.id !== tripId));
    await fetchData();
  };

  /** Full undo of Apply to Underpaid (restores claim + toll provenance + trip queue). */
  const undoApplyToUnderpaid = async (tripId: string) => {
    const result = await api.undoApplyUnlinkedRefund(tripId);
    setResolvedRefunds((prev) => prev.filter((t) => t.id !== tripId));
    await fetchData();
    return result;
  };

  /** Repair trip-pending / claim-still-Reimbursed splits (also runs via wizard on load). */
  const repairUnlinkedApplySplits = async (opts?: { tripId?: string; driverId?: string }) => {
    return api.repairUnlinkedApplySplits(opts);
  };

  return {
    loading,
    unreconciledTolls,
    reconciledTolls,
    allReconciledTolls,
    unclaimedRefunds,
    resolvedRefunds,
    refundSuggestions,
    shortfallSuggestions,
    disputeRefunds,
    trips,
    suggestions,
    reconcile,
    unreconcile,
    approve,
    reject,
    autoMatchAll,
    autoReconciledCount,
    resolveRefund,
    bulkResolveRefunds,
    undoRefund,
    undoApplyToUnderpaid,
    repairUnlinkedApplySplits,
    applyUnlinkedToClaim,
    applyDisputeMatch,
    applyDisputeUnmatch,
    refresh: fetchData
  };
}