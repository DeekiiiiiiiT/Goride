import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TooltipProvider } from "../../ui/tooltip";
import { DRIVER_FINANCIAL_PERIODS_KEY } from '../../../hooks/useDriverFinancialPeriods';
import { TollBucketPanel } from "./TollBucketPanel";
import { TollFinancialOverviewCards } from "./TollFinancialOverviewCards";
import { UnderpaidClaimsStep } from "./UnderpaidClaimsStep";
import { DisputeRefundsList, DisputeMatchEvent } from "./DisputeRefundsList";
import { UnclaimedRefundsList } from "./UnclaimedRefundsList";
import { GatedReconciliationStepper, computeGatedStepStates, pickInitialStep, GatedStepState } from "./GatedReconciliationStepper";
import { useTollReconciliation } from "../../../hooks/useTollReconciliation";
import { useClaims } from "../../../hooks/useClaims";
import {
  Loader2, RefreshCw, Wand2, DollarSign, HelpCircle,
  CarFront, Route, ShieldCheck, Unlink as UnlinkIcon, ArrowLeft, RotateCcw, type LucideIcon,
} from "lucide-react";
import { Button } from "../../ui/button";
import { runScenarioTest } from "../../../utils/testScenario";
import { FinancialTransaction, Claim } from "../../../types/data";
import { MatchResult } from "../../../utils/tollReconciliation";
import {
  resolveWizardBucket,
  isTollExcludedFromWizardBuckets,
  isOrphanPersonalMatch,
  TollBucket,
} from "../../../utils/tollBucket";
import { StepId, StepCounts, STEP_ORDER, computeStepCounts } from "../../../utils/tollPeriodGating";
import { buildPeriodTollIdSet, isClaimVisibleInPeriod, isDisputeRefundInWizardPeriod, isTollInWizardPeriod, tollWeekKey, filterTollsToWizardPeriod, assertTollInWizardPeriod } from "../../../utils/tollWeekPeriod";
import { mergeReconciledTollsForUnderpaid, buildClaimByTollId } from "../../../utils/claimByToll";
import { computeUnderpaidPipelineCounts } from "../../../utils/underpaidPipelineCounts";
import { listFullyCoveredPendingUnderpaid, listPeriodUnderpaidShortfallsForDispute } from "../../../utils/pendingUnderpaidListable";
import { isRecommendedUnlinkedShortfall } from "../../../utils/unlinkedShortfallEligibility";
import type { UnlinkedShortfallSuggestion } from "../../../hooks/useTollReconciliation";
import { toast } from "sonner";
import { Trip as TripType } from "../../../types/data";
import { api } from "../../../services/api";
import { runBackgroundJobToast } from "../../shared/runBackgroundJobToast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../ui/dialog";
import { DriverPicker } from "../../ui/DriverPicker";
import { TollAutomationSettings } from "./TollAutomationSettings";
import { RematchCandidatesQueue } from "./RematchCandidatesQueue";
import { PeriodResetDialog } from "./PeriodResetDialog";
import { TollReconBusyProvider, useTollReconBusy } from "./tollReconBusyLock";
import { StepAdvancePrompt } from "./StepAdvancePrompt";
import {
  TOLL_RECONCILIATION_PERIODS_KEY,
  useInvalidateTollReconciliationPeriods,
  type ReconciliationPeriod,
} from '../../../hooks/useTollReconciliationPeriods';
import { useFleetTimezone } from "../../../utils/timezoneDisplay";
import {
  finishBlockReason,
  runDeadheadCharge,
  runPersonalUseCharge,
} from "../../../utils/tollChargeSagas";
import {
  collectTripsForReimbursedCard,
  computeReimbursedTotals,
  computeGrossTollSpendByPlatform,
  normPlatformBucket,
  resolveTollPlatformBucket,
  type PlatformBucket,
  type TollWithLinkedTrip,
} from "../../../utils/tollFinancialOverview";
import { isTollIncludedInSpend } from "../../../utils/tollLedgerIntegrity";
import { tollReconTruncationMessage } from "../../../utils/tollReconCaps";
import { collectReadyToLinkPairs, partitionSuggestions } from "../../../utils/suggestionPartition";

type PlatformFilter = 'all' | PlatformBucket;
const PLATFORM_OPTIONS: PlatformFilter[] = ['all', 'Uber', 'InDrive', 'Roam', 'Unlinked'];

const STEP_LABELS: Record<StepId, string> = {
  'needs-review': 'Needs Review',
  'personal-use': 'Personal Use',
  deadhead: 'Deadhead',
  'underpaid-claims': 'Underpaid & Claims',
  'dispute-refunds': 'Dispute Refunds',
  'unlinked-refunds': 'Unlinked Refunds',
};

const STEP_ICONS: Record<StepId, LucideIcon> = {
  'needs-review': HelpCircle,
  'personal-use': CarFront,
  deadhead: Route,
  'underpaid-claims': DollarSign,
  'dispute-refunds': ShieldCheck,
  'unlinked-refunds': UnlinkIcon,
};

interface ReconciliationWizardProps {
  period: ReconciliationPeriod;
  driverId?: string;
  drivers: any[];
  onExit: () => void;
  /** Deep-link from Close Week readiness (?step=). */
  initialStepId?: StepId;
}

/**
 * Period-scoped, hard-gated reconciliation wizard (Phase F4). This is the
 * former (always-rendered, soft-guided) ReconciliationDashboard body,
 * relocated here and scoped to a single Monday–Sunday period: every hook
 * call, financial aggregate, and action handler below is unchanged from that
 * version except for (a) period-scoping the data hooks and claims, and (b)
 * replacing the soft-guide ReconciliationStepper/GuidedSteps with the
 * hard-gated GatedReconciliationStepper + a Next/Finish control that only
 * advances once the active step's actionable count is zero.
 */
export function ReconciliationWizard(props: ReconciliationWizardProps) {
  return (
    <TollReconBusyProvider>
      <ReconciliationWizardInner {...props} />
    </TollReconBusyProvider>
  );
}

