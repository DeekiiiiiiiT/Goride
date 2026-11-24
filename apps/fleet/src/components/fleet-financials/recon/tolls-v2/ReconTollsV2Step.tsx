import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTagAccountRollForward } from '../../../../services/reconApi';
import { toast } from 'sonner';
import { isPaidWeekRefusal, TollV2CommandError } from '../../../../services/tollV2CommandError';
import { useTollV2Desk } from './useTollV2Desk';
import { formatConfirmAllSureToast, runConfirmAllSure, useTollV2Commands } from './useTollV2Commands';
import { computeTiles, computeTileSubcounts, progressCounts } from './tollV2Tiles';
import { toastAfterKeptPayback, toastAfterTollDecision } from './tollV2DecisionToast';
import { blockerGroups, pairChargesForReview, sureSuggestions, chargesInSection } from './tollV2DeskLogic';
import { decisionUndoPayload } from './tollV2Format';
import { TollV2TilesRow } from './TollV2TilesRow';
import { TollV2Sections } from './TollV2Sections';
import { TollV2SealBox } from './TollV2SealBox';
import { TollV2SummaryPortal } from './TollV2SummaryPortal';
import { TollV2MatcherBanner } from './TollV2MatcherBanner';
import { TollV2VersionChangedCard } from './TollV2VersionChangedCard';
import type { TollV2Charge, TollV2KeptPayback, TollV2Payback, TollV2ReviewPair, TollV2Suggestion } from './types';
import { TollV2PickTripDialog } from './dialogs/TollV2PickTripDialog';
import { TollV2CheckReceiptDialog } from './dialogs/TollV2CheckReceiptDialog';
import { TollV2RejectReceiptDialog } from './dialogs/TollV2RejectReceiptDialog';
import { TollV2DuplicateDialog } from './dialogs/TollV2DuplicateDialog';
import { TollV2UndoDialog } from './dialogs/TollV2UndoDialog';
import { TollV2ConfirmAllSureDialog } from './dialogs/TollV2ConfirmAllSureDialog';
import { TollV2LinkPaybackDialog } from './dialogs/TollV2LinkPaybackDialog';
import type { TollV2RowActions } from './TollV2ChargeRow';
import { useTollV2Weeks } from './useTollV2Weeks';
import { TollV2LateItemsCard } from './TollV2LateItemsCard';
import { TollV2TakeBacksCard } from './TollV2TakeBacksCard';
import { TollV2RecordTakeBackDialog } from './dialogs/TollV2RecordTakeBackDialog';
import { TollV2ReopenDialog } from './TollV2ReopenDialog';
import { TollV2SealedRibbon } from './TollV2SealedRibbon';
import { TollV2EmptyCard, TollV2ErrorCard, TollV2LoadingState } from './TollV2StateCards';
import { TollV2MobileSealBar } from './TollV2MobileSealBar';
import type {
  TollV2Blocker,
  TollV2DisputeResult,
  TollV2DisputeRow,
  TollV2LateItem,
  TollV2PartNo,
  TollV2RefundCandidate,
  TollV2TakeBack,
  TollV2TakeBackCandidate,
} from './types';
import { useTollV2Switches } from './useTollV2Switches';
import { chargesInPart, deskHasParts, firstPartWithWork, settleDisputeBody, splitMatches, topSuggestion } from './tollV2Parts';
import { TollV2MatchesPart, TollV2PartCard, TollV2PartsRow, TollV2SectionsPart } from './TollV2PartsDesk';
import { TollV2DisputesPart } from './TollV2DisputesPart';
import { TollV2SealPart } from './TollV2SealPart';
import {
  TollV2ApprovalReasonDialog,
  TollV2LostDialog,
  TollV2OpenTripDialog,
  TollV2RefundReceivedDialog,
} from './dialogs/TollV2DisputeDialogs';

