import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { TollBucketPanel } from "./TollBucketPanel";
import { UnderpaidClaimsStep } from "./UnderpaidClaimsStep";
import { DisputeRefundsList, DisputeMatchEvent } from "./DisputeRefundsList";
import { UnclaimedRefundsList } from "./UnclaimedRefundsList";
import { ReconciledTollsList } from "./ReconciledTollsList";
import { ResolvedRefundsList, ResolvedRefundRow } from "./ResolvedRefundsList";
import { ReconciliationStepper, ReconciliationStepDef, pickDefaultStep } from "./ReconciliationStepper";
import { useTollReconciliation } from "../../../hooks/useTollReconciliation";
import { useClaims } from "../../../hooks/useClaims";
import {
  Loader2, RefreshCw, Wand2, AlertTriangle, TrendingDown, TrendingUp, DollarSign, Wallet, HelpCircle,
  Filter, Bot, CarFront, Route, ShieldCheck, Unlink as UnlinkIcon, History as HistoryIcon,
} from "lucide-react";
import { Button } from "../../ui/button";
import { runScenarioTest } from "../../../utils/testScenario";
import { UnifiedTollActivityTable } from "./UnifiedTollActivityTable";
import { FinancialTransaction } from "../../../types/data";
import { MatchResult, calculateTollFinancials } from "../../../utils/tollReconciliation";
import { bucketForBestMatch, bucketForWorkflowStage, TollBucket, TollWorkflowStage } from "../../../utils/tollBucket";
import { toast } from "sonner@2.0.3";
import { Trip as TripType } from "../../../types/data";
import { api } from "../../../services/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../ui/dialog";
import { DriverPicker } from "../../ui/DriverPicker";
import { TollAutomationSettings } from "./TollAutomationSettings";
import { RematchCandidatesQueue } from "./RematchCandidatesQueue";
import { normalizePlatform } from "../../../utils/normalizePlatform";

type PlatformFilter = 'all' | 'Uber' | 'InDrive' | 'Roam';
const PLATFORM_OPTIONS: PlatformFilter[] = ['all', 'Uber', 'InDrive', 'Roam'];

type StepId = 'needs-review' | 'personal-use' | 'deadhead' | 'underpaid-claims' | 'dispute-refunds' | 'unlinked-refunds';

