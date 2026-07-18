import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { TooltipProvider } from "../../ui/tooltip";
import { DRIVER_FINANCIAL_PERIODS_KEY } from '../../../hooks/useDriverFinancialPeriods';
import { TollBucketPanel } from "./TollBucketPanel";
import { TollFinancialOverviewCards } from "./TollFinancialOverviewCards";
import { UnderpaidClaimsStep } from "./UnderpaidClaimsStep";
import { DisputeRefundsList, DisputeMatchEvent } from "./DisputeRefundsList";
import { UnclaimedRefundsList } from "./UnclaimedRefundsList";
import { ReconciledTollsList } from "./ReconciledTollsList";
import { ResolvedRefundsList, ResolvedRefundRow } from "./ResolvedRefundsList";
import { GatedReconciliationStepper, computeGatedStepStates, pickInitialStep, GatedStepState } from "./GatedReconciliationStepper";
import { useTollReconciliation } from "../../../hooks/useTollReconciliation";
import { useClaims } from "../../../hooks/useClaims";
import {
  Loader2, RefreshCw, Wand2, DollarSign, HelpCircle,
  CarFront, Route, ShieldCheck, Unlink as UnlinkIcon, History as HistoryIcon, ArrowLeft, RotateCcw, type LucideIcon,
} from "lucide-react";
import { Button } from "../../ui/button";
import { runScenarioTest } from "../../../utils/testScenario";
import { UnifiedTollActivityTable } from "./UnifiedTollActivityTable";
import { FinancialTransaction, Claim } from "../../../types/data";
import { MatchResult, calculateTollFinancials, buildTollFinancialsContext, buildTripRefundAllocation, spentUnlinkedCreditsByTripId } from "../../../utils/tollReconciliation";
import {
  resolveWizardBucket,
  isTollExcludedFromWizardBuckets,
  isOrphanPersonalMatch,
  TollBucket,
} from "../../../utils/tollBucket";
import { StepId, StepCounts, STEP_ORDER, computeStepCounts } from "../../../utils/tollPeriodGating";
import { buildPeriodTollIdSet, isClaimVisibleInPeriod, isTollInWizardPeriod, tollWeekKey, filterTollsToWizardPeriod, assertTollInWizardPeriod } from "../../../utils/tollWeekPeriod";
import { mergeReconciledTollsForUnderpaid, buildClaimByTollId } from "../../../utils/claimByToll";
import { computeUnderpaidPipelineCounts } from "../../../utils/underpaidPipelineCounts";
import { listFullyCoveredPendingUnderpaid } from "../../../utils/pendingUnderpaidListable";
import { isRecommendedUnlinkedShortfall } from "../../../utils/unlinkedShortfallEligibility";
import type { UnlinkedShortfallSuggestion } from "../../../hooks/useTollReconciliation";
import { toast } from "sonner@2.0.3";
import { Trip as TripType } from "../../../types/data";
import { api } from "../../../services/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../ui/dialog";
import { DriverPicker } from "../../ui/DriverPicker";
import { TollAutomationSettings } from "./TollAutomationSettings";
import { RematchCandidatesQueue } from "./RematchCandidatesQueue";
import { PeriodResetDialog } from "./PeriodResetDialog";
import { TollReconBusyProvider, useTollReconBusy } from "./tollReconBusyLock";
import { StepAdvancePrompt } from "./StepAdvancePrompt";
import { normalizePlatform } from "../../../utils/normalizePlatform";
import { ReconciliationPeriod } from "../../../hooks/useTollReconciliationPeriods";
import { useFleetTimezone } from "../../../utils/timezoneDisplay";
import {
  computeReimbursedTotals,
  computeTollSpendByPlatform,
  normPlatformBucket,
  type PlatformBucket,
} from "../../../utils/tollFinancialOverview";

type PlatformFilter = 'all' | 'Uber' | 'InDrive' | 'Roam';
const PLATFORM_OPTIONS: PlatformFilter[] = ['all', 'Uber', 'InDrive', 'Roam'];

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

