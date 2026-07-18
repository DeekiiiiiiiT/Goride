import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { Button } from "../../ui/button";
import { toast } from "sonner@2.0.3";
import { Download, FileX, AlertCircle, Timer, Banknote } from "lucide-react";
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
import { MatchResult, calculateTollFinancials, buildTollFinancialsContext, buildTripRefundAllocation, spentUnlinkedCreditsByTripId } from "../../../utils/tollReconciliation";
import { hasBlockingUnlinkedRefund } from "../../../utils/unlinkedShortfallEligibility";
import { buildClaimByTollId, dedupeClaimsForDisplay, collectDuplicateClaimIds } from "../../../utils/claimByToll";
import { isVisiblePartialShortfallClaim, isTollCoveredByDisputeRefund, isTollInWizardPeriod, assertTollInWizardPeriod } from "../../../utils/tollWeekPeriod";
import {
  evaluateListableUnderpaidShortfall,
  resolvePendingUnderpaidTrip,
  linkPendingUnderpaidToTrips,
} from "../../../utils/pendingUnderpaidListable";
import { resolveDriverChargeAmount } from "../../../utils/claimChargeGuard";
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
  /**
   * Unreconciled underpaid Tag tolls (e.g. after period reset). Shown on the
   * Underpaid Tolls tab using matchedTripId / live suggestion trip — not Needs Review.
   */
  pendingUnderpaidTolls?: FinancialTransaction[];
  /** Live match suggestions keyed by toll id (for pending underpaid trip link). */
  suggestions?: Map<string, MatchResult[]>;
  /** Extra tolls for History location/platform lookup (may include other weeks). */
  tollLookup?: FinancialTransaction[];
  trips: Trip[];
  disputeRefunds: DisputeRefund[];
  /** Open unlinked trip refunds — blocks Charge Driver until applied. */
  unlinkedRefundTrips?: Trip[];
  /** Undo apply-to-underpaid from claim history (trip id). */
  onUndoUnlinkedApply?: (tripId: string) => Promise<void> | void;
  busyUnlinkedTripId?: string | null;
  periodWeekKey: string;
  periodLabel: string;
  fleetTz: string;
  drivers: any[];
  loadingTolls: boolean;
  loadingClaims: boolean;
  createClaim: (claim: Partial<Claim>) => Promise<any>;
  updateClaim: (claim: Claim) => Promise<any>;
  deleteClaim: (id: string) => Promise<any>;
  refreshClaims: () => void;
}

