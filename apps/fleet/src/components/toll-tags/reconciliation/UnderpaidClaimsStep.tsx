import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Button } from "../../ui/button";
import { toast } from "sonner@2.0.3";
import { Download, Wallet, CheckCircle2, FileX, UserMinus, AlertCircle, Timer, Banknote, DollarSign } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../ui/alert-dialog";
import { LossList } from "../../claimable-loss/LossList";
import { PendingReimbursementList } from "../../claimable-loss/PendingReimbursementList";
import { DisputeLostList } from "../../claimable-loss/DisputeLostList";
import { ResolvedHistoryList } from "../../claimable-loss/ResolvedHistoryList";
import { DisputeModal } from "../../claimable-loss/DisputeModal";
import { ClaimDetailOverlay } from "../../claimable-loss/ClaimDetailOverlay";
import { StatCard } from "../../claimable-loss/StatCard";
import { TollBucketPanel } from "./TollBucketPanel";
import { FinancialTransaction, Trip, Claim, DisputeRefund } from "../../../types/data";
import { MatchResult } from "../../../utils/tollReconciliation";
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
  underpaidTolls: FinancialTransaction[];
  suggestions: Map<string, MatchResult[]>;
  allTrips: Trip[];
  onFlag: (tx: FinancialTransaction) => void;
  /** Tag-imported underpaid tolls (no cash claim) fall to the generic "Link"
   *  action instead of "Flag" — same underlying reconcile() call either way. */
  onReconcile: (tx: FinancialTransaction, trip: Trip) => void;
  onEdit?: (transactionId: string, updates: Record<string, any>) => Promise<void>;

  claims: Claim[];
  reconciledTolls: FinancialTransaction[];
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  drivers: any[];
  loadingTolls: boolean;
  loadingClaims: boolean;
  unreconcile: (tx: FinancialTransaction) => Promise<any>;
  updateClaim: (claim: Claim) => Promise<any>;
  deleteClaim: (id: string) => Promise<any>;
  refreshClaims: () => void;
}

