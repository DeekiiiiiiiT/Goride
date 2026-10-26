/**
 * Embedded Close Week confirm + evidence + reopen (R2-26).
 * Stays on /week-reconciliation. Close starts the close workflow directly: it waits for
 * every driver to finish updating and re-checks before freezing, so no separate sync step.
 */
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { CheckCircle2, Loader2, Lock, Unlock } from 'lucide-react';
import { MONEY_EPS, RECON_STEP_LABELS, type CloseBlocker, type RunStepId } from '@roam/finance-core';
import {
  blockingCount,
  humanBlockerLabel,
  wizardStepForBlockerCode,
} from '../../../utils/weekCloseBlockers';
import type { ReconRunPayload } from '../../../services/reconApi';
import {
  weekCloseApi,
  isWeekCloseUnavailable,
  WeekCloseApiError,
} from '../../../services/weekCloseApi';
import { isCloseWeekEnded } from '../../../utils/closeWeekPicker';
import { useSettlementQueue } from '../../../hooks/useSettlementQueue';
import { resolvePayQueueOwed } from '../../../utils/driverSettlementsPayAmount';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { Textarea } from '../../ui/textarea';
import { toast } from 'sonner';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function weekLabel(weekKey: string): string {
  try {
    const start = parseISO(`${weekKey}T12:00:00`);
    const end = addDays(start, 6);
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  } catch {
    return weekKey;
  }
}

function collectOwedMajor(r: {
  amountOwed?: number | null;
  collectKind?: string | null;
  cashStillHeld?: number | null;
  settlementAmount?: number | null;
}): number {
  if (r.amountOwed != null && Number.isFinite(r.amountOwed)) return Math.max(0, Number(r.amountOwed));
  if (r.collectKind === 'cash_held') return Math.max(0, Number(r.cashStillHeld) || 0);
  return Math.max(0, Math.abs(Number(r.settlementAmount) || 0));
}

type CloseItem = Pick<CloseBlocker, 'code' | 'severity' | 'message'> & {
  driverId?: string | null;
  sourceId?: string | null;
  delta?: number | null;
};

