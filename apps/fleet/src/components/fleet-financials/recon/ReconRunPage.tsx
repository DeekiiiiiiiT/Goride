import React, { lazy, Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { RECON_STEP_LABELS, RECON_STEP_ORDER, type RunStepId } from '@roam/finance-core';
import { fetchRun, isReconUnavailable, type ReconRunPayload } from '../../../services/reconApi';
import { ReconSourcesStep } from './ReconSourcesStep';
import { ReconAttributionStep } from './ReconAttributionStep';
import { ReconCodRemittanceBanner } from './ReconCodRemittanceBanner';
import { ReconTagAccountStep } from './ReconTagAccountStep';
import { ReconTripsEarningsStep } from './ReconTripsEarningsStep';
import { Button } from '../../ui/button';
import { cn } from '../../ui/utils';

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
  onNavigate?: (page: string) => void;
  onStepChange?: (step: RunStepId) => void;
  onOpenRemittance?: () => void;
}) {
  const activeStep = stepFromQuery();

  const runQuery = useQuery({
    queryKey: ['recon-run', line, weekKey],
    queryFn: () => fetchRun(line, weekKey),
    staleTime: 30_000,
    retry: false,
  });

  const gateByStep = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of runQuery.data?.evaluation.steps ?? []) map.set(s.id, s.status);
    return map;
  }, [runQuery.data]);

  const setStep = (step: RunStepId) => {
    onStepChange?.(step);
    if (typeof window === 'undefined') return;
    const qs = new URLSearchParams(window.location.search);
    qs.set('line', line);
    qs.set('week', weekKey);
    qs.set('step', step);
    const path = `/week-reconciliation?${qs.toString()}`;
    window.history.replaceState({ page: 'week-reconciliation', step }, '', path);
  };

  if (runQuery.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading week run…
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

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_240px]">
      <nav className="space-y-1 rounded-xl border border-slate-200 bg-white p-2" aria-label="Steps">
        <Button type="button" variant="ghost" size="sm" className="mb-2 w-full justify-start" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          All weeks
        </Button>
        {RECON_STEP_ORDER.map((stepId) => {
          const status = gateByStep.get(stepId) ?? 'locked';
          const active = stepId === activeStep;
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
              <span className="text-xs capitalize text-slate-500">{status.replace(/_/g, ' ')}</span>
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
        </header>

        {activeStep === 'sources' ? (
          <ReconSourcesStep
            run={run}
            onRefresh={() => void runQuery.refetch()}
            onNavigateImports={() => onNavigate?.('imports')}
          />
        ) : null}

        {activeStep === 'attribution' ? (
          <ReconAttributionStep run={run} onRefresh={() => void runQuery.refetch()} />
        ) : null}

        {activeStep === 'tolls' ? (
          <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" />}>
            <TollReconciliationLazy embedded hideLanding initialWeekStart={weekKey} />
          </Suspense>
        ) : null}

        {activeStep === 'fuel' ? (
          <Suspense fallback={<Loader2 className="mx-auto h-6 w-6 animate-spin" />}>
            <FuelManagementLazy
              embedded
              hideReconLanding
              defaultTab="reconciliation"
              initialWeekStart={weekKey}
            />
          </Suspense>
        ) : null}

        {activeStep === 'tag_account' ? (
          <ReconTagAccountStep run={run} onRefresh={() => void runQuery.refetch()} />
        ) : null}

        {activeStep === 'trips_earnings' ? (
          <ReconTripsEarningsStep run={run} onNavigate={onNavigate} />
        ) : null}

        {activeStep !== 'sources' &&
        activeStep !== 'attribution' &&
        activeStep !== 'tolls' &&
        activeStep !== 'fuel' &&
        activeStep !== 'tag_account' &&
        activeStep !== 'trips_earnings' ? (
          <p className="text-sm text-slate-600">
            {RECON_STEP_LABELS[activeStep]} opens in a later phase. Use sources, tolls, and fuel for
            this week.
          </p>
        ) : null}
      </section>

      <div className="space-y-3">
        <SourceScoreRail run={run} />
        <AttributionRail run={run} />
      </div>
    </div>
  );
}
