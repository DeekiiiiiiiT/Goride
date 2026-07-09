import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Button } from "../../ui/button";
import { toast } from "sonner@2.0.3";
import { Download, Wallet, CheckCircle2, FileX, UserMinus, AlertCircle, Timer, Banknote } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { LossList, type LossItem } from "../../claimable-loss/LossList";
import { PartiallyCoveredList } from "../../claimable-loss/PartiallyCoveredList";
import { PendingReimbursementList } from "../../claimable-loss/PendingReimbursementList";
import { DisputeLostList } from "../../claimable-loss/DisputeLostList";
import { ResolvedHistoryList } from "../../claimable-loss/ResolvedHistoryList";
import { DisputeModal } from "../../claimable-loss/DisputeModal";
import { ClaimDetailOverlay } from "../../claimable-loss/ClaimDetailOverlay";
import { StatCard } from "../../claimable-loss/StatCard";
import { FinancialTransaction, Trip, Claim, DisputeRefund } from "../../../types/data";
import { MatchResult, VARIANCE_THRESHOLD, calculateTollFinancials, buildTollFinancialsContext, buildTripRefundAllocation } from "../../../utils/tollReconciliation";
import { hasBlockingUnlinkedRefund } from "../../../utils/unlinkedShortfallEligibility";
import { buildClaimByTollId, dedupeClaimsForDisplay, collectDuplicateClaimIds } from "../../../utils/claimByToll";
import { isActionablePartialShortfall } from "../../../utils/tollWeekPeriod";
import { guardClaimChargeAmount } from "../../../utils/claimChargeGuard";
import { formatDateJM } from "../../../utils/csv-helper";

/**
 * "Underpaid & Claims" step — folds the former standalone Claimable Loss
 * page (pages/ClaimableLoss.tsx, now deleted) into the guided Toll
 * Reconciliation flow as one step, since it's really the direct continuation
 * of "Underpaid" (file/track the claim), not an unrelated screen. Hosts two
 * sub-concerns: tolls still needing to be flagged/linked (from the Underpaid
 * bucket) and the claim lifecycle (Loss → Awaiting Driver → Pending Uber →
 * Lost/Resolved) previously owned by that page — logic ported largely
 * unchanged, since `updateClaim` already dispatches through the consolidated
 * claim_service.ts server-side (Phase B).
 */

interface UnderpaidClaimsStepProps {
  /** Period-scoped claims for pipeline tabs and stats. */
  claims: Claim[];
  /** All-time claims — used to link tolls ↔ claims (prevents duplicate filing). */
  allClaims: Claim[];
  reconciledTolls: FinancialTransaction[];
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  /** Open unlinked trip refunds — blocks Charge Driver until applied. */
  unlinkedRefundTrips?: Trip[];
  /** Undo apply-to-underpaid from claim history (trip id). */
  onUndoUnlinkedApply?: (tripId: string) => Promise<void> | void;
  busyUnlinkedTripId?: string | null;
  /** Trip + dispute refunds for this period — matches top overview Reimbursed card. */
  periodReimbursedAmount?: number;
  /** Charge Driver total for this period — matches top overview card. */
  periodChargedToDrivers?: number;
  drivers: any[];
  loadingTolls: boolean;
  loadingClaims: boolean;
  unreconcile: (tx: FinancialTransaction) => Promise<any>;
  createClaim: (claim: Partial<Claim>) => Promise<any>;
  updateClaim: (claim: Claim) => Promise<any>;
  deleteClaim: (id: string) => Promise<any>;
  refreshClaims: () => void;
}

