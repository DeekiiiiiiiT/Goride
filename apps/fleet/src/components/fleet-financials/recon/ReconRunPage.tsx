import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { RECON_STEP_LABELS, RECON_STEP_ORDER, type RunStepId } from '@roam/finance-core';
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
import { PastWeeksReturnLink } from '../settlements/past-weeks/PastWeeksReturnLink';
import { TollsCheckFailedBanner, TollsLockedBanner } from './TollsLockedBanner';
import { api } from '../../../services/api';
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

function stepRailHint(
  status: string,
  lockedBy: StepLockedBy | undefined,
  stepId: RunStepId,
): string | null {
  if (status !== 'locked') return null;
  if (stepId !== 'tolls' && stepId !== 'fuel' && stepId !== 'tag_account' && stepId !== 'trips_earnings') {
    return null;
  }
  if (lockedBy?.kind === 'step') {
    return `Finish ${lockedBy.label} first.`;
  }
  return null;
}

function AttributionRail({ run }: { run: ReconRunPayload }) {
  const u = run.attribution?.rowCount ?? 0;
  const amt = run.attribution?.amountMajor ?? 0;
  return (
    <aside className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
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
    </aside>
  );
}

function SourceScoreRail({ run }: { run: ReconRunPayload }) {
  const required = run.sources.filter((s) => s.requirement === 'required');
  const done = required.filter(
    (s) => s.status === 'received' || s.status === 'attested_none' || s.status === 'waived',
  ).length;
  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sources</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">
        {done}/{required.length || '—'}
      </p>
      <p className="text-xs text-slate-600">{run.evaluation.nextAction.label}</p>
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
  const autoSkipKey = useRef<string | null>(null);
  const autoSkipInFlight = useRef(false);

  const runQuery = useQuery({
    queryKey: runQueryKey,
    queryFn: () => fetchRun(line, weekKey),
    staleTime: 0,
    retry: false,
    refetchInterval: (query) => (query.state.data?.deskReady === false ? 3000 : false),
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

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
      <nav className="space-y-1 rounded-xl border border-slate-200 bg-white p-2" aria-label="Steps">
        <PastWeeksReturnLink onReturn={() => onNavigate?.('driver-settlements')} />
        <Button type="button" variant="ghost" size="sm" className="mb-2 w-full justify-start" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          All weeks
        </Button>
        {RECON_STEP_ORDER.map((stepId) => {
          const status = gateByStep.get(stepId) ?? 'locked';
          const lockedBy = lockedByStep.get(stepId);
          const active = stepId === activeStep;
          const hint = stepRailHint(status, lockedBy, stepId);
          const tollsLocked = stepId === 'tolls' && tollsSealed && status !== 'locked';
          const tollsUnknown = stepId === 'tolls' && tollsCheckFailed && status !== 'locked';
          return (
            <button
              key={stepId}
              type="button"
              disabled={status === 'locked' && stepId !== 'sources'}
              onClick={() => setStep(stepId)}
              className={cn(
                'flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors',
                active ? 'bg-indigo-50 text-indigo-900' : 'text-slate-700 hover:bg-slate-50',
                status === 'locked' && !active && 'opacity-50',
              )}
            >
              <span className="font-medium">{RECON_STEP_LABELS[stepId]}</span>
              <span className={cn('text-xs', tollsLocked || tollsUnknown ? 'font-medium text-amber-800' : 'text-slate-500')}>
                {tollsLocked ? 'Tolls locked' : tollsUnknown ? "Couldn't check tolls" : stepRailCaption(status, lockedBy)}
              </span>
              {hint ? <span className="mt-0.5 text-[10px] leading-snug text-slate-400">{hint}</span> : null}
            </button>
          );
        })}
      </nav>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
        <header className="mb-4 space-y-3 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900">
            Week of {weekKey}{' '}
            <span className="text-sm font-normal capitalize text-slate-500">({line})</span>
          </h2>
          {line === 'rush_delivery' ? (
            <ReconCodRemittanceBanner onOpenRemittance={onOpenRemittance} />
          ) : null}
          {statusQuery.data?.line ? (
            <p className="flex items-center gap-3 text-sm text-slate-600">
              <span>{statusQuery.data.line}</span>
              {statusQuery.data.failedDrivers > 0 ? (
                <button
                  type="button"
                  className="font-semibold text-[#3525cd] underline"
                  onClick={() => {
                    void retryFailedProjection(line, weekKey).then(() => statusQuery.refetch());
                  }}
                >
                  Retry
                </button>
              ) : null}
            </p>
          ) : null}
        </header>

        {activeStep === 'attribution' && (run.attribution?.rowCount ?? 0) === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Nothing to assign — moving on…
          </div>
        ) : null}

        {activeStep === 'sources' ? (
          <ReconSourcesStep run={run} onRefresh={refreshRun} />
        ) : null}

        {activeStep === 'attribution' && (run.attribution?.rowCount ?? 0) > 0 ? (
          <ReconAttributionStep run={run} onRefresh={refreshRun} />
        ) : null}

        {activeStep === 'tolls' ? (
          <>
            {tollsCheckFailed ? (
              <TollsCheckFailedBanner
                busy={sealQuery.isFetching}
                onRetry={() => {
                  void sealQuery.refetch();
                }}
              />
            ) : null}
            {tollsSealed ? (
              <TollsLockedBanner
                weekKey={weekKey}
                serviceLine={line}
                onReopened={() => {
                  void sealQuery.refetch();
                }}
              />
            ) : null}
            <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" />}>
              <TollReconciliationLazy
                key={tollsSealed ? 'tolls-sealed' : 'tolls-open'}
                embedded
                hideLanding
                initialWeekStart={weekKey}
                serviceLine={line}
                onPeriodFinished={handleTollsPeriodFinished}
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
            />
          </Suspense>
        ) : null}

        {activeStep === 'tag_account' ? (
          <ReconTagAccountStep run={run} onRefresh={refreshRun} />
        ) : null}

        {activeStep === 'trips_earnings' ? (
          <ReconTripsEarningsStep run={run} onRefresh={refreshRun} />
        ) : null}

        {activeStep === 'settlement_preview' ? (
          <ReconSettlementStep run={run} onNavigate={onNavigate} />
        ) : null}

        {activeStep === 'close' ? (
          <ReconCloseStep run={run} onRefresh={refreshRun} onGoToStep={setStep} />
        ) : null}

        {activeStep !== 'sources' &&
        activeStep !== 'attribution' &&
        activeStep !== 'tolls' &&
        activeStep !== 'fuel' &&
        activeStep !== 'tag_account' &&
        activeStep !== 'trips_earnings' &&
        activeStep !== 'settlement_preview' &&
        activeStep !== 'close' ? (
          <p className="text-sm text-slate-600">
            {RECON_STEP_LABELS[activeStep]} is not available in this build.
          </p>
        ) : null}

        {/* Tolls Finish CTA lives inside the embed — avoid a second Continue. */}
        {(canMarkComplete || canSkipToNext) && continueLabelStep && activeStep !== 'tolls' ? (
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">
              {canMarkComplete
                ? 'This step looks complete. Continue to unlock the next one.'
                : 'This step is done. You can move on whenever you are ready.'}
            </p>
            <Button type="button" onClick={() => void advanceToNext()} disabled={advancing}>
              {advancing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Continue to {RECON_STEP_LABELS[continueLabelStep]}
            </Button>
          </div>
        ) : null}
      </section>

      <div className="space-y-3">
        <SourceScoreRail run={run} />
        <AttributionRail run={run} />
      </div>
    </div>
  );
}