export function UnderpaidClaimsStep({
  underpaidTolls, suggestions, allTrips, onFlag, onReconcile, onEdit,
  claims, reconciledTolls, trips, disputeRefunds, drivers, loadingTolls, loadingClaims,
  unreconcile, updateClaim, deleteClaim, refreshClaims,
}: UnderpaidClaimsStepProps) {
  const tripMap = useMemo(() => new Map(trips.map(t => [t.id, t])), [trips]);

  const getDriverName = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId || d.uberDriverId === driverId || d.inDriveDriverId === driverId);
    if (driver) return driver.name;
    const trip = trips.find(t => t.driverId === driverId && t.driverName);
    if (trip && trip.driverName) return trip.driverName;
    return driverId;
  };

  const [selectedLoss, setSelectedLoss] = useState<{ transaction: FinancialTransaction, match: MatchResult } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClaimDetail, setSelectedClaimDetail] = useState<Claim | null>(null);
  const [isClaimDetailOpen, setIsClaimDetailOpen] = useState(false);
  const [itemsToDelete, setItemsToDelete] = useState<string[]>([]);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; description: string; actionLabel: string;
    onConfirm: () => void; isDestructive?: boolean;
  }>({ isOpen: false, title: "", description: "", actionLabel: "Continue", onConfirm: () => {}, isDestructive: false });

  const refundByTollId = useMemo(() => {
    const map = new Map<string, DisputeRefund>();
    (disputeRefunds || []).forEach(r => { if (r.matchedTollId) map.set(r.matchedTollId, r); });
    return map;
  }, [disputeRefunds]);

  const activeTransactionIds = new Set(claims.map(c => c.transactionId));

  const losses = useMemo(() => {
    const confirmedLosses = reconciledTolls.map(tx => {
      if (!tx.tripId) return null;
      const trip = tripMap.get(tx.tripId);
      if (!trip) return null;
      const tollCost = Math.abs(tx.amount);
      const uberRefund = trip.tollCharges || 0;
      if (uberRefund < tollCost - 0.05) {
        // Explicit MatchResult annotation (not `satisfies`) so string fields
        // widen to `string` instead of inferring as narrow literals — the
        // filter's type predicate below needs MatchResult to be assignable
        // to this object's own inferred type, which fails if `reason` infers
        // as a literal string type narrower than MatchResult's `reason: string`.
        const match: MatchResult = {
          transaction: tx, trip, matchType: 'AMOUNT_VARIANCE', confidence: 'high',
          varianceAmount: uberRefund - tollCost, reason: 'Underpaid — platform reimbursed less than the toll cost',
          timeDifferenceMinutes: 0,
        };
        return { transaction: tx, match };
      }
      return null;
    }).filter((item): item is { transaction: FinancialTransaction, match: MatchResult } => item !== null);

    const uniqueLosses = Array.from(new Map(confirmedLosses.map(item => [item.transaction.id, item])).values());
    return uniqueLosses
      .filter(item => !activeTransactionIds.has(item.transaction.id))
      .sort((a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime());
  }, [reconciledTolls, tripMap, activeTransactionIds]);

  const pendingClaims = claims.filter(c => c.status === 'Submitted_to_Uber');
  const lostClaims = claims.filter(c => c.status === 'Rejected');
  const awaitingDriverClaims = claims.filter(c => c.status === 'Sent_to_Driver');
  const resolvedClaims = claims.filter(c => c.status === 'Resolved');

  const { unclaimedTotal, pendingTotal, atRiskTotal } = useMemo(() => {
    const unclaimed = losses.reduce((sum, item) => sum + Math.abs(item.match.varianceAmount || 0), 0);
    const pending = claims
      .filter(c => c.status === 'Submitted_to_Uber' || c.status === 'Sent_to_Driver')
      .reduce((sum, c) => sum + c.amount, 0);
    const atRisk = claims.filter(c => c.status === 'Rejected').reduce((sum, c) => sum + c.amount, 0);
    return { unclaimedTotal: unclaimed, pendingTotal: pending, atRiskTotal: atRisk };
  }, [losses, claims]);

  const { reimbursedTotal, writeOffTotal, chargedToDriverTotal, netResult } = useMemo(() => {
    const reimbursed = resolvedClaims.filter(c => c.resolutionReason === 'Reimbursed').reduce((sum, c) => sum + c.amount, 0);
    const writeOff = resolvedClaims.filter(c => c.resolutionReason === 'Write Off' || c.resolutionReason === 'Business Expense').reduce((sum, c) => sum + c.amount, 0);
    const charged = resolvedClaims.filter(c => c.resolutionReason === 'Charge Driver').reduce((sum, c) => sum + c.amount, 0);
    return { reimbursedTotal: reimbursed, writeOffTotal: writeOff, chargedToDriverTotal: charged, netResult: (reimbursed + charged) - writeOff };
  }, [resolvedClaims]);

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

  const handleChargeDriver = async (claim: Claim) => {
    try {
      await updateClaim({ ...claim, status: 'Resolved', resolutionReason: 'Charge Driver', updatedAt: new Date().toISOString() });
      toast.success(`Claim resolved. $${claim.amount.toFixed(2)} will be deducted from driver pay.`);
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

  const handleReverseLoss = async (item: { transaction: FinancialTransaction, match: MatchResult }) => {
    try {
      await unreconcile(item.transaction);
      toast.success("Transaction reversed to Needs Review");
    } catch (error) { toast.error("Failed to reverse transaction"); }
  };

  const handleBulkReverse = (items: { transaction: FinancialTransaction, match: MatchResult }[]) => {
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Underpaid & Claims</h3>
        <p className="text-sm text-slate-500">
          Tolls the platform reimbursed for less than they cost — flag them, then track the claim through to resolution.
        </p>
      </div>

      {/* Step 1 of this step: tolls still needing to be linked/flagged */}
      {underpaidTolls.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700">Needs flagging ({underpaidTolls.length})</h4>
          <TollBucketPanel
            tolls={underpaidTolls}
            suggestions={suggestions}
            allTrips={allTrips}
            onReconcile={onReconcile}
            onFlag={onFlag}
            onEdit={onEdit}
            emptyState={{ icon: DollarSign, title: "No underpaid tolls found", description: "All platform reimbursements match the actual toll amounts." }}
            listTitle="Underpaid Tolls"
            listDescription="Reimbursed for less than the toll cost — flag to move into the claim pipeline below."
          />
        </div>
      )}

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

      <Tabs defaultValue="unmatched" className="w-full">
        <TabsList className="grid w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 lg:max-w-[1000px]">
          <TabsTrigger value="unmatched">
            Underpaid Tolls {losses.length > 0 && <span className="ml-2 bg-slate-200 text-slate-700 px-1.5 rounded-full text-xs">{losses.length}</span>}
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
        onClose={() => { setIsModalOpen(false); refreshClaims(); }}
        lossItem={selectedLoss}
      />

      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete {itemsToDelete.length} resolved claims from the history.
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