export function ReconciliationDashboard() {
  const handleRunTest = () => {
    const result = runScenarioTest();
    console.log(result);
    alert(result);
  };

  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');

  useEffect(() => {
    api.getDrivers().then(setDrivers).catch(console.error);
  }, []);

  const {
    loading: tollsLoading,
    unreconciledTolls,
    reconciledTolls,
    unclaimedRefunds,
    resolvedRefunds,
    refundSuggestions,
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
    applyDisputeMatch,
    applyDisputeUnmatch,
    refresh
  } = useTollReconciliation(selectedDriverId || undefined);

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
              updatedAt: new Date().toISOString()
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
  const platformOfToll = (tx: FinancialTransaction): string | null => {
    const trip = tripMap.get(tx.tripId || '');
    if (trip?.platform) return normPlat(trip.platform);
    if ((tx as any).metadata?.source === 'roam_geofence') return 'Roam';
    return null;
  };
  const tripInPlatform = (t: TripType) => platformFilter === 'all' || normPlat(t.platform) === platformFilter;
  const tollInPlatform = (tx: FinancialTransaction) => platformFilter === 'all' || platformOfToll(tx) === platformFilter;
  const claimInPlatform = (c: any) => platformFilter === 'all' || normPlat(tripMap.get(c.tripId || '')?.platform) === platformFilter;

  const pTrips = platformFilter === 'all' ? trips : trips.filter(tripInPlatform);
  const pReconciled = platformFilter === 'all' ? reconciledTolls : reconciledTolls.filter(tollInPlatform);
  const pUnreconciled = platformFilter === 'all' ? unreconciledTolls : unreconciledTolls.filter(tollInPlatform);
  const pUnclaimed = platformFilter === 'all' ? unclaimedRefunds : unclaimedRefunds.filter(tripInPlatform);
  const pResolved = platformFilter === 'all' ? resolvedRefunds : resolvedRefunds.filter(tripInPlatform);
  const pClaims = platformFilter === 'all' ? claims : claims.filter(claimInPlatform);

  const claimedTransactionIds = new Set(claims.map(c => c.transactionId));
  const filteredUnreconciledTolls = pUnreconciled.filter(tx => !claimedTransactionIds.has(tx.id));

  const isLoading = tollsLoading || claimsLoading;

  // ── RWF-1: classify into the 4 non-claims buckets, preferring the
  // persisted workflowStage over a live suggestions recompute so a toll's
  // queue position survives independent of this render's match recompute —
  // falls back to bucketForBestMatch for rows that predate the backfill. ──
  const classified = useMemo(() => {
    const buckets: Record<TollBucket, FinancialTransaction[]> = {
      'needs-review': [], 'underpaid': [], 'deadhead': [], 'personal-use': [],
    };
    filteredUnreconciledTolls.forEach(tx => {
      const stage = (tx as any).workflowStage as TollWorkflowStage | undefined;
      const bucket: TollBucket | null = stage
        ? bucketForWorkflowStage(stage)
        : bucketForBestMatch(suggestions.get(tx.id)?.[0]);
      if (bucket) buckets[bucket].push(tx);
    });
    return buckets;
  }, [filteredUnreconciledTolls, suggestions]);

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

  reconciledTolls.forEach(tx => {
      const trip = tripMap.get(tx.tripId || '');
      const claim = claims.find(c => c.transactionId === tx.id);
      const financials = calculateTollFinancials(tx, trip, claim);
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

  const scopedDisputeRefund = (platformFilter === 'all' || platformFilter === 'Uber') ? matchedDisputeRefundAmount : 0;
  const tollSpend = [...pUnreconciled, ...pReconciled]
    .reduce((sum, tx) => sum + (tx.amount < 0 ? Math.abs(tx.amount) : 0), 0);
  const reimbursedByUber =
    pTrips.reduce((sum, t) => sum + (t.tollCharges || 0), 0) + scopedDisputeRefund;
  const chargedToDrivers = pClaims
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
                  updatedAt: new Date().toISOString()
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

  // ── Guided step navigation (RWF-1 / Phase D) ─────────────────────────────
  const claimsNeedingAttention = claims.filter(c => c.status !== 'Resolved').length;
  const unmatchedDisputeRefunds = (disputeRefunds || []).filter(r => r.status === 'unmatched').length;

  const steps: ReconciliationStepDef[] = [
    { id: 'needs-review', label: 'Needs Review', icon: HelpCircle, count: classified['needs-review'].length },
    { id: 'personal-use', label: 'Personal Use', icon: CarFront, count: classified['personal-use'].length },
    { id: 'deadhead', label: 'Deadhead', icon: Route, count: classified['deadhead'].length },
    { id: 'underpaid-claims', label: 'Underpaid & Claims', icon: DollarSign, count: classified['underpaid'].length + claimsNeedingAttention },
    { id: 'dispute-refunds', label: 'Dispute Refunds', icon: ShieldCheck, count: unmatchedDisputeRefunds,
      hint: claims.length === 0 ? 'Needs a claim first' : undefined },
    { id: 'unlinked-refunds', label: 'Unlinked Refunds', icon: UnlinkIcon, count: pUnclaimed.length },
  ];

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Toll Reconciliation</h2>
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
            <div className="flex items-center gap-1.5">
                <Filter className="h-4 w-4 text-slate-400" />
                <select
                    value={selectedDriverId}
                    onChange={(e) => setSelectedDriverId(e.target.value)}
                    className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                    <option value="">All Drivers</option>
                    {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-slate-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider">Toll Spend</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Total tolls the fleet paid (tag charges, cash, and geofence-detected). This is the money that went out.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${tollSpend.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Money out</div>
                </div>
                <DollarSign className="h-5 w-5 text-slate-400" />
            </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-emerald-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-emerald-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                            Reimbursed{platformFilter !== 'all' ? ` · ${platformFilter}` : ''}
                        </h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-emerald-400 hover:text-emerald-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Toll money the rideshare platform (Uber / InDrive / Roam) paid back on trips through the fare, plus matched Uber support adjustments.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${reimbursedByUber.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">
                        Paid back on trips
                        {scopedDisputeRefund > 0 && (
                            <span className="block text-teal-600 mt-0.5">
                                Incl. ${scopedDisputeRefund.toFixed(2)} from dispute refunds
                            </span>
                        )}
                    </div>
                </div>
                <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-purple-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-purple-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-purple-600 uppercase tracking-wider">Charged to Drivers</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-purple-400 hover:text-purple-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Toll cost recovered by billing the driver via resolved "Charge Driver" claims.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${chargedToDrivers.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Recovered from drivers</div>
                </div>
                <Wallet className="h-5 w-5 text-purple-400" />
            </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-rose-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-rose-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-rose-600 uppercase tracking-wider">Net Toll Loss</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">What the fleet is actually out of pocket: Toll Spend − Reimbursed by Uber − Charged to Drivers.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">${netTollLoss.toFixed(2)}</div>
                    <div className="text-xs text-slate-500 mt-1">Unrecovered toll cost</div>
                </div>
                <TrendingDown className="h-5 w-5 text-rose-400" />
            </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-amber-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-2 h-full bg-amber-400" />
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-medium text-amber-600 uppercase tracking-wider">Needs Review</h3>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3.5 w-3.5 text-amber-400 hover:text-amber-600 transition-colors" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className="max-w-[200px] text-xs">Open items still to sort across every step below.</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{needsReviewCount}</div>
                    <div className="text-xs text-slate-500 mt-1">
                        {filteredUnreconciledTolls.length} tolls · {pUnclaimed.length} refunds
                        {resolvedRefundsAmount > 0 && (
                            <span className="block text-emerald-600 mt-0.5">
                                ${resolvedRefundsAmount.toFixed(2)} resolved
                            </span>
                        )}
                    </div>
                </div>
                <AlertTriangle className="h-5 w-5 text-amber-400" />
            </div>
        </div>
      </div>

      {autoReconciledCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
          <Bot className="h-4 w-4 shrink-0" />
          <span>
            <strong>{autoReconciledCount}</strong> toll{autoReconciledCount === 1 ? ' was' : 's were'} auto-matched to trips this session.{' '}
            <span className="text-indigo-500">View in History below.</span>
          </span>
        </div>
      )}

      {/* MOI-5: already-resolved tolls flagged for a second look — cuts across
          steps, so it stays a banner above the stepper rather than a step. */}
      <RematchCandidatesQueue driverId={selectedDriverId || undefined} />

      <GuidedSteps
        steps={steps}
        classified={classified}
        suggestions={suggestions}
        trips={trips}
        pClaims={pClaims}
        pUnclaimed={pUnclaimed}
        disputeRefunds={disputeRefunds}
        refundSuggestions={refundSuggestions}
        drivers={drivers}
        claims={claims}
        reconciledTolls={pReconciled}
        loadingTolls={tollsLoading}
        loadingClaims={claimsLoading}
        onSmartReconcile={handleSmartReconcile}
        onApprove={handleApprove}
        onReject={handleReject}
        onFlag={handleFlag}
        onManualResolve={handleManualResolve}
        onEditToll={handleEditToll}
        onRefundMatchComplete={handleRefundMatchComplete}
        onResolveRefund={resolveRefund}
        onBulkResolveRefunds={bulkResolveRefunds}
        unreconcile={unreconcile}
        updateClaim={updateClaim}
        deleteClaim={deleteClaim}
        refreshClaims={refreshClaims}
      />

      {/* Read-only audit views — Resolved / Matched History / All activity,
          kept as one persistent panel below the guided steps (not a step
          itself: nothing here needs a decision). */}
      <HistoryPanel
        pResolved={pResolved}
        onUndoRefund={undoRefund}
        pReconciled={pReconciled}
        trips={trips}
        pClaims={pClaims}
        onUnmatch={unreconcile}
        selectedDriverId={selectedDriverId}
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
                const driverId = pendingDriverId;
                setPendingPersonalTx(null);
                if (tx && driverId) await handleManualResolve(tx, 'Personal', driverId);
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

/** Matches useTollReconciliation.ts's local (unexported) RefundResolution union. */
type RefundResolutionKind = 'cash_wash' | 'phantom' | 'expense_logged' | 'pending';

// ── Guided step content router ─────────────────────────────────────────────
function GuidedSteps(props: {
  steps: ReconciliationStepDef[];
  classified: Record<TollBucket, FinancialTransaction[]>;
  suggestions: Map<string, MatchResult[]>;
  trips: TripType[];
  pClaims: any[];
  pUnclaimed: TripType[];
  disputeRefunds: any[];
  refundSuggestions: any;
  drivers: any[];
  claims: any[];
  reconciledTolls: FinancialTransaction[];
  loadingTolls: boolean;
  loadingClaims: boolean;
  onSmartReconcile: (tx: FinancialTransaction, trip: TripType) => void;
  onApprove: (tx: FinancialTransaction) => void;
  onReject: (tx: FinancialTransaction) => void;
  onFlag: (tx: FinancialTransaction) => void;
  onManualResolve: (tx: FinancialTransaction, type: 'Personal' | 'WriteOff' | 'Business') => void;
  onEditToll: (transactionId: string, updates: Record<string, any>) => Promise<void>;
  onRefundMatchComplete: (event: DisputeMatchEvent) => void;
  onResolveRefund: (tripId: string, resolution: RefundResolutionKind, opts?: { notes?: string; driverId?: string }) => Promise<void> | void;
  onBulkResolveRefunds: (items: Array<{ tripId: string; resolution: RefundResolutionKind; notes?: string; driverId?: string }>) => Promise<any>;
  unreconcile: (tx: FinancialTransaction) => Promise<any>;
  updateClaim: (claim: any) => Promise<any>;
  deleteClaim: (id: string) => Promise<any>;
  refreshClaims: () => void;
}) {
  const [activeStepId, setActiveStepId] = useState<StepId>(() => pickDefaultStep(props.steps) as StepId);

  return (
    <div className="space-y-4">
      <ReconciliationStepper steps={props.steps} activeStepId={activeStepId} onSelect={(id) => setActiveStepId(id as StepId)} />

      <div className="pt-2">
        {activeStepId === 'needs-review' && (
          <TollBucketPanel
            tolls={props.classified['needs-review']}
            suggestions={props.suggestions}
            allTrips={props.trips}
            onReconcile={props.onSmartReconcile}
            onApprove={props.onApprove}
            onReject={props.onReject}
            onFlag={props.onFlag}
            onManualResolve={props.onManualResolve}
            onEdit={props.onEditToll}
            emptyState={{ icon: HelpCircle, title: "No tolls pending review", description: "All tolls have been classified into other steps." }}
            listTitle="Needs Review"
            listDescription="Toll provider charges that haven't been linked to a specific trip."
          />
        )}
        {activeStepId === 'personal-use' && (
          <TollBucketPanel
            tolls={props.classified['personal-use']}
            suggestions={props.suggestions}
            allTrips={props.trips}
            onReconcile={props.onSmartReconcile}
            onApprove={props.onApprove}
            onReject={props.onReject}
            onFlag={props.onFlag}
            onManualResolve={props.onManualResolve}
            onEdit={props.onEditToll}
            emptyState={{ icon: CarFront, title: "No personal use tolls detected", description: "No tolls were classified as personal driver use." }}
            listTitle="Personal Use"
            listDescription="Tolls with no trip explaining them, or matched post-dropoff — likely personal driving."
          />
        )}
        {activeStepId === 'deadhead' && (
          <TollBucketPanel
            tolls={props.classified['deadhead']}
            suggestions={props.suggestions}
            allTrips={props.trips}
            onReconcile={props.onSmartReconcile}
            onApprove={props.onApprove}
            onReject={props.onReject}
            onFlag={props.onFlag}
            onManualResolve={props.onManualResolve}
            onEdit={props.onEditToll}
            approveLabel="Acknowledge (Fleet Cost)"
            emptyState={{ icon: Route, title: "No deadhead tolls found", description: "No unreimbursed business driving tolls detected." }}
            listTitle="Deadhead"
            listDescription="Unreimbursed business driving (en route to pickup) — a fleet cost, no driver liability. Link/Acknowledge closes these out."
          />
        )}
        {activeStepId === 'underpaid-claims' && (
          <UnderpaidClaimsStep
            underpaidTolls={props.classified['underpaid']}
            suggestions={props.suggestions}
            allTrips={props.trips}
            onFlag={props.onFlag}
            onReconcile={props.onSmartReconcile}
            onEdit={props.onEditToll}
            claims={props.claims}
            reconciledTolls={props.reconciledTolls}
            trips={props.trips}
            disputeRefunds={props.disputeRefunds}
            drivers={props.drivers}
            loadingTolls={props.loadingTolls}
            loadingClaims={props.loadingClaims}
            unreconcile={props.unreconcile}
            updateClaim={props.updateClaim}
            deleteClaim={props.deleteClaim}
            refreshClaims={props.refreshClaims}
          />
        )}
        {activeStepId === 'dispute-refunds' && (
          <DisputeRefundsList
            refunds={props.disputeRefunds}
            onMatchComplete={props.onRefundMatchComplete}
          />
        )}
        {activeStepId === 'unlinked-refunds' && (
          <UnclaimedRefundsList
            trips={props.pUnclaimed}
            suggestions={props.refundSuggestions}
            drivers={props.drivers}
            onResolve={props.onResolveRefund}
            onBulkResolve={props.onBulkResolveRefunds}
          />
        )}
      </div>
    </div>
  );
}

// ── Persistent read-only history (Resolved / Matched History / All activity) ──
function HistoryPanel(props: {
  pResolved: TripType[];
  onUndoRefund: (tripId: string) => Promise<void> | void;
  pReconciled: FinancialTransaction[];
  trips: TripType[];
  pClaims: any[];
  onUnmatch: (tx: FinancialTransaction) => Promise<any>;
  selectedDriverId: string;
}) {
  return (
    <div className="border-t border-slate-200 pt-6">
      <div className="flex items-center gap-2 mb-4">
        <HistoryIcon className="h-4 w-4 text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-700">History</h3>
        <span className="text-xs text-slate-400">Read-only audit trail — nothing here needs a decision.</span>
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
            rows={props.pResolved.map((t): ResolvedRefundRow => ({
              id: t.id,
              date: t.date,
              platform: t.platform,
              driverId: t.driverId,
              driverName: t.driverName,
              tollCharges: t.tollCharges,
              pickupLocation: t.pickupLocation,
              dropoffLocation: t.dropoffLocation,
              resolution: (t.tollRefundResolution?.status as ResolvedRefundRow['resolution']) || 'cash_wash',
              resolvedBy: t.tollRefundResolution?.resolvedBy,
              resolvedAt: t.tollRefundResolution?.resolvedAt,
              auto: t.tollRefundResolution?.auto,
            }))}
            onUndo={props.onUndoRefund}
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
          <UnifiedTollActivityTable driverId={props.selectedDriverId || undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