export function UnderpaidClaimsStep({
  claims, allClaims, reconciledTolls, trips, disputeRefunds, unlinkedRefundTrips = [], onUndoUnlinkedApply, busyUnlinkedTripId,
  periodReimbursedAmount,
  periodChargedToDrivers,
  drivers, loadingTolls, loadingClaims,
  unreconcile, createClaim, updateClaim, deleteClaim, refreshClaims,
}: UnderpaidClaimsStepProps) {
  const tripMap = useMemo(() => new Map(trips.map(t => [t.id, t])), [trips]);

  const getDriverName = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId || d.uberDriverId === driverId || d.inDriveDriverId === driverId);
    if (driver) return driver.name;
    const trip = trips.find(t => t.driverId === driverId && t.driverName);
    if (trip && trip.driverName) return trip.driverName;
    return driverId;
  };

  const [selectedLoss, setSelectedLoss] = useState<LossItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('unmatched');
  const [selectedClaimDetail, setSelectedClaimDetail] = useState<Claim | null>(null);
  const [isClaimDetailOpen, setIsClaimDetailOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; description: string; actionLabel: string;
    onConfirm: () => void; isDestructive?: boolean;
  }>({ isOpen: false, title: "", description: "", actionLabel: "Continue", onConfirm: () => {}, isDestructive: false });

  const prunedDupesRef = useRef('');

  useEffect(() => {
    if (loadingClaims) return;
    const dupIds = collectDuplicateClaimIds(allClaims);
    const key = [...dupIds].sort().join(',');
    if (!dupIds.length || prunedDupesRef.current === key) return;

    let cancelled = false;
    (async () => {
      try {
        await Promise.all(dupIds.map((id) => deleteClaim(id)));
        if (cancelled) return;
        prunedDupesRef.current = key;
        refreshClaims();
      } catch {
        if (!cancelled) toast.error('Failed to remove duplicate claims');
      }
    })();
    return () => { cancelled = true; };
  }, [allClaims, loadingClaims, deleteClaim, refreshClaims]);

  const refundByTollId = useMemo(() => {
    const map = new Map<string, DisputeRefund>();
    (disputeRefunds || []).forEach(r => { if (r.matchedTollId) map.set(r.matchedTollId, r); });
    return map;
  }, [disputeRefunds]);

  const claimByTollId = useMemo(() => buildClaimByTollId(allClaims), [allClaims]);

  const allocation = useMemo(
    () => buildTripRefundAllocation(reconciledTolls, tripMap),
    [reconciledTolls, tripMap],
  );

  const reconciledTollIds = useMemo(
    () => new Set(reconciledTolls.map((t) => t.id)),
    [reconciledTolls],
  );

  const visibleTollIds = useMemo(() => {
    const ids = new Set(reconciledTollIds);
    claims.forEach((c) => { if (c.transactionId) ids.add(c.transactionId); });
    return ids;
  }, [reconciledTollIds, claims]);

  const reconciledTollById = useMemo(
    () => new Map(reconciledTolls.map((t) => [t.id, t])),
    [reconciledTolls],
  );

  const partialClaims = useMemo(
    () =>
      dedupeClaimsForDisplay(
        allClaims.filter((c) => {
          if (!c.transactionId || !visibleTollIds.has(c.transactionId)) return false;
          return isActionablePartialShortfall(c, reconciledTollById.get(c.transactionId));
        }),
      ).displayClaims,
    [allClaims, visibleTollIds, reconciledTollById],
  );

  const partialByTollId = useMemo(
    () => new Map(partialClaims.map((c) => [c.transactionId!, c])),
    [partialClaims],
  );

  const losses = useMemo(() => {
    const items: LossItem[] = [];
    for (const tx of reconciledTolls) {
      if (!tx.tripId) continue;
      const trip = tripMap.get(tx.tripId);
      if (!trip) continue;
      const claim = claimByTollId.get(tx.id);

      // Only hide from Underpaid when Partially Covered will show this toll.
      if (partialByTollId.has(tx.id)) continue;

      if (claim && ['Sent_to_Driver', 'Submitted_to_Uber', 'Rejected'].includes(claim.status)) {
        continue;
      }
      if (claim?.status === 'Resolved' && !isActionablePartialShortfall(claim, reconciledTollById.get(tx.id))) {
        continue;
      }

      const ctx = buildTollFinancialsContext(tx, trip, claim, trips, disputeRefunds, allocation);
      const financials = calculateTollFinancials(tx, trip, claim, ctx);
      if (financials.netLoss <= VARIANCE_THRESHOLD) continue;

      const match: MatchResult = {
        transaction: tx,
        trip,
        matchType: 'AMOUNT_VARIANCE',
        confidence: 'high',
        varianceAmount: -financials.netLoss,
        reason: 'Underpaid — platform reimbursed less than the toll cost',
        timeDifferenceMinutes: 0,
      };
      items.push({ transaction: tx, match, claim, financials });
    }
    return items.sort(
      (a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime(),
    );
  }, [reconciledTolls, tripMap, claimByTollId, partialByTollId, trips, disputeRefunds, allocation, reconciledTollById]);

  const pendingClaims = useMemo(
    () => dedupeClaimsForDisplay(claims.filter((c) => c.status === 'Submitted_to_Uber')).displayClaims,
    [claims],
  );
  const lostClaims = useMemo(
    () => dedupeClaimsForDisplay(claims.filter((c) => c.status === 'Rejected')).displayClaims,
    [claims],
  );
  const awaitingDriverClaims = useMemo(
    () => dedupeClaimsForDisplay(claims.filter((c) => c.status === 'Sent_to_Driver')).displayClaims,
    [claims],
  );

  const resolvedClaims = useMemo(
    () => dedupeClaimsForDisplay(claims.filter((c) => c.status === 'Resolved')).displayClaims,
    [claims],
  );

  const { unclaimedTotal, pendingTotal, atRiskTotal } = useMemo(() => {
    const lossTotal = losses.reduce((sum, item) => sum + item.financials.netLoss, 0);
    const partialTotal = partialClaims.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const unclaimed = lossTotal + partialTotal;
    const pipelinePending = dedupeClaimsForDisplay(
      claims.filter((c) => c.status === 'Submitted_to_Uber' || c.status === 'Sent_to_Driver'),
    ).displayClaims;
    const pending =
      pipelinePending.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) + partialTotal;
    const atRisk = dedupeClaimsForDisplay(claims.filter((c) => c.status === 'Rejected')).displayClaims
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    return { unclaimedTotal: unclaimed, pendingTotal: pending, atRiskTotal: atRisk };
  }, [losses, partialClaims, claims]);

  const { reimbursedTotal, writeOffTotal, chargedToDriverTotal, netResult } = useMemo(() => {
    const reimbursed =
      periodReimbursedAmount ??
      resolvedClaims
        .filter((c) => c.resolutionReason === 'Reimbursed')
        .reduce((sum, c) => sum + (Number(c.paidAmount) || 0), 0);
    const writeOff = resolvedClaims
      .filter((c) => c.resolutionReason === 'Write Off' || c.resolutionReason === 'Business Expense')
      .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    const charged =
      periodChargedToDrivers ??
      resolvedClaims
        .filter((c) => c.resolutionReason === 'Charge Driver')
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    return {
      reimbursedTotal: reimbursed,
      writeOffTotal: writeOff,
      chargedToDriverTotal: charged,
      netResult: reimbursed + charged - writeOff,
    };
  }, [resolvedClaims, periodReimbursedAmount, periodChargedToDrivers]);

  const handleResolve = async (claim: Claim) => {
    try {
      await updateClaim({ ...claim, status: 'Resolved', resolutionReason: 'Reimbursed', updatedAt: new Date().toISOString() });
      toast.success("Claim resolved and verified!");
      refreshClaims();
    } catch (e) { toast.error("Failed to resolve claim"); }
  };

  const handleRevert = async (claim: Claim) => {
    try {
      await updateClaim({ ...claim, status: 'Rejected', updatedAt: new Date().toISOString() });
      toast.info("Claim marked as rejected/lost.");
      refreshClaims();
    } catch (e) { toast.error("Failed to revert claim"); }
  };

  const handleRetry = async (claim: Claim) => {
    try {
      await updateClaim({ ...claim, status: 'Sent_to_Driver', updatedAt: new Date().toISOString() });
      toast.success("Claim re-opened and sent to driver.");
      refreshClaims();
    } catch (e) { toast.error("Failed to re-open claim"); }
  };

  const guardChargeAmountForClaim = (claim: Claim) => {
    const tx = reconciledTolls.find((t) => t.id === claim.transactionId);
    const trip = claim.tripId ? tripMap.get(claim.tripId) : tx?.tripId ? tripMap.get(tx.tripId) : undefined;
    if (!tx) return { ok: true as const, amount: Math.abs(Number(claim.amount) || 0) };
    return guardClaimChargeAmount({
      chargeAmount: Number(claim.amount) || 0,
      tollCost: Math.abs(tx.amount),
      platformRefund: trip?.tollCharges ?? 0,
      claimPaidAmount: claim.paidAmount ?? 0,
    });
  };

  const handleChargeDriver = async (claim: Claim) => {
    if (hasBlockingUnlinkedRefund({ claimDriverId: claim.driverId, unlinkedTrips: unlinkedRefundTrips })) {
      toast.error('Pick Apply to underpaid on Unlinked Refunds first', {
        description: 'This driver still has an open unlinked trip refund that may cover this shortfall.',
      });
      return;
    }
    const coveredByDispute = disputeRefunds.some(
      (r) =>
        (r.status === 'matched' || r.status === 'auto_resolved') &&
        (r.matchedClaimId === claim.id || r.matchedTollId === claim.transactionId),
    );
    if (coveredByDispute) {
      toast.error('A dispute refund already covers this toll — set Reimbursed instead of charging the driver.');
      return;
    }
    const chargeGuard = guardChargeAmountForClaim(claim);
    if (!chargeGuard.ok) {
      toast.error('Cannot charge full toll amount', {
        description: `${chargeGuard.message} Charge $${chargeGuard.suggestedAmount.toFixed(2)} instead.`,
      });
      return;
    }
    try {
      await updateClaim({
        ...claim,
        amount: chargeGuard.amount,
        status: 'Resolved',
        resolutionReason: 'Charge Driver',
        updatedAt: new Date().toISOString(),
      });
      toast.success(`Claim resolved. $${chargeGuard.amount.toFixed(2)} will be deducted from driver pay.`);
      refreshClaims();
    } catch (e) { toast.error("Failed to charge driver"); }
  };

  const handleWriteOff = async (claim: Claim) => {
    try {
      await updateClaim({ ...claim, status: 'Resolved', resolutionReason: 'Write Off', updatedAt: new Date().toISOString() });
      toast.success("Claim written off as company loss.");
      refreshClaims();
    } catch (e) { toast.error("Failed to write off claim"); }
  };

  const handleUpdateStatus = async (claim: Claim, newReason: 'Charge Driver' | 'Write Off' | 'Reimbursed') => {
    if (newReason === 'Charge Driver' && hasBlockingUnlinkedRefund({ claimDriverId: claim.driverId, unlinkedTrips: unlinkedRefundTrips })) {
      toast.error('Pick Apply to underpaid on Unlinked Refunds first');
      return;
    }
    if (newReason === 'Charge Driver') {
      const chargeGuard = guardChargeAmountForClaim(claim);
      if (!chargeGuard.ok) {
        toast.error('Cannot charge full toll amount', {
          description: `${chargeGuard.message} Charge $${chargeGuard.suggestedAmount.toFixed(2)} instead.`,
        });
        return;
      }
      try {
        await updateClaim({
          ...claim,
          amount: chargeGuard.amount,
          resolutionReason: newReason,
          updatedAt: new Date().toISOString(),
        });
        toast.success(`Claim updated to: ${newReason}`);
        refreshClaims();
      } catch (e) { toast.error("Failed to update claim status"); }
      return;
    }
    try {
      await updateClaim({ ...claim, resolutionReason: newReason, updatedAt: new Date().toISOString() });
      toast.success(`Claim updated to: ${newReason}`);
      refreshClaims();
    } catch (e) { toast.error("Failed to update claim status"); }
  };

  const handleDeleteClaims = (ids: string[]) => {
    setItemsToDelete(ids);
    setIsDeleteAlertOpen(true);
  };

  const confirmDelete = async () => {
    const linked = itemsToDelete
      .map((id) => claims.find((c) => c.id === id))
      .filter((c) => c?.unlinkedTripId);
    if (linked.length > 0) {
      toast.error('Cannot delete — use Undo Apply for unlinked-linked claims', {
        description: `${linked.length} selected claim(s) are tied to an unlinked refund apply.`,
      });
      setIsDeleteAlertOpen(false);
      setItemsToDelete([]);
      return;
    }
    try {
      await Promise.all(itemsToDelete.map(id => deleteClaim(id)));
      toast.success(`Successfully deleted ${itemsToDelete.length} claims`);
      refreshClaims();
    } catch (e) {
      toast.error("Failed to delete claims");
    } finally {
      setIsDeleteAlertOpen(false);
      setItemsToDelete([]);
    }
  };

  const handleExport = () => {
    if (pendingClaims.length === 0) {
      toast.error("No pending claims to export");
      return;
    }
    const headers = ['Date', 'Driver', 'Trip ID', 'Amount', 'Pickup', 'Dropoff', 'Status', 'Message'];
    const csvRows = [headers.join(',')];
    pendingClaims.forEach(claim => {
      const row = [
        formatDateJM(claim.createdAt), `"${getDriverName(claim.driverId)}"`, claim.tripId || '',
        claim.amount.toFixed(2), `"${claim.pickup || ''}"`, `"${claim.dropoff || ''}"`,
        claim.status, `"${(claim.message || '').replace(/"/g, '""')}"`,
      ];
      csvRows.push(row.join(','));
    });
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `uber_claims_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReverseLoss = async (item: LossItem) => {
    try {
      await unreconcile(item.transaction);
      toast.success("Transaction reversed to Needs Review");
    } catch (error) { toast.error("Failed to reverse transaction"); }
  };

  const handleBulkReverse = (items: LossItem[]) => {
    if (!items.length) return;
    setConfirmDialog({
      isOpen: true, title: "Reverse Transactions",
      description: `Are you sure you want to reverse ${items.length} items? They will be sent back to Needs Review.`,
      actionLabel: "Reverse",
      onConfirm: async () => {
        let successCount = 0, failCount = 0;
        const toastId = toast.loading(`Reversing ${items.length} transactions...`);
        try {
          await Promise.all(items.map(async (item) => {
            try { await unreconcile(item.transaction); successCount++; }
            catch (e) { console.error(e); failCount++; }
          }));
          toast.dismiss(toastId);
          if (failCount > 0) toast.warning(`Reversed ${successCount} items. Failed: ${failCount}`);
          else toast.success(`Successfully reversed ${successCount} items`);
        } catch (e) {
          toast.dismiss(toastId);
          toast.error("Batch processing failed");
        }
      },
    });
  };

  const handleBulkUpdateStatus = (claimsToUpdate: Claim[], status: Claim['status'], reason?: Claim['resolutionReason']) => {
    if (!claimsToUpdate.length) return;
    if (reason === 'Charge Driver') {
      const blocked = claimsToUpdate.filter((c) =>
        hasBlockingUnlinkedRefund({ claimDriverId: c.driverId, unlinkedTrips: unlinkedRefundTrips }),
      );
      if (blocked.length > 0) {
        toast.error(`${blocked.length} claim(s) blocked — apply Unlinked Refunds for those drivers first`);
        return;
      }
    }
    const isReject = status === 'Rejected';
    const actionWord = isReject ? 'Reject' : 'Update';
    setConfirmDialog({
      isOpen: true, title: `${actionWord} Claims`,
      description: `Are you sure you want to update ${claimsToUpdate.length} claims to ${status}?`,
      actionLabel: actionWord, isDestructive: isReject,
      onConfirm: async () => {
        const toastId = toast.loading(`Updating ${claimsToUpdate.length} claims...`);
        let successCount = 0, failCount = 0;
        try {
          await Promise.all(claimsToUpdate.map(async (c) => {
            try {
              await updateClaim({ ...c, status: status as any, resolutionReason: reason, updatedAt: new Date().toISOString() });
              successCount++;
            } catch (e) { failCount++; }
          }));
          toast.dismiss(toastId);
          if (failCount > 0) toast.warning(`Updated ${successCount} claims. Failed: ${failCount}`);
          else toast.success(`Successfully updated ${successCount} claims`);
          refreshClaims();
        } catch (e) {
          toast.dismiss(toastId);
          toast.error("Batch processing failed");
        }
      },
    });
  };

  const handleClaimSentToDriver = () => {
    setActiveTab('awaiting');
    refreshClaims();
  };

  const handleSendPartialToDriver = async (claim: Claim) => {
    const tx = reconciledTolls.find((t) => t.id === claim.transactionId);
    const trip = claim.tripId ? tripMap.get(claim.tripId) : undefined;
    if (!tx || !trip) {
      toast.error('Missing toll or trip link for this claim');
      return;
    }
    const ctx = buildTollFinancialsContext(tx, trip, claim, trips, disputeRefunds, allocation);
    const financials = calculateTollFinancials(tx, trip, claim, ctx);
    setSelectedLoss({
      transaction: tx,
      match: {
        transaction: tx,
        trip,
        matchType: 'AMOUNT_VARIANCE',
        confidence: 'high',
        varianceAmount: -financials.netLoss,
        reason: 'Partial shortfall after credits applied',
        timeDifferenceMinutes: 0,
      },
      claim,
      financials,
    });
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Underpaid & Claims</h3>
        <p className="text-sm text-slate-500">
          Tolls the platform reimbursed for less than they cost — flag them, then track the claim through to resolution.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-slate-700">Claim pipeline</h4>
          <Button onClick={handleExport} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Unclaimed Potential" amount={unclaimedTotal} type="neutral" icon={Banknote} />
          <StatCard title="Pending Recovery" amount={pendingTotal} type="info" icon={Timer} />
          <StatCard title="Action Required" amount={atRiskTotal} type="warning" icon={AlertCircle} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard title="Net Result" amount={netResult} type="net" icon={Wallet} />
          <StatCard title="Reimbursed" amount={reimbursedTotal} type="gain" icon={CheckCircle2} />
          <StatCard title="Written Off" amount={writeOffTotal * -1} type="loss" icon={FileX} />
          <StatCard title="Charged to Drivers" amount={chargedToDriverTotal} type="gain" icon={UserMinus} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6 lg:max-w-[1100px]">
          <TabsTrigger value="unmatched">
            Underpaid Tolls {losses.length > 0 && <span className="ml-2 bg-slate-200 text-slate-700 px-1.5 rounded-full text-xs">{losses.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="partial">
            Partially Covered {partialClaims.length > 0 && <span className="ml-2 bg-amber-100 text-amber-800 px-1.5 rounded-full text-xs">{partialClaims.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="awaiting">
            Awaiting Driver {awaitingDriverClaims.length > 0 && <span className="ml-2 bg-orange-100 text-orange-700 px-1.5 rounded-full text-xs">{awaitingDriverClaims.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="pending">
            Reimbursement Pending {pendingClaims.length > 0 && <span className="ml-2 bg-blue-100 text-blue-700 px-1.5 rounded-full text-xs">{pendingClaims.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="lost">
            Dispute Lost {lostClaims.length > 0 && <span className="ml-2 bg-red-100 text-red-700 px-1.5 rounded-full text-xs">{lostClaims.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="resolved">History</TabsTrigger>
        </TabsList>

        <TabsContent value="unmatched" className="mt-6">
          <LossList
            losses={losses}
            isLoading={loadingTolls || loadingClaims}
            onSelectLoss={(item) => { setSelectedLoss(item); setIsModalOpen(true); }}
            onReverse={handleReverseLoss}
            onBulkReverse={handleBulkReverse}
            onUndoUnlinkedApply={onUndoUnlinkedApply}
            busyUnlinkedTripId={busyUnlinkedTripId}
          />
        </TabsContent>

        <TabsContent value="partial" className="mt-6">
          <PartiallyCoveredList
            claims={allClaims}
            tollIds={visibleTollIds}
            tollById={reconciledTollById}
            trips={trips}
            isLoading={loadingClaims}
            getDriverName={getDriverName}
            onChargeDriver={handleChargeDriver}
            onWriteOff={handleWriteOff}
            onSendToDriver={handleSendPartialToDriver}
            onSelectClaim={(claim) => { setSelectedClaimDetail(claim); setIsClaimDetailOpen(true); }}
          />
        </TabsContent>

        <TabsContent value="awaiting" className="mt-6">
          <PendingReimbursementList
            claims={awaitingDriverClaims}
            isLoading={loadingClaims}
            onResolve={(c) => handleRetry(c)}
            onRevert={(c) => handleRevert(c)}
            onBulkResolve={(cs) => handleBulkUpdateStatus(cs, 'Sent_to_Driver')}
            onBulkRevert={(cs) => handleBulkUpdateStatus(cs, 'Rejected')}
            title="Awaiting Driver Submission"
            description="Claims sent to drivers but not yet submitted to Uber."
            getDriverName={getDriverName}
            refundByTollId={refundByTollId}
          />
          <p className="text-xs text-slate-500 mt-2 text-center">
            * These claims have been sent to drivers but they haven't submitted them to Uber yet.
          </p>
        </TabsContent>

        <TabsContent value="pending" className="mt-6">
          <PendingReimbursementList
            claims={pendingClaims}
            isLoading={loadingClaims}
            onResolve={handleResolve}
            onRevert={handleRevert}
            onBulkResolve={(cs) => handleBulkUpdateStatus(cs, 'Resolved', 'Reimbursed')}
            onBulkRevert={(cs) => handleBulkUpdateStatus(cs, 'Rejected')}
            getDriverName={getDriverName}
            refundByTollId={refundByTollId}
          />
        </TabsContent>

        <TabsContent value="lost" className="mt-6">
          <DisputeLostList
            claims={lostClaims}
            isLoading={loadingClaims}
            onRetry={handleRetry}
            onChargeDriver={handleChargeDriver}
            onWriteOff={handleWriteOff}
            onBulkRetry={(cs) => handleBulkUpdateStatus(cs, 'Sent_to_Driver')}
            onBulkCharge={(cs) => handleBulkUpdateStatus(cs, 'Resolved', 'Charge Driver')}
            onBulkWriteOff={(cs) => handleBulkUpdateStatus(cs, 'Resolved', 'Write Off')}
            getDriverName={getDriverName}
          />
        </TabsContent>

        <TabsContent value="resolved" className="mt-6">
          <ResolvedHistoryList
            claims={resolvedClaims}
            isLoading={loadingClaims}
            getDriverName={getDriverName}
            onDelete={handleDeleteClaims}
            onUpdateStatus={handleUpdateStatus}
            onSelectClaim={(claim) => { setSelectedClaimDetail(claim); setIsClaimDetailOpen(true); }}
            trips={trips}
            onUndoUnlinkedApply={onUndoUnlinkedApply}
            busyUnlinkedTripId={busyUnlinkedTripId}
          />
        </TabsContent>
      </Tabs>

      <ClaimDetailOverlay
        isOpen={isClaimDetailOpen}
        onClose={() => setIsClaimDetailOpen(false)}
        claim={selectedClaimDetail}
        trip={selectedClaimDetail?.tripId ? tripMap.get(selectedClaimDetail.tripId) : null}
        getDriverName={getDriverName}
      />

      <DisputeModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setSelectedLoss(null); }}
        lossItem={selectedLoss ? { transaction: selectedLoss.transaction, match: selectedLoss.match } : null}
        claim={selectedLoss?.claim ?? null}
        financials={selectedLoss?.financials}
        onCreateClaim={createClaim}
        onUpdateClaim={updateClaim}
        onClaimSuccess={handleClaimSentToDriver}
      />

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Deleting {itemsToDelete.length} claim(s) removes them from history and the toll may return as a full underpaid loss. Claims linked to an unlinked refund apply must be undone instead of deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, isOpen: open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(prev => ({ ...prev, isOpen: false })); }}
              className={confirmDialog.isDestructive ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {confirmDialog.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
