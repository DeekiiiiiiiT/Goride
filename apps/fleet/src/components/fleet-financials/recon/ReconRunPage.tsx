import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Loader2, Lock } from 'lucide-react';
import { RECON_STEP_LABELS, RECON_STEP_ORDER, serverStepForBlockerCode, type RunStepId } from '@roam/finance-core';
import { humanBlockerLabel } from '../../../utils/weekCloseBlockers';
import {
  completeRunStep,
  fetchRun,
  fetchWeekProjectionStatus,
  isReconUnavailable,
  ReconApiError,
  retryFailedProjection,
  type ReconRunPayload,
} from '../../../services/reconApi';
import { ReconSourcesStep } from './ReconSourcesStep';
import { ReconAttributionStep } from './ReconAttributionStep';
import { ReconCodRemittanceBanner } from './ReconCodRemittanceBanner';
import { ReconTagAccountStep } from './ReconTagAccountStep';
import { ReconTripsEarningsStep } from './ReconTripsEarningsStep';
import { ReconSettlementStep } from './ReconSettlementStep';
import { ReconCloseStep } from './ReconCloseStep';
import { ReconStepBoundary } from './ReconStepBoundary';
import { PastWeeksReturnLink } from '../settlements/past-weeks/PastWeeksReturnLink';
import { TollsCheckFailedBanner, TollsLockedBanner } from './TollsLockedBanner';
import { ReconCalculatorBanner } from './ReconCalculatorBanner';
import { ReconPendingApprovalBanner } from './ReconPendingApprovalBanner';
import { approvalsForWeek, useReconApprovals } from './useReconApprovals';
import { formatWeekRange, formatWeekTitle } from './weekListFormat';
import { api } from '../../../services/api';
import { RECON_WEEK_CHANGED_EVENT, clearReconWeekContext, setReconWeekContext } from '../../../services/reconWeekContext';
import { useAuth } from '../../auth/AuthContext';
import { hasAnyJwtRole } from '@roam/auth-client';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';
import { toast } from 'sonner';

const FuelManagementLazy = lazy(() =>
  import('../../../pages/FuelManagement').then((m) => ({ default: m.FuelManagement })),
);
const TollReconciliationLazy = lazy(() =>
  import('../../../pages/TollReconciliation').then((m) => ({ default: m.TollReconciliation })),
);

function stepFromQuery(): RunStepId {
  if (typeof window === 'undefined') return 'sources';
  const raw = new URLSearchParams(window.location.search).get('step');
  if (raw && (RECON_STEP_ORDER as readonly string[]).includes(raw)) return raw as RunStepId;
  return 'sources';
}

/** Steps with nothing to review when empty — auto-complete and skip past them. */
function isEmptyAutoSkip(run: ReconRunPayload, stepId: RunStepId): boolean {
  if (stepId === 'attribution') return (run.attribution?.rowCount ?? 0) === 0;
  return false;
}

function stepStatus(run: ReconRunPayload, stepId: RunStepId): string {
  return run.evaluation.steps.find((s) => s.id === stepId)?.status ?? 'locked';
}

/** The one question each step answers (Stitch headers). */
const STEP_QUESTION: Record<RunStepId, string> = {
  sources: 'Are all the files for this week in?',
  attribution: 'Which service line does each shared toll and fuel row belong to?',
  tolls: 'Does every toll match a trip, a refund or a dispute?',
  tag_account: 'Does the toll tag account balance for the week?',
  fuel: 'Is every fuel fill matched and priced?',
  trips_earnings: 'Do the trips and earnings match the platform statements?',
  settlement_preview: 'What does each driver get paid or owe?',
  close: 'Is the week ready to lock?',
};

type StepLockedBy = { kind: 'source' | 'step'; id: string; label: string };

function parseLockedBy(raw: unknown): StepLockedBy | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as { kind?: string; id?: string; label?: string };
  if (o.kind !== 'source' && o.kind !== 'step') return undefined;
  const label = String(o.label || '').trim();
  if (!label) return undefined;
  return { kind: o.kind, id: String(o.id || ''), label };
}