function ReconciliationWizardInner({ period, driverId, drivers, onExit }: ReconciliationWizardProps) {
  const { runExclusive, busy: actionBusy } = useTollReconBusy();
  const handleRunTest = () => {
    const result = runScenarioTest();
    console.log(result);
    alert(result);
  };

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const fleetTz = useFleetTimezone();

  const {
    loading: tollsLoading,
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
    refresh
  } = useTollReconciliation(driverId, { startDate: period.startDate, endDate: period.endDate });

  const { claims, loading: claimsLoading, refresh: refreshClaims, createClaim, updateClaim, deleteClaim } = useClaims();
  const queryClient = useQueryClient();
  // Expenses Toll Status reads a cached weekly snapshot — rebuild it whenever
  // reconciliation mutates this period (otherwise Completed weeks stay "Unmatched").
  const invalidateSharedPeriods = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
    const ids = new Set<string>();
    if (driverId) ids.add(driverId);
    for (const tx of [...unreconciledTolls, ...reconciledTolls, ...allReconciledTolls]) {
      if (!tx?.driverId) continue;
      if (!isTollInWizardPeriod(tx, period.startDate, fleetTz)) continue;
      ids.add(String(tx.driverId));
    }
    for (const id of ids) {
      void api.rebuildDriverFinancialPeriods(id, period.startDate).catch(() => undefined);
    }
  }, [
    queryClient,
    driverId,
    period.startDate,
    fleetTz,
    unreconciledTolls,
    reconciledTolls,
    allReconciledTolls,
  ]);

  const handleRefundMatchComplete = useCallback((event: DisputeMatchEvent) => {
    if (event.type === 'match') {
      applyDisputeMatch(event.refundId, event.tollId);
    } else {
      applyDisputeUnmatch(event.refundId);
    }
    void Promise.all([refresh(), refreshClaims()]).then(() => invalidateSharedPeriods());
  }, [applyDisputeMatch, applyDisputeUnmatch, refresh, refreshClaims, invalidateSharedPeriods]);

  const [pendingPersonalTx, setPendingPersonalTx] = React.useState<FinancialTransaction | null>(null);
  const [pendingDriverId, setPendingDriverId] = React.useState<string>('');

  const tripMap = useMemo(() => new Map(trips.map(t => [t.id, t])), [trips]);

  /** Blocking confirm when charge sync is OFF — Expenses/Cash Wallet will not receive the debit. */
  const confirmChargeSyncOrAbort = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.getTollAutomationSettings();
      if (res.data?.driverTollChargeSyncEnabled) return true;
      const proceed = window.confirm(
        'Driver toll charge sync is OFF.\n\n' +
          'This will record a claim only — it will NOT post to Expenses or Cash Wallet.\n\n' +
          'Enable “Sync charges to driver financials” (and Unified toll settlement) in Automation Settings for production parity.\n\n' +
          'Continue with claim-only?',
      );
      if (!proceed) return false;
      toast.warning(
        'Driver charge recorded as claim only — enable charge sync in Automation to post wallet debits.',
      );
      return true;
    } catch {
      return true; // don't block if settings fetch fails
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
    const resolvedDriverId = opts.trip?.driverId || tx.driverId;
    if (!resolvedDriverId) {
      setPendingPersonalTx(tx);
      setPendingDriverId('');
      return;
    }
    if (!(await confirmChargeSyncOrAbort())) {
      toast.message('Charge cancelled — turn on driver charge sync for Expenses/Cash Wallet parity.');
      return;
    }
    try {
      const tollCost = Math.abs(tx.amount);
      const isCashClaim = tx.paymentMethod === 'Cash' || !!tx.receiptUrl;
      let linkedOrRejected = false;
      try {
        if (opts.trip?.id) {
          await reconcile(tx, opts.trip);
          linkedOrRejected = true;
        } else {
          await reject(tx, opts.reason);
          linkedOrRejected = true;
        }
        await createClaim({
          transactionId: tx.id,
          driverId: resolvedDriverId,
          amount: tollCost,
          expectedAmount: tollCost,
          paidAmount: 0,
          status: 'Resolved',
          type: 'Toll_Refund',
          resolutionReason: 'Charge Driver',
          subject: opts.subject || (isCashClaim
            ? 'Cash Personal Toll - Charged to Driver'
            : 'Unmatched Toll - Personal Use'),
          message: opts.message || (isCashClaim
            ? 'Driver used trip cash for a personal toll — charged to driver (no reimbursement).'
            : 'This toll was identified as personal usage and charged to your account.'),
          tripId: opts.trip?.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          date: tx.date,
        });
        await Promise.all([refresh(), refreshClaims()]);
        toast.success(
          isCashClaim
            ? 'Cash personal toll charged to driver'
            : opts.trip?.id
              ? 'Linked to trip & charged to driver'
              : 'Marked as personal (driver liability)',
        );
      } catch (error) {
        // Charge failed after queue mutation — put the toll back so the step stays open.
        if (linkedOrRejected && opts.trip?.id) {
          try {
            await unreconcile({ ...tx, tripId: opts.trip.id, isReconciled: true });
            await refresh();
          } catch (rollbackErr) {
            console.error('Personal charge rollback failed', rollbackErr);
          }
        } else if (linkedOrRejected) {
          await refresh();
        }
        throw error;
      }
    } catch (error) {
      console.error('Personal charge failed', error);
      toast.error('Failed to charge driver for personal toll', {
        description: error instanceof Error ? error.message : undefined,
      });
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

  // ── Platform scoping (Uber / InDrive / Roam) ─────────────────────────────
  const normPlat = (p?: string | null) => normalizePlatform(p || undefined);
  const platformOfToll = (tx: FinancialTransaction): PlatformBucket => {
    const trip = tripMap.get(tx.tripId || '');
    if (trip?.platform) return normPlatformBucket(trip.platform);
    if ((tx as any).metadata?.source === 'roam_geofence') return 'Roam';
    const suggested = suggestions.get(tx.id)?.[0]?.trip?.platform;
    if (suggested) return normPlatformBucket(suggested);
    return 'Unlinked';
  };
  const tripInPlatform = (t: TripType) => platformFilter === 'all' || normPlat(t.platform) === platformFilter;
  const tollInPlatform = (tx: FinancialTransaction) =>
    platformFilter === 'all' || platformOfToll(tx) === platformFilter;
  const claimInPlatform = (c: any) => platformFilter === 'all' || normPlat(tripMap.get(c.tripId || '')?.platform) === platformFilter;

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
    [...unreconciledTolls, ...reconciledTolls, ...allReconciledTolls].forEach(tx => { if (tx?.id && tx?.date) map.set(tx.id, tx.date); });
    return map;
  }, [unreconciledTolls, reconciledTolls, allReconciledTolls]);
  const periodTollIds = useMemo(
    () =>
      buildPeriodTollIdSet(
        unreconciledTolls,
        reconciledTolls,
        allReconciledTolls,
        period.startDate,
        fleetTz,
      ),
    [unreconciledTolls, reconciledTolls, allReconciledTolls, period.startDate, fleetTz],
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
      allReconciledTolls.length ? allReconciledTolls : reconciledTolls,
      period.startDate,
      fleetTz,
      claimTollIdsForPeriod,
    );
    const inPeriod = filterTollsToWizardPeriod(merged, period.startDate, fleetTz);
    return platformFilter === 'all' ? inPeriod : inPeriod.filter(tollInPlatform);
  }, [pReconciledInPeriod, allReconciledTolls, reconciledTolls, period.startDate, fleetTz, claimTollIdsForPeriod, platformFilter]);

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

  const underpaidPipeline = useMemo(
    () => {
      const merged = mergeReconciledTollsForUnderpaid(
        pReconciledInPeriod,
        allReconciledTolls.length ? allReconciledTolls : reconciledTolls,
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
        // Fully covered pending (netLoss ~$0) do not block Finish — auto-cleared below.
        pendingUnderpaidTolls: classifiedAllPlatforms.underpaid,
        suggestions,
      });
    },
    [
      pReconciledInPeriod,
      allReconciledTolls,
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

  // Auto-clear claimless underpaid leftovers already covered by trip refunds.
  const coveredPendingClearKey = useMemo(() => {
    if (isLoading) return '';
    const tripMapLocal = new Map(trips.filter((t) => t?.id).map((t) => [t.id, t]));
    const claimByTollId = buildClaimByTollId(claims);
    const covered = listFullyCoveredPendingUnderpaid({
      pendingUnderpaidTolls: classifiedAllPlatforms.underpaid,
      suggestions,
      tripMap: tripMapLocal,
      claimByTollId,
      partialByTollId: new Set(),
      reconciledTollById: new Map(
        (allReconciledTolls.length ? allReconciledTolls : reconciledTolls).map((t) => [t.id, t]),
      ),
      trips,
      disputeRefunds: disputeRefunds || [],
      periodWeekKey: period.startDate,
      fleetTz,
    });
    return covered.map((c) => `${c.transaction.id}:${c.trip.id}`).sort().join('|');
  }, [
    isLoading,
    trips,
    claims,
    classifiedAllPlatforms.underpaid,
    suggestions,
    allReconciledTolls,
    reconciledTolls,
    disputeRefunds,
    period.startDate,
    fleetTz,
  ]);

  useEffect(() => {
    if (!coveredPendingClearKey || isLoading) return;
    let cancelled = false;
    (async () => {
      const tripMapLocal = new Map(trips.filter((t) => t?.id).map((t) => [t.id, t]));
      const claimByTollId = buildClaimByTollId(claims);
      const covered = listFullyCoveredPendingUnderpaid({
        pendingUnderpaidTolls: classifiedAllPlatforms.underpaid,
        suggestions,
        tripMap: tripMapLocal,
        claimByTollId,
        partialByTollId: new Set(),
        reconciledTollById: new Map(
          (allReconciledTolls.length ? allReconciledTolls : reconciledTolls).map((t) => [t.id, t]),
        ),
        trips,
        disputeRefunds: disputeRefunds || [],
        periodWeekKey: period.startDate,
        fleetTz,
      });
      if (covered.length === 0) return;
      let cleared = 0;
      for (const row of covered) {
        if (cancelled) return;
        try {
          await reconcile(row.transaction, row.trip);
          cleared++;
        } catch {
          /* best-effort */
        }
      }
      if (!cancelled && cleared > 0) {
        toast.success(
          cleared === 1
            ? 'Cleared 1 fully covered toll from Underpaid'
            : `Cleared ${cleared} fully covered tolls from Underpaid`,
        );
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by coveredPendingClearKey
  }, [coveredPendingClearKey, isLoading, reconcile]);

  // Unlinked: pending-hold alone is informational, but Apply / Accept still count.
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
  const stepCounts: Record<StepId, StepCounts> = useMemo(() => computeStepCounts({
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

  const gatedStates: GatedStepState[] = useMemo(
    () => computeGatedStepStates(stepCounts, STEP_ORDER),
    [stepCounts],
  );

  const [activeStepId, setActiveStepId] = useState<StepId>(STEP_ORDER[0]);
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

  // Auto-repair split state: trip pending in Unlinked but claim still Reimbursed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await repairUnlinkedApplySplits({ driverId: driverId || undefined });
        if (cancelled || !res.repaired) return;
        await Promise.all([refresh(), refreshClaims()]);
        toast.info(
          res.repaired === 1
            ? 'Repaired 1 claim that was out of sync with an unlinked refund.'
            : `Repaired ${res.repaired} claims that were out of sync with unlinked refunds.`,
        );
      } catch {
        // Non-fatal — manual undo still available on claim history rows.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driverId, period.startDate, period.endDate, repairUnlinkedApplySplits, refresh, refreshClaims]);

  useEffect(() => {
    if (isLoading) return;
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
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
  }, [isLoading, gatedStates, activeStepId]);

  if (isLoading) {
    return (
        <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <span className="ml-2 text-slate-500">Analyzing toll data...</span>
        </div>
    );
  }

  // Calculate Financial Aggregates
  let claimableAmount = 0;
  let unreconciledPersonal = 0;
  let unknownAmount = 0;

  filteredUnreconciledTolls.forEach(tx => {
    const matches = suggestions.get(tx.id);
    const bestMatch = matches?.[0];
    const amount = Math.abs(tx.amount);

    if (!bestMatch) {
      unknownAmount += amount;
      return;
    }

    switch (bestMatch.matchType) {
      case 'AMOUNT_VARIANCE':
        claimableAmount += (bestMatch.varianceAmount || amount);
        break;
      case 'PERSONAL_MATCH':
        unreconciledPersonal += amount;
        break;
      default:
        unknownAmount += amount;
    }
  });

  let reconciledLiability = 0;
  let recoveredAmount = 0;

  // A trip's refund is a shared pool split across every toll linked to it
  // (time order, each capped at its own cost) — prevents two tolls sharing
  // one trip (e.g. two toll plazas on the same route) from each showing the
  // full trip.tollCharges amount, which both double-counts the same money
  // AND can show a refund bigger than the toll itself ever cost.
  const tollRefundAllocation = buildTripRefundAllocation(
    reconciledTolls,
    tripMap,
    spentUnlinkedCreditsByTripId({
      claims,
      disputeRefunds: disputeRefunds || [],
      tolls: reconciledTolls,
    }),
  );
  reconciledTolls.forEach(tx => {
      const trip = tripMap.get(tx.tripId || '');
      const claim = periodClaims.find(c => c.transactionId === tx.id);
      const ctx = buildTollFinancialsContext(tx, trip, claim, trips, disputeRefunds || [], tollRefundAllocation);
      const financials = calculateTollFinancials(tx, trip, claim, ctx);
      recoveredAmount += financials.totalRecovered;
      reconciledLiability += financials.netLoss;
  });

  const totalDriverLiability = unreconciledPersonal + reconciledLiability + unknownAmount;

  const refundsAmount = unclaimedRefunds.reduce((sum, t) => sum + (t.tollCharges || 0), 0);
  const resolvedRefundsAmount = pResolved.reduce((sum, t) => sum + (t.tollCharges || 0), 0);

  const matchedDisputeRefundAmount = (disputeRefunds || [])
    .filter(r => r.status === 'matched' || r.status === 'auto_resolved')
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalRecovered = recoveredAmount + matchedDisputeRefundAmount;

  const periodTolls = [...pUnreconciled, ...pReconciled];
  const { total: tollSpend, byPlatform: tollSpendByPlatform } = computeTollSpendByPlatform(
    periodTolls,
    platformOfToll,
  );
  const {
    total: reimbursedByUber,
    byPlatform: reimbursedByPlatform,
    disputeRefundAmount: scopedDisputeFromCalc,
  } = computeReimbursedTotals({
    trips: pTrips,
    disputeRefunds: disputeRefunds || [],
    period: { startDate: period.startDate, endDate: period.endDate },
    fleetTz,
    platformFilter: platformFilter === 'all' ? 'all' : platformFilter,
  });
  const chargedToDrivers = pPeriodClaims
    .filter(c => c.status === 'Resolved' && c.resolutionReason === 'Charge Driver')
    .reduce((sum, c) => sum + Math.abs(c.amount || 0), 0);
  const netTollLoss = Math.max(0, tollSpend - reimbursedByUber - chargedToDrivers);
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

  const filteredTollIds = new Set(filteredUnreconciledTolls.map(tx => tx.id));
  const highConfidenceCount = Array.from(suggestions.entries())
    .filter(([txId, matches]) => filteredTollIds.has(txId) && matches[0]?.confidence === 'high')
    .length;

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
      const driverId = match.trip.driverId || tx.driverId;
      if (!driverId) {
          toast.error('Cannot charge deadhead toll — no driver on this trip');
          return;
      }
      if (!(await confirmChargeSyncOrAbort())) {
          toast.message('Charge cancelled — turn on driver charge sync for Expenses/Cash Wallet parity.');
          return;
      }

      let linked = false;
      try {
          await reconcile(tx, match.trip);
          linked = true;
          const tollCost = Math.abs(tx.amount);
          await createClaim({
              transactionId: tx.id,
              driverId,
              amount: tollCost,
              expectedAmount: tollCost,
              paidAmount: 0,
              status: 'Resolved',
              type: 'Toll_Refund',
              resolutionReason: 'Charge Driver',
              subject: 'Deadhead Toll - Charged to Driver',
              message: `Enroute-to-pickup toll charged to driver for trip ${match.trip.id}.`,
              tripId: match.trip.id,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              date: tx.date,
          });
          await Promise.all([refresh(), refreshClaims()]);
          toast.success('Deadhead toll charged to driver');
      } catch (e) {
          console.error(e);
          if (linked) {
              try {
                  // Put the toll back in Deadhead — charge never landed.
                  await unreconcile({ ...tx, tripId: match.trip.id, isReconciled: true });
                  await refresh();
              } catch (rollbackErr) {
                  console.error('Deadhead charge rollback failed', rollbackErr);
                  toast.error('Charge failed and could not undo the trip link — unmatch this toll manually', {
                      description: e instanceof Error ? e.message : undefined,
                  });
                  return;
              }
          }
          toast.error('Failed to charge driver for deadhead toll', {
              description: e instanceof Error ? e.message : undefined,
          });
      }
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

  const handleFinish = () => {
    const allPlatformActionable = STEP_ORDER.reduce((sum, id) => sum + (stepCounts[id]?.actionable || 0), 0);
    if (allPlatformActionable > 0) {
      toast.error('Still open items on other platforms', {
        description: 'Clear the platform filter to All and finish remaining steps before closing this period.',
      });
      return;
    }
    invalidateSharedPeriods();
    toast.success(`Period ${period.label} fully reconciled`);
    onExit();
  };

  const renderAdvancePrompt = (compact = false) => (
    <StepAdvancePrompt
      currentStepLabel={STEP_LABELS[activeStepId]}
      nextStepLabel={nextStepLabel}
      isLastStep={isLastStep}
      onAdvance={isLastStep ? handleFinish : handleNext}
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
        allReconciledTolls.find((t) => t.id === tollId) ||
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
    await refreshClaims();
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
  const lockedEditToll = lock('Saving toll…', handleEditToll);
  const lockedChargeDeadhead = lock('Charging driver…', handleChargeDriverForDeadhead);
  const lockedSmartReconcile = lock('Matching toll…', handleSmartReconcile);
  const lockedUndoApply = lock('Undoing apply…', handleUndoApply);
  const lockedApplyShortfall = lock('Applying credit to underpaid…', handleApplyUnlinkedShortfall);
  const lockedResolveRefund = lock('Resolving refund…', resolveRefund);
  const lockedBulkResolve = lock('Resolving refunds…', bulkResolveRefunds);
  const lockedUndoRefund = lock('Undoing refund…', undoRefund);
  const lockedAutoMatch = lock('Auto-matching…', async () => {
    await autoMatchAll();
  });
  const lockedRefresh = lock('Refreshing…', async () => {
    await refresh({ autoMatch: true });
  });
  const lockedCreateClaim = lock('Saving claim…', createClaim);
  const lockedUpdateClaim = lock('Updating claim…', updateClaim);
  const lockedDeleteClaim = lock('Removing claim…', deleteClaim);
  const lockedUnreconcile = lock('Unmatching…', unreconcile);
  const lockedRefundMatch = lock('Updating dispute match…', async (event: DisputeMatchEvent) => {
    if (event.type === 'match') {
      applyDisputeMatch(event.refundId, event.tollId);
    } else {
      applyDisputeUnmatch(event.refundId);
    }
    await Promise.all([refresh(), refreshClaims()]);
  });

  return (
    <TooltipProvider>
    <div className={`space-y-6 ${actionBusy ? 'select-none' : ''}`}>
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
            <div className="flex items-center rounded-md border border-slate-200 bg-white p-0.5 shadow-sm">
                {PLATFORM_OPTIONS.map(p => (
                    <button
                        key={p}
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
            <Button variant="ghost" size="sm" onClick={handleRunTest} className="text-slate-400 hover:text-slate-600">
                Test
            </Button>
            {highConfidenceCount > 0 && (
                <Button variant="default" size="sm" onClick={() => void lockedAutoMatch()} disabled={actionBusy} className="bg-indigo-600 hover:bg-indigo-700">
                    <Wand2 className="h-4 w-4 mr-2" />
                    Auto-match {highConfidenceCount}
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

      {/* Financial Overview Cards — one balancing story: Spend − Reimbursed − Charged = Net Loss */}
      <TollFinancialOverviewCards
        tollSpend={tollSpend}
        tollSpendByPlatform={tollSpendByPlatform}
        reimbursedAmount={reimbursedByUber}
        reimbursedByPlatform={reimbursedByPlatform}
        reimbursedLabelSuffix={platformFilter !== 'all' ? ` · ${platformFilter}` : undefined}
        scopedDisputeRefund={scopedDisputeFromCalc}
        chargedToDrivers={chargedToDrivers}
        netTollLoss={netTollLoss}
        needsReviewCount={needsReviewCount}
        tollsNeedingReviewCount={tollsNeedingReviewCount}
        refundsNeedingReviewCount={refundsNeedingReviewCount}
        resolvedRefundsAmount={resolvedRefundsAmount}
      />

      {autoReconciledCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
          <Wand2 className="h-4 w-4 shrink-0" />
          <span>
            <strong>{autoReconciledCount}</strong> toll{autoReconciledCount === 1 ? ' was' : 's were'} auto-matched to trips this session.{' '}
            <span className="text-indigo-500">View in History below.</span>
          </span>
        </div>
      )}

      {/* MOI-5: already-resolved tolls flagged for a second look — cuts across
          steps, so it stays a banner above the stepper rather than a step. */}
      <RematchCandidatesQueue driverId={driverId} />

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
              onEdit={lockedEditToll}
              advancePrompt={showAdvancePrompt ? renderAdvancePrompt(true) : undefined}
              emptyState={{ icon: CarFront, title: "No personal use tolls this period", description: "No tolls were classified as personal driver use." }}
              listTitle="Personal Use"
              listDescription="Tolls with no trip explaining them, or after dropoff — confirm each driver charge. Approach tolls appear under Deadhead."
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
              refunds={disputeRefunds}
              onMatchComplete={lockedRefundMatch}
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
              tollLookup={allReconciledTolls.length ? allReconciledTolls : reconciledTolls}
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
              deleteClaim={lockedDeleteClaim}
              refreshClaims={refreshClaims}
              onUndoUnlinkedApply={lockedUndoApply}
              busyUnlinkedTripId={busyUnlinkedTripId}
            />
          )}
        </div>

        {showBottomAdvancePrompt && (
          <div className="pt-4">
            {renderAdvancePrompt()}
          </div>
        )}
      </div>

      {/* Read-only audit views — Resolved / Matched History / All activity,
          scoped to this period like every other step (not a step itself:
          nothing here needs a decision). */}
      <HistoryPanel
        pResolved={pResolved}
        onUndoRefund={lockedUndoRefund}
        onUndoApply={lockedUndoApply}
        busyUnlinkedTripId={busyUnlinkedTripId}
        disputeRefunds={disputeRefunds || []}
        pReconciled={pReconciledInPeriod}
        trips={trips}
        pClaims={pPeriodClaims}
        onUnmatch={lockedUnreconcile}
        selectedDriverId={driverId || ''}
        periodStartDate={period.startDate}
        periodEndDate={period.endDate}
      />

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

// ── Persistent read-only history (Resolved / Matched History / All activity) ──
function HistoryPanel(props: {
  pResolved: TripType[];
  onUndoRefund: (tripId: string) => Promise<void> | void;
  onUndoApply?: (tripId: string) => Promise<void> | void;
  busyUnlinkedTripId?: string | null;
  pReconciled: FinancialTransaction[];
  trips: TripType[];
  pClaims: any[];
  disputeRefunds?: import('../../../types/data').DisputeRefund[];
  onUnmatch: (tx: FinancialTransaction) => Promise<any>;
  selectedDriverId: string;
  periodStartDate: string;
  periodEndDate: string;
}) {
  return (
    <div className="border-t border-slate-200 pt-6">
      <div className="flex items-center gap-2 mb-4">
        <HistoryIcon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">History</h3>
        <span className="text-xs text-slate-400">Read-only audit trail for this period — nothing here needs a decision.</span>
      </div>
      <Tabs defaultValue="history" className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:max-w-md">
          <TabsTrigger value="resolved">
            Resolved
            {props.pResolved.length > 0 && (
              <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">{props.pResolved.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">
            Matched History
            <span className="ml-2 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs font-bold">{props.pReconciled.length}</span>
          </TabsTrigger>
          <TabsTrigger value="activity">All activity</TabsTrigger>
        </TabsList>

        <TabsContent value="resolved" className="mt-4">
          <ResolvedRefundsList
            rows={props.pResolved.map((t): ResolvedRefundRow => {
              const res = t.tollRefundResolution;
              const claimId = res?.appliedToClaimId;
              const claim = claimId
                ? props.pClaims.find((c: any) => c?.id === claimId)
                : props.pClaims.find((c: any) => c?.unlinkedTripId === t.id);
              const toll = claim?.transactionId
                ? props.pReconciled.find((tx) => tx.id === claim.transactionId)
                : res?.appliedToTollId
                  ? props.pReconciled.find((tx) => tx.id === res.appliedToTollId)
                  : undefined;
              return {
                id: t.id,
                date: t.date,
                platform: t.platform,
                driverId: t.driverId,
                driverName: t.driverName,
                tollCharges: t.tollCharges,
                pickupLocation: t.pickupLocation,
                dropoffLocation: t.dropoffLocation,
                resolution: (res?.status as ResolvedRefundRow['resolution']) || 'cash_wash',
                resolvedBy: res?.resolvedBy,
                resolvedAt: res?.resolvedAt,
                auto: res?.auto,
                appliedToClaimId: res?.appliedToClaimId,
                appliedToTollId: res?.appliedToTollId,
                resolutionSource: res?.source,
                resolutionNotes: res?.notes,
                preUnlinkedStatus: claim?.preUnlinkedStatus,
                preUnlinkedResolutionReason: claim?.preUnlinkedResolutionReason,
                targetTollAmount: toll
                  ? Math.abs(Number(toll.amount) || 0)
                  : claim
                    ? Math.abs(Number(claim.expectedAmount ?? claim.amount) || 0)
                    : null,
                targetLocation:
                  (toll as any)?.description ||
                  (toll as any)?.vendor ||
                  claim?.subject ||
                  null,
              };
            })}
            onUndo={props.onUndoRefund}
            onUndoApply={props.onUndoApply}
            busyTripId={props.busyUnlinkedTripId}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ReconciledTollsList
            tolls={props.pReconciled}
            trips={props.trips}
            claims={props.pClaims}
            disputeRefunds={props.disputeRefunds || []}
            onUnmatch={props.onUnmatch}
          />
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="mb-2">
            <p className="text-sm text-slate-600">
              One timeline across toll ledger, legacy imports, unlinked trip refunds, and Uber support adjustments.
              Amounts follow each source&apos;s sign convention (toll charges are usually negative; credits positive).
            </p>
          </div>
          <UnifiedTollActivityTable
            driverId={props.selectedDriverId || undefined}
            initialFrom={props.periodStartDate}
            initialTo={props.periodEndDate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