export function UnderpaidClaimsStep({
  claims, allClaims, reconciledTolls, pendingUnderpaidTolls = [], suggestions, tollLookup = [], trips, disputeRefunds, unlinkedRefundTrips = [], onUndoUnlinkedApply, busyUnlinkedTripId,
  periodWeekKey,
  periodLabel: _periodLabel,
  fleetTz,
  drivers, loadingTolls, loadingClaims,
  createClaim, updateClaim, deleteClaim, refreshClaims,
}: UnderpaidClaimsStepProps) {
  const tripMap = useMemo(() => new Map(trips.map(t => [t.id, t])), [trips]);
  const displayTollById = useMemo(() => {
    const map = new Map(reconciledTolls.map((t) => [t.id, t]));
    for (const t of tollLookup) {
      if (t?.id && !map.has(t.id)) map.set(t.id, t);
    }
    return map;
  }, [reconciledTolls, tollLookup]);

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

  const linkedPending = useMemo(
    () => linkPendingUnderpaidToTrips(pendingUnderpaidTolls, suggestions),
    [pendingUnderpaidTolls, suggestions],
  );

  const tripMapWithSuggestionFallback = useMemo(() => {
    const map = new Map(tripMap);
    for (const tx of linkedPending) {
      if (map.has(tx.tripId)) continue;
      const trip = resolvePendingUnderpaidTrip(tx, tripMap, suggestions);
      if (trip) map.set(trip.id, trip);
    }
    return map;
  }, [tripMap, linkedPending, suggestions]);

  const spentByTripId = useMemo(
    () =>
      spentUnlinkedCreditsByTripId({
        claims: allClaims,
        disputeRefunds,
        tolls: reconciledTolls,
      }),
    [allClaims, disputeRefunds, reconciledTolls],
  );

  const allocation = useMemo(
    () =>
      buildTripRefundAllocation(
        [...reconciledTolls, ...linkedPending],
        tripMapWithSuggestionFallback,
        spentByTripId,
      ),
    [reconciledTolls, linkedPending, tripMapWithSuggestionFallback, spentByTripId],
  );

  const visibleTollIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tx of reconciledTolls) {
      if (tx?.id && isTollInWizardPeriod(tx, periodWeekKey, fleetTz)) ids.add(tx.id);
    }
    for (const c of claims) {
      if (c.transactionId) ids.add(c.transactionId);
    }
    return ids;
  }, [reconciledTolls, claims, periodWeekKey, fleetTz]);

  const reconciledTollById = useMemo(
    () => new Map(reconciledTolls.map((t) => [t.id, t])),
    [reconciledTolls],
  );

  const partialClaims = useMemo(
    () =>
      dedupeClaimsForDisplay(
        claims.filter((c) => {
          if (!c.transactionId || !visibleTollIds.has(c.transactionId)) return false;
          return isVisiblePartialShortfallClaim(
            c,
            displayTollById.get(c.transactionId) || reconciledTollById.get(c.transactionId),
            disputeRefunds,
          );
        }),
      ).displayClaims,
    [claims, visibleTollIds, displayTollById, reconciledTollById, disputeRefunds],
  );

  const partialByTollId = useMemo(
    () => new Map(partialClaims.map((c) => [c.transactionId!, c])),
    [partialClaims],
  );

  const losses = useMemo(() => {
    const items: LossItem[] = [];
    const seenTollIds = new Set<string>();
    const partialIds = new Set(partialByTollId.keys());
    const listableCtx = {
      claimByTollId,
      partialByTollId: partialIds,
      reconciledTollById,
      trips,
      disputeRefunds,
      allocation,
      periodWeekKey,
      fleetTz,
    };

    const pushLoss = (tx: FinancialTransaction, trip: Trip) => {
      if (seenTollIds.has(tx.id)) return;
      const result = evaluateListableUnderpaidShortfall(tx, trip, listableCtx);
      if (!result.ok) return;

      const match: MatchResult = {
        transaction: tx,
        trip,
        matchType: 'AMOUNT_VARIANCE',
        confidence: 'high',
        varianceAmount: -result.financials.netLoss,
        reason: 'Underpaid — platform reimbursed less than the toll cost',
        timeDifferenceMinutes: 0,
      };
      seenTollIds.add(tx.id);
      items.push({ transaction: tx, match, claim: result.claim, financials: result.financials });
    };

    for (const tx of reconciledTolls) {
      if (!tx.tripId) continue;
      const trip = tripMapWithSuggestionFallback.get(tx.tripId);
      if (!trip) continue;
      pushLoss(tx, trip);
    }

    // After period reset: tripId cleared but matchedTripId / suggestion remain.
    for (const tx of pendingUnderpaidTolls) {
      if (seenTollIds.has(tx.id)) continue;
      const trip = resolvePendingUnderpaidTrip(tx, tripMap, suggestions);
      if (!trip) continue;
      pushLoss({ ...tx, tripId: trip.id }, trip);
    }

    return items.sort(
      (a, b) => new Date(b.transaction.date).getTime() - new Date(a.transaction.date).getTime(),
    );
  }, [
    reconciledTolls,
    pendingUnderpaidTolls,
    suggestions,
    tripMap,
    tripMapWithSuggestionFallback,
    claimByTollId,
    partialByTollId,
    trips,
    disputeRefunds,
    allocation,
    reconciledTollById,
    periodWeekKey,
    fleetTz,
  ]);

  const guardTollInPeriod = (transaction: FinancialTransaction): boolean => {
    const check = assertTollInWizardPeriod(transaction, periodWeekKey, fleetTz);
    if (!check.ok) {
      toast.error(`This toll belongs to ${check.weekLabel}. Switch to that period to act on it.`);
      return false;
    }
    return true;
  };

  const guardClaimTollInPeriod = (claim: Claim): boolean => {
    const tx = claim.transactionId ? reconciledTollById.get(claim.transactionId) : undefined;
    if (!tx) return true;
    return guardTollInPeriod(tx);
  };

  const assertNotDisputeCovered = (claim: Pick<Claim, 'id' | 'transactionId'>): boolean => {
    if (isTollCoveredByDisputeRefund(claim, disputeRefunds)) {
      toast.error('A dispute refund already covers this toll — see History for the reimbursed claim.');
      return false;
    }
    return true;
  };

  const resolveClaimDisplayTrip = (claim: Claim | null | undefined): Trip | null => {
    if (!claim) return null;
    const tx = claim.transactionId ? displayTollById.get(claim.transactionId) : undefined;
    const messageTripId = claim.message?.match(/trip\s+([0-9a-f-]{36})/i)?.[1];
    const underpaidTripId =
      (claim.tripId && claim.tripId !== claim.unlinkedTripId ? claim.tripId : undefined) ||
      (tx?.tripId && tx.tripId !== claim.unlinkedTripId ? tx.tripId : undefined) ||
      tx?.tripId ||
      claim.tripId ||
      undefined;
    return (
      (underpaidTripId ? tripMap.get(underpaidTripId) : undefined) ||
      (claim.unlinkedTripId ? tripMap.get(claim.unlinkedTripId) : undefined) ||
      (messageTripId ? tripMap.get(messageTripId) : undefined) ||
      null
    );
  };

  /** Resolve underpaid toll + trip for Send to Driver (not the unlinked credit trip). */
  const resolvePartialClaimSendContext = (
    claim: Claim,
  ): { tx: FinancialTransaction; trip: Trip } | null => {
    if (!claim.transactionId) return null;

    let tx = reconciledTollById.get(claim.transactionId);
    const underpaidTripId =
      (claim.tripId && claim.tripId !== claim.unlinkedTripId ? claim.tripId : undefined) ||
      (tx?.tripId && tx.tripId !== claim.unlinkedTripId ? tx.tripId : undefined) ||
      tx?.tripId ||
      claim.tripId ||
      undefined;
    const trip = underpaidTripId ? tripMap.get(underpaidTripId) : undefined;
    if (!trip) return null;

    if (!tx) {
      const tollCost =
        Math.abs(Number(claim.expectedAmount) || 0) ||
        Math.abs(Number(claim.paidAmount) || 0) + Math.abs(Number(claim.amount) || 0);
      tx = {
        id: claim.transactionId,
        amount: -tollCost,
        date: claim.date || trip.date || '',
        time: '12:00:00',
        tripId: trip.id,
        description: claim.subject || claim.pickup || 'Toll charge',
        isReconciled: true,
        driverId: claim.driverId,
        vehicleId: claim.vehicleId,
      } as FinancialTransaction;
    }

    return { tx, trip };
  };

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

  const writeOffTotal = useMemo(
    () =>
      resolvedClaims
        .filter((c) => c.resolutionReason === 'Write Off' || c.resolutionReason === 'Business Expense')
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0),
    [resolvedClaims],
  );

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

  const resolveChargeAmountForClaim = (claim: Claim) => {
    const tx =
      (claim.transactionId ? reconciledTollById.get(claim.transactionId) : undefined) ||
      (claim.transactionId ? displayTollById.get(claim.transactionId) : undefined) ||
      reconciledTolls.find((t) => t.id === claim.transactionId);
    if (!tx) return { amount: Math.abs(Number(claim.amount) || 0), clamped: false };

    const tripId =
      claim.tripId ||
      claim.unlinkedTripId ||
      tx.tripId ||
      tx.unlinkedSourceTripId ||
      undefined;
    const trip = tripId
      ? tripMapWithSuggestionFallback.get(tripId) || tripMap.get(tripId)
      : undefined;
    const ctx = buildTollFinancialsContext(tx, trip, claim, trips, disputeRefunds, allocation);
    const financials = calculateTollFinancials(tx, trip, claim, ctx);

    // Prefer remaining claim amount when partial credits already applied; else net loss.
    const preferredCharge =
      Number(claim.paidAmount) > 0
        ? Math.abs(Number(claim.amount) || financials.netLoss)
        : financials.netLoss;

    return resolveDriverChargeAmount({
      chargeAmount: preferredCharge,
      tollCost: financials.cost,
      // Allocation-aware — never use raw trip.tollCharges when pool was spent elsewhere.
      platformRefund: financials.platformRefund,
      claimPaidAmount: financials.creditsApplied || claim.paidAmount || 0,
    });
  };

  const resolveChargeAmountForLoss = (item: LossItem) => {
    const { financials, claim } = item;
    return resolveDriverChargeAmount({
      chargeAmount: financials.netLoss,
      tollCost: financials.cost,
      platformRefund: financials.platformRefund,
      claimPaidAmount: financials.creditsApplied || claim?.paidAmount || 0,
    });
  };

  const buildClaimPayloadFromLoss = (item: LossItem): Partial<Claim> => {
    const { transaction, match, financials } = item;
    const trip = match.trip;
    return {
      driverId: trip.driverId || 'unknown_driver',
      tripId: trip.id,
      transactionId: transaction.id,
      type: 'Toll_Refund',
      amount: financials.netLoss,
      expectedAmount: financials.cost,
      paidAmount: financials.totalRecovered,
      subject: `Toll Refund: ${trip.pickupLocation?.split(',')[0] || 'Unknown Location'}`,
      message: '',
      tripDate: trip.requestTime || trip.date,
      pickup: trip.pickupLocation,
      dropoff: trip.dropoffLocation,
      date: transaction.date,
      vehicleId: transaction.vehicleId,
      driverName: trip.driverName,
    };
  };

  const ensureClaimForLoss = async (item: LossItem): Promise<Claim> => {
    if (item.claim) return item.claim;
    return createClaim(buildClaimPayloadFromLoss(item));
  };

  const claimDraftFromLoss = (item: LossItem): Claim => ({
    id: item.claim?.id || '',
    status: item.claim?.status || 'Open',
    createdAt: item.claim?.createdAt || new Date().toISOString(),
    updatedAt: item.claim?.updatedAt || new Date().toISOString(),
    ...buildClaimPayloadFromLoss(item),
    ...item.claim,
    amount: item.financials.netLoss,
    expectedAmount: item.financials.cost,
    paidAmount: item.financials.totalRecovered,
    type: 'Toll_Refund',
  } as Claim);

  const handleChargeDriverLoss = async (item: LossItem) => {
    if (!guardTollInPeriod(item.transaction)) return;
    const trip = item.match.trip;
    const driverId = trip.driverId || 'unknown_driver';
    if (hasBlockingUnlinkedRefund({ claimDriverId: driverId, unlinkedTrips: unlinkedRefundTrips })) {
      toast.error('Pick Apply to underpaid on Unlinked Refunds first', {
        description: 'This driver still has an open unlinked trip refund that may cover this shortfall.',
      });
      return;
    }
    const draft = claimDraftFromLoss(item);
    if (!assertNotDisputeCovered(draft)) return;
    const resolved = resolveChargeAmountForLoss(item);
    if (resolved.amount <= 0) {
      toast.info('Nothing left to charge — credits already cover this toll.');
      return;
    }
    try {
      const claim = await ensureClaimForLoss(item);
      await updateClaim({
        ...claim,
        amount: resolved.amount,
        status: 'Resolved',
        resolutionReason: 'Charge Driver',
        updatedAt: new Date().toISOString(),
      });
      toast.success(
        resolved.clamped
          ? `Charged shortfall $${resolved.amount.toFixed(2)} (credits already applied).`
          : `Claim resolved. $${resolved.amount.toFixed(2)} will be deducted from driver pay.`,
      );
      refreshClaims();
    } catch (e) {
      toast.error('Failed to charge driver');
    }
  };

  const handleWriteOffLoss = (item: LossItem) => {
    if (!guardTollInPeriod(item.transaction)) return;
    const amount = item.financials.netLoss;
    setConfirmDialog({
      isOpen: true,
      title: 'Write Off',
      description: `Fleet absorbs $${amount.toFixed(2)} — no dispute will be sent to the driver.`,
      actionLabel: 'Write Off',
      isDestructive: true,
      onConfirm: async () => {
        try {
          const claim = await ensureClaimForLoss(item);
          await updateClaim({
            ...claim,
            amount,
            status: 'Resolved',
            resolutionReason: 'Write Off',
            updatedAt: new Date().toISOString(),
          });
          toast.success('Claim written off as company loss.');
          refreshClaims();
        } catch (e) {
          toast.error('Failed to write off claim');
        }
      },
    });
  };

  const handleChargeDriver = async (claim: Claim) => {
    if (!guardClaimTollInPeriod(claim)) return;
    if (!assertNotDisputeCovered(claim)) return;
    if (hasBlockingUnlinkedRefund({ claimDriverId: claim.driverId, unlinkedTrips: unlinkedRefundTrips })) {
      toast.error('Pick Apply to underpaid on Unlinked Refunds first', {
        description: 'This driver still has an open unlinked trip refund that may cover this shortfall.',
      });
      return;
    }
    const resolved = resolveChargeAmountForClaim(claim);
    if (resolved.amount <= 0) {
      toast.info('Nothing left to charge — credits already cover this toll.');
      return;
    }
    try {
      await updateClaim({
        ...claim,
        amount: resolved.amount,
        status: 'Resolved',
        resolutionReason: 'Charge Driver',
        updatedAt: new Date().toISOString(),
      });
      toast.success(
        resolved.clamped
          ? `Charged shortfall $${resolved.amount.toFixed(2)} (credits already applied).`
          : `Claim resolved. $${resolved.amount.toFixed(2)} will be deducted from driver pay.`,
      );
      refreshClaims();
    } catch (e) { toast.error("Failed to charge driver"); }
  };

  const handleWriteOff = async (claim: Claim) => {
    if (!guardClaimTollInPeriod(claim)) return;
    if (!assertNotDisputeCovered(claim)) return;
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
      const resolved = resolveChargeAmountForClaim(claim);
      if (resolved.amount <= 0) {
        toast.info('Nothing left to charge — credits already cover this toll.');
        return;
      }
      try {
        await updateClaim({
          ...claim,
          amount: resolved.amount,
          resolutionReason: newReason,
          updatedAt: new Date().toISOString(),
        });
        toast.success(
          resolved.clamped
            ? `Updated to Charge Driver — shortfall $${resolved.amount.toFixed(2)}.`
            : `Claim updated to: ${newReason}`,
        );
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
    const resolved = resolvePartialClaimSendContext(claim);
    if (!resolved) {
      toast.error('Missing toll or trip link for this claim');
      return;
    }
    const { tx, trip } = resolved;
    if (!guardTollInPeriod(tx)) return;
    if (!assertNotDisputeCovered(claim)) return;
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Unclaimed Potential" amount={unclaimedTotal} type="neutral" icon={Banknote} />
          <StatCard title="Pending Recovery" amount={pendingTotal} type="info" icon={Timer} />
          <StatCard title="Action Required" amount={atRiskTotal} type="warning" icon={AlertCircle} />
          <StatCard title="Written Off" amount={writeOffTotal * -1} type="loss" icon={FileX} />
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
            onSelectLoss={(item) => {
              if (!guardTollInPeriod(item.transaction)) return;
              setSelectedLoss(item);
              setIsModalOpen(true);
            }}
            onChargeDriver={handleChargeDriverLoss}
            onWriteOff={handleWriteOffLoss}
            fleetTz={fleetTz}
            onUndoUnlinkedApply={onUndoUnlinkedApply}
            busyUnlinkedTripId={busyUnlinkedTripId}
          />
        </TabsContent>

        <TabsContent value="partial" className="mt-6">
          <PartiallyCoveredList
            claims={partialClaims}
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
            tollById={displayTollById}
            onUndoUnlinkedApply={onUndoUnlinkedApply}
            busyUnlinkedTripId={busyUnlinkedTripId}
          />
        </TabsContent>
      </Tabs>

      <ClaimDetailOverlay
        isOpen={isClaimDetailOpen}
        onClose={() => setIsClaimDetailOpen(false)}
        claim={selectedClaimDetail}
        trip={resolveClaimDisplayTrip(selectedClaimDetail)}
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
