/**
 * Step 8 Close (Stitch screens 10 + 11). Reads only the saved desk (WRA-07):
 * the calculator's close check, sources and corrections. No live week preview.
 *  - Open week: Fix before closing (Go to step), evidence, Close week → approval dialog.
 *  - Closed week: Closed badge, Corrections (Sign correction), Reopen → approval dialog,
 *    History, and the three outputs.
 * Close, Reopen and Sign use the existing week-close actions; the dialog chooses
 * between Send for approval and Approve it myself (reason required, logged self-approved).
 */
import React, { useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Lock, Unlock } from 'lucide-react';
import { MONEY_EPS, RECON_STEP_LABELS, type CloseBlocker, type RunStepId } from '@roam/finance-core';
import { blockingCount, humanBlockerLabel, wizardStepForBlockerCode } from '../../../utils/weekCloseBlockers';
import {
  fetchWeekHistory,
  sendForApproval,
  type ReconRunPayload,
} from '../../../services/reconApi';
import { weekCloseApi, WeekCloseApiError } from '../../../services/weekCloseApi';
import { isCloseWeekEnded } from '../../../utils/closeWeekPicker';
import { useSettlementQueue } from '../../../hooks/useSettlementQueue';
import { resolvePayQueueOwed } from '../../../utils/driverSettlementsPayAmount';
import { toast } from 'sonner';
import { ReconApprovalDialog } from './ReconApprovalDialog';
import { ReconWeekHistory } from './ReconWeekHistory';
import { approvalErrorMessage, assertWeekUnchanged, useReconApprovals } from './useReconApprovals';
import { formatWeekRange } from './weekListFormat';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}J$${body}`;
};

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

export type ReconCorrection = {
  statementId: string;
  kind: string;
  driverId: string | null;
  closeReason: string | null;
  raisedAt: string | null;
  raisedAutomatically: boolean;
};

type DialogKind = 'close' | 'reopen' | 'sign_restatement' | null;

/** What Close shows and allows, from the saved desk only. Exported for tests. */
export function closeStepState(input: {
  closeCheck: ReconRunPayload['closeCheck'];
  runState: string;
  weekEnded: boolean;
  calculatorPaused: boolean;
}): {
  closed: boolean;
  waiting: boolean;
  failed: boolean;
  items: CloseItem[];
  blocking: number;
  canClose: boolean;
  why: string | null;
} {
  const closed = input.runState === 'closed';
  const cc = input.closeCheck;
  const waiting = !cc || cc.status === 'none';
  const failed = cc?.status === 'error';
  const items: CloseItem[] =
    cc?.status === 'ok'
      ? cc.blockers.map((b) => ({
          code: b.code,
          severity: b.severity === 'warn' ? 'warn' : 'block',
          message: b.message || b.code,
          driverId: b.driver_id,
          sourceId: b.source_id,
          delta: b.delta,
        }))
      : [];
  const blocking = failed ? 1 : blockingCount(items as CloseBlocker[]);
  let why: string | null = null;
  if (closed) why = 'This week is closed.';
  else if (!input.weekEnded) why = 'Close opens after the week ends.';
  else if (input.calculatorPaused) why = 'The calculator is paused. Close stays off until it is running again.';
  else if (waiting) why = 'Waiting for the calculator to check this week.';
  else if (failed) why = "Could not load this week's checks.";
  else if (blocking > 0) why = `Fix ${blocking} ${blocking === 1 ? 'item' : 'items'} first.`;
  return { closed, waiting, failed, items, blocking, canClose: why === null, why };
}

export function ReconCloseStep({
  run,
  onRefresh,
  onGoToStep,
  onNavigate,
}: {
  run: ReconRunPayload;
  onRefresh: () => void;
  onGoToStep?: (step: RunStepId) => void;
  onNavigate?: (page: string) => void;
}) {
  const weekKey = run.run.weekKey;
  const line = (run.run.serviceLine as 'rideshare' | 'rush_delivery') || 'rideshare';
  const version = Number(run.run.version);
  const weekEnded = isCloseWeekEnded(weekKey);
  const periodEnd = useMemo(() => format(addDays(parseISO(`${weekKey}T12:00:00`), 6), 'yyyy-MM-dd'), [weekKey]);
  const approvals = useReconApprovals();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [riskAck, setRiskAck] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);

  const state = closeStepState({
    closeCheck: run.closeCheck,
    runState: run.run.state,
    weekEnded,
    calculatorPaused: Boolean(run.calculator?.paused),
  });
  const corrections = ((run as { corrections?: ReconCorrection[] }).corrections ?? []) as ReconCorrection[];

  const queueParams = { weekFrom: weekKey, weekTo: periodEnd, minAmount: 0, pageSize: 200, groupBy: 'week' as const };
  const collectQuery = useSettlementQueue({ view: 'collect', ...queueParams });
  const payQuery = useSettlementQueue({ view: 'pay', ...queueParams });
  const drivers = useMemo(() => {
    type Row = { driverId: string; driverName?: string; amountOwed?: number | null; collectKind?: string | null; cashStillHeld?: number | null; settlementAmount?: number | null };
    const byId = new Map<string, { name: string; owed: number; fleet: number }>();
    for (const r of (collectQuery.data?.rows || []) as Row[]) {
      const id = String(r.driverId || '').trim();
      if (!id) continue;
      const cur = byId.get(id) || { name: String(r.driverName || id), owed: 0, fleet: 0 };
      cur.owed += collectOwedMajor(r);
      byId.set(id, cur);
    }
    for (const r of (payQuery.data?.rows || []) as Row[]) {
      const id = String(r.driverId || '').trim();
      if (!id) continue;
      const cur = byId.get(id) || { name: String(r.driverName || id), owed: 0, fleet: 0 };
      cur.fleet += resolvePayQueueOwed(r);
      byId.set(id, cur);
    }
    return byId;
  }, [collectQuery.data?.rows, payQuery.data?.rows]);
  const fleetOwes = [...drivers.values()].reduce((n, d) => n + d.fleet, 0);
  const driversOwe = [...drivers.values()].reduce((n, d) => n + d.owed, 0);

  // Closed badge: the latest close in the week's own history.
  const historyQuery = useQuery({
    queryKey: ['recon-week-history', line, weekKey, version],
    queryFn: () => fetchWeekHistory(line, weekKey),
    enabled: state.closed,
    staleTime: 30_000,
    retry: false,
  });
  /** Done-test 8c: people who can neither prepare nor approve see no change buttons. */
  const canChange = approvals.canApprove || approvals.canPrepare;
  const closedRow = useMemo(
    () => [...(historyQuery.data ?? [])].reverse().find((i) => i.label === 'Closed the week' || i.label === 'Closed as old clean-up week'),
    [historyQuery.data],
  );
  /** Done-test 4k: a week closed by the old clean-up cannot be reopened (server: LEGACY_CLOSED). */
  const legacyClosed = closedRow?.label === 'Closed as old clean-up week';

  const sourceLabels = new Map((run.sources || []).map((s) => [s.id, s.label]));
  const isAttestedNone = (b: CloseItem) => String(b.code || '').toUpperCase() === 'SOURCE_ATTESTED_NONE';
  const blocks = state.items.filter((b) => String(b.severity || 'block') !== 'warn');
  const warnings = state.items.filter((b) => String(b.severity || 'block') === 'warn' && !isAttestedNone(b));
  const itemLabel = (b: CloseItem) => {
    if (!String(b.code || '').toUpperCase().startsWith('SOURCE_')) return humanBlockerLabel(b);
    const label = b.sourceId ? sourceLabels.get(b.sourceId) : null;
    const base = humanBlockerLabel(b);
    return label ? `${label}: ${base.charAt(0).toLowerCase()}${base.slice(1)}` : b.message || base;
  };
  const renderItem = (b: CloseItem, i: number) => {
    const step = wizardStepForBlockerCode(b.code);
    const who = b.driverId ? drivers.get(b.driverId)?.name : null;
    const amount = b.delta != null && Math.abs(b.delta) > MONEY_EPS ? MONEY(b.delta) : null;
    return (
      <li key={`${b.code}-${b.driverId ?? ''}-${b.sourceId ?? ''}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
        <span className="text-sm text-[#0b1c30]">
          {step ? <span className="font-semibold">{RECON_STEP_LABELS[step]}: </span> : null}
          {itemLabel(b)}
          {who ? ` — ${who}` : ''}
          {amount ? ` (off by ${amount})` : ''}
        </span>
        {onGoToStep && step && step !== 'close' ? (
          <button
            type="button"
            onClick={() => onGoToStep(step)}
            className="h-8 rounded-lg bg-[#e5eeff] px-3 text-[13px] font-semibold text-[#0b1c30] hover:bg-[#d3e4fe]"
          >
            Go to {RECON_STEP_LABELS[step]}
          </button>
        ) : null}
      </li>
    );
  };

  const afterChange = async () => {
    approvals.refresh();
    await onRefresh();
  };

  const send = async (action: 'close' | 'reopen' | 'sign_restatement', reason: string) => {
    setBusy(true);
    try {
      await sendForApproval({
        line,
        weekKey,
        action,
        reason,
        expectedVersion: version,
        params: action === 'reopen' ? { acknowledgeSettlementRisk: riskAck } : {},
      });
      toast.success('Sent for approval');
      setDialog(null);
      await afterChange();
    } catch (e) {
      toast.error(approvalErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const selfClose = async (reason: string) => {
    setBusy(true);
    try {
      await assertWeekUnchanged(line, weekKey, version);
      const res = await weekCloseApi.close(weekKey, reason, {
        idempotencyKey: crypto.randomUUID(),
        skipPrepare: true,
        serviceLine: line,
        onProgress: setProgress,
      });
      if (res.closed) toast.success(`Week of ${formatWeekRange(weekKey)} closed — ${res.driversClosed} drivers signed`);
      else toast.error(`Could not close — ${res.driversBlocked} drivers still blocked`);
      setDialog(null);
      await afterChange();
    } catch (e) {
      toast.error(e instanceof WeekCloseApiError && e.code === 'CLOSE_IN_PROGRESS' ? 'Close is already running. Wait a moment.' : approvalErrorMessage(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const selfReopen = async (reason: string) => {
    setBusy(true);
    try {
      await assertWeekUnchanged(line, weekKey, version);
      const res = await weekCloseApi.reopen(weekKey, reason, riskAck, line);
      toast.success(`Week reopened — ${res.driversReopened} driver${res.driversReopened === 1 ? '' : 's'} unfrozen.`);
      setDialog(null);
      setRiskAck(false);
      await afterChange();
    } catch (e) {
      if (e instanceof WeekCloseApiError && e.code === 'SETTLEMENT_RISK') {
        toast.error('Money was already paid or collected this week. Tick the box to confirm, then try again.');
      } else {
        toast.error(approvalErrorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  /** Automatic (data) corrections: one signature, no reason, not self-approval (WRA-30). */
  const signDataCorrection = async (c: ReconCorrection) => {
    setSigningId(c.statementId);
    try {
      await assertWeekUnchanged(line, weekKey, version);
      await weekCloseApi.close(weekKey, 'Signed correction', { idempotencyKey: crypto.randomUUID(), skipPrepare: true, serviceLine: line });
      toast.success('Correction signed');
      await afterChange();
    } catch (e) {
      toast.error(approvalErrorMessage(e));
    } finally {
      setSigningId(null);
    }
  };

  const personCorrections = corrections.filter((c) => !c.raisedAutomatically);
  const dataCorrections = corrections.filter((c) => c.raisedAutomatically);

  return (
    <div className="space-y-5" data-testid="recon-close-step">
      {state.closed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#0b1c30] px-5 py-4 text-white" data-testid="recon-closed-badge">
          <p className="flex items-center gap-2 text-base font-semibold">
            <Lock className="h-5 w-5" aria-hidden /> Closed
            {closedRow ? (
              <span className="font-normal text-white/80">
                {' '}· {new Date(closedRow.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} by {closedRow.by}
              </span>
            ) : null}
          </p>
          {canChange && !legacyClosed ? (
          <button
            type="button"
            onClick={() => { setRiskAck(false); setDialog('reopen'); }}
            disabled={busy}
            data-testid="recon-reopen"
            className="flex h-10 items-center gap-2 rounded-xl bg-[#fff1f2] px-4 text-sm font-semibold text-[#ba1a1a] hover:bg-[#ffdad6]"
          >
            <Unlock className="h-4 w-4" aria-hidden /> Reopen week
          </button>
          ) : null}
        </div>
      ) : null}

      {state.closed && corrections.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-5" data-testid="recon-corrections">
          <p className="text-lg font-semibold text-[#0b1c30]">Corrections waiting to be signed</p>
          <p className="text-sm text-[#47464c]">The closed figures stay as they are until a correction is signed.</p>
          <ul className="space-y-2">
            {dataCorrections.map((c) => (
              <li key={c.statementId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                <span>
                  {c.kind} — raised automatically{c.raisedAt ? ` on ${new Date(c.raisedAt).toLocaleDateString()}` : ''}
                  {c.driverId && drivers.get(c.driverId) ? ` · ${drivers.get(c.driverId)!.name}` : ''}
                </span>
                {approvals.canApprove ? (
                  <button
                    type="button"
                    disabled={!!signingId}
                    onClick={() => void signDataCorrection(c)}
                    className="flex h-9 items-center gap-2 rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white"
                  >
                    {signingId === c.statementId ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Sign correction
                  </button>
                ) : (
                  <span className="text-[13px] text-[#47464c]">An approver signs this.</span>
                )}
              </li>
            ))}
            {personCorrections.map((c) => (
              <li key={c.statementId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm">
                <span>
                  {c.kind}{c.closeReason ? ` — “${c.closeReason}”` : ''}
                  {c.driverId && drivers.get(c.driverId) ? ` · ${drivers.get(c.driverId)!.name}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setDialog('sign_restatement')}
                  className="h-9 rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white"
                >
                  Sign correction
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!state.closed ? (
        <>
          {state.waiting ? (
            <p className="flex items-center gap-2 rounded-2xl bg-[#eff4ff] px-4 py-3 text-sm text-[#0b1c30]" data-testid="recon-close-waiting">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Waiting for the calculator to check this week.
            </p>
          ) : null}
          {state.failed ? (
            <p className="rounded-2xl bg-[#fff1f2] px-4 py-3 text-sm text-[#93000a]">
              Could not load this week&apos;s checks, so Close stays off. Reload the week.
            </p>
          ) : null}
          {blocks.length > 0 ? (
            <section className="space-y-2 rounded-2xl border border-[#ffdad6] bg-[#fff1f2] p-4" data-testid="recon-close-fix">
              <p className="font-semibold text-[#93000a]">Fix before closing</p>
              <ul className="space-y-2">{blocks.map(renderItem)}</ul>
            </section>
          ) : null}
          {warnings.length > 0 ? (
            <section className="space-y-2 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
              <p className="font-semibold text-[#92400e]">Worth a look (does not stop Close)</p>
              <ul className="space-y-2">{warnings.map(renderItem)}</ul>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="rounded-2xl border border-[#e5eeff] bg-white p-5">
        <p className="text-lg font-semibold text-[#0b1c30]">Evidence</p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {(run.sources || [])
            .filter((s) => s.requirement !== 'not_applicable' && s.status !== 'not_applicable')
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#f8f9ff] px-3 py-2 text-[13px]">
                <span className="font-medium text-[#0b1c30]">{s.label}</span>
                <span className={s.status === 'received' ? 'font-semibold text-[#069669]' : 'text-[#47464c]'}>
                  {s.status === 'received' ? 'Received' : s.status === 'attested_none' ? 'No activity' : s.status === 'waived' ? 'Waived' : s.status.replace(/_/g, ' ')}
                </span>
              </li>
            ))}
        </ul>
        {(run.attribution?.rowCount ?? 0) > 0 ? (
          <p className="mt-2 text-[13px] text-[#92400e]">
            {run.attribution!.rowCount} shared row(s) still need a service line.
          </p>
        ) : null}
      </section>

      {!state.closed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e5eeff] bg-[#f8f9ff] p-5">
          <div className="text-sm">
            <p className="font-semibold text-[#0b1c30]">
              {drivers.size} driver{drivers.size === 1 ? '' : 's'} · Fleet owes {MONEY(fleetOwes)} · Drivers owe {MONEY(driversOwe)}
            </p>
            <p className={state.canClose ? 'text-[#069669]' : 'text-[#47464c]'}>
              {state.canClose ? (
                <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" aria-hidden /> Every step is done and every driver ties.</span>
              ) : state.why}
            </p>
          </div>
          {canChange ? (
          <button
            type="button"
            disabled={!state.canClose || busy}
            onClick={() => setDialog('close')}
            data-testid="recon-close-week"
            className="flex h-11 items-center gap-2 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Lock className="h-4 w-4" aria-hidden />}
            {busy && progress ? progress : state.blocking > 0 ? `Fix ${state.blocking} item${state.blocking === 1 ? '' : 's'}` : 'Close week'}
          </button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {[
            { page: 'driver-settlements', label: 'Open Driver Settlements' },
            { page: 'business-finance', label: 'Open Business P&L' },
            { page: 'transaction-list', label: 'Open Ledgers' },
          ].map((o) => (
            <button
              key={o.page}
              type="button"
              onClick={() => onNavigate?.(o.page)}
              className="h-10 rounded-xl bg-[#e5eeff] px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#d3e4fe]"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <ReconWeekHistory line={line} weekKey={weekKey} version={version} />

      <ReconApprovalDialog
        open={dialog === 'close'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Close the week of ${formatWeekRange(weekKey)}?`}
        summary={`${drivers.size} driver${drivers.size === 1 ? '' : 's'} · Fleet owes ${MONEY(fleetOwes)}`}
        detail="Locks every step and freezes each driver's week. Changes after this need a correction."
        confirmLabel="Approve & lock week"
        canApprove={approvals.canApprove}
        otherApprovers={approvals.otherApprovers}
        busy={busy}
        onSend={(reason) => send('close', reason)}
        onSelfApprove={selfClose}
      />
      <ReconApprovalDialog
        open={dialog === 'sign_restatement'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Sign the correction for ${formatWeekRange(weekKey)}?`}
        summary={`${personCorrections.length} correction${personCorrections.length === 1 ? '' : 's'} on a closed week`}
        detail="Replaces the closed figures with the corrected ones."
        confirmLabel="Approve & sign"
        canApprove={approvals.canApprove}
        otherApprovers={approvals.otherApprovers}
        busy={busy}
        onSend={(reason) => send('sign_restatement', reason)}
        onSelfApprove={selfClose}
      />
      <ReconApprovalDialog
        open={dialog === 'reopen'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Reopen the week of ${formatWeekRange(weekKey)}?`}
        summary="Unlocks every step so it can be changed again"
        detail="Tolls locked by the close reopen too. The week has to be closed again afterwards."
        confirmLabel="Approve & reopen"
        canApprove={approvals.canApprove}
        otherApprovers={approvals.otherApprovers}
        busy={busy}
        onSend={(reason) => send('reopen', reason)}
        onSelfApprove={selfReopen}
        extra={
          <label className="flex items-start gap-2 rounded-xl bg-[#fffbeb] p-3 text-sm text-[#92400e]">
            <input type="checkbox" className="mt-1" checked={riskAck} onChange={(e) => setRiskAck(e.target.checked)} />
            <span>If money was already paid or collected this week, I understand reopening can let it be paid or collected twice.</span>
          </label>
        }
      />
    </div>
  );
}
