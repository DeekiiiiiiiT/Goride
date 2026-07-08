import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { TooltipProvider } from "../../ui/tooltip";
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
  CarFront, Route, ShieldCheck, Unlink as UnlinkIcon, History as HistoryIcon, ArrowLeft, type LucideIcon,
} from "lucide-react";
import { Button } from "../../ui/button";
import { runScenarioTest } from "../../../utils/testScenario";
import { UnifiedTollActivityTable } from "./UnifiedTollActivityTable";
import { FinancialTransaction, Claim } from "../../../types/data";
import { MatchResult, calculateTollFinancials, allocateTripRefundAcrossTolls } from "../../../utils/tollReconciliation";
import {
  bucketForWorkflowStage,
  resolveTollBucket,
  TollBucket,
  TollWorkflowStage,
} from "../../../utils/tollBucket";
import { StepId, StepCounts, STEP_ORDER, computeStepCounts } from "../../../utils/tollPeriodGating";
import { hasBlockingUnlinkedRefund } from "../../../utils/unlinkedShortfallEligibility";
import { getClaimWeekDate } from "../../../utils/tollWeekPeriod";
import type { UnlinkedShortfallSuggestion } from "../../../hooks/useTollReconciliation";
import { toast } from "sonner@2.0.3";
import { Trip as TripType } from "../../../types/data";
import { api } from "../../../services/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../ui/dialog";
import { DriverPicker } from "../../ui/DriverPicker";
import { TollAutomationSettings } from "./TollAutomationSettings";
import { RematchCandidatesQueue } from "./RematchCandidatesQueue";
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
export function ReconciliationWizard({ period, driverId, drivers, onExit }: ReconciliationWizardProps) {
  const handleRunTest = () => {
    const result = runScenarioTest();
    console.log(result);
    alert(result);
  };

  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const fleetTz = useFleetTimezone();

  const {
    loading: tollsLoading,
    unreconciledTolls,
    reconciledTolls,
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
    applyUnlinkedToClaim,
    applyDisputeMatch,
    applyDisputeUnmatch,
    refresh
  } = useTollReconciliation(driverId, { startDate: period.startDate, endDate: period.endDate });

  const { claims, loading: claimsLoading, refresh: refreshClaims, createClaim, updateClaim, deleteClaim } = useClaims();

  const handleRefundMatchComplete = useCallback((event: DisputeMatchEvent) => {
    if (event.type === 'match') {
      applyDisputeMatch(event.refundId, event.tollId);
    } else {
      applyDisputeUnmatch(event.refundId);
    }
    void Promise.all([refresh(), refreshClaims()]);
  }, [applyDisputeMatch, applyDisputeUnmatch, refresh, refreshClaims]);

  const [pendingPersonalTx, setPendingPersonalTx] = React.useState<FinancialTransaction | null>(null);
  const [pendingDriverId, setPendingDriverId] = React.useState<string>('');

  const tripMap = useMemo(() => new Map(trips.map(t => [t.id, t])), [trips]);

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
              await createClaim({
                  ...commonData,
                  driverId: resolvedDriverId as string,
                  resolutionReason: 'Charge Driver',
                  subject: 'Unmatched Toll - Personal Use',
                  message: 'This toll was identified as personal usage and charged to your account.'
              });
              await reject(tx, 'Manual Resolution: Personal (Driver Pays)');
              toast.success("Marked as Personal (Driver Liability)");
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
  const pUnreconciled = platformFilter === 'all' ? unreconciledTolls : unreconciledTolls.filter(tollInPlatform);
  const pUnclaimed = platformFilter === 'all' ? unclaimedRefunds : unclaimedRefunds.filter(tripInPlatform);
  const pResolved = platformFilter === 'all' ? resolvedRefunds : resolvedRefunds.filter(tripInPlatform);

  // ── Period-scoping for claims (the one list the data hooks can't date-filter
  // server-side, since a claim's own `date` — not its resolution timestamp —
  // decides which week it belongs to; see getClaimWeekDate). ──────────────────
  const tollDateById = useMemo(() => {
    const map = new Map<string, string>();
    [...unreconciledTolls, ...reconciledTolls].forEach(tx => { if (tx?.id && tx?.date) map.set(tx.id, tx.date); });
    return map;
  }, [unreconciledTolls, reconciledTolls]);
  const periodStartMs = useMemo(() => new Date(period.startDate).getTime(), [period.startDate]);
  const periodEndMs = useMemo(() => new Date(`${period.endDate}T23:59:59.999`).getTime(), [period.endDate]);
  const periodClaims = useMemo(() => claims.filter((c: Claim) => {
    const d = getClaimWeekDate(c, tollDateById).getTime();
    return d >= periodStartMs && d <= periodEndMs;
  }), [claims, tollDateById, periodStartMs, periodEndMs]);
  const pPeriodClaims = platformFilter === 'all' ? periodClaims : periodClaims.filter(claimInPlatform);

  // Claimed-toll exclusion is deliberately ALL-TIME (not period-scoped): "does
  // this toll already have a claim at all" doesn't depend on which period the
  // claim's own date resolves to — matches the same rule the period
  // aggregation endpoint (toll_period_controller.tsx) uses.
  const claimedTransactionIds = new Set(claims.map(c => c.transactionId));
  const filteredUnreconciledTolls = pUnreconciled.filter(tx => !claimedTransactionIds.has(tx.id));
  const allUnreconciledForGating = unreconciledTolls.filter(tx => !claimedTransactionIds.has(tx.id));

  const isLoading = tollsLoading || claimsLoading;

  const buildBuckets = useCallback((tolls: FinancialTransaction[]) => {
    const buckets: Record<TollBucket, FinancialTransaction[]> = {
      'needs-review': [], 'underpaid': [], 'deadhead': [], 'personal-use': [],
    };
    tolls.forEach(tx => {
      const best = suggestions.get(tx.id)?.[0];
      const stage = (tx as any).workflowStage as TollWorkflowStage | undefined;
      const liveBucket = resolveTollBucket(tx, best);
      const bucket: TollBucket | null =
        liveBucket === 'needs-review'
          ? 'needs-review'
          : stage
            ? bucketForWorkflowStage(stage)
            : liveBucket;
      if (bucket) buckets[bucket].push(tx);
    });
    return buckets;
  }, [suggestions]);

  const classified = useMemo(
    () => buildBuckets(filteredUnreconciledTolls),
    [buildBuckets, filteredUnreconciledTolls],
  );
  const classifiedAllPlatforms = useMemo(
    () => buildBuckets(allUnreconciledForGating),
    [buildBuckets, allUnreconciledForGating],
  );

  // ── Phase F4: hard-gate counts use ALL platforms (filter is display-only) ─
  const stepCounts: Record<StepId, StepCounts> = useMemo(() => computeStepCounts({
    classified: classifiedAllPlatforms,
    underpaidClaims: periodClaims,
    disputeRefunds: disputeRefunds || [],
    unclaimedRefundTrips: unclaimedRefunds,
  }), [classifiedAllPlatforms, periodClaims, disputeRefunds, unclaimedRefunds]);

  const gatedStates: GatedStepState[] = useMemo(
    () => computeGatedStepStates(stepCounts, STEP_ORDER),
    [stepCounts],
  );

  const [activeStepId, setActiveStepId] = useState<StepId>(STEP_ORDER[0]);
  const hasInitializedRef = React.useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setActiveStepId(pickInitialStep(gatedStates));
      return;
    }
    // Re-lock guard: if the active step just became locked (an earlier step
    // regained an actionable item — e.g. a background rematch), snap back to
    // the new current step rather than leaving the user on a locked step.
    const activeState = gatedStates.find(s => s.id === activeStepId);
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
  const tripRefundById = new Map<string, number>();
  reconciledTolls.forEach(tx => {
      if (tx.tripId && !tripRefundById.has(tx.tripId)) {
          const trip = tripMap.get(tx.tripId);
          if (trip) tripRefundById.set(tx.tripId, trip.tollCharges || 0);
      }
  });
  const tollRefundAllocation = allocateTripRefundAcrossTolls(reconciledTolls, tripRefundById);
  reconciledTolls.forEach(tx => {
      const trip = tripMap.get(tx.tripId || '');
      const claim = claims.find(c => c.transactionId === tx.id);
      const effectiveTrip = trip ? { ...trip, tollCharges: tollRefundAllocation.get(tx.id) ?? 0 } : trip;
      const financials = calculateTollFinancials(tx, effectiveTrip, claim);
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
  const needsReviewCount = filteredUnreconciledTolls.length + pUnclaimed.length;

  const filteredTollIds = new Set(filteredUnreconciledTolls.map(tx => tx.id));
  const highConfidenceCount = Array.from(suggestions.entries())
    .filter(([txId, matches]) => filteredTollIds.has(txId) && matches[0]?.confidence === 'high')
    .length;

  const handleSmartReconcile = async (tx: FinancialTransaction, trip: TripType) => {
      if (!trip?.id) {
          await handleManualResolve(tx, 'Personal');
          return;
      }

      const match = suggestions.get(tx.id)?.find(m => m.trip.id === trip.id);

      if (match?.matchType === 'PERSONAL_MATCH') {
          try {
              await reconcile(tx, trip);
              const tollCost = Math.abs(tx.amount);
              await createClaim({
                  transactionId: tx.id,
                  driverId: trip.driverId || tx.driverId || 'unknown',
                  amount: tollCost,
                  expectedAmount: tollCost,
                  paidAmount: 0,
                  status: 'Resolved',
                  type: 'Toll_Refund',
                  resolutionReason: 'Charge Driver',
                  subject: 'Unmatched Toll - Personal Use',
                  message: `System identified this toll as personal usage during trip ${trip.id}.`,
                  tripId: trip.id,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  date: tx.date
              });
              toast.success("Linked to Trip & Charged to Driver");
              refreshClaims();
          } catch (e) {
              console.error(e);
              toast.error("Failed to process Personal Match");
          }
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
   */
  const handleChargeDriverForDeadhead = async (tx: FinancialTransaction, match: MatchResult) => {
      const driverIdForCharge = match.trip.driverId || tx.driverId;
      if (hasBlockingUnlinkedRefund({ claimDriverId: driverIdForCharge, unlinkedTrips: unclaimedRefunds })) {
          toast.error('Pick Apply to underpaid on Unlinked Refunds first', {
            description: 'This driver still has an open unlinked trip refund that may cover this toll.',
          });
          setActiveStepId('unlinked-refunds');
          return;
      }
      try {
          await reconcile(tx, match.trip);
          const tollCost = Math.abs(tx.amount);
          await createClaim({
              transactionId: tx.id,
              driverId: match.trip.driverId || tx.driverId || 'unknown',
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
              date: tx.date
          });
          toast.success("Deadhead toll charged to driver");
          refreshClaims();
      } catch (e) {
          console.error(e);
          toast.error("Failed to charge driver for deadhead toll");
      }
  };

  const activeState = gatedStates.find(s => s.id === activeStepId) ?? gatedStates[0];
  const isLastStep = activeStepId === STEP_ORDER[STEP_ORDER.length - 1];
  const canAdvance = activeState.actionable === 0;

  const handleNext = () => {
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
    toast.success(`Period ${period.label} fully reconciled`);
    onExit();
  };

  const handleApplyUnlinkedShortfall = async (
    tripId: string,
    suggestion: UnlinkedShortfallSuggestion,
    opts?: { acknowledgedPlatformMismatch?: boolean },
  ) => {
    await applyUnlinkedToClaim(tripId, {
      claimId: suggestion.claimId,
      tollId: suggestion.tollId,
      acknowledgedPlatformMismatch: opts?.acknowledgedPlatformMismatch,
    });
    refreshClaims();
  };

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <Button variant="ghost" size="sm" onClick={onExit} className="-ml-2 mb-1 text-slate-500 hover:text-slate-700">
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
                <Button variant="default" size="sm" onClick={autoMatchAll} className="bg-indigo-600 hover:bg-indigo-700">
                    <Wand2 className="h-4 w-4 mr-2" />
                    Auto-match {highConfidenceCount}
                </Button>
            )}
            <TollAutomationSettings onChanged={refresh} />
            <Button variant="outline" size="sm" onClick={() => refresh({ autoMatch: true })}>
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
        tollsNeedingReviewCount={filteredUnreconciledTolls.length}
        refundsNeedingReviewCount={pUnclaimed.length}
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
          onSelect={setActiveStepId}
          labels={STEP_LABELS}
          icons={STEP_ICONS}
        />

        <div className="pt-2">
          {activeStepId === 'needs-review' && (
            <TollBucketPanel
              tolls={classified['needs-review']}
              suggestions={suggestions}
              allTrips={trips}
              onReconcile={handleSmartReconcile}
              onApprove={handleApprove}
              onReject={handleReject}
              onFlag={handleFlag}
              onManualResolve={handleManualResolve}
              onEdit={handleEditToll}
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
              onReconcile={handleSmartReconcile}
              onApprove={handleApprove}
              onReject={handleReject}
              onFlag={handleFlag}
              onManualResolve={handleManualResolve}
              onEdit={handleEditToll}
              emptyState={{ icon: CarFront, title: "No personal use tolls this period", description: "No tolls were classified as personal driver use." }}
              listTitle="Personal Use"
              listDescription="Tolls with no trip explaining them, or matched post-dropoff — likely personal driving."
            />
          )}
          {activeStepId === 'deadhead' && (
            <TollBucketPanel
              tolls={classified['deadhead']}
              suggestions={suggestions}
              allTrips={trips}
              onReconcile={handleSmartReconcile}
              onApprove={handleApprove}
              onReject={handleReject}
              onFlag={handleFlag}
              onManualResolve={handleManualResolve}
              onEdit={handleEditToll}
              onChargeDriver={handleChargeDriverForDeadhead}
              approveLabel="Acknowledge (Fleet Cost)"
              emptyState={{ icon: Route, title: "No deadhead tolls this period", description: "No unreimbursed business driving tolls detected." }}
              listTitle="Deadhead"
              listDescription="Unreimbursed business driving (en route to pickup) — normally a fleet cost, but chargeable to the driver on a case-by-case basis."
            />
          )}
          {activeStepId === 'dispute-refunds' && (
            <DisputeRefundsList
              refunds={disputeRefunds}
              onMatchComplete={handleRefundMatchComplete}
            />
          )}
          {activeStepId === 'unlinked-refunds' && (
            <UnclaimedRefundsList
              trips={pUnclaimed}
              suggestions={refundSuggestions}
              shortfallSuggestions={shortfallSuggestions}
              drivers={drivers}
              onResolve={resolveRefund}
              onBulkResolve={bulkResolveRefunds}
              onApplyToShortfall={handleApplyUnlinkedShortfall}
            />
          )}
          {activeStepId === 'underpaid-claims' && (
            <UnderpaidClaimsStep
              underpaidTolls={classified['underpaid']}
              suggestions={suggestions}
              allTrips={trips}
              onFlag={handleFlag}
              onReconcile={handleSmartReconcile}
              onEdit={handleEditToll}
              claims={pPeriodClaims}
              reconciledTolls={pReconciled}
              trips={trips}
              disputeRefunds={disputeRefunds}
              unlinkedRefundTrips={unclaimedRefunds}
              drivers={drivers}
              loadingTolls={tollsLoading}
              loadingClaims={claimsLoading}
              unreconcile={unreconcile}
              updateClaim={updateClaim}
              deleteClaim={deleteClaim}
              refreshClaims={refreshClaims}
            />
          )}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-100">
          <Button
            disabled={!canAdvance}
            onClick={isLastStep ? handleFinish : handleNext}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isLastStep ? 'Finish — Back to Periods' : 'Next'}
          </Button>
        </div>
      </div>

      {/* Read-only audit views — Resolved / Matched History / All activity,
          scoped to this period like every other step (not a step itself:
          nothing here needs a decision). */}
      <HistoryPanel
        pResolved={pResolved}
        onUndoRefund={undoRefund}
        onUndoApply={undoApplyToUnderpaid}
        pReconciled={pReconciled}
        trips={trips}
        pClaims={pPeriodClaims}
        onUnmatch={unreconcile}
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
              disabled={!pendingDriverId}
              onClick={async () => {
                const tx = pendingPersonalTx;
                const driverIdForCharge = pendingDriverId;
                setPendingPersonalTx(null);
                if (tx && driverIdForCharge) await handleManualResolve(tx, 'Personal', driverIdForCharge);
              }}
            >
              Charge driver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

// ── Persistent read-only history (Resolved / Matched History / All activity) ──
function HistoryPanel(props: {
  pResolved: TripType[];
  onUndoRefund: (tripId: string) => Promise<void> | void;
  onUndoApply?: (tripId: string) => Promise<void> | void;
  pReconciled: FinancialTransaction[];
  trips: TripType[];
  pClaims: any[];
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
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ReconciledTollsList
            tolls={props.pReconciled}
            trips={props.trips}
            claims={props.pClaims}
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