/** Plain status for the step rail — locked steps say what they are waiting on. */
function stepRailCaption(status: string, lockedBy: StepLockedBy | undefined): string {
  if (status === 'locked') {
    if (lockedBy?.label) return `Waiting on ${lockedBy.label}`;
    return 'Locked';
  }
  if (status === 'in_progress') return 'In progress';
  if (status === 'ready') return 'Ready';
  if (status === 'complete') return 'Complete';
  if (status === 'stale') return 'Stale — re-review';
  return status.replace(/_/g, ' ');
}

function AttributionRail({ run }: { run: ReconRunPayload }) {
  const u = run.attribution?.rowCount ?? 0;
  const amt = run.attribution?.amountMajor ?? 0;
  return (
    <div className="space-y-3 rounded-[20px] bg-white p-5 text-sm shadow-sm" data-testid="recon-summary-split">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Service line split
      </p>
      <dl className="space-y-1 tabular-nums">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-600">Unattributed rows</dt>
          <dd className="font-medium text-amber-800">{u}</dd>
        </div>
        <div className="flex justify-between gap-2 border-t border-slate-200 pt-2 font-semibold">
          <dt>Unattributed $</dt>
          <dd>{amt > 0 ? `$${amt.toFixed(2)}` : '—'}</dd>
        </div>
      </dl>
      <p className="text-xs text-slate-500">Assign shared toll and fuel in the attribution step.</p>
    </div>
  );
}