export function ReconTollsV2Step({
  weekKey,
  summaryTarget,
  onPeriodFinished,
  onGoToTagAccount,
}: {
  weekKey: string;
  summaryTarget: HTMLElement | null;
  onPeriodFinished?: () => void | Promise<void>;
  onGoToTagAccount: () => void;
}) {
  const queryClient = useQueryClient();
  const deskQuery = useTollV2Desk(weekKey);
  const weeksQuery = useTollV2Weeks();
  // WRA-57: the Tag account box shows step 4's roll (anchored on the last closed week), same cache as step 4.
  const tagRollQuery = useQuery({
    queryKey: ['recon-tag-account', 'rideshare', weekKey],
    queryFn: () => fetchTagAccountRollForward('rideshare', weekKey),
    staleTime: 30_000,
    retry: 1,
  });
  const tagRoll = tagRollQuery.data
    ? {
        openingMinor: tagRollQuery.data.openingMinor,
        topUpsMinor: tagRollQuery.data.topUpsMinor,
        usageMinor: tagRollQuery.data.tagUsageMinor,
        closingMinor: tagRollQuery.data.expectedClosingMinor,
      }
    : null;
  const { runCommand, busy, versionConflict, clearVersionConflict, refetchDesk, approvalAsk } = useTollV2Commands(weekKey);
  const switchesQuery = useTollV2Switches();
  const [sealing, setSealing] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenInstead, setReopenInstead] = useState<string | null>(null);
  const [takeBackTarget, setTakeBackTarget] = useState<TollV2TakeBack | null>(null);

  const [pickCharge, setPickCharge] = useState<TollV2Charge | null>(null);
  const [receiptCharge, setReceiptCharge] = useState<TollV2Charge | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [undoCharge, setUndoCharge] = useState<TollV2Charge | null>(null);
  const [dupPair, setDupPair] = useState<TollV2ReviewPair | null>(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [linkPayback, setLinkPayback] = useState<TollV2Payback | null>(null);
  // UI1 — the six-part layout (C3). Only with the disputes switch on; switched off, the screen is today's.
  const [part, setPart] = useState<TollV2PartNo | null>(null);
  const [refusedBlockers, setRefusedBlockers] = useState<TollV2Blocker[] | null>(null);
  const [refundFor, setRefundFor] = useState<TollV2DisputeRow | null>(null);
  const [lostFor, setLostFor] = useState<TollV2DisputeRow | null>(null);
  const [tripFor, setTripFor] = useState<TollV2DisputeRow | null>(null);

  const desk = deskQuery.data;
  const partsLayout = switchesQuery.data?.tollDisputes === true && deskHasParts(desk);
  useEffect(() => {
    setPart(null);
  }, [weekKey]);
  useEffect(() => {
    if (partsLayout && desk && part === null) setPart(firstPartWithWork(desk));
  }, [partsLayout, desk, part]);
  // A refused seal's list stands until the desk is read again (AD3).
  useEffect(() => {
    setRefusedBlockers(null);
  }, [desk]);
  const goToPart = useCallback((p: TollV2PartNo) => {
    setPart(p);
    document.getElementById('toll-v2-parts-top')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);
  const tiles = useMemo(
    () => (desk ? computeTiles(desk.result, desk.charges, desk.earlierResults) : null),
    [desk],
  );
  const subcounts = useMemo(
    () => (desk ? computeTileSubcounts(desk.charges, desk.result) : null),
    [desk],
  );
  const progress = useMemo(() => (desk ? progressCounts(desk.charges) : null), [desk]);
  const sureRows = useMemo(() => (desk ? sureSuggestions(desk.charges) : []), [desk]);
  const groups = useMemo(() => (desk ? blockerGroups(desk.blockers) : []), [desk]);
  // Take-backs aren't tied to the week on screen (the command picks the right week itself), so they show on any
  // week that is still open. Week Reconciliation only opens ended weeks, so the calendar's current week never shows.
  const openWeekTakeBacks = useMemo(() => {
    const overview = weeksQuery.data;
    if (!overview || !desk || desk.sealed) return [];
    return overview.takeBacks ?? [];
  }, [weeksQuery.data, desk]);
  const showEmpty =
    desk &&
    !desk.sealed &&
    desk.charges.length === 0 &&
    (desk.paybacks?.length ?? 0) === 0 &&
    (desk.kept?.length ?? 0) === 0 &&
    (desk.reviewPairs?.length ?? 0) === 0 &&
    desk.blockers.length === 0 &&
    (desk.late?.length ?? 0) === 0 &&
    openWeekTakeBacks.length === 0;

  const invalidateWeeks = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['toll-v2-weeks'] });
  }, [queryClient]);

  const handleCarryLate = useCallback(
    async (item: TollV2LateItem) => {
      if (!desk) return;
      try {
        let res: unknown;
        if (item.kind === 'late_charge') {
          res = await runCommand('carry_forward', {
            from_week: desk.weekKey,
            kind: 'charge',
            charge_id: item.id,
            expected_charge_version: item.version,
          });
        } else if (item.kind === 'late_payback') {
          res = await runCommand('carry_forward', {
            from_week: desk.weekKey,
            kind: 'payback',
            payback_id: item.id,
            expected_payback_version: item.version,
          });
        } else if (item.kind === 'correction') {
          const kind = item.direction === 'down' ? 'correction_down' : 'correction_up';
          res = await runCommand('carry_forward', {
            from_week: desk.weekKey,
            kind,
            charge_id: item.id,
            expected_charge_version: item.version,
            amount_minor: item.newAmountMinor,
            reason_code: 'provider_correction',
          });
        } else {
          return;
        }
        if (res === null) return;
        invalidateWeeks();
        toast.success('Moved to the open week');
      } catch {
        /* error toast shown by runCommand */
      }
    },
    [desk, invalidateWeeks, runCommand],
  );

  const handleReopen = useCallback(
    async (reason: string) => {
      if (!desk) return;
      setReopenInstead(null);
      try {
        const res = await runCommand('reopen_week', {
          week_key: desk.weekKey,
          expected_week_version: desk.weekVersion,
          reason,
        });
        if (res === null) return;
        toast.success('Week reopened');
        setReopenOpen(false);
        invalidateWeeks();
      } catch (err) {
        if (isPaidWeekRefusal(err)) {
          setReopenInstead('Paid weeks can\'t be reopened — late items move to the open week.');
        }
      }
    },
    [desk, invalidateWeeks, runCommand],
  );

  const handleRecordTakeBack = useCallback(
    async (opts: {
      candidate: TollV2TakeBackCandidate;
      bearer: 'driver' | 'fleet';
      reference: string;
      paidOn: string;
    }) => {
      if (!takeBackTarget) return;
      const { candidate, bearer, reference, paidOn } = opts;
      // The amount Uber took back goes with the command, so the server refuses a payback of another amount
      // (PARTIAL_TAKE_BACK) instead of reversing the whole payback.
      const amountMinor = takeBackTarget.amountMinor;
      try {
        let res: unknown;
        if (candidate.weekSealed && candidate.weekPaid) {
          res = await runCommand('carry_forward', {
            from_week: candidate.weekKey,
            kind: 'take_back',
            payback_id: candidate.paybackId,
            expected_payback_version: candidate.version,
            amount_minor: amountMinor,
            reference,
            paid_on: paidOn,
            bearer,
          });
        } else {
          res = await runCommand('reverse_payback', {
            payback_id: candidate.paybackId,
            expected_payback_version: candidate.version,
            amount_minor: amountMinor,
            reference,
            paid_on: paidOn,
          });
        }
        if (res === null) return;
        setTakeBackTarget(null);
        invalidateWeeks();
        toast.success('Take-back recorded');
      } catch {
        /* error toast shown by runCommand */
      }
    },
    [invalidateWeeks, runCommand, takeBackTarget],
  );

  const undoFromToast = useCallback(
    async (charge: TollV2Charge) => {
      const body = decisionUndoPayload(charge.decision);
      if (!body) return;
      try {
        await runCommand('undo_decision', body);
      } catch {
        /* error toast shown by runCommand */
      }
    },
    [runCommand],
  );

  const undoKept = useCallback(
    async (kept: TollV2KeptPayback) => {
      const body = decisionUndoPayload({ kind: 'kept_unlinked', undo: kept.undo });
      if (!body) return;
      try {
        const res = await runCommand('undo_decision', body);
        if (res !== null) toast.success('Undone — the payback is open again');
      } catch {
        /* error toast shown by runCommand */
      }
    },
    [runCommand],
  );

  /** InDrive rider-pays-driver: Confirm Driver pays → driver_pays, Fleet pays → fleet_absorbs, both with the suggestion (AD5). */
  const riderBear = useCallback(
    async (charge: TollV2Charge, suggestionId: string, intent: 'driver_pays' | 'fleet_absorbs'): Promise<boolean> => {
      try {
        const res = await runCommand(intent, {
          charge_id: charge.id,
          expected_charge_version: charge.version,
          suggestion_id: suggestionId,
        });
        if (res === null) return false;
        const verb = intent === 'driver_pays' ? 'Driver pays' : 'Fleet pays';
        await toastAfterTollDecision(queryClient, weekKey, charge.id, verb, undoFromToast);
        return true;
      } catch {
        return false;
      }
    },
    [queryClient, runCommand, undoFromToast, weekKey],
  );

  const applyTopSuggestion = useCallback(
    async (charge: TollV2Charge, suggestion?: TollV2Suggestion): Promise<boolean> => {
      const s = suggestion ?? charge.suggestions?.find((x) => x.top !== false) ?? charge.suggestions?.[0];
      if (!s) return false;
      if (s.kind === 'rider_pays_driver') return riderBear(charge, s.suggestionId, 'driver_pays');
      try {
        const res = await runCommand('apply_suggestion', {
          suggestion_id: s.suggestionId,
          expected_charge_version: charge.version,
          expected_payback_version: s.paybackVersion,
        });
        if (res === null) return false;
        await toastAfterTollDecision(queryClient, weekKey, charge.id, 'Matched', undoFromToast);
        return true;
      } catch {
        return false;
      }
    },
    [queryClient, riderBear, runCommand, undoFromToast, weekKey],
  );

  const confirmAllRider = useCallback(async () => {
    if (!desk) return;
    let done = 0;
    for (const c of splitMatches(desk.charges).rider) {
      const s = topSuggestion(c);
      if (!s) continue;
      try {
        const res = await runCommand('driver_pays', {
          charge_id: c.id,
          expected_charge_version: c.version,
          suggestion_id: s.suggestionId,
        });
        if (res !== null) done += 1;
      } catch {
        /* error toast shown by runCommand; carry on with the next row */
      }
    }
    if (done > 0) toast.success(String(done) + ' set to Driver pays — list refreshed');
  }, [desk, runCommand]);

  const markDisputeSent = useCallback(
    async (d: TollV2DisputeRow) => {
      try {
        const res = await runCommand('mark_dispute_sent', { dispute_id: d.id, expected_dispute_version: d.version });
        if (res !== null) toast.success('Marked as sent');
      } catch {
        /* error toast shown by runCommand */
      }
    },
    [runCommand],
  );

  const settleDispute = useCallback(
    async (d: TollV2DisputeRow, c: TollV2RefundCandidate) => {
      try {
        const res = await runCommand('settle_dispute', settleDisputeBody(d, c));
        if (res === null) return;
        setRefundFor(null);
        toast.success('Refund linked to the dispute');
      } catch {
        /* error toast shown by runCommand */
      }
    },
    [runCommand],
  );

  const closeDisputeLost = useCallback(
    async (d: TollV2DisputeRow) => {
      try {
        const res = await runCommand('close_dispute_lost', { dispute_id: d.id, expected_dispute_version: d.version });
        if (res === null) return;
        setLostFor(null);
        toast.success('Dispute closed as lost');
      } catch {
        /* error toast shown by runCommand */
      }
    },
    [runCommand],
  );

  const undoDisputeResult = useCallback(
    async (r: TollV2DisputeResult) => {
      if (!r.undo?.decision_id) return;
      try {
        const res = await runCommand('undo_decision', { decision_id: r.undo.decision_id });
        if (res !== null) toast.success('Undone — the dispute is open again');
      } catch {
        /* error toast shown by runCommand */
      }
    },
    [runCommand],
  );

  const bear = useCallback(
    async (charge: TollV2Charge, intent: 'driver_pays' | 'fleet_absorbs'): Promise<boolean> => {
      try {
        const res = await runCommand(intent, {
          charge_id: charge.id,
          expected_charge_version: charge.version,
          reason_code: intent === 'driver_pays' ? 'personal' : 'fleet_business',
        });
        if (res === null) return false;
        const verb = intent === 'driver_pays' ? 'Driver pays' : 'Fleet pays';
        await toastAfterTollDecision(queryClient, weekKey, charge.id, verb, undoFromToast);
        return true;
      } catch {
        return false;
      }
    },
    [queryClient, runCommand, undoFromToast, weekKey],
  );

  const handleSeal = useCallback(async () => {
    if (!desk) return;
    setSealing(true);
    try {
      const res = await runCommand(
        'seal_week',
        { week_key: desk.weekKey, expected_week_version: desk.weekVersion },
        partsLayout ? { quiet: ['PENDING_NOT_RESOLVED'] } : undefined,
      );
      if (res === null) return;
      toast.success('Tolls sealed for this week');
      await refetchDesk();
      if (onPeriodFinished) await onPeriodFinished();
    } catch (err) {
      if (partsLayout && err instanceof TollV2CommandError && err.code === 'PENDING_NOT_RESOLVED') {
        const blocking = err.currentState?.blocking;
        if (Array.isArray(blocking)) setRefusedBlockers(blocking as TollV2Blocker[]);
        setPart(6);
      }
      /* other refusals: error toast shown by runCommand */
    } finally {
      setSealing(false);
    }
  }, [desk, onPeriodFinished, partsLayout, runCommand, refetchDesk]);

  const dupCharges = useMemo(() => {
    if (!desk || !dupPair) return { a: null, b: null };
    return pairChargesForReview(desk, dupPair);
  }, [desk, dupPair]);

  const pickQueue = useMemo(() => {
    if (!desk) return { current: 1, total: 1 };
    const picks = chargesInSection(desk.charges, 'pick');
    const idx = pickCharge ? picks.findIndex((c) => c.id === pickCharge.id) : 0;
    return { current: Math.max(1, idx + 1), total: picks.length || 1 };
  }, [desk, pickCharge]);

  const rowActions: TollV2RowActions & {
    onLinkPayback?: (p: TollV2Payback) => void;
    onLeaveUnlinked?: (p: TollV2Payback) => void;
    onUndoKept?: (k: TollV2KeptPayback) => void;
  } = {
    readOnly: desk?.sealed,
    onConfirm: (c) => void applyTopSuggestion(c),
    onPickTrip: (c) => setPickCharge(c),
    onPickSuggestion: (c, s) => void applyTopSuggestion(c, s),
    onCompareTimeline: (c) => setPickCharge(c),
    onDriverPays: (c) => void bear(c, 'driver_pays'),
    onFleetPays: (c) => void bear(c, 'fleet_absorbs'),
    onCheckReceipt: (c) => setReceiptCharge(c),
    onReviewDuplicate: (c) => {
      const pair = desk?.reviewPairs.find((p) => p.chargeA === c.id || p.chargeB === c.id);
      if (pair) setDupPair(pair);
    },
    onUndo: (c) => setUndoCharge(c),
    onLeaveUnlinked: async (p) => {
      try {
        const res = await runCommand('leave_payback_unlinked', {
          payback_id: p.id,
          expected_payback_version: p.version,
          reason_code: 'no_toll_found',
        });
        if (res === null) return;
        await toastAfterKeptPayback(queryClient, weekKey, p.id, undoKept);
      } catch {
        /* error toast shown by runCommand */
      }
    },
    onUndoKept: (k: TollV2KeptPayback) => void undoKept(k),
    onLinkPayback: (p) => setLinkPayback(p),
  };

  if (deskQuery.isLoading) {
    return <TollV2LoadingState />;
  }

  if (deskQuery.isError || !desk || !tiles || !subcounts || !progress) {
    return (
      <TollV2ErrorCard onRetry={() => void deskQuery.refetch()} />
    );
  }

  return (
    <div className="overflow-x-hidden pb-24 sm:pb-0" data-testid="recon-tolls-v2-step">
      {desk.matcherBusy && !desk.sealed ? <TollV2MatcherBanner /> : null}
      {versionConflict ? <TollV2VersionChangedCard onDismiss={clearVersionConflict} /> : null}
      {desk.sealed ? <TollV2SealedRibbon onReopen={() => setReopenOpen(true)} /> : null}

      {!desk.sealed ? (
        <TollV2TakeBacksCard takeBacks={openWeekTakeBacks} onRecord={setTakeBackTarget} />
      ) : null}

      <TollV2TilesRow tiles={tiles} tilesAddUp={tiles.tilesAddUp} subcounts={subcounts} locked={desk.sealed} />

      {/* Stitch "sealed week with late items": late items come right after the tiles. */}
      {desk.sealed && (desk.late?.length ?? 0) > 0 ? (
        <div className="mt-4">
          <TollV2LateItemsCard
            items={desk.late ?? []}
            openWeek={desk.openWeek}
            weekPaid={desk.paid}
            busy={busy}
            onCarry={(item) => void handleCarryLate(item)}
          />
        </div>
      ) : null}

      {partsLayout && part !== null ? (
        <div className="mt-4" id="toll-v2-parts-top" data-testid="toll-v2-parts-layout">
          <TollV2PartsRow desk={desk} current={part} onGo={goToPart} />
          <TollV2PartCard desk={desk} part={part} onGo={goToPart}>
            {part === 1 ? (
              <TollV2MatchesPart
                charges={desk.charges}
                rowActions={rowActions}
                sureCount={sureRows.length}
                onConfirmAllSure={desk.sealed ? undefined : () => setConfirmAllOpen(true)}
                busy={busy}
                rider={{
                  onRiderDriverPays: (c, s) => void riderBear(c, s.suggestionId, 'driver_pays'),
                  onRiderFleetPays: (c, s) => void riderBear(c, s.suggestionId, 'fleet_absorbs'),
                  onConfirmAllRider: () => void confirmAllRider(),
                }}
              />
            ) : part === 3 ? (
              <TollV2DisputesPart
                disputes={desk.disputes!}
                results={desk.results ?? []}
                busy={busy}
                actions={{
                  onMarkSent: (d) => void markDisputeSent(d),
                  onRefundReceived: setRefundFor,
                  onLost: setLostFor,
                  onOpenTrip: setTripFor,
                  onUndoResult: (r) => void undoDisputeResult(r),
                }}
              />
            ) : part === 6 ? (
              <TollV2SealPart
                desk={desk}
                decided={chargesInPart(desk.charges, 6)}
                blockers={refusedBlockers ?? desk.blockers}
                rowActions={rowActions}
                sealing={sealing}
                onSeal={() => void handleSeal()}
                onGoTo={goToPart}
                onGoToTagAccount={onGoToTagAccount}
              />
            ) : (
              <TollV2SectionsPart part={part} desk={desk} rowActions={rowActions} />
            )}
          </TollV2PartCard>
        </div>
      ) : null}

      {!partsLayout ? (
      <div className={desk.sealed ? 'hidden' : 'mt-4'}>
        <div className="mb-2 flex items-center justify-between text-sm text-[#47464c]">
          <span data-testid="toll-v2-progress">
            {progress.decided} of {progress.total} tolls decided · {progress.left} left
          </span>
          <span>{progress.total ? Math.round((progress.decided / progress.total) * 100) : 0}% completed</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e5eeff]">
          <div
            className="h-full bg-[#030213] transition-all"
            style={{ width: `${progress.total ? (progress.decided / progress.total) * 100 : 0}%` }}
          />
        </div>
      </div>
      ) : null}

      {showEmpty && !partsLayout ? <TollV2EmptyCard /> : null}

      {!showEmpty && !partsLayout ? (
        <TollV2MainSection
          desk={desk}
          rowActions={rowActions}
          sureRows={sureRows}
          sealed={desk.sealed}
          onConfirmAll={() => setConfirmAllOpen(true)}
        />
      ) : null}

      {!partsLayout ? (
      <TollV2SealBox
        weekKey={weekKey}
        tiles={tiles}
        charges={desk.charges}
        blockers={desk.blockers}
        blockerGroups={groups}
        sealed={desk.sealed}
        sealing={sealing || busy}
        onSeal={() => void handleSeal()}
        onScrollTo={(id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })}
      />
      ) : null}

      <TollV2SummaryPortal
        target={summaryTarget}
        result={desk.result}
        charges={desk.charges}
        onGoToTagAccount={onGoToTagAccount}
        roll={tagRoll}
        results={desk.results}
        weekKey={weekKey}
      />

      <TollV2PickTripDialog
        open={!!pickCharge}
        onOpenChange={(o) => !o && setPickCharge(null)}
        charge={pickCharge}
        pickQueue={pickQueue}
        busy={busy}
        onNone={() => setPickCharge(null)}
        onConfirm={async (s) => {
          if (!pickCharge) return;
          const ok = await applyTopSuggestion(pickCharge, s);
          if (ok) setPickCharge(null);
        }}
      />

      <TollV2CheckReceiptDialog
        open={!!receiptCharge && !rejectOpen}
        onOpenChange={(o) => !o && setReceiptCharge(null)}
        charge={receiptCharge}
        busy={busy}
        onReject={() => setRejectOpen(true)}
        onFine={async (amountMinor, changed) => {
          if (!receiptCharge) return;
          // Amount first, then the check: if either step is refused, the receipt is never left checked at the
          // misread amount (an unchecked receipt still blocks the seal, so nothing is lost).
          let version = receiptCharge.version;
          try {
            if (changed && amountMinor !== receiptCharge.amountMinor) {
              const adj = await runCommand('correct_charge_amount', {
                charge_id: receiptCharge.id,
                expected_charge_version: version,
                amount_minor: amountMinor,
                reason_code: 'receipt_reading',
              });
              if (adj === null) return;
              const v = (adj as { charge_version?: number })?.charge_version;
              if (typeof v !== 'number') {
                await refetchDesk();
                setReceiptCharge(null);
                return;
              }
              version = v;
              setReceiptCharge({ ...receiptCharge, version, amountMinor });
            }
            const res = await runCommand('verify_cash_receipt', {
              charge_id: receiptCharge.id,
              expected_charge_version: version,
            });
            if (res === null) return;
            setReceiptCharge(null);
            toast.success('Receipt checked');
          } catch {
            /* error toast shown by runCommand */
          }
        }}
      />

      <TollV2RejectReceiptDialog
        open={rejectOpen}
        onOpenChange={(o) => {
          setRejectOpen(o);
          if (!o) setReceiptCharge(null);
        }}
        busy={busy}
        onReject={async (reasonCode, note) => {
          if (!receiptCharge) return;
          try {
            const res = await runCommand('reject_cash_receipt', {
              charge_id: receiptCharge.id,
              expected_charge_version: receiptCharge.version,
              reason_code: reasonCode,
              note,
            });
            if (res === null) return;
            setRejectOpen(false);
            setReceiptCharge(null);
          } catch {
            /* error toast shown by runCommand */
          }
        }}
      />

      <TollV2DuplicateDialog
        open={!!dupPair}
        onOpenChange={(o) => !o && setDupPair(null)}
        pair={dupPair}
        chargeA={dupCharges.a ?? null}
        chargeB={dupCharges.b ?? null}
        busy={busy}
        onBoth={async () => {
          if (!dupPair || !dupCharges.a || !dupCharges.b) return;
          const cash = dupCharges.a.paidBy === 'cash' ? dupCharges.a : dupCharges.b;
          const tag = dupCharges.a.paidBy === 'tag' ? dupCharges.a : dupCharges.b;
          try {
            const res = await runCommand('release_duplicate', {
              charge_id: cash.id,
              expected_charge_version: cash.version,
              other_charge_id: tag.id,
              expected_other_version: tag.version,
            });
            if (res === null) return;
            setDupPair(null);
          } catch {
            /* error toast shown by runCommand */
          }
        }}
        onSameToll={async (copyId, keepId) => {
          if (!dupPair) return;
          const copy = desk.charges.find((c) => c.id === copyId);
          const keep = desk.charges.find((c) => c.id === keepId);
          if (!copy || !keep) return;
          try {
            const res = await runCommand('confirm_duplicate', {
              charge_id: copyId,
              expected_charge_version: copy.version,
              other_charge_id: keepId,
              expected_other_version: keep.version,
            });
            if (res === null) return;
            setDupPair(null);
          } catch {
            /* error toast shown by runCommand */
          }
        }}
      />

      <TollV2UndoDialog
        open={!!undoCharge}
        onOpenChange={(o) => !o && setUndoCharge(null)}
        charge={undoCharge}
        busy={busy}
        onUndo={async () => {
          if (!undoCharge) return;
          const body = decisionUndoPayload(undoCharge.decision);
          if (!body) return;
          try {
            const res = await runCommand('undo_decision', body);
            if (res === null) return;
            setUndoCharge(null);
          } catch {
            /* error toast shown by runCommand */
          }
        }}
      />

      <TollV2ConfirmAllSureDialog
        open={confirmAllOpen}
        onOpenChange={setConfirmAllOpen}
        rows={sureRows}
        busy={busy}
        onConfirm={async () => {
          const payload = sureRows.map(({ charge, suggestion }) => ({
            chargeId: charge.id,
            chargeVersion: charge.version,
            suggestionId: suggestion.suggestionId,
            paybackVersion: suggestion.paybackVersion,
          }));
          try {
            const counts = await runConfirmAllSure(runCommand, payload);
            setConfirmAllOpen(false);
            toast.success(formatConfirmAllSureToast(counts));
          } catch {
            /* runConfirmAllSure swallows row errors */
          }
        }}
      />

      <TollV2ReopenDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        busy={busy}
        reopenInsteadMessage={reopenInstead}
        onConfirm={(reason) => void handleReopen(reason)}
      />

      <TollV2RecordTakeBackDialog
        open={!!takeBackTarget}
        onOpenChange={(o) => !o && setTakeBackTarget(null)}
        takeBack={takeBackTarget}
        busy={busy}
        onSubmit={(opts) => void handleRecordTakeBack(opts)}
      />

      <TollV2MobileSealBar
        left={progress.left}
        sealing={sealing || busy}
        onSeal={() => void handleSeal()}
        hidden={desk.sealed || partsLayout}
      />

      <TollV2RefundReceivedDialog
        dispute={refundFor}
        busy={busy}
        onOpenChange={(o) => !o && setRefundFor(null)}
        onConfirm={(c) => refundFor && void settleDispute(refundFor, c)}
      />
      <TollV2LostDialog
        dispute={lostFor}
        busy={busy}
        onOpenChange={(o) => !o && setLostFor(null)}
        onConfirm={() => lostFor && void closeDisputeLost(lostFor)}
      />
      <TollV2OpenTripDialog dispute={tripFor} onOpenChange={(o) => !o && setTripFor(null)} />
      <TollV2ApprovalReasonDialog
        intent={approvalAsk?.intent ?? null}
        amountMinor={approvalAsk?.amountMinor ?? null}
        onDone={(reason) => approvalAsk?.resolve(reason)}
      />

      <TollV2LinkPaybackDialog
        open={!!linkPayback}
        onOpenChange={(o) => !o && setLinkPayback(null)}
        payback={linkPayback}
        busy={busy}
        charges={desk.charges.filter((c) => c.section === 'no_trip' || c.section === 'suggested')}
        onConfirm={async (charge) => {
          if (!linkPayback) return;
          try {
            const res = await runCommand('link_payback', {
              charge_id: charge.id,
              payback_id: linkPayback.id,
              expected_charge_version: charge.version,
              expected_payback_version: linkPayback.version,
            });
            if (res === null) return;
            setLinkPayback(null);
            await toastAfterTollDecision(queryClient, weekKey, charge.id, 'Matched', undoFromToast);
          } catch {
            /* error toast shown by runCommand */
          }
        }}
      />
    </div>
  );
}

function TollV2MainSection(props: {
  desk: NonNullable<ReturnType<typeof useTollV2Desk>['data']>;
  rowActions: TollV2RowActions & { onLinkPayback?: (p: TollV2Payback) => void; onLeaveUnlinked?: (p: TollV2Payback) => void };
  sureRows: ReturnType<typeof sureSuggestions>;
  sealed: boolean;
  onConfirmAll: () => void;
}) {
  return (
    <div className="mt-6">
      <TollV2Sections
        charges={props.desk.charges}
        paybacks={props.desk.paybacks}
        kept={props.desk.kept}
        rowActions={props.rowActions}
        sureCount={props.sureRows.length}
        sealed={props.sealed}
        onConfirmAllSure={props.sealed ? undefined : props.onConfirmAll}
      />
    </div>
  );
}

