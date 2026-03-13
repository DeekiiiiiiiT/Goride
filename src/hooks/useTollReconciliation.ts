import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { FinancialTransaction, Trip } from '../types/data';
import { findTollMatches, MatchResult } from '../utils/tollReconciliation';

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
    }));

    result.set(txId, converted);
  }

  return result;
}

export function useTollReconciliation(driverId?: string) {
  const [loading, setLoading] = useState(true);
  const [unreconciledTolls, setUnreconciledTolls] = useState<FinancialTransaction[]>([]);
  const [reconciledTolls, setReconciledTolls] = useState<FinancialTransaction[]>([]);
  const [unclaimedRefunds, setUnclaimedRefunds] = useState<Trip[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [suggestions, setSuggestions] = useState<Map<string, MatchResult[]>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Phase 4: Fetch from server endpoints (no more fetchAllTransactions!)
      // Still fetch trips for ManualMatchModal + driver inference in UnmatchedTollsList
      const filterParams = { limit: 1000, ...(driverId ? { driverId } : {}) };
      const [unreconciledRes, reconciledRes, refundsRes, allTrips] = await Promise.all([
        api.getTollUnreconciled(filterParams),
        api.getTollReconciled(filterParams),
        api.getTollUnclaimedRefunds(filterParams),
        fetchAllTrips()
      ]);

      const unreconciled: FinancialTransaction[] = unreconciledRes.data || [];
      const reconciled: FinancialTransaction[] = reconciledRes.data || [];
      const refunds: Trip[] = refundsRes.data || [];

      setUnreconciledTolls(unreconciled);
      setReconciledTolls(reconciled);
      setUnclaimedRefunds(refunds);
      setTrips(allTrips);

      // Convert server suggestions to client MatchResult format
      if (unreconciledRes.suggestions) {
        setSuggestions(convertServerSuggestions(unreconciledRes.suggestions, unreconciled));
      } else {
        setSuggestions(new Map());
      }

    } catch (error) {
      console.error("Failed to fetch reconciliation data", error);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
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
        setLoading(true);
        // Phase 4: Use bulk endpoint (1 call instead of N sequential calls)
        const result = await api.bulkReconcileTolls(highConfidenceMatches);
        console.log(`[AutoMatch] Bulk result: ${result.matched} matched, ${result.skipped} skipped, ${result.failed} failed`);
        if (result.errors?.length > 0) {
            console.warn('[AutoMatch] Errors:', result.errors);
        }

        // Refresh all data to reflect server state
        await fetchData();
    } catch (e) {
        console.error("Auto-match failed", e);
    } finally {
        setLoading(false);
    }
  };

  return {
    loading,
    unreconciledTolls,
    reconciledTolls,
    unclaimedRefunds,
    trips,
    suggestions,
    reconcile,
    unreconcile,
    approve,
    reject,
    autoMatchAll,
    refresh: fetchData
  };
}