export function ReconRunPage({
  line,
  weekKey,
  onBack,
  onNavigate,
  onStepChange,
  onOpenRemittance,
}: {
  line: 'rideshare' | 'rush_delivery';
  weekKey: string;
  onBack: () => void;
  onNavigate?: (
    page: string,
    opts?: { startYmd: string; endYmd?: string; driverId?: string },
  ) => void;
  onStepChange?: (step: RunStepId) => void;
  onOpenRemittance?: () => void;
}) {
  const { session } = useAuth();
  const canResumeCalculator = session?.user
    ? hasAnyJwtRole(session.user, ['fleet_admin', 'platform_owner', 'superadmin'])
    : false;
  const [activeStep, setActiveStep] = useState<RunStepId>(() => stepFromQuery());
  const queryClient = useQueryClient();
  const runQueryKey = useMemo(() => ['recon-run', line, weekKey] as const, [line, weekKey]);
  const sealQuery = useQuery({
    queryKey: ['toll-period-seal', line, weekKey],
    queryFn: () => api.getTollPeriodSeal(weekKey, line),
    enabled: Boolean(weekKey),
    retry: false,
  });
  const tollsSealed = sealQuery.isSuccess && sealQuery.data?.sealed === true;
  const tollsCheckFailed = sealQuery.isError;
  const [advancing, setAdvancing] = useState(false);
  /** Right-column slot a step panel can fill with its own totals card (Stitch). */
  const [stepSummaryEl, setStepSummaryEl] = useState<HTMLDivElement | null>(null);
  const approvals = useReconApprovals();
  const autoSkipKey = useRef<string | null>(null);
  const autoSkipInFlight = useRef(false);

  const runQuery = useQuery({
    queryKey: runQueryKey,
    queryFn: () => fetchRun(line, weekKey),
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.calculatorPaused) return 8000;
      if (data?.deskReady === false) return 3000;
      return false;
    },
  });

  const statusQuery = useQuery({
    queryKey: ['recon-projection', line, weekKey],
    queryFn: () => fetchWeekProjectionStatus(line, weekKey),
    refetchInterval: (query) => {
      const status = query.state.data;
      if (status && (status.pendingDrivers > 0 || status.failedDrivers > 0)) return 5000;
      return false;
    },
  });

  const pendingDrivers = statusQuery.data?.pendingDrivers;
  const prevPending = useRef<number | null>(null);
  useEffect(() => {
    if (pendingDrivers == null) return;
    const prev = prevPending.current;
    prevPending.current = pendingDrivers;
    if (prev == null || prev === 0 || pendingDrivers !== 0) return;
    void queryClient.refetchQueries({ queryKey: runQueryKey });
    const timer = window.setTimeout(() => {
      void queryClient.refetchQueries({ queryKey: runQueryKey });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [pendingDrivers, queryClient, runQueryKey]);

  const gateByStep = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of runQuery.data?.evaluation.steps ?? []) map.set(s.id, s.status);
    return map;
  }, [runQuery.data]);

  const lockedByStep = useMemo(() => {
    const map = new Map<string, StepLockedBy>();
    for (const s of runQuery.data?.evaluation.steps ?? []) {
      const lb = parseLockedBy(s.lockedBy);
      if (lb) map.set(s.id, lb);
    }
    return map;
  }, [runQuery.data]);

  // WRA-27: toll / fuel / settlement changes made on this page carry this week's version.
  const openRun = runQuery.data?.run;
  useEffect(() => {
    if (!openRun?.id) return;
    setReconWeekContext({ runId: openRun.id, version: Number(openRun.version), closed: openRun.state === 'closed' });
  }, [openRun?.id, openRun?.version, openRun?.state]);
  useEffect(() => {
    const id = openRun?.id;
    return () => clearReconWeekContext(id);
  }, [openRun?.id]);
  const [weekChanged, setWeekChanged] = useState<string | null>(null);
  useEffect(() => {
    const onChanged = (e: Event) => setWeekChanged(String((e as CustomEvent<{ code?: string }>).detail?.code || 'WEEK_CHANGED'));
    window.addEventListener(RECON_WEEK_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RECON_WEEK_CHANGED_EVENT, onChanged);
  }, []);

  /** Apply mutation payload immediately, then refetch so gates/rails stay in sync. */
  const refreshRun = useCallback(
    async (payload?: ReconRunPayload) => {
      if (payload?.run && Array.isArray(payload.sources)) {
        queryClient.setQueryData(runQueryKey, payload);
      }
      await queryClient.invalidateQueries({ queryKey: ['recon-weeks'] });
      await queryClient.refetchQueries({ queryKey: runQueryKey });
    },
    [queryClient, runQueryKey],
  );

  const setStep = useCallback(
    (step: RunStepId) => {
      setActiveStep(step);
      onStepChange?.(step);
      if (typeof window === 'undefined') return;
      const qs = new URLSearchParams(window.location.search);
      qs.set('line', line);
      qs.set('week', weekKey);
      qs.set('step', step);
      const path = `/week-reconciliation?${qs.toString()}`;
      window.history.replaceState({ page: 'week-reconciliation', step }, '', path);
    },
    [line, weekKey, onStepChange],
  );

  // A closed week opened without a step lands on Close (badge + History).
  const openState = runQuery.data?.run.state;
  useEffect(() => {
    if (openState !== 'closed' || typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('step')) return;
    setActiveStep('close');
  }, [openState, line, weekKey]);

  // Reset step when opening a different week/line.
  useEffect(() => {
    setActiveStep(stepFromQuery());
    autoSkipKey.current = null;
  }, [line, weekKey]);

  const nextStepId = useMemo(() => {
    const idx = RECON_STEP_ORDER.indexOf(activeStep);
    if (idx < 0 || idx >= RECON_STEP_ORDER.length - 1) return null;
    return RECON_STEP_ORDER[idx + 1] ?? null;
  }, [activeStep]);

  const activeGate = gateByStep.get(activeStep) ?? 'locked';
  // Backend keeps later steps locked until this step is explicitly completed.
  // Close week uses its own confirm flow — no generic Continue there.
  // Empty attribution auto-skips — don't show a Continue CTA on that blank screen.
  const hideContinueForEmptySkip =
    activeStep === 'attribution' && (runQuery.data?.attribution?.rowCount ?? 0) === 0;
  const canMarkComplete =
    activeStep !== 'close' &&
    !hideContinueForEmptySkip &&
    (activeGate === 'ready' || activeGate === 'stale');
  const canSkipToNext =
    activeStep !== 'close' &&
    !hideContinueForEmptySkip &&
    activeGate === 'complete' &&
    !!nextStepId;

  /** Complete current (if needed), then auto-complete empty skippable steps; land on first real work. */
  const completeThroughSkips = useCallback(
    async (fromStep: RunStepId, startRun: ReconRunPayload): Promise<ReconRunPayload> => {
      let payload = startRun;
      let cursor: RunStepId | null = fromStep;

      while (cursor && cursor !== 'close') {
        const status = stepStatus(payload, cursor);
        if (status === 'locked') break;

        if (status === 'ready' || status === 'stale') {
          payload = await completeRunStep(line, weekKey, cursor, {
            expectedVersion: payload.run.version,
          });
        } else if (status !== 'complete') {
          break;
        }

        const idx = RECON_STEP_ORDER.indexOf(cursor);
        const following = (RECON_STEP_ORDER[idx + 1] ?? null) as RunStepId | null;
        if (!following || following === 'close') break;
        if (!isEmptyAutoSkip(payload, following)) break;
        cursor = following;
      }

      return payload;
    },
    [line, weekKey],
  );

  /**
   * Land on the next openable step after `afterStep` (not from the top of the
   * rail — Upload inputs staying "in progress" must not yank you back to step 1).
   */
  const landAfterAdvance = useCallback(
    (payload: ReconRunPayload, fallback: RunStepId, afterStep?: RunStepId) => {
      const isOpenable = (id: RunStepId) => {
        const st = stepStatus(payload, id);
        return st === 'ready' || st === 'in_progress' || st === 'stale';
      };
      const startIdx = afterStep
        ? Math.max(0, RECON_STEP_ORDER.indexOf(afterStep) + 1)
        : 0;
      const forward = RECON_STEP_ORDER.slice(startIdx);
      const target =
        forward.find(isOpenable) ??
        (isOpenable(fallback) ? fallback : null) ??
        // Nothing ahead unlocked — stay on the step just finished when complete
        (afterStep && stepStatus(payload, afterStep) === 'complete' ? afterStep : fallback);
      setStep(target);
    },
    [setStep],
  );

  // Auto-skip empty Assign service lines so the user never sits on a blank step.
  useEffect(() => {
    const run = runQuery.data;
    if (!run || autoSkipInFlight.current) return;
    if (activeStep !== 'attribution') return;
    if ((run.attribution?.rowCount ?? 0) > 0) return;

    const status = stepStatus(run, 'attribution');
    if (status === 'locked' || status === 'in_progress') return;

    const key = `${line}:${weekKey}:attribution:0`;
    if (autoSkipKey.current === key || autoSkipInFlight.current) return;
    autoSkipInFlight.current = true;

    let cancelled = false;
    (async () => {
      setAdvancing(true);
      try {
        const payload = await completeThroughSkips('attribution', run);
        if (cancelled) return;
        await refreshRun(payload);
        if (cancelled) return;
        autoSkipKey.current = key;
        landAfterAdvance(payload, 'tolls', 'attribution');
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ReconApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not skip empty step';
        toast.error(msg);
      } finally {
        autoSkipInFlight.current = false;
        if (!cancelled) setAdvancing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeStep, completeThroughSkips, landAfterAdvance, line, refreshRun, runQuery.data, weekKey]);

  const continueLabelStep = useMemo(() => {
    if (!nextStepId || !runQuery.data) return null;
    // Preview the first non-empty destination for the button label.
    if (isEmptyAutoSkip(runQuery.data, nextStepId)) {
      const idx = RECON_STEP_ORDER.indexOf(nextStepId);
      return RECON_STEP_ORDER[idx + 1] ?? nextStepId;
    }
    return nextStepId;
  }, [nextStepId, runQuery.data]);

  /** Fuel Finalize (step 5) → complete the Fuel step once the server sees the locked week. */
  const handleFuelFinalized = useCallback(async () => {
    setAdvancing(true);
    try {
      let payload = await fetchRun(line, weekKey);
      if (stepStatus(payload, 'fuel') !== 'complete') {
        payload = await completeRunStep(line, weekKey, 'fuel', { expectedVersion: payload.run.version });
      }
      await refreshRun(payload);
      landAfterAdvance(payload, nextStepId ?? 'trips_earnings', 'fuel');
      toast.success('Fuel finalized', { description: 'Moved you to the next open week step.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not complete the Fuel step';
      toast.error('Fuel is locked, but the step did not complete', { description: `${msg}. Use Continue below.` });
    } finally {
      setAdvancing(false);
    }
  }, [landAfterAdvance, line, nextStepId, refreshRun, weekKey]);

  /** Tolls embed Finish → mark run step complete and open next ready left-rail step. */
  const handleTollsPeriodFinished = useCallback(async () => {
    setAdvancing(true);
    try {
      let payload = runQuery.data;
      if (!payload) payload = await fetchRun(line, weekKey);
      const status = stepStatus(payload, 'tolls');
      // completeThroughSkips only auto-completes ready/stale — force in_progress too.
      if (status === 'in_progress') {
        payload = await completeRunStep(line, weekKey, 'tolls', {
          expectedVersion: payload.run.version,
        });
      }
      if (stepStatus(payload, 'tolls') !== 'complete' && stepStatus(payload, 'tolls') !== 'locked') {
        payload = await completeThroughSkips('tolls', payload);
      } else if (nextStepId && isEmptyAutoSkip(payload, nextStepId)) {
        payload = await completeThroughSkips(nextStepId, payload);
      }
      await refreshRun(payload);
      landAfterAdvance(payload, nextStepId ?? 'tag_account', 'tolls');
      toast.success('Tolls complete', {
        description: 'Moved you to the next open week step.',
      });
    } catch (err) {
      const msg =
        err instanceof ReconApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not open the next week step';
      toast.error(msg);
      throw err instanceof Error ? err : new Error(msg);
    } finally {
      setAdvancing(false);
    }
  }, [
    completeThroughSkips,
    landAfterAdvance,
    line,
    nextStepId,
    refreshRun,
    runQuery.data,
    weekKey,
  ]);

  if (runQuery.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading week run…
      </div>
    );
  }

  if (runQuery.data?.deskReady === false) {
    if (runQuery.data.calculatorPaused) {
      return (
        <div className="flex h-48 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-600">
          <p>Week calculator is paused by an admin.</p>
          {canResumeCalculator ? (
            <a href="/admin" className="inline-flex h-10 items-center rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white">
              Open Week calculator
            </a>
          ) : (
            <p>Ask a product admin to resume it.</p>
          )}
        </div>
      );
    }
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Preparing this week. The calculator will fill this in shortly.
      </div>
    );
  }

  if (runQuery.isError && isReconUnavailable(runQuery.error)) {
    return (
      <p className="text-sm text-slate-500">
        Reconciliation runs are not available on this environment yet.
      </p>
    );
  }

  if (!runQuery.data) {
    return <p className="text-sm text-rose-700">Could not load this week.</p>;
  }

  const run = runQuery.data;

  const advanceToNext = async () => {
    if (!nextStepId) return;
    setAdvancing(true);
    try {
      let payload = run;
      if (canMarkComplete) {
        payload = await completeThroughSkips(activeStep, run);
      } else if (canSkipToNext) {
        // Already complete — still chain past empty following steps if needed.
        const following = nextStepId;
        if (isEmptyAutoSkip(run, following) && stepStatus(run, following) !== 'complete') {
          payload = await completeThroughSkips(following, run);
        }
      } else {
        return;
      }
      await refreshRun(payload);
      landAfterAdvance(payload, nextStepId, activeStep);
    } catch (err) {
      const msg =
        err instanceof ReconApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not continue to the next step';
      toast.error(msg);
    } finally {
      setAdvancing(false);
    }
  };

  // WRA-19: steps that do not apply to this line are not shown.
  const hiddenSteps = new Set(
    run.evaluation.steps.filter((s) => s.hidden).map((s) => s.id),
  );
  const visibleSteps = RECON_STEP_ORDER.filter((id) => !hiddenSteps.has(id));
  const activeIndex = visibleSteps.indexOf(activeStep);
  const previousStepId = activeIndex > 0 ? visibleSteps[activeIndex - 1] : null;
  // A closed week: the Close step always opens (badge, History, corrections); nothing waits on files.
  const weekClosed = run.run.state === 'closed';
  const activeLocked = activeGate === 'locked' && activeStep !== 'sources' && !(weekClosed && activeStep === 'close');
  const activeLockedBy = lockedByStep.get(activeStep);
  const lineLabel = line === 'rideshare' ? 'Rideshare' : 'Delivery';
  const requiredSources = run.sources.filter((s) => s.requirement === 'required');
  const receivedRequired = requiredSources.filter(
    (s) => s.status === 'received' || s.status === 'attested_none' || s.status === 'waived',
  ).length;

  return (
    <div className="space-y-4" data-testid="recon-week-desk">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        {/* Left: All weeks + step list (Stitch screen 6 shell) */}
        <nav className="space-y-4" aria-label="Steps">
          <PastWeeksReturnLink onReturn={() => onNavigate?.('driver-settlements')} />
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-full items-center gap-2 rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> All weeks
          </button>
          <div className="flex flex-col gap-1 rounded-[20px] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">Week steps</span>
              <span className="rounded-full bg-[#e5eeff] px-2 py-0.5 text-[11px] font-semibold text-[#0b1c30]">
                Step {Math.max(1, activeIndex + 1)} of {visibleSteps.length}
              </span>
            </div>
            {visibleSteps.map((stepId, i) => {
              const status = gateByStep.get(stepId) ?? 'locked';
              const lockedBy = lockedByStep.get(stepId);
              const active = stepId === activeStep;
              const tollsLocked = stepId === 'tolls' && tollsSealed && status !== 'locked';
              const caption = tollsLocked
                ? 'Tolls locked'
                : stepId === 'tolls' && tollsCheckFailed && status !== 'locked'
                  ? "Couldn't check tolls"
                  : weekClosed
                  ? 'Closed'
                  : stepRailCaption(status, lockedBy);
              return (
                <button
                  key={stepId}
                  type="button"
                  onClick={() => setStep(stepId)}
                  data-testid={`recon-step-${stepId}`}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors',
                    active ? 'border-l-4 border-[#030213] bg-[#e5eeff] shadow-sm' : 'hover:bg-[#eff4ff]',
                    status === 'locked' && !active && 'opacity-60',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                      status === 'complete'
                        ? 'bg-[#030213] text-white'
                        : status === 'locked'
                          ? 'bg-[#d3e4fe] text-[#47464c]'
                          : 'bg-[#030213] text-white',
                    )}
                  >
                    {status === 'complete' ? <Check className="h-3.5 w-3.5" aria-hidden /> : status === 'locked' ? <Lock className="h-3 w-3" aria-hidden /> : i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className={cn('truncate text-sm', active ? 'font-semibold text-[#0b1c30]' : 'text-[#0b1c30]')}>
                      {i + 1}. {RECON_STEP_LABELS[stepId]}
                    </span>
                    <span
                      className={cn(
                        'text-[12px]',
                        status === 'complete' ? 'font-medium text-[#069669]' : status === 'locked' ? 'text-[#78767d]' : 'font-semibold text-[#0051d5]',
                      )}
                    >
                      {caption}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="rounded-[20px] border border-dashed border-[#c9c5cd] bg-[#f8f9ff] p-4 text-[#47464c]" aria-disabled="true" data-testid="recon-telematics-tile">
            <p className="text-sm font-semibold">Telematics</p>
            <p className="text-[12px]">Coming soon</p>
          </div>
        </nav>

        {/* Middle: the step */}
        <section className="min-w-0 rounded-[20px] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(15,23,42,0.06)]">
          <header className="mb-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#0b1c30]">
              <p>
                <span className="font-semibold">{formatWeekTitle(weekKey)}</span>
                <span className="text-[#47464c]"> · {lineLabel} · {formatWeekRange(weekKey)}</span>
              </p>
              <ReconCalculatorBanner calculator={run.calculator ?? null} className={run.calculator?.paused ? "w-full" : "rounded-full bg-[#eff4ff] px-3 py-1"} />
            </div>
            <h2 className="text-[28px] font-semibold tracking-tight text-[#0b1c30]">{RECON_STEP_LABELS[activeStep]}</h2>
            <p className="text-base text-[#47464c]">{STEP_QUESTION[activeStep]}</p>
            {line === 'rush_delivery' ? <ReconCodRemittanceBanner onOpenRemittance={onOpenRemittance} /> : null}
            {statusQuery.data?.line ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-[#47464c]">
                <span>{statusQuery.data.line}</span>
                {statusQuery.data.failedDrivers > 0 ? (
                  <button
                    type="button"
                    className="h-9 rounded-xl bg-[#030213] px-4 text-sm font-semibold text-white"
                    onClick={() => {
                      void retryFailedProjection(line, weekKey).then(() => statusQuery.refetch());
                    }}
                  >
                    Retry failed drivers
                  </button>
                ) : null}
              </div>
            ) : null}
          </header>

          {weekChanged ? (
            <div
              className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-5 py-4"
              role="alert"
              data-testid="recon-week-changed"
            >
              <p className="text-sm font-semibold text-[#0b1c30]">
                {weekChanged === 'WEEK_CLOSED'
                  ? 'This week was closed — nothing was saved. Reload the week.'
                  : 'This week changed — nothing was saved. Reload the week to see the latest.'}
              </p>
              <Button
                type="button"
                className="h-11"
                onClick={async () => {
                  setWeekChanged(null);
                  // Take the server's version as it is now, not our own count.
                  clearReconWeekContext();
                  await refreshRun();
                }}
              >
                Reload week
              </Button>
            </div>
          ) : null}

          <div className="mb-5">
            <ReconPendingApprovalBanner
              items={approvalsForWeek(approvals.items, line, weekKey)}
              me={approvals.me}
              canApprove={approvals.canApprove}
              onChanged={() => {
                approvals.refresh();
                void refreshRun();
              }}
            />
          </div>

          {activeLocked ? (
            <LockedStepPanel
              lockedBy={activeLockedBy}
              weekClosed={weekClosed}
              items={weekClosed ? [] : lockedStepBlockers(run.closeCheck, activeStep)}
              onGoTo={(id) => setStep(id as RunStepId)}
            />
          ) : (
            <ReconStepBoundary key={activeStep} step={activeStep}>
              {activeStep === 'attribution' && (run.attribution?.rowCount ?? 0) === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-[#47464c]">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Nothing to assign — moving on…
                </div>
              ) : null}

              {activeStep === 'sources' ? <ReconSourcesStep run={run} onRefresh={refreshRun} /> : null}

              {activeStep === 'attribution' && (run.attribution?.rowCount ?? 0) > 0 ? (
                <ReconAttributionStep run={run} onRefresh={refreshRun} />
              ) : null}

              {activeStep === 'tolls' ? (
                <>
                  {tollsCheckFailed ? (
                    <TollsCheckFailedBanner busy={sealQuery.isFetching} onRetry={() => { void sealQuery.refetch(); }} />
                  ) : null}
                  {tollsSealed ? (
                    <TollsLockedBanner weekKey={weekKey} serviceLine={line} onReopened={() => { void sealQuery.refetch(); }} />
                  ) : null}
                  <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" />}>
                    <TollReconciliationLazy
                      key={tollsSealed ? 'tolls-sealed' : 'tolls-open'}
                      embedded
                      hideLanding
                      initialWeekStart={weekKey}
                      serviceLine={line}
                      onPeriodFinished={handleTollsPeriodFinished}
                      deskSections
                      summaryTarget={stepSummaryEl}
                    />
                  </Suspense>
                </>
              ) : null}

              {activeStep === 'fuel' ? (
                <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" />}>
                  <FuelManagementLazy
                    embedded
                    hideReconLanding
                    defaultTab="reconciliation"
                    initialWeekStart={weekKey}
                    serviceLine={line}
                    deskSections
                    summaryTarget={stepSummaryEl}
                    onDeskFinalized={handleFuelFinalized}
                  />
                </Suspense>
              ) : null}

              {activeStep === 'tag_account' ? <ReconTagAccountStep run={run} onRefresh={refreshRun} /> : null}
              {activeStep === 'trips_earnings' ? <ReconTripsEarningsStep run={run} onRefresh={refreshRun} /> : null}
              {activeStep === 'settlement_preview' ? <ReconSettlementStep run={run} onNavigate={onNavigate} /> : null}
              {activeStep === 'close' ? <ReconCloseStep run={run} onRefresh={refreshRun} onGoToStep={setStep} onNavigate={(page) => onNavigate?.(page)} /> : null}
            </ReconStepBoundary>
          )}

          {/* Footer: Previous / Continue (Tolls keeps its own Finish until Round 4b). */}
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5eeff] pt-5">
            {previousStepId ? (
              <button
                type="button"
                onClick={() => setStep(previousStepId)}
                className="h-11 rounded-xl border border-[#cbd5e1] bg-white px-5 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]"
              >
                Previous: {RECON_STEP_LABELS[previousStepId]}
              </button>
            ) : <span />}
            {(canMarkComplete || canSkipToNext) && continueLabelStep && (activeStep !== 'tolls' || canSkipToNext) && !activeLocked ? (
              <button
                type="button"
                onClick={() => void advanceToNext()}
                disabled={advancing}
                data-testid="recon-continue"
                className="flex h-11 items-center gap-2 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145] disabled:opacity-60"
              >
                {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Continue to {RECON_STEP_LABELS[continueLabelStep]}
                {advancing ? null : <ArrowRight className="h-4 w-4" />}
              </button>
            ) : null}
          </footer>
        </section>

        {/* Right: summary */}
        <aside className="space-y-4">
          <div className="rounded-[20px] bg-white p-5 shadow-sm" data-testid="recon-summary-sources">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#47464c]">Sources</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-[#0b1c30]">
              {receivedRequired} / {requiredSources.length || '—'}
            </p>
            <p className="text-[13px] text-[#47464c]">required received</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e5eeff]">
              <div
                className="h-full rounded-full bg-[#030213]"
                style={{ width: `${requiredSources.length ? Math.round((receivedRequired / requiredSources.length) * 100) : 0}%` }}
              />
            </div>
          </div>
          <AttributionRail run={run} />
          <div ref={setStepSummaryEl} />
        </aside>
      </div>
    </div>
  );
}

/** WRA-24: a locked step opens read-only and says what it is waiting on. */
/**
 * Done-tests 2 / 16 (WRA-24): a locked step still shows, read-only, the saved problems it
 * will have to clear. Close lists every blocking item (same as its Close box).
 */
export function lockedStepBlockers(
  closeCheck: ReconRunPayload['closeCheck'] | undefined,
  stepId: RunStepId,
): Array<{ code: string; message: string | null }> {
  if (!closeCheck || closeCheck.status !== 'ok') return [];
  return closeCheck.blockers
    .filter((b) => String(b.severity || 'block') !== 'warn')
    .filter((b) => stepId === 'close' || serverStepForBlockerCode(String(b.code || '')) === stepId)
    .map((b) => ({ code: String(b.code), message: b.message ?? null }));
}

function LockedStepPanel({
  lockedBy,
  weekClosed = false,
  items,
  onGoTo,
}: {
  lockedBy: StepLockedBy | undefined;
  weekClosed?: boolean;
  items: Array<{ code: string; message: string | null }>;
  onGoTo: (stepId: string) => void;
}) {
  if (weekClosed) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-2xl bg-[#eff4ff] p-6" data-testid="recon-locked-step">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
          <Lock className="h-5 w-5 text-[#47464c]" aria-hidden />
        </span>
        <div>
          <p className="text-lg font-semibold text-[#0b1c30]">This week is closed</p>
          <p className="text-sm text-[#47464c]">Nothing changes here any more. The Close step shows who closed it and any corrections.</p>
        </div>
        <button
          type="button"
          onClick={() => onGoTo('close')}
          className="h-11 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145]"
        >
          Go to Close week
        </button>
      </div>
    );
  }
  const waitingOnSource = !lockedBy || lockedBy.kind === 'source';
  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl bg-[#eff4ff] p-6" data-testid="recon-locked-step">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white">
        <Lock className="h-5 w-5 text-[#47464c]" aria-hidden />
      </span>
      <div>
        <p className="text-lg font-semibold text-[#0b1c30]">
          {lockedBy?.label ? `Waiting on ${lockedBy.label}` : 'This step is not open yet'}
        </p>
        <p className="text-sm text-[#47464c]">
          {waitingOnSource
            ? 'This step opens once its files are in. Upload them, or mark them as no activity.'
            : 'Finish the earlier step first.'}
        </p>
      </div>
      {items.length > 0 ? (
        <div className="w-full rounded-xl bg-white p-4" data-testid="recon-locked-blockers">
          <p className="text-sm font-semibold text-[#0b1c30]">
            Still to fix here ({items.length})
          </p>
          <ul className="mt-2 space-y-1 text-sm text-[#47464c]">
            {items.map((b, i) => (
              <li key={`${b.code}-${i}`}>{humanBlockerLabel({ code: b.code, message: b.message ?? '' })}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => onGoTo(waitingOnSource ? 'sources' : lockedBy!.id)}
        className="h-11 rounded-xl bg-[#030213] px-5 text-sm font-semibold text-white hover:bg-[#213145]"
      >
        {waitingOnSource ? 'Go to Upload inputs' : `Go to ${lockedBy!.label}`}
      </button>
    </div>
  );
}