function ReconciliationWizardInner({ period, driverId, drivers, onExit, initialStepId }: ReconciliationWizardProps) {
  const { runExclusive, busy: actionBusy, setMessage, setCancel } = useTollReconBusy();
  const handleRunTest = () => {
    if (!import.meta.env.DEV) return;
    const result = runScenarioTest();
    console.log(result);
    alert(result);
  };

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  /** TR-H7: charge-sync confirm via Dialog (not window.confirm); resolve(false) aborts. */
  const [chargeSyncPrompt, setChargeSyncPrompt] = useState<{
    resolve: (ok: boolean) => void;
  } | null>(null);
  const fleetTz = useFleetTimezone();
  const bulkAbortRef = React.useRef<AbortController | null>(null);

  const {
    loading: tollsLoading,
    loadError,
    unreconciledTolls,
    reconciledTolls,
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
    refresh
  } = useTollReconciliation(driverId, { startDate: period.startDate, endDate: period.endDate });

  const truncationMessage = tollReconTruncationMessage(truncation || {});
  const dataTruncated = Boolean(truncationMessage);

  const { claims, loading: claimsLoading, refresh: refreshClaims, createClaim, updateClaim, deleteClaim } = useClaims();
  const queryClient = useQueryClient();
  const invalidateTollPeriods = useInvalidateTollReconciliationPeriods();
  // Expenses Toll Status reads a cached weekly snapshot — rebuild it whenever
  // After mutations, refresh Expenses weeks in the background (leave-safe toast job).
  const invalidateSharedPeriods = useCallback(() => {
    invalidateTollPeriods(driverId);
    void queryClient.invalidateQueries({ queryKey: [TOLL_RECONCILIATION_PERIODS_KEY] });
    void queryClient.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
    const ids = new Set<string>();
    if (driverId) ids.add(driverId);
    for (const tx of [...unreconciledTolls, ...reconciledTolls]) {
      if (!tx?.driverId) continue;
      if (!isTollInWizardPeriod(tx, period.startDate, fleetTz)) continue;
      ids.add(String(tx.driverId));
    }
    if (ids.size === 0) return;
    void runBackgroundJobToast(
      async () => {
        for (const id of ids) {
          await api.rebuildDriverFinancialPeriods(id, period.startDate);
        }
        // Drain outbox so Expenses catches cash-wash / period projections.
        await api.processDriverFinancialOutbox(50).catch(() => undefined);
        return ids.size;
      },
      {
        loading: `Updating Expenses for ${ids.size} driver${ids.size === 1 ? '' : 's'}…`,
        success: (n) => `Expenses refreshed for ${n} driver${Number(n) === 1 ? '' : 's'}`,
        error: 'Could not refresh Driver Expenses — try again from Admin if needed',
      },
    );
  }, [
    queryClient,
    invalidateTollPeriods,
    driverId,
    period.startDate,
    fleetTz,
    unreconciledTolls,
    reconciledTolls,
  ]);

  const handleRefundMatchComplete = useCallback((event: DisputeMatchEvent) => {
    if (event.type === 'match') {
      applyDisputeMatch(event.refundId, event.tollId);
    } else if (event.type === 'bulk-unmatch') {
      for (const refundId of event.refundIds) {
        applyDisputeUnmatch(refundId);
      }
    } else {
      applyDisputeUnmatch(event.refundId);
    }
    void Promise.all([refresh(), refreshClaims()]).then(() => invalidateSharedPeriods());
  }, [applyDisputeMatch, applyDisputeUnmatch, refresh, refreshClaims, invalidateSharedPeriods]);

  const [pendingPersonalTx, setPendingPersonalTx] = React.useState<FinancialTransaction | null>(null);
  const [pendingDriverId, setPendingDriverId] = React.useState<string>('');

  // Enrich with linkedTrip from toll APIs — fetchAllTrips often misses older weeks.
  const tripMap = useMemo(() => {
    const map = new Map<string, TripType>();
    for (const t of trips) {
      if (t?.id) map.set(t.id, t);
    }
    for (const tx of [...reconciledTolls, ...unreconciledTolls] as TollWithLinkedTrip[]) {
      const lt = tx.linkedTrip;
      if (!lt?.id || map.has(lt.id)) continue;
      map.set(lt.id, {
        id: lt.id,
        platform: lt.platform || undefined,
        tollCharges: Number(lt.tollCharges) || 0,
        date: lt.date || undefined,
        dropoffTime: lt.dropoffTime || undefined,
      } as TripType);
    }
    return map;
  }, [trips, reconciledTolls, unreconciledTolls]);

  /** Blocking confirm when charge sync is OFF — Expenses/Cash Wallet will not receive the debit. */
  const confirmChargeSyncOrAbort = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.getTollAutomationSettings();
      if (res.data?.driverTollChargeSyncEnabled) return true;
      return await new Promise<boolean>((resolve) => {
        setChargeSyncPrompt({ resolve });
      });
    } catch {
      // TR-H7: fail closed — never charge when we cannot verify sync settings.
      toast.error('Could not verify charge sync settings — charge blocked. Try again or check Automation Settings.');
      return false;
    }
  }, []);

  const chargeDriverForPersonalUse = useCallback(async (
    tx: FinancialTransaction,
    opts: {
      trip?: TripType;
      reason: string;
      subject?: string;
      message?: string;
    },
  ) => {
    try {
      const result = await runPersonalUseCharge(tx, opts, {
        confirmChargeSyncOrAbort,
        reconcile,
        reject,
        unreconcile,
        createClaim: async (payload) => {
          await createClaim(payload as any);
        },
        refresh,
        refreshClaims,
        onNeedDriver: (t) => {
          setPendingPersonalTx(t);
          setPendingDriverId('');
        },
        onCancelled: () => {
          toast.message('Charge cancelled — turn on driver charge sync for Expenses/Cash Wallet parity.');
        },
        onSuccess: (msg) => toast.success(msg),
        onError: (error) => {
          console.error('Personal charge failed', error);
          toast.error('Failed to charge driver for personal toll', {
            description: error instanceof Error ? error.message : undefined,
          });
        },
      });
      if (result === 'ok' || result === 'cancelled' || result === 'need_driver') return;
    } catch (error) {
      // onError already toasted when saga failed after a queue mutation.
      throw error;
    }
  }, [reconcile, reject, unreconcile, createClaim, refresh, refreshClaims, confirmChargeSyncOrAbort]);

  const handleApprove = async (tx: FinancialTransaction) => {
      const match = suggestions.get(tx.id)?.[0];
      if (match) {
          await reconcile(tx, match.trip);
          await approve(tx, "Matched & Approved via Dashboard");
      }
  };

  const handleReject = async (tx: FinancialTransaction) => {
      const match = suggestions.get(tx.id)?.[0];
      const reason = match?.matchType === 'PERSONAL_MATCH' ? "Identified as Personal Trip" : "Rejected by Admin";
      await reject(tx, reason);
  };

  /** Cash/receipt claim is bogus — leave queue with no driver charge and no reimbursement. */
  const handleDiscardReceipt = async (tx: FinancialTransaction) => {
    try {
      await reject(tx, 'Invalid receipt — discarded');
      toast.success('Receipt discarded', {
        description: 'No driver charge. Any Uber trip refund stays available in Unlinked Refunds.',
      });
      await refresh();
    } catch (error) {
      console.error('Discard receipt failed', error);
      toast.error('Failed to discard receipt');
    }
  };

  const handleAcceptPersonal = useCallback(async (tx: FinancialTransaction) => {
      const isClaim = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
      try {
          if (isClaim) {
              await approve(tx, 'Personal toll — fleet reimbursed driver');
              toast.success('Claim approved — fleet paid driver');
          } else {
              const tollCost = Math.abs(tx.amount);
              await createClaim({
                  transactionId: tx.id,
                  driverId: tx.driverId || 'fleet',
                  amount: tollCost,
                  expectedAmount: tollCost,
                  paidAmount: 0,
                  status: 'Resolved',
                  type: 'Toll_Refund',
                  resolutionReason: 'Write Off',
                  subject: 'Personal Toll - Fleet Pays',
                  message: 'Fleet covered this personal toll.',
                  pickup: tx.description || undefined,
                  vehicleId: tx.vehicleId,
                  driverName: tx.driverName,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  date: tx.date,
              });
              await approve(tx, 'Personal toll — fleet paid (write off)');
              toast.success('Fleet paid — toll written off');
          }
          await Promise.all([refresh(), refreshClaims()]);
      } catch (error) {
          console.error('Accept personal failed', error);
          toast.error('Failed to process fleet payment');
      }
  }, [approve, createClaim, refresh, refreshClaims]);

  const handleFlag = async (tx: FinancialTransaction) => {
      const match = suggestions.get(tx.id)?.[0];
      if (match) {
          await reconcile(tx, match.trip);
          toast.success("Flagged for claim");
          refresh();
      }
  };

  const handleManualResolve = async (
      tx: FinancialTransaction,
      type: 'Personal' | 'WriteOff' | 'Business',
      driverIdOverride?: string,
  ) => {
      const resolvedDriverId = driverIdOverride || tx.driverId;
      if (type === 'Personal' && !resolvedDriverId) {
          setPendingPersonalTx(tx);
          setPendingDriverId('');
          return;
      }
      try {
          const tollCost = Math.abs(tx.amount);
          const commonData = {
              transactionId: tx.id,
              amount: tollCost,
              expectedAmount: tollCost,
              paidAmount: 0,
              status: 'Resolved' as const,
              type: 'Toll_Refund' as const,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              date: tx.date
          };

          if (type === 'Personal') {
              await chargeDriverForPersonalUse(
                driverIdOverride ? { ...tx, driverId: driverIdOverride } : tx,
                { reason: 'Manual Resolution: Personal (Driver Pays)' },
              );
              return;
          } else if (type === 'WriteOff') {
               await createClaim({
                  ...commonData,
                  driverId: tx.driverId || 'fleet',
                  resolutionReason: 'Write Off',
                  subject: 'Unmatched Toll - Write Off',
                  message: 'Fleet wrote off this expense.'
              });
              await approve(tx, 'Manual Resolution: Write Off (Fleet Pays)');
              toast.success("Written off as Fleet Loss");
          } else if (type === 'Business') {
               await createClaim({
                  ...commonData,
                  driverId: tx.driverId || 'fleet',
                  resolutionReason: 'Business Expense',
                  subject: 'Business Expense',
                  message: 'Legitimate business expense (e.g. maintenance).'
              });
              await approve(tx, 'Manual Resolution: Business Expense');
              toast.success("Marked as Business Expense");
          }

          await Promise.all([refresh(), refreshClaims()]);
      } catch (error) {
          console.error("Manual resolution failed", error);
          toast.error("Failed to resolve transaction");
      }
  };

  const handleChargePersonal = useCallback(async (tx: FinancialTransaction, match?: MatchResult) => {
    // Orphan/nearby personal: do not link the nearby trip — reject + Charge Driver claim only.
    const linkTrip = match?.trip?.id && !isOrphanPersonalMatch(match) ? match.trip : undefined;
    await chargeDriverForPersonalUse(tx, {
      trip: linkTrip,
      reason: match?.reason || 'Identified as Personal Trip',
      message: match?.reason || undefined,
    });
  }, [chargeDriverForPersonalUse]);

  const handleBulkChargePersonal = useCallback(async (
    items: Array<{ tx: FinancialTransaction; match?: MatchResult }>,
  ) => {
    const total = items.length;
    if (total === 0) return;
    const ac = new AbortController();
    bulkAbortRef.current = ac;
    setCancel(() => ac.abort());
    let done = 0;
    try {
      for (const { tx, match } of items) {
        if (ac.signal.aborted) {
          toast.message(`Stopped after ${done} of ${total}`);
          break;
        }
        setMessage(`Charging drivers… ${done + 1} of ${total}`);
        await handleChargePersonal(tx, match);
        done += 1;
        setMessage(`Charging drivers… ${done} of ${total}`);
      }
      if (!ac.signal.aborted && done === total) {
        toast.success(`Charged ${done} driver${done === 1 ? '' : 's'}`);
      }
    } finally {
      bulkAbortRef.current = null;
      setCancel(null);
    }
  }, [handleChargePersonal, setMessage, setCancel]);

  const handleEditToll = async (transactionId: string, updates: Record<string, any>) => {
      try {
          await api.editToll(transactionId, updates);
          toast.success("Transaction updated successfully");
          await refresh();
      } catch (error) {
          console.error("Edit toll failed", error);
          toast.error("Failed to update transaction");
      }
  };

  // ── Platform scoping (Uber / InDrive / Roam / Unlinked) ──────────────────
  const platformOfToll = (tx: FinancialTransaction): PlatformBucket =>
    resolveTollPlatformBucket(tx as TollWithLinkedTrip, tripMap, {
      suggestedPlatform: suggestions.get(tx.id)?.[0]?.trip?.platform,
    });
  const tripInPlatform = (t: TripType) =>
    platformFilter === 'all' || normPlatformBucket(t.platform) === platformFilter;
  const tollInPlatform = (tx: FinancialTransaction) =>
    platformFilter === 'all' || platformOfToll(tx) === platformFilter;
  const claimInPlatform = (c: any) =>
    platformFilter === 'all' ||
    normPlatformBucket(tripMap.get(c.tripId || '')?.platform) === platformFilter;

  const pTrips = platformFilter === 'all' ? trips : trips.filter(tripInPlatform);
  const pReconciled = platformFilter === 'all' ? reconciledTolls : reconciledTolls.filter(tollInPlatform);
  const pReconciledInPeriod = useMemo(
    () => pReconciled.filter((tx) => isTollInWizardPeriod(tx, period.startDate, fleetTz)),
    [pReconciled, period.startDate, fleetTz],
  );
  const pUnreconciled = platformFilter === 'all' ? unreconciledTolls : unreconciledTolls.filter(tollInPlatform);
  const pUnclaimed = platformFilter === 'all' ? unclaimedRefunds : unclaimedRefunds.filter(tripInPlatform);
  const pResolved = platformFilter === 'all' ? resolvedRefunds : resolvedRefunds.filter(tripInPlatform);

  // ── Period-scoping for claims (strict: toll/claim/trip date only — never
  // createdAt, which can bucket resolved claims into the wrong week). ───────
  const tollDateById = useMemo(() => {
    const map = new Map<string, string>();
    [...unreconciledTolls, ...reconciledTolls].forEach(tx => { if (tx?.id && tx?.date) map.set(tx.id, tx.date); });
    return map;
  }, [unreconciledTolls, reconciledTolls]);
  const periodTollIds = useMemo(
    () =>
      buildPeriodTollIdSet(
        unreconciledTolls,
        reconciledTolls,
        period.startDate,
        fleetTz,
      ),
    [unreconciledTolls, reconciledTolls, period.startDate, fleetTz],
  );
  const periodClaims = useMemo(
    () =>
      claims.filter((c: Claim) =>
        isClaimVisibleInPeriod(
          c,
          { startDate: period.startDate, endDate: period.endDate },
          tollDateById,
          fleetTz,
          periodTollIds,
        ),
      ),
    [claims, tollDateById, period.startDate, period.endDate, fleetTz, periodTollIds],
  );
  const pPeriodClaims = platformFilter === 'all' ? periodClaims : periodClaims.filter(claimInPlatform);

  const claimTollIdsForPeriod = useMemo(() => {
    const ids = new Set<string>();
    periodClaims.forEach((c) => {
      if (c.transactionId) ids.add(c.transactionId);
    });
    return ids;
  }, [periodClaims]);
  const underpaidReconciledTolls = useMemo(() => {
    const merged = mergeReconciledTollsForUnderpaid(
      pReconciledInPeriod,
      reconciledTolls,
      period.startDate,
      fleetTz,
      claimTollIdsForPeriod,
    );
    const inPeriod = filterTollsToWizardPeriod(merged, period.startDate, fleetTz);
    return platformFilter === 'all' ? inPeriod : inPeriod.filter(tollInPlatform);
  }, [pReconciledInPeriod, reconciledTolls, period.startDate, fleetTz, claimTollIdsForPeriod, platformFilter]);

  const periodClaimIds = useMemo(
    () => new Set(periodClaims.map((c) => c.id).filter(Boolean)),
    [periodClaims],
  );

  // Claimed-toll exclusion is deliberately ALL-TIME (not period-scoped): "does
  // this toll already have a claim at all" doesn't depend on which period the
  // claim's own date resolves to — matches the same rule the period
  // aggregation endpoint (toll_period_controller.tsx) uses.
  const claimedTransactionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of claims) {
      if (c.transactionId) ids.add(c.transactionId);
    }
    for (const tx of unreconciledTolls) {
      if (isTollExcludedFromWizardBuckets(tx)) ids.add(tx.id);
    }
    return ids;
  }, [claims, unreconciledTolls]);
  const filteredUnreconciledTolls = pUnreconciled.filter(tx => !claimedTransactionIds.has(tx.id));
  const allUnreconciledForGating = unreconciledTolls.filter(tx => !claimedTransactionIds.has(tx.id));

  const isLoading = tollsLoading || claimsLoading;

  const buildBuckets = useCallback((tolls: FinancialTransaction[]) => {
    const buckets: Record<TollBucket, FinancialTransaction[]> = {
      'needs-review': [], 'underpaid': [], 'deadhead': [], 'personal-use': [],
    };
    tolls.forEach(tx => {
      const best = suggestions.get(tx.id)?.[0];
      const bucket = resolveWizardBucket(tx, best);
      if (bucket) buckets[bucket].push(tx);
    });
    return buckets;
  }, [suggestions]);

  const filterBucketsToPeriod = useCallback(
    (buckets: Record<TollBucket, FinancialTransaction[]>) => ({
      'needs-review': filterTollsToWizardPeriod(buckets['needs-review'], period.startDate, fleetTz),
      underpaid: filterTollsToWizardPeriod(buckets.underpaid, period.startDate, fleetTz),
      deadhead: filterTollsToWizardPeriod(buckets.deadhead, period.startDate, fleetTz),
      'personal-use': filterTollsToWizardPeriod(buckets['personal-use'], period.startDate, fleetTz),
    }),
    [period.startDate, fleetTz],
  );

  const classified = useMemo(
    () => filterBucketsToPeriod(buildBuckets(filteredUnreconciledTolls)),
    [buildBuckets, filteredUnreconciledTolls, filterBucketsToPeriod],
  );
  const classifiedAllPlatforms = useMemo(
    () => filterBucketsToPeriod(buildBuckets(allUnreconciledForGating)),
    [buildBuckets, allUnreconciledForGating, filterBucketsToPeriod],
  );

  /** Same shortfalls as Underpaid Tolls — feed Dispute Refund "This period" matches.
   *  Must sit after `classified` (TDZ) — referencing it earlier crashed period open. */
  const periodDisputeShortfalls = useMemo(() => {
    const tripMapLocal = new Map(trips.filter((t) => t?.id).map((t) => [t.id, t]));
    const claimByTollId = buildClaimByTollId(claims);
    const reconciledTollById = new Map(
      underpaidReconciledTolls.filter((t) => t?.id).map((t) => [t.id, t]),
    );
    return listPeriodUnderpaidShortfallsForDispute({
      reconciledTolls: underpaidReconciledTolls,
      pendingUnderpaidTolls: classified.underpaid,
      suggestions,
      tripMap: tripMapLocal,
      claimByTollId,
      // Include partials too — a $10 dispute can still close a remaining shortfall.
      partialByTollId: new Set(),
      reconciledTollById,
      trips,
      disputeRefunds: disputeRefunds || [],
      periodWeekKey: period.startDate,
      fleetTz,
    });
  }, [
    underpaidReconciledTolls,
    classified.underpaid,
    suggestions,
    trips,
    claims,
    disputeRefunds,
    period.startDate,
    fleetTz,
  ]);

  const underpaidPipeline = useMemo(
    () => {
      const merged = mergeReconciledTollsForUnderpaid(
        pReconciledInPeriod,
        reconciledTolls,
        period.startDate,
        fleetTz,
        claimTollIdsForPeriod,
      );
      const reconciledForGating = filterTollsToWizardPeriod(merged, period.startDate, fleetTz);
      return computeUnderpaidPipelineCounts({
        reconciledTolls: reconciledForGating,
        periodClaims,
        allClaims: claims,
        trips,
        disputeRefunds: disputeRefunds || [],
        periodWeekKey: period.startDate,
        fleetTz,
        // Fully covered pending (netLoss ~$0) do not block Finish — offer Clear covered banner.
        pendingUnderpaidTolls: classifiedAllPlatforms.underpaid,
        suggestions,
      });
    },
    [
      pReconciledInPeriod,
      reconciledTolls,
      period.startDate,
      fleetTz,
      claimTollIdsForPeriod,
      periodClaims,
      claims,
      trips,
      disputeRefunds,
      classifiedAllPlatforms,
      suggestions,
    ],
  );

  // TR-H3: preview fully covered underpaid leftovers — never auto-write on mount.
  const coveredPendingRows = useMemo(() => {
    if (isLoading) return [] as ReturnType<typeof listFullyCoveredPendingUnderpaid>;
    const tripMapLocal = new Map(trips.filter((t) => t?.id).map((t) => [t.id, t]));
    const claimByTollId = buildClaimByTollId(claims);
    return listFullyCoveredPendingUnderpaid({
      pendingUnderpaidTolls: classifiedAllPlatforms.underpaid,
      suggestions,
      tripMap: tripMapLocal,
      claimByTollId,
      partialByTollId: new Set(),
      reconciledTollById: new Map(
        (reconciledTolls).map((t) => [t.id, t]),
      ),
      trips,
      disputeRefunds: disputeRefunds || [],
      periodWeekKey: period.startDate,
      fleetTz,
    });
  }, [
    isLoading,
    trips,
    claims,
    classifiedAllPlatforms.underpaid,
    suggestions,
    reconciledTolls,
    disputeRefunds,
    period.startDate,
    fleetTz,
  ]);

  const handleClearCoveredPending = useCallback(async () => {
    if (coveredPendingRows.length === 0) return;
    let cleared = 0;
    for (const row of coveredPendingRows) {
      try {
        await reconcile(row.transaction, row.trip);
        cleared++;
      } catch {
        /* best-effort per row */
      }
    }
    if (cleared > 0) {
      toast.success(
        cleared === 1
          ? 'Cleared 1 fully covered toll from Underpaid'
          : `Cleared ${cleared} fully covered tolls from Underpaid`,
      );
      await refresh();
    }
  }, [coveredPendingRows, reconcile, refresh]);

  // Unlinked step counts: pending-hold is actionable (policy A / TR-C1).
  const unlinkedSuggestionStatusByTripId = useMemo(() => {
    const m = new Map<string, string>();
    refundSuggestions.forEach((s, tripId) => {
      if (s?.status) m.set(tripId, s.status);
    });
    return m;
  }, [refundSuggestions]);

  const unlinkedRecommendedShortfallTripIds = useMemo(() => {
    const ids = new Set<string>();
    shortfallSuggestions.forEach((list, tripId) => {
      const trip = unclaimedRefunds.find((t) => t.id === tripId);
      const best = list[0];
      if (best && isRecommendedUnlinkedShortfall(best, trip?.platform)) ids.add(tripId);
    });
    return ids;
  }, [shortfallSuggestions, unclaimedRefunds]);

  // ── Phase F4: hard-gate counts use ALL platforms (filter is display-only) ─
  const clientStepCounts: Record<StepId, StepCounts> = useMemo(() => computeStepCounts({
    classified: classifiedAllPlatforms,
    underpaidClaims: periodClaims,
    disputeRefunds: disputeRefunds || [],
    unclaimedRefundTrips: unclaimedRefunds,
    underpaidPipeline: {
      actionable: underpaidPipeline.actionable,
      informational: underpaidPipeline.informational,
    },
    periodWeekKey: period.startDate,
    fleetTz,
    periodTollIds,
    periodClaimIds,
    unlinkedSuggestionStatusByTripId,
    unlinkedRecommendedShortfallTripIds,
  }), [
    classifiedAllPlatforms,
    periodClaims,
    disputeRefunds,
    unclaimedRefunds,
    underpaidPipeline,
    period.startDate,
    fleetTz,
    periodTollIds,
    periodClaimIds,
    unlinkedSuggestionStatusByTripId,
    unlinkedRecommendedShortfallTripIds,
  ]);

  const readinessQuery = useQuery({
    queryKey: ['toll-period-readiness', period.startDate, driverId ?? null],
    queryFn: () =>
      api.getTollPeriodReadiness(period.startDate, {
        driverId,
        clientCounts: clientStepCounts,
      }),
    staleTime: 30_000,
    enabled: !isLoading,
  });

  const stepCounts: Record<StepId, StepCounts> = useMemo(() => {
    const serverSteps = readinessQuery.data?.readiness?.steps as
      | Record<StepId, StepCounts>
      | undefined;
    if (readinessQuery.data?.authoritative && serverSteps) {
      return serverSteps;
    }
    return clientStepCounts;
  }, [clientStepCounts, readinessQuery.data]);

  const informationalWaitingTotal = useMemo(
    () => STEP_ORDER.reduce((sum, id) => sum + (stepCounts[id]?.informational || 0), 0),
    [stepCounts],
  );

  const periodScopedDisputeRefunds = useMemo(
    () =>
      (disputeRefunds || []).filter((r) =>
        isDisputeRefundInWizardPeriod(r, period.startDate, fleetTz, periodTollIds, periodClaimIds),
      ),
    [disputeRefunds, period.startDate, fleetTz, periodTollIds, periodClaimIds],
  );

  const gatedStates: GatedStepState[] = useMemo(
    () => computeGatedStepStates(stepCounts, STEP_ORDER),
    [stepCounts],
  );

  const [activeStepId, setActiveStepId] = useState<StepId>(() =>
    initialStepId && STEP_ORDER.includes(initialStepId) ? initialStepId : STEP_ORDER[0],
  );
  const hasInitializedRef = React.useRef(false);
  /** After an in-step action, stay on that step until it completes or the user picks another. */
  const holdStepRef = React.useRef<StepId | null>(null);
  const [busyUnlinkedTripId, setBusyUnlinkedTripId] = useState<string | null>(null);

  const selectStep = useCallback((id: StepId) => {
    holdStepRef.current = null;
    setActiveStepId(id);
  }, []);

  const handleUndoApply = useCallback(async (tripId: string) => {
    setBusyUnlinkedTripId(tripId);
    try {
      await undoApplyToUnderpaid(tripId);
      await refreshClaims();
      toast.success('Apply undone — trip and claim are back in sync.');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to undo apply');
      throw e;
    } finally {
      setBusyUnlinkedTripId(null);
    }
  }, [undoApplyToUnderpaid, refreshClaims]);

  // TR-H3: offer repair as an explicit action — never write on mount.
  const showRepairSplitBanner = useMemo(() => {
    const unlinked = period.counts?.['unlinked-refunds'];
    const hasUnlinkedSignal =
      (unlinked?.actionable ?? 0) > 0 || (unlinked?.informational ?? 0) > 0;
    return !isLoading && unclaimedRefunds.length > 0 && hasUnlinkedSignal;
  }, [isLoading, period.counts, unclaimedRefunds.length]);

  const handleRepairUnlinkedSplits = useCallback(async () => {
    try {
      const res = await repairUnlinkedApplySplits({ driverId: driverId || undefined });
      if (!res.repaired) {
        toast.message('No out-of-sync claims to repair');
        return;
      }
      await Promise.all([refresh(), refreshClaims()]);
      toast.success(
        res.repaired === 1
          ? 'Repaired 1 claim that was out of sync with an unlinked refund.'
          : `Repaired ${res.repaired} claims that were out of sync with unlinked refunds.`,
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to repair split state');
    }
  }, [driverId, repairUnlinkedApplySplits, refresh, refreshClaims]);

  useEffect(() => {
    if (isLoading) return;
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      // Close Week deep-link: land on requested step when unlocked.
      if (initialStepId && STEP_ORDER.includes(initialStepId)) {
        const target = gatedStates.find((s) => s.id === initialStepId);
        if (target && !target.locked) {
          setActiveStepId(initialStepId);
          return;
        }
      }
      setActiveStepId(pickInitialStep(gatedStates));
      return;
    }
    // Mid-action hold (e.g. Apply on Unlinked) — never kick the user to an earlier step
    // when a rematch re-opens Personal Use / Needs Review.
    if (holdStepRef.current) {
      return;
    }
    const activeState = gatedStates.find(s => s.id === activeStepId);
    // Re-lock guard: if the active step just became locked (an earlier step
    // regained an actionable item — e.g. a background rematch), snap back to
    // the new current step.
    if (activeState?.locked) {
      setActiveStepId(pickInitialStep(gatedStates));
    }
  }, [isLoading, gatedStates, activeStepId, initialStepId]);

  const orphanNoTripAutoChargeCount = useMemo(() => {
    return (classified['personal-use'] || []).filter((tx) => {
      const best = suggestions.get(tx.id)?.[0];
      if (!best || !isOrphanPersonalMatch(best)) return false;
      if (best.reasonCode !== 'ORPHAN_NO_TRIP') return false;
      if (!tx.driverId) return false;
      if (tx.paymentMethod === 'Cash' || tx.receiptUrl) return false;
      return true;
    }).length;
  }, [classified, suggestions]);

  // TR-M2: money block memoized; dead claimable/liability aggregates removed.
  const moneySnapshot = useMemo(() => {
    const {
      total: tollSpend,
      byPlatform: tollSpendByPlatform,
    } = computeGrossTollSpendByPlatform({
      tolls: filterTollsToWizardPeriod(
        [...pUnreconciled, ...pReconciled] as TollWithLinkedTrip[],
        period.startDate,
        fleetTz,
      ).filter(isTollIncludedInSpend),
      resolvePlatform: platformOfToll,
      unclaimedRefunds: pUnclaimed,
      resolvedRefunds: pResolved,
    });
    const periodTolls = filterTollsToWizardPeriod(
      [...pUnreconciled, ...pReconciled] as TollWithLinkedTrip[],
      period.startDate,
      fleetTz,
    ).filter(isTollIncludedInSpend);
    const reimbursedTrips = collectTripsForReimbursedCard({
      trips: pTrips,
      unclaimedRefunds: pUnclaimed,
      resolvedRefunds: pResolved,
      tolls: periodTolls,
    });
    const {
      total: reimbursedByUber,
      byPlatform: reimbursedByPlatform,
      disputeRefundAmount: scopedDisputeFromCalc,
    } = computeReimbursedTotals({
      trips: reimbursedTrips,
      disputeRefunds: disputeRefunds || [],
      period: { startDate: period.startDate, endDate: period.endDate },
      fleetTz,
      platformFilter: platformFilter === 'all' ? 'all' : platformFilter,
    });
    const chargedToDrivers = pPeriodClaims
      .filter(c => c.status === 'Resolved' && c.resolutionReason === 'Charge Driver')
      .reduce((sum, c) => sum + Math.abs(c.amount || 0), 0);
    const netTollLoss = Math.round((tollSpend - reimbursedByUber - chargedToDrivers) * 100) / 100;
    const eventsNet =
      typeof period.financials?.eventsNetTollLoss === 'number'
        ? period.financials.eventsNetTollLoss
        : null;
    const identityResidual =
      platformFilter !== 'all'
        ? undefined
        : eventsNet == null
          ? 0
          : Math.round((netTollLoss - eventsNet) * 100) / 100;
    const resolvedRefundsAmount = pResolved.reduce((sum, t) => sum + (t.tollCharges || 0), 0);
    return {
      tollSpend,
      tollSpendByPlatform,
      reimbursedByUber,
      reimbursedByPlatform,
      scopedDisputeFromCalc,
      chargedToDrivers,
      netTollLoss,
      identityResidual,
      resolvedRefundsAmount,
    };
  }, [
    pUnreconciled,
    pReconciled,
    pUnclaimed,
    pResolved,
    pTrips,
    pPeriodClaims,
    disputeRefunds,
    period.startDate,
    period.endDate,
    period.financials,
    fleetTz,
    platformFilter,
  ]);

  if (isLoading) {
    return (
        <div className="flex h-64 items-center justify-center" role="status" aria-live="polite">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-500">Analyzing toll data...</span>
        </div>
    );
  }

  // TR-M12: never render an empty-clean week on hard load failure.
  if (loadError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onExit} className="-ml-2 text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Periods
        </Button>
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 py-16 text-rose-800"
          role="alert"
        >
          <p className="text-sm font-medium">Could not load this week’s tolls.</p>
          <p className="max-w-md text-center text-xs text-rose-600">
            {loadError}. Finish is disabled until data loads successfully — this is not a clean week.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            className="mt-1 border-rose-200 text-rose-700 hover:bg-rose-100"
          >
            <RefreshCw className="h-4 w-4 mr-2" aria-hidden /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const {
    tollSpend,
    tollSpendByPlatform,
    reimbursedByUber,
    reimbursedByPlatform,
    scopedDisputeFromCalc,
    chargedToDrivers,
    netTollLoss,
    identityResidual,
    resolvedRefundsAmount,
  } = moneySnapshot;

  const needsReviewCount = STEP_ORDER.reduce(
    (sum, id) => sum + (stepCounts[id]?.actionable || 0),
    0,
  );
  const tollsNeedingReviewCount =
    (stepCounts['needs-review']?.actionable || 0) +
    (stepCounts['personal-use']?.actionable || 0) +
    (stepCounts['deadhead']?.actionable || 0) +
    (stepCounts['underpaid-claims']?.actionable || 0);
  const refundsNeedingReviewCount =
    (stepCounts['dispute-refunds']?.actionable || 0) +
    (stepCounts['unlinked-refunds']?.actionable || 0);

  const needsReviewReadyPairs = collectReadyToLinkPairs(
    partitionSuggestions(classified['needs-review'] || [], suggestions, 'needs-review').suggestions,
    suggestions,
  );
  const highConfidenceCount = needsReviewReadyPairs.length;

  const handleSmartReconcile = async (tx: FinancialTransaction, trip: TripType) => {
      if (!trip?.id) {
          await chargeDriverForPersonalUse(tx, {
            reason: 'Identified as Personal Trip',
          });
          return;
      }

      const match = suggestions.get(tx.id)?.find(m => m.trip.id === trip.id);

      if (match?.matchType === 'PERSONAL_MATCH') {
          await chargeDriverForPersonalUse(tx, {
            trip,
            reason: 'Identified as Personal Trip',
            message: `System identified this toll as personal usage during trip ${trip.id}.`,
          });
      } else {
          await reconcile(tx, trip);
          toast.success("Transaction Linked Successfully");
      }
  };

  /**
   * Deadhead-only: bill an enroute-to-pickup toll to the driver instead of
   * the fleet absorbing it (the step's default via handleApprove). Same
   * shape as handleSmartReconcile's PERSONAL_MATCH branch — reconcile the
   * toll to its trip, then a resolved "Charge Driver" claim.
   *
   * If the claim fails after reconcile, unmatch so the toll stays in
   * Deadhead (avoids "complete" + charge-failed toast contradiction).
   */
  const handleChargeDriverForDeadhead = async (tx: FinancialTransaction, match: MatchResult) => {
      await runDeadheadCharge(tx, match.trip, {
          confirmChargeSyncOrAbort,
          reconcile,
          unreconcile,
          createClaim: async (payload) => {
              await createClaim(payload as any);
          },
          refresh,
          refreshClaims,
          onNoDriver: () => toast.error('Cannot charge deadhead toll — no driver on this trip'),
          onCancelled: () =>
              toast.message('Charge cancelled — turn on driver charge sync for Expenses/Cash Wallet parity.'),
          onSuccess: () => toast.success('Deadhead toll charged to driver'),
          onError: (e) =>
              toast.error('Failed to charge driver for deadhead toll', {
                  description: e instanceof Error ? e.message : undefined,
              }),
          onRollbackFailed: (e) =>
              toast.error('Charge failed and could not undo the trip link — unmatch this toll manually', {
                  description: e instanceof Error ? e.message : undefined,
              }),
      });
  };

  const activeState = gatedStates.find(s => s.id === activeStepId) ?? gatedStates[0];
  const isLastStep = activeStepId === STEP_ORDER[STEP_ORDER.length - 1];
  const allStepsComplete = gatedStates.every((s) => s.complete);
  const canAdvance = activeState.actionable === 0;
  const activeStepIdx = STEP_ORDER.indexOf(activeStepId);
  const nextStepId = STEP_ORDER[activeStepIdx + 1];
  const nextStepLabel = nextStepId ? STEP_LABELS[nextStepId] : undefined;

  // Show continue/finish whenever the active step has no actionable work left
  // (including empty Needs Review / Personal Use / Deadhead — user still needs Next).
  const showAdvancePrompt =
    canAdvance || (allStepsComplete && activeStepId === 'underpaid-claims');

  const bucketStepIds: StepId[] = ['needs-review', 'personal-use', 'deadhead'];
  const isBucketStepEmpty =
    bucketStepIds.includes(activeStepId) &&
    (activeStepId === 'needs-review' ? classified['needs-review'] :
      activeStepId === 'personal-use' ? classified['personal-use'] :
      classified['deadhead']).length === 0;
  // Empty bucket panels already show a compact CTA — skip the duplicate bottom banner.
  const showBottomAdvancePrompt = showAdvancePrompt && !isBucketStepEmpty;

  const handleNext = () => {
    holdStepRef.current = null;
    const idx = STEP_ORDER.indexOf(activeStepId);
    setActiveStepId(STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)]);
  };

  const handleFinish = async () => {
    const block = finishBlockReason({
      loadError,
      dataTruncated,
      platformFilter,
      identityResidual,
      allPlatformActionable: STEP_ORDER.reduce((sum, id) => sum + (stepCounts[id]?.actionable || 0), 0),
    });
    if (block === 'load_error') {
      toast.error('Week data failed to load', {
        description: 'Retry loading before marking this week reviewed.',
      });
      return;
    }
    if (block === 'truncated') {
      toast.error('Period data is truncated', {
        description: 'Narrow the scope or raise fetch caps before marking this week reviewed.',
      });
      return;
    }
    if (block === 'identity_residual') {
      toast.error('Money cards do not reconcile', {
        description: `Cards vs ledger events differ by $${Math.abs(identityResidual!).toFixed(2)}. Resolve the gap before finishing.`,
      });
      return;
    }
    if (block === 'cross_platform_actionable') {
      toast.error('Still open items on other platforms', {
        description: 'Clear the platform filter to All and finish remaining steps before closing this period.',
      });
      return;
    }
    try {
      await api.finishTollReconciliationPeriod(period.startDate);
    } catch (e: any) {
      const blockers = e?.data?.readiness?.blockers;
      const blockerHint =
        Array.isArray(blockers) && blockers.length > 0
          ? blockers.map((b: { code?: string }) => b.code).filter(Boolean).join(', ')
          : e?.message || 'Server refused finish';
      toast.error('Could not mark week reviewed', { description: String(blockerHint) });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: [TOLL_RECONCILIATION_PERIODS_KEY] });
    invalidateSharedPeriods();
    toast.success(`Week ${period.label} marked reviewed`, {
      description: 'Seal and unlock payouts from Close Week when ready.',
      action: {
        label: 'Close Week',
        onClick: () => {
          if (typeof window === 'undefined') return;
          const path = `/close-week?week=${encodeURIComponent(period.startDate)}`;
          window.history.pushState({ page: 'close-week', weekKey: period.startDate }, '', path);
          window.dispatchEvent(new PopStateEvent('popstate'));
        },
      },
    });
    onExit();
  };

  const renderAdvancePrompt = (compact = false) => (
    <StepAdvancePrompt
      currentStepLabel={STEP_LABELS[activeStepId]}
      nextStepLabel={nextStepLabel}
      isLastStep={isLastStep}
      onAdvance={isLastStep ? handleFinish : handleNext}
      informationalWaitingCount={isLastStep ? informationalWaitingTotal : 0}
      compact={compact}
    />
  );

  const handleApplyUnlinkedShortfall = async (
    tripId: string,
    suggestion: UnlinkedShortfallSuggestion,
    opts?: {
      acknowledgedPlatformMismatch?: boolean;
      forceSingleTarget?: boolean;
      applyShare?: number;
      targets?: Array<{ claimId?: string | null; tollId?: string | null; share?: number }>;
    },
  ) => {
    const targets = opts?.targets;
    const tollIds = targets?.map((t) => t.tollId).filter(Boolean) as string[] | undefined;
    const checkIds = tollIds?.length ? tollIds : suggestion.tollId ? [suggestion.tollId] : [];
    for (const tollId of checkIds) {
      const targetToll =
        reconciledTolls.find((t) => t.id === tollId) ||
        unreconciledTolls.find((t) => t.id === tollId);
      if (targetToll) {
        const periodCheck = assertTollInWizardPeriod(targetToll, period.startDate, fleetTz);
        if (!periodCheck.ok) {
          // Throw so UnclaimedRefundsList does not show a false success toast.
          throw new Error(
            `This toll belongs to ${periodCheck.weekLabel}. Switch to that period to apply.`,
          );
        }
      }
    }
    holdStepRef.current = 'unlinked-refunds';
    await applyUnlinkedToClaim(tripId, {
      claimId: suggestion.claimId,
      tollId: suggestion.tollId,
      applyShare: opts?.applyShare ?? suggestion.proposedShare,
      forceSingleTarget: opts?.forceSingleTarget,
      targets: opts?.targets,
      acknowledgedPlatformMismatch: opts?.acknowledgedPlatformMismatch,
    });
    await Promise.all([refresh(), refreshClaims()]);
    invalidateSharedPeriods();
  };

  /** One action at a time — blocks the whole wizard UI while money/match work runs. */
  const lock =
    <A extends unknown[]>(label: string, fn: (...args: A) => Promise<unknown>) =>
    (...args: A) =>
      runExclusive(label, () => fn(...args) as Promise<unknown>);

  const lockedApprove = lock('Matching toll…', handleApprove);
  const lockedReject = lock('Updating toll…', handleReject);
  const lockedDiscardReceipt = lock('Discarding receipt…', handleDiscardReceipt);
  const lockedAcceptPersonal = lock('Saving personal toll…', handleAcceptPersonal);
  const lockedFlag = lock('Flagging toll…', handleFlag);
  const lockedManualResolve = lock('Resolving toll…', handleManualResolve);
  const lockedChargePersonal = lock('Charging driver…', handleChargePersonal);
  const lockedBulkChargePersonal = lock('Charging drivers…', handleBulkChargePersonal);
  const lockedEditToll = lock('Saving toll…', handleEditToll);
  const lockedChargeDeadhead = lock('Charging driver…', handleChargeDriverForDeadhead);
  const lockedSmartReconcile = lock('Matching toll…', handleSmartReconcile);
  const lockedUndoApply = lock('Undoing apply…', handleUndoApply);
  const lockedApplyShortfall = lock('Applying credit to underpaid…', handleApplyUnlinkedShortfall);
  const lockedResolveRefund = lock('Resolving refund…', resolveRefund);
  const lockedBulkResolve = lock('Resolving refunds…', bulkResolveRefunds);
  const lockedUndoRefund = lock('Undoing refund…', undoRefund);
  const lockedAutoMatch = lock('Linking trips…', async (
    pairs?: Array<{ transactionId: string; tripId: string }>,
  ) => {
    await autoMatchAll(pairs && pairs.length > 0 ? pairs : needsReviewReadyPairs);
  });
  const lockedRefresh = lock('Refreshing…', async () => {
    await refresh({ autoMatch: true });
  });
  const lockedClearCovered = lock('Clearing covered tolls…', handleClearCoveredPending);
  const lockedRepairSplits = lock('Repairing claim sync…', handleRepairUnlinkedSplits);

  const lockedAutoChargePersonal = lock('Auto-charging personal…', async () => {
    try {
      const dry = await api.autoChargePersonalUse({
        startDate: period.startDate,
        endDate: period.endDate,
        dryRun: true,
        batchSize: 25,
      });
      if (!dry.wouldCharge && !dry.candidateCount) {
        toast.message(dry.message || 'Nothing to auto-charge');
        return;
      }
      const apply = await api.autoChargePersonalUse({
        startDate: period.startDate,
        endDate: period.endDate,
        dryRun: false,
        batchSize: 25,
      });
      toast.success(apply.message || `Charged ${apply.charged ?? 0} personal toll(s)`);
      await Promise.all([refresh(), refreshClaims()]);
    } catch (e: any) {
      toast.error(e?.message || 'Auto-charge personal failed');
    }
  });
  const lockedCreateClaim = lock('Saving claim…', createClaim);
  const lockedUpdateClaim = lock('Updating claim…', updateClaim);
  const lockedDeleteClaim = lock('Removing claim…', deleteClaim);
  const lockedUnreconcile = lock('Unmatching…', unreconcile);
  const lockedRefundMatch = lock('Updating dispute match…', async (event: DisputeMatchEvent) => {
    if (event.type === 'match') {
      applyDisputeMatch(event.refundId, event.tollId);
    } else if (event.type === 'bulk-unmatch') {
      for (const refundId of event.refundIds) {
        applyDisputeUnmatch(refundId);
      }
    } else {
      applyDisputeUnmatch(event.refundId);
    }
    await Promise.all([refresh(), refreshClaims()]);
    invalidateSharedPeriods();
  });

  return (
    <TooltipProvider>
    <div className={`space-y-6 ${actionBusy ? 'select-none' : ''}`}>
      {truncationMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {truncationMessage}
        </div>
      )}
      {coveredPendingRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span>
            {coveredPendingRows.length === 1
              ? '1 underpaid toll is already fully covered by a trip refund — review and clear it.'
              : `${coveredPendingRows.length} underpaid tolls are already fully covered by trip refunds — review and clear them.`}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={actionBusy}
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-100"
            onClick={() => void lockedClearCovered()}
          >
            Clear covered ({coveredPendingRows.length})
          </Button>
        </div>
      )}
      {showRepairSplitBanner && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
          <span>
            Some claims may be out of sync with unlinked refunds. Preview and repair before finishing.
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={actionBusy}
            onClick={() => void lockedRepairSplits()}
          >
            Repair claim sync
          </Button>
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <Button variant="ghost" size="sm" onClick={onExit} disabled={actionBusy} className="-ml-2 mb-1 text-slate-500 hover:text-slate-700">
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back to Periods
            </Button>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{period.label}</h2>
            <p className="text-slate-500">Match toll expenses with trip refunds to identify leakage.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-sm"
              role="radiogroup"
              aria-label="Platform filter"
            >
                {PLATFORM_OPTIONS.map(p => (
                    <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={platformFilter === p}
                        onClick={() => setPlatformFilter(p)}
                        className={`h-8 rounded px-2.5 text-xs font-medium transition-colors ${
                            platformFilter === p
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-600 hover:bg-slate-100'
                        }`}
                    >
                        {p === 'all' ? 'All' : p}
                    </button>
                ))}
            </div>
            {import.meta.env.DEV && (
            <Button variant="ghost" size="sm" onClick={handleRunTest} className="text-slate-400 hover:text-slate-600">
                Test
            </Button>
            )}
            {/* TR-M7: Link-all lives in Suggestions panel only — header duplicate removed */}
            {activeStepId === 'personal-use' && orphanNoTripAutoChargeCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void lockedAutoChargePersonal()}
                  disabled={actionBusy}
                  className="border-purple-300 text-purple-700 hover:bg-purple-50"
                >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Auto-charge personal {orphanNoTripAutoChargeCount}
                </Button>
            )}
            <TollAutomationSettings onChanged={refresh} />
            <Button
              variant="outline"
              size="sm"
              className="text-red-700 border-red-200 hover:bg-red-50"
              disabled={actionBusy}
              onClick={() => setResetDialogOpen(true)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Period
            </Button>
            <Button variant="outline" size="sm" disabled={actionBusy} onClick={() => void lockedRefresh()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
            </Button>
        </div>
      </div>

      {/* Financial Overview Cards — hidden when truncated (TR-M5) */}
      {!dataTruncated && (
      <TollFinancialOverviewCards
        tollSpend={tollSpend}
        tollSpendByPlatform={tollSpendByPlatform}
        reimbursedAmount={reimbursedByUber}
        reimbursedByPlatform={reimbursedByPlatform}
        reimbursedLabelSuffix={platformFilter !== 'all' ? ` · ${platformFilter}` : undefined}
        scopedDisputeRefund={scopedDisputeFromCalc}
        chargedToDrivers={chargedToDrivers}
        netTollLoss={netTollLoss}
        identityResidual={identityResidual}
        filteredView={platformFilter !== 'all'}
        needsReviewCount={needsReviewCount}
        tollsNeedingReviewCount={tollsNeedingReviewCount}
        refundsNeedingReviewCount={refundsNeedingReviewCount}
        resolvedRefundsAmount={resolvedRefundsAmount}
      />
      )}

      {autoReconciledCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
          <Wand2 className="h-4 w-4 shrink-0" />
          <span>
            <strong>{autoReconciledCount}</strong> toll{autoReconciledCount === 1 ? ' was' : 's were'} auto-matched to trips this session.{' '}
            <span className="text-indigo-500">View under Underpaid & Claims → History.</span>
          </span>
        </div>
      )}

      {/* MOI-5: already-resolved tolls flagged for a second look — cuts across
          steps, so it stays a banner above the stepper rather than a step. */}
      <RematchCandidatesQueue driverId={driverId} enabled={!isLoading} />

      <div className="space-y-4">
        <GatedReconciliationStepper
          states={gatedStates}
          activeStepId={activeStepId}
          onSelect={actionBusy ? () => undefined : selectStep}
          labels={STEP_LABELS}
          icons={STEP_ICONS}
        />

        <div className="pt-2">
          {activeStepId === 'needs-review' && (
            <TollBucketPanel
              tolls={classified['needs-review']}
              suggestions={suggestions}
              allTrips={trips}
              drivers={drivers}
              unifiedPeriodView
              onReconcile={lockedSmartReconcile}
              onApprove={lockedApprove}
              onReject={lockedReject}
              onAcceptPersonal={lockedAcceptPersonal}
              onFlag={lockedFlag}
              onManualResolve={lockedManualResolve}
              onEdit={lockedEditToll}
              onBulkLinkReady={lockedAutoMatch}
              advancePrompt={showAdvancePrompt ? renderAdvancePrompt(true) : undefined}
              emptyState={{ icon: HelpCircle, title: "No tolls pending review", description: "There are no tolls needing review this period." }}
              listTitle="Needs Review"
              listDescription="Toll charges with no clear trip link, or where multiple trips compete — pick the correct trip first."
            />
          )}
          {activeStepId === 'personal-use' && (
            <TollBucketPanel
              tolls={classified['personal-use']}
              suggestions={suggestions}
              allTrips={trips}
              drivers={drivers}
              unifiedPeriodView
              stepId="personal-use"
              onReconcile={lockedSmartReconcile}
              onApprove={lockedApprove}
              onReject={lockedReject}
              onDiscardReceipt={lockedDiscardReceipt}
              onAcceptPersonal={lockedAcceptPersonal}
              onFlag={lockedFlag}
              onManualResolve={lockedManualResolve}
              onChargePersonal={lockedChargePersonal}
              onBulkChargePersonal={lockedBulkChargePersonal}
              onEdit={lockedEditToll}
              advancePrompt={showAdvancePrompt ? renderAdvancePrompt(true) : undefined}
              emptyState={{ icon: CarFront, title: "No personal use tolls this period", description: "No tolls were classified as personal driver use." }}
              listTitle="Personal Use"
              listDescription="Charge the driver for personal tolls, or have the fleet cover the cost."
            />
          )}
          {activeStepId === 'deadhead' && (
            <TollBucketPanel
              tolls={classified['deadhead']}
              suggestions={suggestions}
              allTrips={trips}
              drivers={drivers}
              unifiedPeriodView
              stepId="deadhead"
              onReconcile={lockedSmartReconcile}
              onApprove={lockedApprove}
              onReject={lockedReject}
              onDiscardReceipt={lockedDiscardReceipt}
              onAcceptPersonal={lockedAcceptPersonal}
              onFlag={lockedFlag}
              onManualResolve={lockedManualResolve}
              onEdit={lockedEditToll}
              onChargeDriver={lockedChargeDeadhead}
              approveLabel="Acknowledge (Fleet Cost)"
              advancePrompt={showAdvancePrompt ? renderAdvancePrompt(true) : undefined}
              emptyState={{ icon: Route, title: "No deadhead tolls this period", description: "No unreimbursed business driving tolls detected." }}
              listTitle="Deadhead"
              listDescription="Unreimbursed business driving (en route to pickup) — normally a fleet cost, but chargeable to the driver on a case-by-case basis."
            />
          )}
          {activeStepId === 'dispute-refunds' && (
            <DisputeRefundsList
              refunds={periodScopedDisputeRefunds}
              onMatchComplete={lockedRefundMatch}
              activePeriodStart={period.startDate}
              activePeriodEnd={period.endDate}
              periodShortfalls={periodDisputeShortfalls}
            />
          )}
          {activeStepId === 'unlinked-refunds' && (
            <UnclaimedRefundsList
              trips={pUnclaimed}
              suggestions={refundSuggestions}
              shortfallSuggestions={shortfallSuggestions}
              drivers={drivers}
              onResolve={lockedResolveRefund}
              onBulkResolve={lockedBulkResolve}
              onApplyToShortfall={lockedApplyShortfall}
            />
          )}
          {activeStepId === 'underpaid-claims' && (
            <UnderpaidClaimsStep
              claims={pPeriodClaims}
              allClaims={claims}
              reconciledTolls={underpaidReconciledTolls}
              pendingUnderpaidTolls={classified.underpaid}
              suggestions={suggestions}
              tollLookup={reconciledTolls}
              trips={trips}
              disputeRefunds={disputeRefunds}
              unlinkedRefundTrips={unclaimedRefunds}
              periodWeekKey={period.startDate}
              periodLabel={period.label}
              fleetTz={fleetTz}
              drivers={drivers}
              loadingTolls={tollsLoading}
              loadingClaims={claimsLoading}
              createClaim={lockedCreateClaim}
              updateClaim={lockedUpdateClaim}
              rawCreateClaim={createClaim}
              rawUpdateClaim={updateClaim}
              deleteClaim={lockedDeleteClaim}
              rawDeleteClaim={deleteClaim}
              refreshClaims={refreshClaims}
              onUndoUnlinkedApply={lockedUndoApply}
              busyUnlinkedTripId={busyUnlinkedTripId}
              historyAudit={{
                resolvedRefundTrips: pResolved,
                onUndoRefund: lockedUndoRefund,
                matchedTolls: pReconciledInPeriod,
                reconciledTolls: reconciledTolls,
                onUnmatch: lockedUnreconcile,
                selectedDriverId: driverId || '',
                periodStartDate: period.startDate,
                periodEndDate: period.endDate,
              }}
            />
          )}
        </div>

        {showBottomAdvancePrompt && (
          <div className="pt-4">
            {renderAdvancePrompt()}
          </div>
        )}
      </div>

      <Dialog open={!!pendingPersonalTx} onOpenChange={(o) => { if (!o) setPendingPersonalTx(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign a driver</DialogTitle>
            <DialogDescription>
              Charging a toll to a driver requires a real driver. Select who is responsible for this toll.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <DriverPicker
              drivers={drivers.map((d) => ({ id: d.id, name: d.name }))}
              value={pendingDriverId}
              onChange={setPendingDriverId}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingPersonalTx(null)}>Cancel</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={!pendingDriverId || actionBusy}
              onClick={() => {
                const tx = pendingPersonalTx;
                const driverIdForCharge = pendingDriverId;
                setPendingPersonalTx(null);
                if (tx && driverIdForCharge) {
                  void runExclusive('Charging driver…', () =>
                    chargeDriverForPersonalUse(
                      { ...tx, driverId: driverIdForCharge },
                      { reason: 'Manual Resolution: Personal (Driver Pays)' },
                    ),
                  );
                }
              }}
            >
              Charge driver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!chargeSyncPrompt}
        onOpenChange={(o) => {
          if (!o && chargeSyncPrompt) {
            chargeSyncPrompt.resolve(false);
            setChargeSyncPrompt(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Charge sync is off</DialogTitle>
            <DialogDescription>
              This will record a claim only — it will not post to Expenses or Cash Wallet.
              Enable “Sync charges to driver financials” (and Unified toll settlement) in Automation
              Settings for production parity.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                chargeSyncPrompt?.resolve(false);
                setChargeSyncPrompt(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={() => {
                toast.warning(
                  'Driver charge recorded as claim only — enable charge sync in Automation to post wallet debits.',
                );
                chargeSyncPrompt?.resolve(true);
                setChargeSyncPrompt(null);
              }}
            >
              Continue with claim-only
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PeriodResetDialog
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        period={period}
        drivers={drivers.map((d) => ({ id: d.id, name: d.name }))}
        preselectedDriverId={driverId}
        onComplete={() => {
          invalidateSharedPeriods();
          // Back to period list so Outstanding/Completed counts refresh after undo.
          onExit();
        }}
      />
    </div>
    </TooltipProvider>
  );
}