export function ReconCloseStep({
  run,
  onRefresh,
  onGoToStep,
}: {
  run: ReconRunPayload;
  onRefresh: () => void;
  onGoToStep?: (step: RunStepId) => void;
}) {
  const weekKey = run.run.weekKey;
  const serviceLine = (run.run.serviceLine as 'rideshare' | 'rush_delivery') || 'rideshare';
  const weekEnded = isCloseWeekEnded(weekKey);
  const periodEnd = useMemo(
    () => format(addDays(parseISO(`${weekKey}T12:00:00`), 6), 'yyyy-MM-dd'),
    [weekKey],
  );

  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeIdempotencyKey, setCloseIdempotencyKey] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [settlementRiskPrompt, setSettlementRiskPrompt] = useState(false);
  const [acknowledgeSettlementRisk, setAcknowledgeSettlementRisk] = useState(false);

  const previewQuery = useQuery({
    queryKey: ['recon-close-preview', weekKey, serviceLine],
    queryFn: () => weekCloseApi.preview(weekKey, serviceLine),
    staleTime: 30_000,
    retry: false,
  });

  const queueParams = {
    weekFrom: weekKey,
    weekTo: periodEnd,
    minAmount: 0,
    pageSize: 200,
    groupBy: 'week' as const,
  };
  const collectQuery = useSettlementQueue({ view: 'collect', ...queueParams });
  const payQuery = useSettlementQueue({ view: 'pay', ...queueParams });

  const closeConfirmDrivers = useMemo(() => {
    type Row = {
      driverId: string;
      driverName?: string;
      amountOwed?: number | null;
      collectKind?: string | null;
      cashStillHeld?: number | null;
      settlementAmount?: number | null;
    };
    const byId = new Map<
      string,
      { driverId: string; name: string; owed: number; fleet: number }
    >();
    for (const r of (collectQuery.data?.rows || []) as Row[]) {
      const id = String(r.driverId || '').trim();
      if (!id) continue;
      const cur = byId.get(id) || {
        driverId: id,
        name: String(r.driverName || id),
        owed: 0,
        fleet: 0,
      };
      if (r.driverName) cur.name = String(r.driverName);
      cur.owed += collectOwedMajor(r);
      byId.set(id, cur);
    }
    for (const r of (payQuery.data?.rows || []) as Row[]) {
      const id = String(r.driverId || '').trim();
      if (!id) continue;
      const cur = byId.get(id) || {
        driverId: id,
        name: String(r.driverName || id),
        owed: 0,
        fleet: 0,
      };
      if (r.driverName) cur.name = String(r.driverName);
      cur.fleet += resolvePayQueueOwed(r);
      byId.set(id, cur);
    }
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [collectQuery.data?.rows, payQuery.data?.rows]);

  const preview = previewQuery.data;
  const reconEvidence = preview?.reconEvidence;
  const weekAlreadyClosed = !!preview?.weekClosed;
  // The button follows the live preview (driversReady). Show that same list,
  // so a real block cannot hide behind an older saved picture that says the week ties.
  const closeCheck = run.closeCheck;
  const closeCheckFailed = closeCheck?.status === 'error';
  const liveItems: CloseItem[] = [
    ...(preview?.blockers || []),
    ...(preview?.weekBlockers || []),
  ].map((b) => ({
    code: b.code,
    severity: b.severity === 'warn' ? 'warn' : 'block',
    message: b.message || b.code,
    driverId: b.driverId,
    sourceId: b.sourceId,
    delta: b.delta,
  }));
  const closeItems: CloseItem[] = preview
    ? liveItems
    : closeCheck?.status === 'ok'
      ? closeCheck.blockers.map((b) => ({
          code: b.code,
          severity: b.severity === 'warn' ? 'warn' : 'block',
          message: b.message || b.code,
          driverId: b.driver_id,
          sourceId: b.source_id,
          delta: b.delta,
        }))
      : [];
  const totalBlockers = closeCheckFailed ? 1 : blockingCount(closeItems as CloseBlocker[]);
  // "No activity" confirmations are decisions already made on Upload inputs.
  // They belong in the evidence record, not in the to-do warnings.
  const isAttestedNone = (b: CloseItem) => String(b.code || '').toUpperCase() === 'SOURCE_ATTESTED_NONE';
  const sourceLabels = new Map((run.sources || []).map((s) => [s.id, s.label]));
  const sourceLabel = (b: CloseItem) => (b.sourceId ? sourceLabels.get(b.sourceId) : null);
  const confirmedNoActivity = Array.from(
    new Set(
      closeItems
        .filter(isAttestedNone)
        .map((b) => sourceLabel(b) || b.message || 'a source'),
    ),
  );
  const closeBlocks = closeItems.filter((b) => String(b.severity || 'block') !== 'warn');
  const closeWarnings = closeItems.filter(
    (b) => String(b.severity || 'block') === 'warn' && !isAttestedNone(b),
  );
  const driverNames = new Map(closeConfirmDrivers.map((d) => [d.driverId, d.name]));
  // Source checks: the server message names the source, the generic label does not.
  const itemLabel = (b: CloseItem) => {
    if (!String(b.code || '').toUpperCase().startsWith('SOURCE_')) return humanBlockerLabel(b);
    const label = sourceLabel(b);
    const base = humanBlockerLabel(b);
    return label ? `${label}: ${base.charAt(0).toLowerCase()}${base.slice(1)}` : b.message || base;
  };
  const renderItem = (b: CloseItem, i: number) => {
    const step = wizardStepForBlockerCode(b.code);
    const who = b.driverId ? driverNames.get(b.driverId) : null;
    const amount = b.delta != null && Math.abs(b.delta) > MONEY_EPS ? MONEY(b.delta) : null;
    return (
      <li key={`${b.code}-${b.driverId ?? ''}-${b.sourceId ?? ''}-${i}`} className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {itemLabel(b)}
          {who ? ` — ${who}` : ''}
          {amount ? ` (off by ${amount})` : ''}
        </span>
        {onGoToStep && step && step !== 'close' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 bg-white text-xs"
            onClick={() => onGoToStep(step)}
          >
            Go to {RECON_STEP_LABELS[step]}
          </Button>
        ) : null}
      </li>
    );
  };
  const pendingRestatementCount = preview?.pendingRestatementCount ?? 0;
  const hasPendingRestatements = pendingRestatementCount > 0;

  const doClose = async (
    reason: string,
    opts?: { idempotencyKey?: string; skipPrepare?: boolean },
  ) => {
    setClosing(true);
    try {
      const res = await weekCloseApi.close(weekKey, reason, {
        idempotencyKey: opts?.idempotencyKey,
        skipPrepare: opts?.skipPrepare === true,
        serviceLine,
        onProgress: setCloseNote,
      });
      if (res.closed) {
        toast.success(
          hasPendingRestatements
            ? `Restatements signed — ${res.driversClosed} drivers re-sealed`
            : `Week of ${weekLabel(weekKey)} closed — ${res.driversClosed} drivers signed`,
        );
      } else {
        toast.error(`Could not close — ${res.driversBlocked} drivers still blocked`);
      }
      await previewQuery.refetch();
      onRefresh();
    } catch (e) {
      if (isWeekCloseUnavailable(e)) {
        toast.error('Close endpoint not deployed yet.');
      } else if (e instanceof WeekCloseApiError && e.code === 'CLOSE_IN_PROGRESS') {
        toast.message('Close already in progress — wait a moment and try again.');
      } else {
        toast.error(e instanceof Error ? e.message : 'Close week failed');
      }
    } finally {
      setClosing(false);
    }
  };

  const confirmCloseWeek = async () => {
    const reason = 'Closed from Week Reconciliation';
    const key = closeIdempotencyKey || crypto.randomUUID();
    if (!closeIdempotencyKey) setCloseIdempotencyKey(key);

    setCloseConfirmOpen(false);
    await doClose(reason, { idempotencyKey: key, skipPrepare: true });
  };

  const doReopen = async (ackRisk: boolean) => {
    const reason = reopenReason.trim();
    if (!reason) {
      toast.error('Enter a reason before re-opening this week.');
      return;
    }
    setReopening(true);
    try {
      const res = await weekCloseApi.reopen(weekKey, reason, ackRisk, serviceLine);
      toast.success(
        `Week re-opened — ${res.driversReopened} driver${res.driversReopened === 1 ? '' : 's'} unfrozen.`,
      );
      setReopenOpen(false);
      setReopenReason('');
      setAcknowledgeSettlementRisk(false);
      setSettlementRiskPrompt(false);
      await previewQuery.refetch();
      onRefresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Re-open week failed');
    } finally {
      setReopening(false);
    }
  };

  if (previewQuery.isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading close preview…
      </div>
    );
  }

  if (previewQuery.isError && isWeekCloseUnavailable(previewQuery.error)) {
    return (
      <p className="text-sm text-slate-500">
        Week close is not available on this environment yet.
      </p>
    );
  }

  if (previewQuery.isError) {
    return <p className="text-sm text-rose-700">Could not load close preview for this week.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Confirm evidence and close week of {weekLabel(weekKey)} ({serviceLine.replace(/_/g, ' ')}).
      </p>

      {reconEvidence ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
          <p className="font-medium text-slate-900">Evidence — inputs &amp; attestations</p>
          <p className="mt-1 text-xs text-slate-500">
            Line: {reconEvidence.serviceLine}
            {reconEvidence.runState ? ` · run ${reconEvidence.runState}` : ''}
          </p>
          {reconEvidence.sources?.length ? (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {reconEvidence.sources
                .filter((s) => s.requirement !== 'not_applicable')
                .map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs"
                  >
                    <span className="font-medium text-slate-800">{s.label}</span>
                    <span className="capitalize text-slate-600">
                      {s.status.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-slate-500">Source manifest will appear after recon sync.</p>
          )}
          {confirmedNoActivity.length > 0 ? (
            <p className="mt-2 text-xs text-slate-600">
              You confirmed no activity: {confirmedNoActivity.join(', ')}.
            </p>
          ) : null}
          {(reconEvidence.unattributed?.rowCount ?? 0) > 0 ? (
            <p className="mt-2 text-xs text-amber-800">
              {reconEvidence.unattributed.rowCount} unattributed row(s) (
              {MONEY(reconEvidence.unattributed.amountMajor)}) — assign lines before close.
            </p>
          ) : null}
        </div>
      ) : null}

      {closeCheckFailed ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Could not load this week&apos;s checks, so Close stays locked. Refresh and try again.
        </p>
      ) : null}

      {!weekAlreadyClosed && closeBlocks.length > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="mb-2 font-medium">Fix before closing</p>
          <ul className="space-y-1.5">{closeBlocks.map(renderItem)}</ul>
        </div>
      ) : null}

      {closeWarnings.length > 0 ? (
        <ul className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {closeWarnings.map(renderItem)}
        </ul>
      ) : null}

      <div
        className={
          weekAlreadyClosed
            ? 'flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between'
            : 'flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between'
        }
      >
        <div className="text-sm text-slate-600">
          {weekAlreadyClosed ? (
            <span className="text-emerald-800">
              Already closed
              {preview?.driversFrozen != null
                ? ` — ${preview.driversFrozen} driver${preview.driversFrozen === 1 ? '' : 's'} frozen`
                : ''}
              .
              {hasPendingRestatements
                ? ` ${pendingRestatementCount} restatement draft(s) ready to sign.`
                : ''}
            </span>
          ) : !weekEnded ? (
            <span className="text-amber-800">
              This week is still in progress — Close unlocks after the week ends.
            </span>
          ) : totalBlockers > 0 ? (
            <span className="text-rose-700">
              {totalBlockers} blocker{totalBlockers === 1 ? '' : 's'} — see the list above.
            </span>
          ) : (
            <span className="text-emerald-700">
              Every driver ties. {preview?.driversReady ?? 0} ready to close.
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {weekAlreadyClosed ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 border-slate-300 bg-white"
              disabled={reopening}
              onClick={() => {
                const riskUpFront = (preview?.settlementRiskDriverCount ?? 0) > 0;
                setSettlementRiskPrompt(riskUpFront);
                setAcknowledgeSettlementRisk(false);
                setReopenOpen(true);
              }}
            >
              <Unlock className="mr-2 h-4 w-4" />
              Re-open week
            </Button>
          ) : (
            <Button
              type="button"
              className="h-10 bg-indigo-700 hover:bg-indigo-800"
              disabled={
                closing ||
                !weekEnded ||
                totalBlockers > 0 ||
                (preview?.driversReady ?? 0) === 0
              }
              onClick={() => setCloseConfirmOpen(true)}
            >
              {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              {closeNote && closing ? closeNote : hasPendingRestatements ? 'Sign restatements' : 'Close week'}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={closeConfirmOpen}
        onOpenChange={(open) => {
          if (closing) return;
          setCloseConfirmOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasPendingRestatements
                ? `Sign restatements for ${weekLabel(weekKey)}?`
                : `Close week of ${weekLabel(weekKey)}?`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2.5 font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              Everything is complete — every step is done and every driver ties.
            </p>
            <p className="text-slate-600">
              Closing freezes {preview?.driversReady ?? 0} driver-period
              {(preview?.driversReady ?? 0) === 1 ? '' : 's'} and locks Pay/Collect for the week.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={closing}
              onClick={() => setCloseConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={closing}
              onClick={() => void confirmCloseWeek()}
            >
              {closing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              {closeNote && closing ? closeNote : hasPendingRestatements ? 'Sign restatements' : 'Close week'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reopenOpen}
        onOpenChange={(open) => {
          if (reopening) return;
          setReopenOpen(open);
          if (!open) {
            setSettlementRiskPrompt(false);
            setAcknowledgeSettlementRisk(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Re-open week of {weekLabel(weekKey)}?</DialogTitle>
            <DialogDescription>
              Unlocks this week so earlier steps can be edited again. Tolls that an earlier close
              locked are reopened with this same reason. You must re-close when done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Why is this week being re-opened?"
              rows={3}
              className="resize-none"
            />
            {settlementRiskPrompt ? (
              <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acknowledgeSettlementRisk}
                  onChange={(e) => setAcknowledgeSettlementRisk(e.target.checked)}
                />
                <span>
                  Settlement money was already moved. I understand re-opening can allow duplicate
                  collect/pay.
                </span>
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={reopening}
              onClick={() => setReopenOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={
                reopening ||
                !reopenReason.trim() ||
                (settlementRiskPrompt && !acknowledgeSettlementRisk)
              }
              onClick={() => void doReopen(acknowledgeSettlementRisk)}
            >
              {reopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
              Re-open week
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
