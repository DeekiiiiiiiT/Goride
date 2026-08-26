import { useState, useEffect, useCallback, useRef } from 'react';
import { api, fetchFleetTimezone } from '../services/api';
import { FinancialTransaction, Trip, DisputeRefund } from '../types/data';
import { MatchResult } from '../utils/tollReconciliation';
import { collectReadyToLinkPairs, partitionSuggestions } from '../utils/suggestionPartition';
import { demoteSpuriousDeadheadMatch } from '../utils/deadheadMatchGuard';
import { fleetCalendarDay, ymdToLocalDate } from '../utils/timezoneDisplay';
import { TOLL_RECON_CAPS, type TollReconTruncation } from '../utils/tollReconCaps';
import { getTollTransactionDate } from '../utils/tollDate';
import { toast } from 'sonner@2.0.3';

/** Shift yyyy-MM-dd by N days (local calendar). */
function shiftYmd(ymd: string, days: number): string {
  const d = ymdToLocalDate(ymd);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pad period fetch window ±1 day so UTC midnight-edge trips (counted in the
 * period list via fleet TZ) are not dropped by the API's date filter before
 * the server fleet-day fix is deployed. Caller must re-trim with inPeriodDay.
 */
function paddedPeriodDateParams(period: { startDate: string; endDate: string }) {
  return {
    from: shiftYmd(period.startDate, -1),
    to: shiftYmd(period.endDate, 1),
  };
}

/**
 * Fetch trim: fleet calendar day within [startDate, endDate] (inclusive).
 * Wizard display membership / Toll Spend use week-key via isTollInWizardPeriod
 * (tollWeekPeriod) — do not treat this range trim as the spend row set.
 */
function inPeriodFleetDay(
  dateStr: string | undefined,
  startDate: string,
  endDate: string,
  fleetTz: string,
): boolean {
  if (!dateStr) return false;
  const day = fleetCalendarDay(dateStr, fleetTz);
  return !!day && day >= startDate && day <= endDate;
}

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

/** Safety cap so a runaway total cannot loop forever; hasMore=true if we stop early. */
const MAX_FETCH_PAGES = TOLL_RECON_CAPS.maxFetchPages;

/**
 * Period trips for ManualMatch + local rematch — not the whole fleet history.
 */
async function fetchTripsInRange(
  startDate: string,
  endDate: string,
): Promise<{ data: Trip[]; hasMore: boolean }> {
  const PAGE_SIZE = TOLL_RECON_CAPS.tripsPageSize;
  let offset = 0;
  const all: Trip[] = [];
  let hasMore = false;
  for (let page = 0; page < MAX_FETCH_PAGES; page++) {
    const res = await api.getTripsFiltered({
      startDate,
      endDate,
      limit: PAGE_SIZE,
      offset,
    });
    const batch = res.data || [];
    all.push(...batch);
    const total = res.total ?? all.length;
    if (batch.length < PAGE_SIZE || all.length >= total) {
      hasMore = false;
      break;
    }
    hasMore = true;
    offset += PAGE_SIZE;
  }
  return { data: all, hasMore };
}

/** Paginate through all unreconciled tolls (larger pages = fewer round trips). */
async function fetchAllUnreconciled(
  params: { driverId?: string; autoMatch?: boolean; from?: string; to?: string },
): Promise<{
  data: FinancialTransaction[];
  suggestions: Record<string, any[]>;
  autoReconciled: number;
  total: number;
  hasMore: boolean;
}> {
  const PAGE_SIZE = TOLL_RECON_CAPS.unreconciledPageSize;
  let offset = 0;
  const all: FinancialTransaction[] = [];
  const suggestions: Record<string, any[]> = {};
  let autoReconciled = 0;
  let total = 0;
  let hasMore = false;

  for (let page = 0; page < MAX_FETCH_PAGES; page++) {
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
    if (batch.length < PAGE_SIZE || all.length >= total) {
      hasMore = false;
      break;
    }
    hasMore = true;
    offset += PAGE_SIZE;
  }

  return { data: all, suggestions, autoReconciled, total, hasMore };
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

    const converted: MatchResult[] = matches.map((m: any) => {
      const base: MatchResult = {
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
      };
      // Client-side belt: keep bogus deadhead out of the Deadhead step even
      // before edge functions pick up the same demotion.
      return demoteSpuriousDeadheadMatch({
        ...base,
        tripTollCharges: m.tripTollCharges,
        tollAmount: Math.abs(Number(tx.amount) || 0),
      });
    });

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
  proposedShare?: number;
  requiresMultiTarget?: boolean;
  multiTargetTollIds?: string[];
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
  /** True when a paginated fetch hit MAX_FETCH_PAGES with more rows remaining. */
  const [truncation, setTruncation] = useState({ unreconciledHasMore: false, tripsHasMore: false });
  // Only blank the UI on first load (or driver filter change) — action refreshes stay silent
  const isInitialLoad = useRef(true);

  // Ignore stale shortfall responses when overlapping refreshes race.
  const shortfallFetchGen = useRef(0);
  // Period switches / Refresh can overlap — only the newest fetch may write state.
  const fetchGen = useRef(0);

  const fetchData = useCallback(async (opts?: { autoMatch?: boolean }) => {
    const blockUi = isInitialLoad.current;
    if (blockUi) setLoading(true);
    // Keep prior shortfall chips until the new fetch lands — clearing here made
    // Accept flash first, then orange Apply only after Accept/refresh.
    const shortfallGen = ++shortfallFetchGen.current;
    const gen = ++fetchGen.current;
    try {
      // ±1 day pad: UTC timestamps just past midnight still belong to prior
      // fleet calendar day (period list uses fleet TZ; old API filter used UTC).
      const dateParams = period ? paddedPeriodDateParams(period) : {};
      const filterParams = { ...(driverId ? { driverId } : {}), ...dateParams, autoMatch: opts?.autoMatch };
      const tripRange = period
        ? { startDate: shiftYmd(period.startDate, -2), endDate: shiftYmd(period.endDate, 2) }
        : null;

      const [fleetTz, unreconciledRes, reconciledRes, refundsRes, tripsRes, drRes, sugRes, resolvedRes, shortRes] = await Promise.all([
        fetchFleetTimezone(),
        fetchAllUnreconciled(filterParams),
        api.getTollReconciled({
          limit: TOLL_RECON_CAPS.reconciledLimit,
          ...(driverId ? { driverId } : {}),
          ...dateParams,
        }),
        api.getTollUnclaimedRefunds({
          limit: TOLL_RECON_CAPS.unclaimedRefundsLimit,
          ...(driverId ? { driverId } : {}),
          ...dateParams,
        }),
        tripRange
          ? fetchTripsInRange(tripRange.startDate, tripRange.endDate)
          : Promise.resolve({ data: [] as Trip[], hasMore: false }),
        api.getDisputeRefunds(
          period ? { dateFrom: period.startDate, dateTo: period.endDate } : undefined,
        ).catch((drErr) => {
          console.error('[Reconciliation] Failed to fetch dispute refunds:', drErr);
          return { data: [] as DisputeRefund[] };
        }),
        api.getRefundSuggestions({
          ...(driverId ? { driverId } : {}),
          ...dateParams,
        }).catch((err) => {
          console.error('[Reconciliation] Failed to fetch refund suggestions:', err);
          return { suggestions: {} };
        }),
        api.getResolvedRefunds(filterParams).catch((err) => {
          console.error('[Reconciliation] Failed to fetch resolved refunds:', err);
          return { data: [] as Trip[] };
        }),
        api.getUnlinkedShortfallSuggestions({
          ...(driverId ? { driverId } : {}),
          ...(period ? { from: period.startDate, to: period.endDate } : {}),
        }).catch((err) => {
          console.error('[Reconciliation] Failed to fetch shortfall suggestions:', err);
          return { suggestions: {} };
        }),
      ]);
      if (gen !== fetchGen.current) return;

      const trimToPeriod = <T extends { date?: string }>(rows: T[]): T[] => {
        if (!period) return rows;
        return rows.filter((r) => inPeriodFleetDay(r.date, period.startDate, period.endDate, fleetTz));
      };

      const unreconciled: FinancialTransaction[] = trimToPeriod(unreconciledRes.data || []);
      const reconciled: FinancialTransaction[] = trimToPeriod(reconciledRes.data || []);
      const refundsRaw: Trip[] = trimToPeriod(refundsRes.data || []);
      // Belt: server may historically return duplicate trip ids from unordered pages.
      const seenRefundIds = new Set<string>();
      const refunds = refundsRaw.filter((t) => {
        if (!t?.id || seenRefundIds.has(t.id)) return false;
        seenRefundIds.add(t.id);
        return true;
      });

      setUnreconciledTolls(unreconciled);
      setReconciledTolls(reconciled);
      setAllReconciledTolls(reconciled);
      setUnclaimedRefunds(refunds);
      setTrips(tripsRes.data);
      const reconciledTotal = Number((reconciledRes as { total?: number }).total ?? reconciled.length);
      const unclaimedTotal = Number((refundsRes as { total?: number }).total ?? refunds.length);
      setTruncation({
        unreconciledHasMore: unreconciledRes.hasMore,
        tripsHasMore: tripsRes.hasMore,
        reconciledCapped: reconciledTotal > TOLL_RECON_CAPS.reconciledLimit,
        unclaimedRefundsCapped: unclaimedTotal > TOLL_RECON_CAPS.unclaimedRefundsLimit,
      } satisfies TollReconTruncation);
      setDisputeRefunds(drRes.data || []);

      // Convert server suggestions to client MatchResult format
      if (unreconciledRes.suggestions) {
        setSuggestions(convertServerSuggestions(unreconciledRes.suggestions, unreconciled));
      } else {
        setSuggestions(new Map());
      }

      const autoCount = unreconciledRes.autoReconciled;
      setAutoReconciledCount(autoCount || 0);
      if (autoCount && autoCount > 0) {
        toast.info(`${autoCount} toll${autoCount === 1 ? '' : 's'} auto-matched to trips`, {
          description: 'Perfect matches confirmed automatically. View in Matched History.',
          duration: 5000,
        });
      }

      const sugMap = new Map<string, RefundSuggestion>();
      const rawSug = sugRes?.suggestions || {};
      for (const [tripId, s] of Object.entries(rawSug)) {
        sugMap.set(tripId, s as RefundSuggestion);
      }
      setRefundSuggestions(sugMap);
      setResolvedRefunds(trimToPeriod(resolvedRes?.data || []));

      if (shortfallGen === shortfallFetchGen.current) {
        const shortMap = new Map<string, UnlinkedShortfallSuggestion[]>();
        const rawShort = shortRes?.suggestions || {};
        for (const [tripId, list] of Object.entries(rawShort)) {
          shortMap.set(tripId, list as UnlinkedShortfallSuggestion[]);
        }
        setShortfallSuggestions(shortMap);
      }

    } catch (error) {
      if (gen === fetchGen.current) {
        console.error("Failed to fetch reconciliation data", error);
      }
    } finally {
      if (gen === fetchGen.current) {
        isInitialLoad.current = false;
        if (blockUi) setLoading(false);
      }
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
              return next.sort(
                (a, b) => getTollTransactionDate(b).getTime() - getTollTransactionDate(a).getTime(),
              );
          });

          // Do not seed thin client findTollMatches — wait for fetchData()
          // convertServerSuggestions so confidence/reason stay server-grade.
          setSuggestions(prev => {
              const next = new Map(prev);
              next.delete(updatedTx.id);
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

  const autoMatchAll = async (
    matches?: Array<{ transactionId: string; tripId: string }>,
  ) => {
    const highConfidenceMatches =
      matches && matches.length > 0
        ? matches
        : collectReadyToLinkPairs(
            partitionSuggestions(unreconciledTolls, suggestions, 'needs-review').suggestions,
            suggestions,
          );

    if (highConfidenceMatches.length === 0) {
      toast.message('Nothing ready to link in bulk');
      return;
    }

    try {
        const result = await api.bulkReconcileTolls(highConfidenceMatches);
        console.log(`[AutoMatch] Bulk result: ${result.matched} matched, ${result.skipped} skipped, ${result.failed} failed`);
        if (result.errors?.length > 0) {
            console.warn('[AutoMatch] Errors:', result.errors);
        }
        if (result.matched > 0) {
          toast.success(`Linked ${result.matched} trip${result.matched === 1 ? '' : 's'}`);
        }
        if (result.failed > 0) {
          toast.error(`${result.failed} could not be linked`);
        }
        if (result.matched === 0 && result.failed === 0) {
          toast.message(
            result.skipped > 0
              ? `No new trips were linked (${result.skipped} skipped)`
              : 'No new trips were linked',
          );
        }

        await fetchData();
    } catch (e) {
        console.error("Auto-match failed", e);
        toast.error('Bulk link failed');
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
      applyShare?: number;
      forceSingleTarget?: boolean;
      targets?: Array<{ claimId?: string | null; tollId?: string | null; share?: number }>;
      acknowledgedPlatformMismatch?: boolean;
    },
  ) => {
    const result = await api.applyUnlinkedRefundToClaim({
      tripId,
      claimId: opts.claimId,
      tollId: opts.tollId,
      applyShare: opts.applyShare,
      forceSingleTarget: opts.forceSingleTarget,
      targets: opts.targets,
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
    truncation,
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